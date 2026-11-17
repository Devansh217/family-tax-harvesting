import type { Paise, Term, TaxType } from './types';

export interface SwitchInput {
  value: Paise;
  gain: Paise;
  term: Term;
  /** Months until the short-term lots turn long-term (0 when already long-term). */
  monthsToLongTerm: number;
  /** Equity units held under 12 months: an exit load of 1% is assumed. */
  equityUnitsUnder12m: boolean;
  taxType: TaxType;
  /** Tax-free long-term room still free for this member. */
  freeRoom: Paise;
  /** Marginal slab rate including cess, e.g. 0.312. */
  slabRate: number;
  /** Fee gap, percentage points a year. */
  gap: number;
  /** Exact tax of switching now, when the caller has worked it out (it then replaces the estimate below). */
  taxNow?: Paise;
}

export interface SwitchDecision {
  when: 'now' | 'wait' | 'next_year';
  until?: 'long_term' | 'load_free';
  taxNow: Paise;
  /** After-tax gain from switching versus staying, after 10 years. */
  edge10y: Paise;
}

const LT = 0.125 * 1.04;
const ST = 0.2 * 1.04;
const RETURN = 0.11;
const HORIZON = 10;
const MAX_BREAK_EVEN = 7;
const EXIT_LOAD = 0.01;
const MIN_GAP = 0.1;

/**
 * Switch a regular plan to its direct twin now, wait, or leave it for next tax year's room. Break-even rule from
 * docs/research/2026-11-15-product-universe.md §2.4, with an 11% return before costs and a 10-year horizon.
 */
export function switchDecision(i: SwitchInput): SwitchDecision {
  const equity = i.taxType === 'equity';
  const gain = Math.max(0, i.gain);
  const longTerm = i.term === 'lt';
  const load = i.equityUnitsUnder12m ? Math.round(i.value * EXIT_LOAD) : 0;
  const taxNow = i.taxNow ?? Math.round(
    equity ? (longTerm ? LT * Math.max(0, gain - Math.max(0, i.freeRoom)) : ST * gain) : i.slabRate * gain,
  );
  const cost = taxNow + load;
  const horizonRate = equity ? LT : i.slabRate;
  const after = (v: number, basis: number) => v - horizonRate * Math.max(0, v - basis);
  const edgeAt = (n: number) => {
    const stay = i.value * Math.pow(1 + RETURN - i.gap / 100, n);
    const sw = (i.value - cost) * Math.pow(1 + RETURN, n);
    return after(sw, i.value - cost) - after(stay, i.value - gain);
  };

  if (i.gap <= MIN_GAP) return { when: 'next_year', taxNow, edge10y: -cost };
  const edge10y = Math.round(edgeAt(HORIZON));

  if (equity && i.equityUnitsUnder12m) return { when: 'wait', until: 'load_free', taxNow, edge10y };
  if (equity && !longTerm && i.monthsToLongTerm <= 6) return { when: 'wait', until: 'long_term', taxNow, edge10y };
  if (cost === 0) return { when: 'now', taxNow, edge10y };
  let breakEven = Infinity;
  for (let n = 1; n <= 40; n++) if (edgeAt(n) >= 0) { breakEven = n; break; }
  if (breakEven <= MAX_BREAK_EVEN && edge10y >= Math.max(5_000_00, Math.round(i.value * 0.005))) return { when: 'now', taxNow, edge10y };
  return { when: 'next_year', taxNow, edge10y };
}
