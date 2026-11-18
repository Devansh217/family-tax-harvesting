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

export interface CgSection { key: CgSectionKey; title: string; rows: CgRow[]; total: Paise }
export interface CgSchedule {
  sections: CgSection[];
  /** Sum of the sale sections (everything but `set_off` and `business`): the member's realised gains for the year. */
  totalGain: Paise;
}

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

export function cgSchedule(view: FamilyView, memberId: string): CgSchedule {
  const { rules } = view;
  const buckets = new Map<CgSectionKey, Map<string, CgRow>>(ORDER.map((k) => [k, new Map()]));
  for (const r of view.booked) {
    if (r.memberId !== memberId || !inRange(r.sellDate, rules.start, rules.end)) continue;
    const key = sectionOf(r);
    if (!key) continue;
    const sec = view.securities.get(r.isin);
    const rows = buckets.get(key)!;
    const id = `${r.sellDate}|${r.isin}`; // one row per sale: lots and accounts sold on the same day merge
    const row = rows.get(id) ?? { isin: r.isin, name: sec?.name ?? (r.isin.startsWith('ADJ:') ? `Broker figure: ${r.isin.slice(4)}` : r.isin), units: 0, saleDate: r.sellDate, saleValue: 0, cost: 0, gain: 0 };
    row.units += r.qty;
    row.saleValue += r.proceeds;
    row.cost += r.cost;
    row.gain += r.gain;
    if (sec?.fmv2018 && sec.taxType === 'equity' && r.buyDate <= rules.grandfatherDate) {
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
  }

  const sections: CgSection[] = ORDER.map((key) => {
    const rows = key === 'set_off' ? setOff : key === 'business' ? business
      : [...buckets.get(key)!.values()].sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.isin.localeCompare(b.isin));
    return { key, title: CG_TITLES[key], rows, total: rows.reduce((a, r) => a + r.gain, 0) };
  });
  const totalGain = sections.filter((s) => SALE_SECTIONS.includes(s.key)).reduce((a, s) => a + s.total, 0);
  return { sections, totalGain };
}
