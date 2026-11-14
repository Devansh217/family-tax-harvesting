import type { ISODate, Member, Paise } from './types';

/** Tax rules for one tax year. Kept as data so a Budget change is a data change. */
export interface TaxRules {
  label: string;
  start: ISODate;
  end: ISODate;
  ltcgExemption: Paise;
  ltcgRate: number;
  stcgRate: number;
  cess: number;
  longTermMonths: number;
  grandfatherDate: ISODate;
  basicExemptionNew: Paise;
  basicExemptionOld: { below60: Paise; from60: Paise; from80: Paise };
  /** Approximate trading costs, used to net them off each suggested move. */
  costs: {
    /** Securities transaction tax on delivery equity, each side. */
    equityStt: number;
    /** Stamp duty on a delivery equity purchase. */
    equityStampBuy: number;
    /** Exchange and SEBI turnover charges per side, before GST. */
    exchangePerSide: number;
    gst: number;
    /** Depository charge per security sold (incl. GST). */
    dpPerSale: Paise;
    /** Stamp duty on a mutual fund purchase. */
    mfStampBuy: number;
    /** Stamp duty on an off-market gift transfer of shares. */
    giftStamp: number;
    /** Depository charge for an off-market transfer. */
    giftDp: Paise;
  };
}

export const FY_2026_27: TaxRules = {
  label: 'FY 2026-27',
  start: '2026-04-01',
  end: '2027-03-31',
  ltcgExemption: 1_25_000_00,
  ltcgRate: 0.125,
  stcgRate: 0.2,
  cess: 0.04,
  longTermMonths: 12,
  grandfatherDate: '2018-01-31',
  basicExemptionNew: 4_00_000_00,
  basicExemptionOld: { below60: 2_50_000_00, from60: 3_00_000_00, from80: 5_00_000_00 },
  costs: {
    equityStt: 0.001,
    equityStampBuy: 0.00015,
    exchangePerSide: 0.0000307,
    gst: 0.18,
    dpPerSale: 15_93,
    mfStampBuy: 0.00005,
    giftStamp: 0.00015,
    giftDp: 25_00,
  },
};

/** Cost of selling `value` and buying it back the next day. Brokerage assumed zero (discount broker, delivery). */
export function roundTripCost(kind: 'equity' | 'equity_mf' | 'other', value: Paise, r: TaxRules): Paise {
  const c = r.costs;
  if (kind === 'equity') {
    const pct = c.equityStt * 2 + c.equityStampBuy + c.exchangePerSide * 2 * (1 + c.gst);
    return Math.round(value * pct + c.dpPerSale);
  }
  return Math.round(value * c.mfStampBuy);
}

/** Off-market gift transfer of shares worth `value`. */
export const giftTransferCost = (value: Paise, r: TaxRules): Paise => Math.round(value * r.costs.giftStamp + r.costs.giftDp);

export function basicExemption(member: Member, rules: TaxRules): Paise {
  if (member.regime === 'new') return rules.basicExemptionNew;
  if (member.age >= 80) return rules.basicExemptionOld.from80;
  if (member.age >= 60) return rules.basicExemptionOld.from60;
  return rules.basicExemptionOld.below60;
}

/** Rate including cess, e.g. 0.13 for 12.5% LTCG. */
export const ltRate = (r: TaxRules) => r.ltcgRate * (1 + r.cess);
export const stRate = (r: TaxRules) => r.stcgRate * (1 + r.cess);

export interface IncomeBand {
  label: string;
  /** Slab rate on the top rupee of income in this band. */
  rate: number;
  /** Income assumed for the band: its upper end, so bonus room is never overstated (top band: its lower end). */
  assumed: Paise;
}

const L = 1_00_000_00;

/** Income bands a member can pick instead of an exact figure. New regime per Budget 2025; old regime by age. */
export function incomeBands(member: Pick<Member, 'regime' | 'age'>, r: TaxRules): IncomeBand[] {
  const none: IncomeBand = { label: 'No other income', rate: 0, assumed: 0 };
  if (member.regime === 'new') {
    return [
      none,
      { label: 'Up to ₹4 L (nil)', rate: 0, assumed: 4 * L },
      { label: '₹4–8 L (5%)', rate: 0.05, assumed: 8 * L },
      { label: '₹8–12 L (10%)', rate: 0.1, assumed: 12 * L },
      { label: '₹12–16 L (15%)', rate: 0.15, assumed: 16 * L },
      { label: '₹16–20 L (20%)', rate: 0.2, assumed: 20 * L },
      { label: '₹20–24 L (25%)', rate: 0.25, assumed: 24 * L },
      { label: 'Above ₹24 L (30%)', rate: 0.3, assumed: 24 * L },
    ];
  }
  const basic = basicExemption(member as Member, r);
  const bands: IncomeBand[] = [none, { label: `Up to ${basic / L} L (nil)`, rate: 0, assumed: basic }];
  if (basic < 5 * L) bands.push({ label: `₹${basic / L}–5 L (5%)`, rate: 0.05, assumed: 5 * L });
  bands.push({ label: '₹5–10 L (20%)', rate: 0.2, assumed: 10 * L }, { label: 'Above ₹10 L (30%)', rate: 0.3, assumed: 10 * L });
  return bands;
}

/** Slab rate for a known income, or null when income is unknown. */
export function slabRate(member: Member, r: TaxRules): number | null {
  if (member.otherIncome == null) return null;
  const bands = incomeBands(member, r).slice(1);
  for (const b of bands.slice(0, -1)) if (member.otherIncome <= b.assumed) return b.rate;
  return bands.at(-1)!.rate;
}
