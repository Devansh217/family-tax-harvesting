import { inRange } from './dates';
import { basicExemption, incomeTotal, slabTax, type TaxRules } from './rules';
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
}

const roundRupee = (p: Paise) => Math.round(p / 100) * 100;

/**
 * Set-off order (old s.70/s.74): short-term loss against any capital gain, long-term loss only against long-term gain.
 * Then the LTCG exemption, then any unused basic exemption (residents), applied to short-term gains first because
 * they carry the higher rate.
 */
export interface BusinessIncome { speculative: Paise; nonSpeculative: Paise }

/**
 * Trading income (old s.43(5), s.70–73): an intraday loss only offsets intraday profit and carries forward 4 years.
 * An F&O loss offsets intraday profit, then (s.71) capital gains, short-term first, and carries forward 8 years.
 * Trading profit is taxed at slab rates and shrinks the basic exemption left for bonus room.
 */
export function summariseYear(member: Member, realised: Realised[], rules: TaxRules, biz: BusinessIncome = { speculative: 0, nonSpeculative: 0 }): YearSummary {
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

  let spec = biz.speculative, ns = biz.nonSpeculative;
  if (ns < 0 && spec > 0) { u = Math.min(-ns, spec); ns += u; spec -= u; }
  let setOff = 0;
  if (ns < 0) {
    u = Math.min(-ns, st); st -= u; ns += u; setOff += u;
    u = Math.min(-ns, lt); lt -= u; ns += u; setOff += u;
  }
  const businessProfit = Math.max(0, spec) + Math.max(0, ns);

  let cfSt = member.carriedLoss?.st ?? 0, cfLt = member.carriedLoss?.lt ?? 0;
  u = use(st, cfSt); st -= u; cfSt -= u;
  u = use(lt, cfSt); lt -= u; cfSt -= u;
  u = use(lt, cfLt); lt -= u; cfLt -= u;

  const exemptionUsed = Math.min(lt, rules.ltcgExemption);
  let stTaxable = st;
  let ltTaxable = lt - exemptionUsed;

  const income = incomeTotal(member);
  const known = income != null;
  const normal = (income ?? 0) + businessProfit;
  const shortfall = !known ? 0 : Math.max(0, basicExemption(member, rules) - Math.max(0, normal));
  let bonusLeft = shortfall;
  u = Math.min(stTaxable, bonusLeft); stTaxable -= u; bonusLeft -= u;
  u = Math.min(ltTaxable, bonusLeft); ltTaxable -= u; bonusLeft -= u;

  let bizTax = 0;
  if (businessProfit > 0) {
    const total = normal + st + lt;
    bizTax = known
      ? (slabTax(normal, total, member, rules) - slabTax(income ?? 0, total - businessProfit, member, rules)) * (1 + rules.cess)
      : businessProfit * 0.3 * (1 + rules.cess);
  }
  const tax = roundRupee((stTaxable * rules.stcgRate + ltTaxable * rules.ltcgRate) * (1 + rules.cess) + bizTax);

  return {
    stGains, stLosses, ltGains, ltLosses,
    stNet: st, ltNet: lt,
    exemptionUsed, stTaxable, ltTaxable, tax,
    room: { limit: rules.ltcgExemption, used: exemptionUsed, free: rules.ltcgExemption - exemptionUsed },
    bonus: { total: shortfall, used: shortfall - bonusLeft, free: bonusLeft },
    lossCarriedForward: { st: stl + cfSt, lt: ltl + cfLt },
    business: {
      speculative: spec, nonSpeculative: ns, setOffAgainstGains: setOff, tax: roundRupee(bizTax),
      assumedTopSlab: businessProfit > 0 && !known,
      carryForward: { speculative: Math.max(0, -spec), nonSpeculative: Math.max(0, -ns) },
    },
  };
}
