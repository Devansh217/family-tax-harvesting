import { classifyFund, type ReturnClass } from './categories';
import { addMonths, daysBetween, isLongTerm } from './dates';
import type { FamilyView } from './family';
import { CPI, REAL_RETURN, type AssetClass, type Scenario } from './marketAssumptions';
import { clubbing, isRelative, pairRelation } from './relations';
import { normalIncomeOf, rulesFor, type TaxRules } from './rules';
import { longTermMonthsFor, taxForYear, type GainBuckets } from './tax';
import type { ISODate, Member, Paise, Security, TaxType } from './types';

/** Each return class as a mix of asset classes from the research's assumption table. */
export const RETURN_MIX: Record<Exclude<ReturnClass, 'ppf'>, Partial<Record<AssetClass, number>>> = {
  equity: { equity_large: 1 },
  debt: { debt_short: 1 },
  conservative_hybrid: { equity_large: 0.2, debt_short: 0.8 },
  balanced: { equity_large: 0.5, debt_short: 0.5 },
  gold: { gold: 1 },
  international: { intl_equity: 1 },
  fd: { fd: 1 },
};

/** Assumed average yearly return before tax: the mix's real return grown by the scenario's inflation. PPF uses its notified rate. */
export function nominalReturn(c: ReturnClass, s: Scenario = 'base', r: TaxRules): number {
  if (c === 'ppf') return r.smallSavings.ppf;
  const real = Object.entries(RETURN_MIX[c]).reduce((a, [k, w]) => a + REAL_RETURN[s][k as AssetClass] * (w ?? 0), 0);
  return (1 + real) * (1 + CPI[s]) - 1;
}

export type Product = { kind: 'fund'; isin: string } | { kind: 'category'; category: string } | { kind: 'fd' } | { kind: 'ppf' } | { kind: 'gold_etf' };

export interface BringsHomeInput {
  product: Product;
  amount: Paise;
  years: number;
  /** Overrides the assumed average return. */
  annualReturn?: number;
  scenario?: Scenario;
  /** Whose money it is today; rows for anyone else are gifts from this member. */
  fromMemberId: string;
  payout?: 'growth' | 'idcw';
}

export interface BringsHomeRow {
  memberId: string;
  /** Who pays the tax: the holder, or the giver when the income is clubbed. */
  taxedInId: string;
  gift: boolean;
  clubbedReason?: string;
  value: Paise;
  gain: Paise;
  tax: Paise;
  bringsHome: Paise;
  warnings: string[];
}

export type BringsHomeResult =
  | { status: 'ok'; taxType: TaxType; listed: boolean; annualReturn: number; rows: BringsHomeRow[] }
  | { status: 'check'; reason: string }
  | { status: 'invalid'; field: 'amount' | 'years' | 'annualReturn'; message: string };

const L = 1_00_000_00;
const NONE: GainBuckets = { equitySt: 0, equityLt: 0, otherLt: 0, slab: 0 };
/** Income assumed when a member's income was not entered (as in summariseYear): above the top slab. */
const UNKNOWN_INCOME: Paise = 50 * L;
/** Old regime: ₹1,500 of a minor's clubbed income is exempt in the parent's hands. */
const MINOR_EXEMPTION: Paise = 1_500_00;
const STALE_RATE_DAYS = 100;
/** Gifts from non-relatives up to this much a year are not taxed. */
const GIFT_LIMIT: Paise = 50_000_00;

function describeProduct(p: Product, securities: Security[]): { taxType: TaxType; listed: boolean; returnClass: ReturnClass | null; unlisted: boolean } | { check: string } {
  if (p.kind === 'fd') return { taxType: 'interest', listed: false, returnClass: 'fd', unlisted: false };
  if (p.kind === 'ppf') return { taxType: 'exempt', listed: false, returnClass: 'ppf', unlisted: false };
  if (p.kind === 'gold_etf') return { taxType: 'other_lt', listed: true, returnClass: 'gold', unlisted: false };
  if (p.kind === 'category') {
    const c = classifyFund(p.category, '');
    return c.taxType === 'check' ? { check: `How "${p.category}" funds are taxed depends on the fund. Pick a fund, or check its tax type.` } : { ...c, unlisted: !c.listed };
  }
  const sec = securities.find((x) => x.isin === p.isin);
  if (!sec || sec.taxType === 'check') return { check: `${sec?.name ?? 'This fund'}: its tax type is not known yet. Check it before comparing.` };
  const c = sec.category ? classifyFund(sec.category, sec.name) : null;
  return { taxType: sec.taxType, listed: sec.listed, returnClass: c?.returnClass ?? (sec.taxType === 'equity' ? 'equity' : null), unlisted: !sec.listed };
}

/**
 * What a sum brings home after tax in each member's name (foundation spec §5). Growth: one sale at the end of the
 * period, taxed as the extra tax that sale adds to the taxed member's year (this year: with the gains already booked;
 * a later year: a clean year with today's income and rules). Interest and IDCW: taxed every year on that year's
 * income in a clean year; the balance grows after tax. Income stays at today's level throughout.
 */
export function bringsHome(input: BringsHomeInput, view: FamilyView, members: Member[], securities: Security[], asOf: ISODate): BringsHomeResult {
  const { amount, years } = input;
  if (!Number.isFinite(amount) || amount <= 0) return { status: 'invalid', field: 'amount', message: 'Enter an amount above zero.' };
  if (!Number.isFinite(years) || years < 0.25 || years > 40) return { status: 'invalid', field: 'years', message: 'Pick a period between 3 months and 40 years.' };
  if (input.annualReturn != null && (!Number.isFinite(input.annualReturn) || input.annualReturn < -0.5 || input.annualReturn > 0.5)) {
    return { status: 'invalid', field: 'annualReturn', message: 'Use a yearly return between −50% and 50%.' };
  }
  const p = describeProduct(input.product, securities);
  if ('check' in p) return { status: 'check', reason: p.check };
  const rules = view.rules;
  const r = input.annualReturn ?? (p.returnClass ? nominalReturn(p.returnClass, input.scenario ?? 'base', rules) : null);
  if (r == null) return { status: 'check', reason: 'There is no assumed return for this kind of fund. Enter one to compare.' };

  const giver = members.find((m) => m.id === input.fromMemberId)!;
  const invested = p.unlisted ? amount - Math.round(amount * rules.costs.mfStampBuy) : amount;
  const yearly = p.taxType === 'interest' || (input.payout === 'idcw' && p.taxType !== 'exempt');
  const saleDate = addMonths(asOf, Math.round(years * 12));
  const months = longTermMonthsFor(p.taxType, p.listed, rules);
  const longTerm = months != null && isLongTerm(asOf, saleDate, months);
  const bucket: keyof GainBuckets = p.taxType === 'equity' ? (longTerm ? 'equityLt' : 'equitySt') : p.taxType === 'other_lt' && longTerm ? 'otherLt' : 'slab';

  const income = (m: Member, date: ISODate, rr: TaxRules) => normalIncomeOf(m, rr, date) ?? UNKNOWN_INCOME;
  /** Extra tax `gain` adds to `m`'s year: this year with the gains already booked; a later year clean. */
  const extraTax = (m: Member, gain: Paise, k: keyof GainBuckets, date: ISODate) => {
    const thisYear = date <= rules.end;
    const rr = thisYear ? rules : rulesFor(date);
    const base = thisYear ? view.members.find((v) => v.member.id === m.id)?.plan.buckets ?? NONE : NONE;
    const normal = income(m, date, rr);
    const before = taxForYear(m, normal, base, rr, date);
    const after = taxForYear(m, normal, { ...base, [k]: base[k] + Math.max(0, gain) }, rr, date);
    return { tax: after.tax - before.tax, total: after.total };
  };

  const rows: BringsHomeRow[] = members.map((holder) => {
    const gift = holder.id !== giver.id;
    const club = gift ? clubbing(giver, holder, members, asOf) : null;
    const taxed = members.find((m) => m.id === (club?.taxedInId ?? holder.id))!;
    const minorRelief = club && taxed.regime === 'old' && taxed.id !== holder.id && /minor/.test(club.reason) ? MINOR_EXEMPTION : 0;
    const warnings: string[] = [];
    let value: Paise, tax = 0, nearCliff = false;

    if (p.taxType === 'exempt') {
      value = Math.round(invested * (1 + r) ** years);
    } else if (yearly) {
      let bal = invested;
      const whole = Math.ceil(years);
      for (let y = 0; y < whole; y++) {
        const share = Math.min(1, years - y);
        const earned = Math.round(bal * ((1 + r) ** share - 1));
        const date = addMonths(asOf, 12 * y + Math.round(share * 12));
        const t = extraTax(taxed, Math.max(0, earned - minorRelief), 'slab', date > rules.end ? date : rules.end);
        nearCliff ||= taxed.regime === 'new' && Math.abs(t.total - 12 * L) <= 2 * L;
        tax += t.tax;
        bal += earned - t.tax;
      }
      value = bal + tax;
    } else {
      value = Math.round(invested * (1 + r) ** years);
      const t = extraTax(taxed, Math.max(0, value - invested - minorRelief), bucket, saleDate);
      tax = t.tax;
      nearCliff = taxed.regime === 'new' && Math.abs(t.total - 12 * L) <= 2 * L;
    }
    const gain = value - invested;
    // A gift from someone who is not a relative, over ₹50,000 in a year, is the receiver's income (s.92).
    const nonRelative = gift && !isRelative(giver, holder, members);
    if (nonRelative && amount > GIFT_LIMIT) tax += extraTax(holder, amount, 'slab', rules.end).tax;

    if (gift) {
      warnings.push(`Gift from ${giver.name}: it becomes ${holder.name}'s money for good.`);
      if (pairRelation(giver, holder, members) === 'parent') warnings.push(`It passes by ${holder.name}'s will: tell your siblings and check the will.`);
    }
    if (nonRelative) warnings.push(`${holder.name} is not a relative under the tax rules: a gift over ₹50,000 a year is taxed as their income.`);
    if (nearCliff) warnings.push('Near the ₹12 L line: more income here can cost far more.');
    if (taxed.regime === 'old' && p.taxType === 'equity') warnings.push("Old regime: deductions don't reduce these gains.");
    if (input.product.kind === 'ppf') {
      if (amount > rules.ppfYearlyLimit) warnings.push('PPF takes at most ₹1.5 L a year.');
      if (years < 15) warnings.push('PPF locks money for 15 years.');
    }
    if ((input.product.kind === 'ppf' || input.product.kind === 'fd') && daysBetween(rules.smallSavings.asOf, asOf) > STALE_RATE_DAYS) {
      warnings.push(`Rate last checked ${rules.smallSavings.asOf}.`);
    }
    return { memberId: holder.id, taxedInId: taxed.id, gift, clubbedReason: club?.reason, value, gain, tax, bringsHome: value - tax, warnings };
  });

  rows.sort((a, b) => b.bringsHome - a.bringsHome);
  return { status: 'ok', taxType: p.taxType, listed: p.listed, annualReturn: r, rows };
}
