import { ageOn, inRange } from './dates';
import { basicExemption, normalIncomeOf, rebateEligible, slabTax, type TaxRules } from './rules';
import type { ISODate, Member, Paise, Realised, Security, TaxType } from './types';

export { normalIncomeOf };

export interface YearSummary {
  stGains: Paise;
  stLosses: Paise;
  ltGains: Paise;
  ltLosses: Paise;
  /** Net gains after this year's and carried-forward set-off. */
  stNet: Paise;
  ltNet: Paise;
  exemptionUsed: Paise;
  stTaxable: Paise;
  ltTaxable: Paise;
  /** Tax on capital gains booked so far, cess included, rounded to the rupee. */
  tax: Paise;
  room: { limit: Paise; used: Paise; free: Paise };
  business: {
    /** Intraday profit (+) or loss (−) after set-off. */
    speculative: Paise;
    /** F&O profit (+) or loss (−) after set-off. */
    nonSpeculative: Paise;
    /** F&O loss used against this year's capital gains. */
    setOffAgainstGains: Paise;
    /** Extra slab tax (with cess) because of trading profit. */
    tax: Paise;
    /** True when income was not entered, so trading profit was taxed at 30%. */
    assumedTopSlab: boolean;
    carryForward: { speculative: Paise; nonSpeculative: Paise };
  };
  bonus: { total: Paise; used: Paise; free: Paise };
  lossCarriedForward: { st: Paise; lt: Paise };
  /** Gains by how they are taxed, after set-off. */
  buckets: GainBuckets;
  /** Gains from funds whose tax type is not yet known, taxed as slab here. */
  unchecked: Paise;
  /** The set-off order used (the lowest-tax one; whether the law lets the taxpayer choose is open, so it is shown). */
  setOffOrder: { st: StOrder; lt: LtOrder };
}

/** Gains after set-off, by how they are taxed. All ≥ 0. Slab holds short-term non-equity, debt, interest and check. */
export interface GainBuckets { equitySt: Paise; equityLt: Paise; otherLt: Paise; slab: Paise }
export type StOrder = Array<keyof GainBuckets>;
export type LtOrder = Array<'otherLt' | 'equityLt'>;

export interface TaxBreakdown {
  total: Paise;
  exemptionUsed: Paise;
  /** Unused basic exemption set against special-rate gains (residents). */
  basicGapUsed: Paise;
  rebate: Paise;
  marginalRelief: Paise;
  /** Tax including cess, rounded to the rupee. */
  tax: Paise;
}

const roundRupee = (p: Paise) => Math.round(p / 100) * 100;
const L = 1_00_000_00;
const NONE: GainBuckets = { equitySt: 0, equityLt: 0, otherLt: 0, slab: 0 };

/** Debt-fund lots bought before the specified-fund cutoff (s.76) are taxed as other long-term assets. */
export function lotTaxType(sec: Pick<Security, 'taxType'>, buyDate: ISODate, r: TaxRules): TaxType {
  return sec.taxType === 'slab' && buyDate < r.specifiedFundCutoff ? 'other_lt' : sec.taxType;
}

/** Months to become long-term, or null when the type is never long-term (slab-taxed whatever the holding). */
export function longTermMonthsFor(t: TaxType, listed: boolean, r: TaxRules): number | null {
  // `check` (type not yet known) gets the equity holding period so terms read sensibly; its gains are still taxed as slab.
  if (t === 'equity' || t === 'check') return r.longTermMonths;
  if (t === 'other_lt') return listed ? r.longTermMonths : r.otherLongTermMonths;
  return null;
}

const bucketOf = (x: Pick<Realised, 'taxType' | 'term'>): keyof GainBuckets =>
  x.taxType === 'equity' ? (x.term === 'lt' ? 'equityLt' : 'equitySt') : x.taxType === 'other_lt' && x.term === 'lt' ? 'otherLt' : 'slab';

/**
 * Capital loss set-off (s.108, s.111): short-term losses against any capital gain, in `order.st`; long-term losses
 * only against long-term gains, in `order.lt`. This year's losses first, then carried-forward ones under the same
 * rules. Long-term losses go first because they have fewer places to go. `exempt` sales are ignored.
 */
export function setOff(realised: Realised[], carried: { st: Paise; lt: Paise }, order: { st: StOrder; lt: LtOrder }) {
  const net: GainBuckets = { ...NONE };
  let stLoss = 0, ltLoss = 0, unchecked = 0;
  for (const x of realised) {
    if (x.taxType === 'exempt') continue;
    if (x.gain >= 0) {
      net[bucketOf(x)] += x.gain;
      if (x.taxType === 'check') unchecked += x.gain;
    } else if (bucketOf(x) === 'equityLt' || bucketOf(x) === 'otherLt') ltLoss -= x.gain;
    else stLoss -= x.gain;
  }
  const apply = (loss: Paise, buckets: Array<keyof GainBuckets>) => {
    for (const k of buckets) { const u = Math.min(loss, net[k]); net[k] -= u; loss -= u; }
    return loss;
  };
  ltLoss = apply(ltLoss, order.lt);
  stLoss = apply(stLoss, order.st);
  const cfLt = apply(carried.lt, order.lt);
  const cfSt = apply(carried.st, order.st);
  return { net, carryForward: { st: stLoss + cfSt, lt: ltLoss + cfLt }, unchecked };
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
const DEFAULT_ST: StOrder = ['slab', 'equitySt', 'otherLt', 'equityLt'];
const DEFAULT_LT: LtOrder = ['otherLt', 'equityLt'];
const ST_ORDERS = permutations(DEFAULT_ST);
const LT_ORDERS: LtOrder[] = [DEFAULT_LT, ['equityLt', 'otherLt']];

/** Tries every legal order and keeps the one with the lowest tax; ties keep the default order. */
export function bestSetOff(realised: Realised[], carried: { st: Paise; lt: Paise }, m: Member, normal: Paise, r: TaxRules, asOf: ISODate) {
  let best: (ReturnType<typeof setOff> & { order: { st: StOrder; lt: LtOrder } }) | null = null;
  let bestTax = Infinity;
  for (const lt of LT_ORDERS) for (const st of ST_ORDERS) {
    const res = setOff(realised, carried, { st, lt });
    const t = taxForYear(m, normal, res.net, r, asOf).tax;
    if (t < bestTax) { bestTax = t; best = { ...res, order: { st, lt } }; }
  }
  return best!;
}

/**
 * A member's tax for a tax year (new or old regime). Order matters:
 * 1. Slab income = normal income + slab-taxed gains; total adds the special-rate gains.
 * 2. The ₹1.25 L exemption on long-term equity gains (s.198).
 * 3. Residents: unused basic exemption against short-term equity, then long-term equity, then other long-term gains.
 * 4. Slab tax with the rebate (s.156), which covers slab tax only, tested on total income.
 * 5. Special-rate tax: 20% short-term equity (s.196), 12.5% long-term (s.198 and other long-term assets).
 * 6. New regime above ₹12 L: marginal relief, so tax never exceeds the income above ₹12 L.
 * 7. Cess, rounded to the rupee.
 */
export function taxForYear(m: Member, normal: Paise, g: GainBuckets, r: TaxRules, asOf: ISODate): TaxBreakdown {
  const who = { ...m, age: ageOn(m, asOf) };
  const slabIncome = normal + g.slab;
  const total = slabIncome + g.equitySt + g.equityLt + g.otherLt;
  const exemptionUsed = Math.min(g.equityLt, r.ltcgExemption);
  let st = g.equitySt, lt = g.equityLt - exemptionUsed, other = g.otherLt;
  let gap = m.resident === false ? 0 : Math.max(0, basicExemption(who, r) - slabIncome);
  const gapStart = gap;
  for (const take of ['st', 'lt', 'other'] as const) {
    const have = take === 'st' ? st : take === 'lt' ? lt : other;
    const u = Math.min(have, gap); gap -= u;
    if (take === 'st') st -= u; else if (take === 'lt') lt -= u; else other -= u;
  }
  const slabPart = slabTax(slabIncome, total, who, r);
  const rebate = slabTax(slabIncome, Infinity, who, r) - slabPart;
  const special = st * r.stcgRate + lt * r.ltcgRate + other * r.ltcgRate;
  const marginalRelief = m.regime === 'new' && rebateEligible(m) && total > 12 * L ? Math.max(0, slabPart + special - (total - 12 * L)) : 0;
  const tax = roundRupee((slabPart + special - marginalRelief) * (1 + r.cess));
  return { total, exemptionUsed, basicGapUsed: gapStart - gap, rebate, marginalRelief, tax };
}

/**
 * The largest extra long-term equity gain, to the rupee, that adds no tax: the exemption left, any unused basic
 * exemption, and never past the ₹12 L line where the rebate is lost. Tax never falls as gains rise, so a binary
 * search works.
 */
export function freeEquityLtRoom(m: Member, normal: Paise, g: GainBuckets, r: TaxRules, asOf: ISODate): Paise {
  const base = taxForYear(m, normal, g, r, asOf).tax;
  const free = (x: Paise) => taxForYear(m, normal, { ...g, equityLt: g.equityLt + x }, r, asOf).tax === base;
  let lo = 0, hi = Math.round((r.ltcgExemption + basicExemption({ ...m, age: ageOn(m, asOf) }, r)) / 100);
  if (free(hi * 100)) return hi * 100;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (free(mid * 100)) lo = mid; else hi = mid - 1;
  }
  return lo * 100;
}

/** Normal income assumed when it was not entered: above the top slab, so no rebate or basic room is ever assumed. */
const UNKNOWN_INCOME: Paise = 50 * L;

export interface BusinessIncome { speculative: Paise; nonSpeculative: Paise }

/**
 * The year so far for one member: set-off, exemption, basic room, tax on gains and trading profit.
 * Trading income (s.43(5)-style rules): an intraday loss only offsets intraday profit and carries forward; an F&O loss
 * offsets intraday profit, then capital gains (short-term equity, slab, other, long-term equity), and carries forward.
 * Trading profit is taxed at slab rates and shrinks the basic exemption left for bonus room. When income was not
 * entered, no basic room is assumed and trading profit is taxed at 30% (today's meaning, kept).
 */
export function summariseYear(member: Member, realised: Realised[], rules: TaxRules, biz: BusinessIncome = { speculative: 0, nonSpeculative: 0 }): YearSummary {
  const asOf = rules.end;
  const mine = realised.filter((x) => x.memberId === member.id && inRange(x.sellDate, rules.start, rules.end));
  let stGains = 0, stLosses = 0, ltGains = 0, ltLosses = 0;
  for (const x of mine) {
    if (x.term === 'st') x.gain >= 0 ? (stGains += x.gain) : (stLosses -= x.gain);
    else x.gain >= 0 ? (ltGains += x.gain) : (ltLosses -= x.gain);
  }

  const known = normalIncomeOf(member, rules, asOf);
  const normal = known ?? UNKNOWN_INCOME;
  const carried = { st: member.carriedLoss?.st ?? 0, lt: member.carriedLoss?.lt ?? 0 };
  const best = bestSetOff(mine, carried, member, normal, rules, asOf);
  const g = { ...best.net };

  let spec = biz.speculative, ns = biz.nonSpeculative, u = 0;
  if (ns < 0 && spec > 0) { u = Math.min(-ns, spec); ns += u; spec -= u; }
  let setOffAgainstGains = 0;
  for (const k of ['equitySt', 'slab', 'otherLt', 'equityLt'] as const) {
    if (ns >= 0) break;
    u = Math.min(-ns, g[k]); g[k] -= u; ns += u; setOffAgainstGains += u;
  }
  const businessProfit = Math.max(0, spec) + Math.max(0, ns);
  const withBiz = normal + businessProfit;

  const full = taxForYear(member, withBiz, g, rules, asOf);
  const tax = full.tax - taxForYear(member, normal, NONE, rules, asOf).tax;
  const bizTax = taxForYear(member, withBiz, NONE, rules, asOf).tax - taxForYear(member, normal, NONE, rules, asOf).tax;

  const basic = basicExemption({ ...member, age: ageOn(member, asOf) }, rules);
  const bonusTotal = known == null || member.resident === false ? 0 : Math.max(0, basic - withBiz);
  const bonusLeftAfterSlab = known == null || member.resident === false ? 0 : Math.max(0, basic - withBiz - g.slab);
  let bonusFree = Math.max(0, bonusLeftAfterSlab - full.basicGapUsed);
  let roomFree = rules.ltcgExemption - full.exemptionUsed;
  // Never call room free past the ₹12 L line: cap the sum at what really adds no tax, taking it from bonus first.
  const reallyFree = freeEquityLtRoom(member, withBiz, g, rules, asOf);
  const over = roomFree + bonusFree - reallyFree;
  if (over > 0) { const fromBonus = Math.min(bonusFree, over); bonusFree -= fromBonus; roomFree -= over - fromBonus; }

  const stTaxable = Math.max(0, g.equitySt - Math.min(g.equitySt, full.basicGapUsed));
  const ltTaxable = Math.max(0, g.equityLt - full.exemptionUsed - Math.max(0, full.basicGapUsed - g.equitySt));

  return {
    stGains, stLosses, ltGains, ltLosses,
    stNet: g.equitySt, ltNet: g.equityLt,
    exemptionUsed: full.exemptionUsed, stTaxable, ltTaxable, tax,
    room: { limit: rules.ltcgExemption, used: full.exemptionUsed, free: roomFree },
    bonus: { total: bonusTotal, used: bonusTotal - bonusFree, free: bonusFree },
    lossCarriedForward: best.carryForward,
    business: {
      speculative: spec, nonSpeculative: ns, setOffAgainstGains, tax: bizTax,
      assumedTopSlab: businessProfit > 0 && known == null,
      carryForward: { speculative: Math.max(0, -spec), nonSpeculative: Math.max(0, -ns) },
    },
    buckets: g, unchecked: best.unchecked, setOffOrder: best.order,
  };
}
