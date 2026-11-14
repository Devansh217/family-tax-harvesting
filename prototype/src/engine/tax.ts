import { inRange } from './dates';
import { basicExemption, type TaxRules } from './rules';
import type { Member, Paise, Realised } from './types';

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
  bonus: { total: Paise; used: Paise; free: Paise };
  lossCarriedForward: { st: Paise; lt: Paise };
}

const roundRupee = (p: Paise) => Math.round(p / 100) * 100;

/**
 * Set-off order (old s.70/s.74): short-term loss against any capital gain, long-term loss only against long-term gain.
 * Then the LTCG exemption, then any unused basic exemption (residents), applied to short-term gains first because
 * they carry the higher rate.
 */
export function summariseYear(member: Member, realised: Realised[], rules: TaxRules): YearSummary {
  let stGains = 0, stLosses = 0, ltGains = 0, ltLosses = 0;
  for (const r of realised) {
    if (r.memberId !== member.id || !inRange(r.sellDate, rules.start, rules.end)) continue;
    if (r.term === 'st') r.gain >= 0 ? (stGains += r.gain) : (stLosses -= r.gain);
    else r.gain >= 0 ? (ltGains += r.gain) : (ltLosses -= r.gain);
  }

  let st = stGains, lt = ltGains, stl = stLosses, ltl = ltLosses;
  const use = (gain: number, loss: number) => Math.min(gain, loss);
  let u = use(st, stl); st -= u; stl -= u;
  u = use(lt, ltl); lt -= u; ltl -= u;
  u = use(lt, stl); lt -= u; stl -= u;

  let cfSt = member.carriedLoss?.st ?? 0, cfLt = member.carriedLoss?.lt ?? 0;
  u = use(st, cfSt); st -= u; cfSt -= u;
  u = use(lt, cfSt); lt -= u; cfSt -= u;
  u = use(lt, cfLt); lt -= u; cfLt -= u;

  const exemptionUsed = Math.min(lt, rules.ltcgExemption);
  let stTaxable = st;
  let ltTaxable = lt - exemptionUsed;

  const shortfall = member.otherIncome == null ? 0 : Math.max(0, basicExemption(member, rules) - Math.max(0, member.otherIncome));
  let bonusLeft = shortfall;
  u = Math.min(stTaxable, bonusLeft); stTaxable -= u; bonusLeft -= u;
  u = Math.min(ltTaxable, bonusLeft); ltTaxable -= u; bonusLeft -= u;

  const tax = roundRupee((stTaxable * rules.stcgRate + ltTaxable * rules.ltcgRate) * (1 + rules.cess));

  return {
    stGains, stLosses, ltGains, ltLosses,
    stNet: st, ltNet: lt,
    exemptionUsed, stTaxable, ltTaxable, tax,
    room: { limit: rules.ltcgExemption, used: exemptionUsed, free: rules.ltcgExemption - exemptionUsed },
    bonus: { total: shortfall, used: shortfall - bonusLeft, free: bonusLeft },
    lossCarriedForward: { st: stl + cfSt, lt: ltl + cfLt },
  };
}
