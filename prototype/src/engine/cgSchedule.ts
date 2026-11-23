import { inRange } from './dates';
import type { FamilyView } from './family';
import { QTY_SCALE, type ISODate, type Paise, type Qty, type Realised } from './types';

export type CgSectionKey = 'equity_lt' | 'equity_st' | 'other_lt' | 'slab' | 'check' | 'set_off' | 'business';

export interface CgRow {
  isin: string;
  name: string;
  units: Qty;
  saleDate: ISODate;
  saleValue: Paise;
  cost: Paise;
  /** Total 31 Jan 2018 value of the grandfathered units sold (equity bought on or before that date). */
  fmv2018?: Paise;
  gain: Paise;
}

export interface CgSection {
  key: CgSectionKey; title: string; rows: CgRow[]; total: Paise;
  /**
   * On a sale section with rows: its gains after loss set-off and any F&O loss set-off, as the year summary's buckets
   * hold them (what the tax uses). Slab-taxed and needs-checking gains share one bucket, so only one of those two
   * sections carries it (slab when it has rows, else check), and `afterSetOffLabel` says so when both have rows.
   */
  afterSetOff?: Paise;
  afterSetOffLabel?: string;
}
export interface CgSchedule {
  sections: CgSection[];
  /** Sum of the sale sections (everything but `set_off` and `business`): the member's realised gains for the year. */
  totalGain: Paise;
  /** Gains on exempt sales this year: not taxed, so not listed; the year summary's gain totals include them. */
  exemptGain: Paise;
}

export const AFTER_SET_OFF = 'After set-off (what the tax uses)';
export const EXEMPT_NOTE = 'Exempt sales are not listed here.';

export const CG_TITLES: Record<CgSectionKey, string> = {
  equity_lt: 'Equity long-term (112A)',
  equity_st: 'Equity short-term (111A)',
  other_lt: 'Other long-term',
  slab: 'Slab-taxed gains (debt and specified funds)',
  check: 'Needs checking (tax type unknown)',
  set_off: 'Losses brought forward and carried forward',
  business: "Intraday and F&O (from your broker's report)",
};
const ORDER: CgSectionKey[] = ['equity_lt', 'equity_st', 'other_lt', 'slab', 'check', 'set_off', 'business'];
/** The sections that hold sales; their totals add up to the member's realised gains. */
export const SALE_SECTIONS: CgSectionKey[] = ['equity_lt', 'equity_st', 'other_lt', 'slab', 'check'];

/** Same buckets as the tax calculation: equity by term, other long-term only once long-term, the rest slab-taxed. */
function sectionOf(r: Realised): CgSectionKey | null {
  if (r.taxType === 'exempt') return null; // not taxed, so not on the schedule
  if (r.taxType === 'check') return 'check';
  if (r.taxType === 'equity') return r.term === 'lt' ? 'equity_lt' : 'equity_st';
  if (r.taxType === 'other_lt' && r.term === 'lt') return 'other_lt';
  return 'slab';
}

/** A real sale (has an ISIN and units). Broker corrections and the loss and business lines carry only a gain. */
export const isSaleRow = (r: CgRow): boolean => r.isin !== '' && !r.isin.startsWith('ADJ:');

/** A broker correction's row (spec §7): "Adjusted to <broker>'s tax P&L", no units or dates. */
function adjustedName(view: FamilyView, r: { memberId: string; isin: string; account?: string }): string {
  const a = view.brokerAdjustments.find((x) => x.memberId === r.memberId && x.account === (r.account ?? '') && `ADJ:${x.label}` === r.isin);
  return `Adjusted to ${a?.broker || 'the broker'}'s tax P&L`;
}

export function cgSchedule(view: FamilyView, memberId: string): CgSchedule {
  const { rules } = view;
  const buckets = new Map<CgSectionKey, Map<string, CgRow>>(ORDER.map((k) => [k, new Map()]));
  let exemptGain = 0;
  for (const r of view.booked) {
    if (r.memberId !== memberId || !inRange(r.sellDate, rules.start, rules.end)) continue;
    const key = sectionOf(r);
    if (!key) { exemptGain += r.gain; continue; }
    const sec = view.securities.get(r.isin);
    const rows = buckets.get(key)!;
    const adj = r.isin.startsWith('ADJ:');
    // One row per sale: lots and accounts sold on the same day merge. A broker correction is one row per account.
    const id = adj ? `${r.isin}|${r.account ?? ''}` : `${r.sellDate}|${r.isin}`;
    const row = rows.get(id) ?? { isin: r.isin, name: sec?.name ?? (adj ? adjustedName(view, r) : r.isin), units: 0, saleDate: r.sellDate, saleValue: 0, cost: 0, gain: 0 };
    row.units += r.qty;
    row.saleValue += r.proceeds;
    row.cost += r.cost;
    row.gain += r.gain;
    if (sec?.fmv2018 && r.taxType === 'equity' && r.buyDate <= rules.grandfatherDate) {
      row.fmv2018 = (row.fmv2018 ?? 0) + Math.round((sec.fmv2018 * r.qty) / QTY_SCALE);
    }
    rows.set(id, row);
  }

  const v = view.members.find((m) => m.member.id === memberId);
  const informational = (label: string, gain: Paise): CgRow => ({ isin: '', name: label, units: 0, saleDate: '', saleValue: 0, cost: 0, gain });
  const setOff: CgRow[] = [];
  const business: CgRow[] = [];
  if (v) {
    const bf = v.member.carriedLoss ?? { st: 0, lt: 0 };
    const cf = v.year.lossCarriedForward;
    if (bf.st) setOff.push(informational('Short-term loss brought forward', -bf.st));
    if (bf.lt) setOff.push(informational('Long-term loss brought forward', -bf.lt));
    if (cf.st) setOff.push(informational('Short-term loss to carry forward', -cf.st));
    if (cf.lt) setOff.push(informational('Long-term loss to carry forward', -cf.lt));
    if (v.business.speculative) business.push(informational('Intraday (speculative)', v.business.speculative));
    if (v.business.nonSpeculative) business.push(informational('F&O (non-speculative)', v.business.nonSpeculative));
    if (v.year.business.setOffAgainstGains) business.push(informational('F&O loss set off against capital gains', -v.year.business.setOffAgainstGains));
  }

  const sections: CgSection[] = ORDER.map((key) => {
    const rows = key === 'set_off' ? setOff : key === 'business' ? business
      : [...buckets.get(key)!.values()].sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.isin.localeCompare(b.isin));
    return { key, title: CG_TITLES[key], rows, total: rows.reduce((a, r) => a + r.gain, 0) };
  });
  if (v) {
    const by = (k: CgSectionKey) => sections.find((x) => x.key === k)!;
    const g = v.year.buckets;
    for (const [k, amount] of [['equity_lt', g.equityLt], ['equity_st', g.equitySt], ['other_lt', g.otherLt]] as const) {
      if (by(k).rows.length) { by(k).afterSetOff = amount; by(k).afterSetOffLabel = AFTER_SET_OFF; }
    }
    const slab = by('slab'), check = by('check');
    const home = slab.rows.length ? slab : check.rows.length ? check : null;
    if (home) {
      home.afterSetOff = g.slab;
      home.afterSetOffLabel = slab.rows.length && check.rows.length ? `${AFTER_SET_OFF}, with the needs-checking section` : AFTER_SET_OFF;
    }
  }
  const totalGain = sections.filter((s) => SALE_SECTIONS.includes(s.key)).reduce((a, s) => a + s.total, 0);
  return { sections, totalGain, exemptGain };
}
