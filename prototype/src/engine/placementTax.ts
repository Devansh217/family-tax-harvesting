import { addMonths } from './dates';
import { rulesFor } from './rules';
import { freeEquityLtRoom, taxForYear, type GainBuckets } from './tax';
import type { ISODate, Member, Paise } from './types';

export type TaxClass = 'equity' | 'other_lt' | 'slab';

export interface Slice {
  assetId: string;
  taxClass: TaxClass;
  /** Yearly growth, e.g. 0.1. */
  annualReturn: number;
  /** What the holder starts with. */
  value: Paise;
  gain: Paise;
  /** Yearly SIP money (0 for a holding). */
  yearlyAdd: Paise;
}

export interface ProjectionStart {
  /** Income taxed at slab rates; the same every year. */
  normal: Paise;
  /** Gains already booked in this tax year. Later years start from zero. */
  year1: GainBuckets;
}

export const PLACEMENT_YEARS = 10;

const ZERO: GainBuckets = { equitySt: 0, equityLt: 0, otherLt: 0, slab: 0 };

interface State {
  s: Slice;
  value: Paise;
  /** Gain that can be harvested or sold as long-term. */
  gain: Paise;
  /** Gain on money added this year, not yet a year old; it joins `gain` next year. */
  young: Paise;
}

/**
 * The extra tax over `years` tax years from holding these slices, with equity gains harvested each year inside the
 * year's tax-free room and everything left sold in the last year.
 *
 * Each year, in order: young gain from last year becomes harvestable; every slice grows by its return on the value at
 * the start of the year plus that year's add (year 1's add earns nothing that year); then equity gain is harvested up
 * to `freeEquityLtRoom`, shared across slices by their gain. Harvesting is free by construction (the room is the most
 * that leaves the tax unchanged), so a year before the last costs the same with or without the slices. Only the last
 * year, where the rest is sold, can add tax, and the result is that year's tax with the sale minus without it. That
 * is the same as summing every year's tax with and without the slices, without the calls that cancel.
 *
 * Simplification: at the final sale, equity gain still under a year old is taxed as long-term too.
 */
export function tenYearTax(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number = PLACEMENT_YEARS): Paise {
  if (slices.length === 0 || years < 1) return 0;
  const st: State[] = slices.map((s) => ({ s, value: s.value, gain: Math.max(0, s.gain), young: 0 }));
  const equity = st.filter((x) => x.s.taxClass === 'equity');
  let sale: GainBuckets = ZERO;

  for (let y = 1; y <= years; y++) {
    for (const x of st) {
      x.gain += x.young; x.young = 0;
      const grown = Math.round(x.value * x.s.annualReturn);
      const addGrown = y === 1 ? 0 : Math.round(x.s.yearlyAdd * x.s.annualReturn);
      x.gain += grown; x.young += addGrown;
      x.value += x.s.yearlyAdd + grown + addGrown;
    }
    const date = addMonths(asOf, 12 * (y - 1));
    const buckets = y === 1 ? start.year1 : ZERO;

    let harvestable = 0;
    for (const x of equity) harvestable += Math.max(0, x.gain);
    if (harvestable > 0) {
      const room = freeEquityLtRoom(member, start.normal, buckets, rulesFor(date), date);
      let left = Math.min(harvestable, room), pool = harvestable;
      for (const x of equity) {
        const g = Math.max(0, x.gain);
        if (g === 0) continue;
        const take = g === pool ? left : Math.min(g, Math.round(left * g / pool));
        x.gain -= take; left -= take; pool -= g;
      }
    }

    if (y === years) {
      let equityLt = 0, otherLt = 0, slab = 0;
      for (const x of st) {
        const g = Math.max(0, x.gain + x.young);
        if (x.s.taxClass === 'equity') equityLt += g; else if (x.s.taxClass === 'other_lt') otherLt += g; else slab += g;
      }
      sale = { equitySt: 0, equityLt, otherLt, slab };
    }
  }

  const r = rulesFor(addMonths(asOf, 12 * (years - 1)));
  const date = addMonths(asOf, 12 * (years - 1));
  const base = years === 1 ? start.year1 : ZERO;
  const withSale: GainBuckets = {
    equitySt: base.equitySt + sale.equitySt, equityLt: base.equityLt + sale.equityLt,
    otherLt: base.otherLt + sale.otherLt, slab: base.slab + sale.slab,
  };
  return Math.max(0, taxForYear(member, start.normal, withSale, r, date).tax - taxForYear(member, start.normal, base, r, date).tax);
}
