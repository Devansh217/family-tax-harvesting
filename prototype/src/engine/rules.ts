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
};

export function basicExemption(member: Member, rules: TaxRules): Paise {
  if (member.regime === 'new') return rules.basicExemptionNew;
  if (member.age >= 80) return rules.basicExemptionOld.from80;
  if (member.age >= 60) return rules.basicExemptionOld.from60;
  return rules.basicExemptionOld.below60;
}

/** Rate including cess, e.g. 0.13 for 12.5% LTCG. */
export const ltRate = (r: TaxRules) => r.ltcgRate * (1 + r.cess);
export const stRate = (r: TaxRules) => r.stcgRate * (1 + r.cess);
