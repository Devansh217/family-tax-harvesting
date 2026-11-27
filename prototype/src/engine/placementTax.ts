import { addMonths } from './dates';
import { rulesFor, type TaxRules } from './rules';
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
 * Speed: the placement solver calls `tenYearTax` thousands of times for the same members. Everything here that
 * doesn't depend on the slices (each year's date and rules, each year's free room, the final year's tax without the
 * slices) is remembered per member and start object. Members and starts are treated as immutable, as everywhere in
 * the engine: a changed member is a new object and gets fresh values.
 */
const memo = new WeakMap<Member, WeakMap<ProjectionStart, Map<string, Paise>>>();
function memoOf(member: Member, start: ProjectionStart): Map<string, Paise> {
  let byStart = memo.get(member);
  if (!byStart) { byStart = new WeakMap(); memo.set(member, byStart); }
  let m = byStart.get(start);
  if (!m) { m = new Map(); byStart.set(start, m); }
  return m;
}
const dateMemo = new Map<ISODate, ISODate[]>();
/** The date `y - 1` years after `asOf`. */
function yearDate(asOf: ISODate, y: number): ISODate {
  let ds = dateMemo.get(asOf);
  if (!ds) { ds = []; dateMemo.set(asOf, ds); }
  return (ds[y] ??= addMonths(asOf, 12 * (y - 1)));
}
const rulesMemo = new Map<ISODate, TaxRules>();
const rulesOn = (date: ISODate) => { let r = rulesMemo.get(date); if (!r) { r = rulesFor(date); rulesMemo.set(date, r); } return r; };

function roomFor(member: Member, start: ProjectionStart, y: number, date: ISODate): Paise {
  const m = memoOf(member, start), key = y === 1 ? `r1|${date}` : `r|${date}`;
  let room = m.get(key);
  if (room === undefined) {
    room = freeEquityLtRoom(member, start.normal, y === 1 ? start.year1 : ZERO, rulesOn(date), date);
    m.set(key, room);
  }
  return room;
}

/** The gains sold in the last year, after yearly harvesting (see tenYearTax). */
function finalSale(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number): GainBuckets {
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
    const date = yearDate(asOf, y);

    let harvestable = 0;
    for (const x of equity) harvestable += Math.max(0, x.gain);
    if (y < years && harvestable > 0) {
      const room = roomFor(member, start, y, date);
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

  return sale;
}

/**
 * The extra tax over `years` tax years from holding these slices, with equity gains harvested each year inside the
 * year's tax-free room and everything left sold in the last year.
 *
 * Each year before the last, in order: young gain from last year becomes harvestable; every slice grows by its
 * return on the value at the start of the year plus that year's add (year 1's add earns nothing that year); then
 * equity gain is harvested up to `freeEquityLtRoom`, shared across slices by their gain. Harvesting is free by
 * construction (the room is the most that leaves the tax unchanged), so those years cost the same with or without
 * the slices. In the last year nothing is harvested: all remaining gain is sold, so the one `taxForYear` call
 * applies the exemption and basic-exemption room once, alongside any other gains sold that year. The result is that
 * year's tax with the sale minus without it, which equals summing every year's tax with and without the slices.
 *
 * Simplifications: equity gain still under a year old at the final sale is taxed as long-term too; a holding's
 * starting gain is treated as long-term and harvestable from year 1; negative gains are clamped to 0 with no set-off
 * between slices.
 */
export function tenYearTax(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number = PLACEMENT_YEARS): Paise {
  return tenYearTaxDetail(member, start, slices, asOf, years).tax;
}

/**
 * `tenYearTax`, and whether the final year sits in the marginal-relief band: `taxForYear` gives marginal relief while
 * the year holds special-rate gains (short- or long-term equity, other long-term). Issue #49
 * (https://github.com/Devansh217/family-tax-harvesting/issues/49): that relief may not cover capital-gains tax, so the
 * placement solver keeps members out of the band.
 */
export function tenYearTaxDetail(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number = PLACEMENT_YEARS): { tax: Paise; reliefBand: boolean } {
  if (slices.length === 0 || years < 1) return { tax: 0, reliefBand: inReliefBand(member, start, slices, asOf, years) };
  const sale = finalSale(member, start, slices, asOf, years);
  const date = yearDate(asOf, years);
  const r = rulesOn(date);
  const base = years === 1 ? start.year1 : ZERO;
  const withSale: GainBuckets = {
    equitySt: base.equitySt + sale.equitySt, equityLt: base.equityLt + sale.equityLt,
    otherLt: base.otherLt + sale.otherLt, slab: base.slab + sale.slab,
  };
  const m = memoOf(member, start), key = `b${years === 1 ? 1 : ''}|${date}`;
  let without = m.get(key);
  if (without === undefined) { without = taxForYear(member, start.normal, base, r, date).tax; m.set(key, without); }
  const t = taxForYear(member, start.normal, withSale, r, date);
  return { tax: Math.max(0, t.tax - without), reliefBand: bandOf(withSale, t.marginalRelief) };
}

const bandOf = (b: GainBuckets, relief: Paise) => relief > 0 && b.equitySt + b.equityLt + b.otherLt > 0;

/** Whether this member's final year, with these slices, sits in the marginal-relief band (see `tenYearTaxDetail`). */
export function inReliefBand(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number = PLACEMENT_YEARS): boolean {
  const { buckets, date } = finalYearBuckets(member, start, slices, asOf, years);
  return bandOf(buckets, taxForYear(member, start.normal, buckets, rulesOn(date), date).marginalRelief);
}

/**
 * The gain buckets of the last year with the final sale (and this year's booked gains when the horizon is one year),
 * and that year's date: what `tenYearTax` hands `taxForYear`. Exported for tests that inspect the final year.
 */
export function finalYearBuckets(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number = PLACEMENT_YEARS): { buckets: GainBuckets; date: ISODate } {
  const sale = slices.length === 0 || years < 1 ? ZERO : finalSale(member, start, slices, asOf, years);
  const base = years === 1 ? start.year1 : ZERO;
  const buckets: GainBuckets = {
    equitySt: base.equitySt + sale.equitySt, equityLt: base.equityLt + sale.equityLt,
    otherLt: base.otherLt + sale.otherLt, slab: base.slab + sale.slab,
  };
  return { buckets, date: yearDate(asOf, Math.max(1, years)) };
}

/**
 * Total income in the last year (normal income plus every gain sold that year, and this year's booked gains when the
 * horizon is one year): what the rebate test at the ₹12 L line looks at.
 */
export function finalYearIncome(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years: number = PLACEMENT_YEARS): Paise {
  const { buckets: b } = finalYearBuckets(member, start, slices, asOf, years);
  return start.normal + b.equitySt + b.equityLt + b.otherLt + b.slab;
}
