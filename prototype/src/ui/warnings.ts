import type { BrokerAdjustment, HoldingsNotes } from '../engine/family';
import { normAccount } from '../engine/openingLots';
import type { TaxRules } from '../engine/rules';
import type { YearSummary } from '../engine/tax';
import { QTY_SCALE, type ISODate, type LedgerWarning, type Paise, type Qty, type Realised, type TermAnswer } from '../engine/types';
import { dateLabel, inr, units as unitsLabel } from './format';

/**
 * What the member page shows about gaps in the history: only what changes this year's figures, grouped, in plain words.
 * The ledger keeps every warning; this is presentation only.
 */

/** True when a broker Tax P&L covers that member's account on that date: its totals win over the history's. */
export type Covered = (memberId: string, account: string, date: ISODate) => boolean;

type SummaryLike = { memberId: string; account: string; summary: { broker?: string; from: ISODate | null; to: ISODate | null } };

/** Coverage the way the broker correction works it out (`computeFamily`): same member and account label, within its dates. */
export function pnlCoverage(summaries: SummaryLike[], rules: TaxRules): Covered {
  return (memberId, account, date) => summaries.some((b) => b.memberId === memberId && b.account === account
    && date >= (b.summary.from ?? rules.start) && date <= (b.summary.to ?? rules.end));
}

/** True when the account has a Tax P&L for any part of this tax year (for the buyback caveat). */
export function hasYearPnl(summaries: SummaryLike[], rules: TaxRules) {
  return (memberId: string, account: string) => summaries.some((b) => b.memberId === memberId && normAccount(b.account) === normAccount(account)
    && (b.summary.from ?? rules.start) <= rules.end && (b.summary.to ?? rules.end) >= rules.start);
}

const inYear = (d: ISODate, fy: TaxRules) => d >= fy.start && d <= fy.end;
const brokerOf = (account: string) => account.trim() || 'your broker';

/** Units a warning saved before it carried them: read from "Sold N more units…". */
function warningUnits(w: LedgerWarning): Qty {
  if (w.qty != null) return w.qty;
  const m = /Sold ([\d,.]+) more units/.exec(w.message);
  return m ? Math.round(Number(m[1]!.replace(/,/g, '')) * QTY_SCALE) : 0;
}

export interface OversellGroup { isin: string; account: string; units: Qty; from: ISODate; to: ISODate }

/**
 * Sales of more units than the history holds. `now`: this tax year and not covered by a Tax P&L, one row per share and
 * account with the units summed. `older`: everything else, which leaves this year's tax alone.
 */
export function visibleOversells(warnings: LedgerWarning[], fy: TaxRules, covered: Covered): { now: OversellGroup[]; older: LedgerWarning[] } {
  const groups = new Map<string, OversellGroup>();
  const older: LedgerWarning[] = [];
  for (const w of warnings) {
    const account = w.account ?? '';
    if (!inYear(w.date, fy) || covered(w.memberId, account, w.date)) { older.push(w); continue; }
    const k = `${w.isin}|${normAccount(account)}`;
    const g = groups.get(k);
    if (!g) { groups.set(k, { isin: w.isin, account, units: warningUnits(w), from: w.date, to: w.date }); continue; }
    g.units += warningUnits(w);
    if (w.date < g.from) g.from = w.date;
    if (w.date > g.to) g.to = w.date;
  }
  return { now: [...groups.values()], older };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (d: ISODate) => MON[Number(d.slice(5, 7)) - 1]!;

/** "Jun 2026", "May–Aug 2026", "Dec 2026–Jan 2027". */
export function monthRange(from: ISODate, to: ISODate): string {
  const [fy, ty] = [from.slice(0, 4), to.slice(0, 4)];
  if (fy !== ty) return `${month(from)} ${fy}–${month(to)} ${ty}`;
  return month(from) === month(to) ? `${month(from)} ${fy}` : `${month(from)}–${month(to)} ${fy}`;
}

export const oversellLine = (name: string, g: OversellGroup) =>
  `${name}: sold ${unitsLabel(g.units)} more units than the history shows (${monthRange(g.from, g.to)}). Their gain is left out until you import ${brokerOf(g.account)}'s tax P&L. Possibly an IPO allotment or a transfer in.`;

/** The quiet lines a member's holdings files add: units that left, files older than the trades, units changed without a trade. */
export function holdingsNoteLines(
  notes: HoldingsNotes, memberId: string, nameOf: (isin: string) => string, hasPnl: (memberId: string, account: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const t of notes.trimmed.filter((x) => x.memberId === memberId)) {
    const n = t.isins.length;
    const broker = brokerOf(t.account);
    out.push(`${n} ${n === 1 ? 'share' : 'shares'} in your trade history ${n === 1 ? "isn't" : "aren't"} in ${broker}'s holdings on ${dateLabel(t.asOf)}, so ${n === 1 ? "it's" : "they're"} left out.`
      + (hasPnl(memberId, t.account) ? '' : ` If any of these left in a buyback this year, that gain counts: import ${broker}'s tax P&L.`));
  }
  for (const f of notes.staleFiles.filter((x) => x.memberId === memberId)) {
    out.push(`Your ${brokerOf(f.account)} holdings file is from ${dateLabel(f.asOf)}, before your latest trades. Import a newer one.`);
  }
  // Only units that changed: a cost lowered to the file's needs nothing from the family.
  const seen = new Set<string>();
  for (const c of notes.corporateActions.filter((x) => x.memberId === memberId && x.kind === 'units')) {
    if (seen.has(c.isin)) continue;
    seen.add(c.isin);
    out.push(`${nameOf(c.isin)}: units changed without a trade (bonus, split or demerger?). Import Zerodha's tax P&L or external tradebook for exact figures.`);
  }
  return out;
}

/** One sale whose buy date is unknown, keyed like a `TermAnswer`, with the term the engine assumed. */
export interface UnknownTermSale { memberId: string; account: string; isin: string; sellDate: ISODate; qty: Qty; gain: Paise; term: Realised['term'] }

const saleKey = (memberId: string, account: string, isin: string, sellDate: ISODate) => `${memberId}|${normAccount(account)}|${isin}|${sellDate}`;

/**
 * Sales this tax year from lots with a guessed date that the family can answer: shares and equity funds only (other
 * types keep their own term), never ELSS (`skip`), and never one a broker Tax P&L covers, since its totals win.
 */
export function unknownTermSales(realised: Realised[], memberId: string, fy: TaxRules, covered: Covered, skip: (isin: string) => boolean = () => false): UnknownTermSale[] {
  const out = new Map<string, UnknownTermSale>();
  for (const r of realised) {
    const account = r.account ?? '';
    if (r.memberId !== memberId || !r.termUnknown || r.taxType !== 'equity' || !inYear(r.sellDate, fy) || covered(memberId, account, r.sellDate) || skip(r.isin)) continue;
    const k = saleKey(memberId, account, r.isin, r.sellDate);
    const s = out.get(k) ?? { memberId, account, isin: r.isin, sellDate: r.sellDate, qty: 0, gain: 0, term: r.term };
    s.qty += r.qty;
    s.gain += r.gain;
    s.term = s.gain >= 0 ? 'lt' : 'st';
    out.set(k, s);
  }
  return [...out.values()];
}

/** The family's answers whose sale is still booked this year and not covered by a Tax P&L, with how the row reads. */
export function answeredSales(realised: Realised[], answers: TermAnswer[], memberId: string, fy: TaxRules, covered: Covered): Array<{ answer: TermAnswer; label: string }> {
  const sold = new Set(realised.filter((r) => r.memberId === memberId).map((r) => saleKey(memberId, r.account ?? '', r.isin, r.sellDate)));
  return answers
    .filter((a) => a.memberId === memberId && inYear(a.sellDate, fy) && !covered(memberId, a.account, a.sellDate) && sold.has(saleKey(memberId, a.account, a.isin, a.sellDate)))
    .map((answer) => ({ answer, label: answer.buyDate ? 'Buy date entered by you' : 'Term set by you' }));
}

/**
 * "Booked this year" with the broker correction on its own lines. `summariseYear` counts a negative correction as a
 * loss set off; the display takes it out of "Losses set off" and shows it as an adjustment. The tax is unchanged.
 */
export function bookedDisplay(year: Pick<YearSummary, 'stLosses' | 'ltLosses'>, adjustments: BrokerAdjustment[], memberId: string) {
  const mine = adjustments.filter((a) => a.memberId === memberId);
  const negative = mine.reduce((s, a) => s + (a.gain < 0 ? -a.gain : 0), 0);
  return {
    lossesSetOff: year.stLosses + year.ltLosses - negative,
    adjustments: mine.filter((x) => x.gain !== 0)
      .map((x) => `Adjusted to ${x.broker}'s figure: ${x.gain > 0 ? '+' : ''}${inr(x.gain)} ${x.term === 'st' ? 'short-term' : 'long-term'}`),
  };
}
