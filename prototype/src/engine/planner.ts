import type { ReturnClass } from './categories';
import { CPI, REAL_RETURN, type AssetClass, type Scenario } from './marketAssumptions';
import type { TaxRules } from './rules';

/** Each return class as a mix of asset classes from the research's assumption table. */
export const RETURN_MIX: Record<Exclude<ReturnClass, 'ppf'>, Partial<Record<AssetClass, number>>> = {
  equity: { equity_large: 1 },
  debt: { debt_short: 1 },
  conservative_hybrid: { equity_large: 0.2, debt_short: 0.8 },
  balanced: { equity_large: 0.5, debt_short: 0.5 },
  gold: { gold: 1 },
  international: { intl_equity: 1 },
  fd: { fd: 1 },
};

/** Assumed average yearly return before tax: the mix's real return grown by the scenario's inflation. PPF uses its notified rate. */
export function nominalReturn(c: ReturnClass, s: Scenario = 'base', r: TaxRules): number {
  if (c === 'ppf') return r.smallSavings.ppf;
  const real = Object.entries(RETURN_MIX[c]).reduce((a, [k, w]) => a + REAL_RETURN[s][k as AssetClass] * (w ?? 0), 0);
  return (1 + real) * (1 + CPI[s]) - 1;
}
