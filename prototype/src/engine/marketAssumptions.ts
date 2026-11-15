// Data only, copied from docs/research/2026-11-15-india-returns-risk-inflation.md §3. Reviewed 2026-11-15. Next review: Nov 2027 (after JPM LTCMA, Oct).
// Returns: expected annual return ABOVE inflation (real), arithmetic, after a low-cost direct/index fund's costs, before tax.
// Volatility: annualised standard deviation of annual returns. Nominal = (1+real)*(1+cpi)-1.

export type AssetClass =
  | 'equity_large' | 'equity_flexi' | 'equity_mid' | 'equity_small'
  | 'debt_short' | 'debt_gilt' | 'liquid' | 'fd'
  | 'gold' | 'intl_equity';

export type Scenario = 'conservative' | 'base' | 'optimistic';

export const CPI: Record<Scenario, number> = { conservative: 0.06, base: 0.05, optimistic: 0.04 };

export const REAL_RETURN: Record<Scenario, Record<AssetClass, number>> = {
  //               large   flexi   mid     small   d_short d_gilt  liquid  fd      gold    intl
  conservative: { equity_large: 0.040, equity_flexi: 0.040, equity_mid: 0.040, equity_small: 0.040,
                  debt_short: 0.010, debt_gilt: 0.010, liquid: 0.000, fd: 0.005, gold: 0.015, intl_equity: 0.030 },
  base:         { equity_large: 0.0575, equity_flexi: 0.060, equity_mid: 0.065, equity_small: 0.065,
                  debt_short: 0.019, debt_gilt: 0.020, liquid: 0.010, fd: 0.0165, gold: 0.029, intl_equity: 0.048 },
  optimistic:   { equity_large: 0.070, equity_flexi: 0.0725, equity_mid: 0.080, equity_small: 0.085,
                  debt_short: 0.025, debt_gilt: 0.030, liquid: 0.015, fd: 0.020, gold: 0.040, intl_equity: 0.060 },
};

export const VOLATILITY: Record<AssetClass, number> = {
  equity_large: 0.18, equity_flexi: 0.19, equity_mid: 0.23, equity_small: 0.27,
  debt_short: 0.025, debt_gilt: 0.065, liquid: 0.005, fd: 0.0,
  gold: 0.15, intl_equity: 0.16,
};

// Order: equity_large, equity_mid, equity_small, debt (short and gilt), liquid, gold, intl_equity.
// Flexi uses large's row. FD is deterministic (no row). Checked positive-definite (Cholesky min diagonal 0.39).
export const CORRELATION_ORDER = ['equity_large', 'equity_mid', 'equity_small', 'debt', 'liquid', 'gold', 'intl_equity'] as const;
export const CORRELATION: number[][] = [
  [1.00, 0.85, 0.78, 0.10, 0.00, 0.00, 0.45],
  [0.85, 1.00, 0.92, 0.08, 0.00, 0.00, 0.40],
  [0.78, 0.92, 1.00, 0.05, 0.00, 0.00, 0.35],
  [0.10, 0.08, 0.05, 1.00, 0.30, 0.10, 0.00],
  [0.00, 0.00, 0.00, 0.30, 1.00, 0.00, 0.00],
  [0.00, 0.00, 0.00, 0.10, 0.00, 1.00, 0.15],
  [0.45, 0.40, 0.35, 0.00, 0.00, 0.15, 1.00],
];

// Goal inflation (nominal, per year). Applied to the goal's cost in today's rupees.
export type GoalKind = 'general' | 'retirement_living' | 'education_india' | 'education_abroad'
  | 'health_costs' | 'health_insurance_premium' | 'house_purchase' | 'wedding' | 'car';
export const GOAL_INFLATION: Record<Scenario, Record<GoalKind, number>> = {
  conservative: { general: 0.06, retirement_living: 0.06, education_india: 0.10, education_abroad: 0.08,
                  health_costs: 0.10, health_insurance_premium: 0.12, house_purchase: 0.07, wedding: 0.07, car: 0.06 },
  base:         { general: 0.05, retirement_living: 0.05, education_india: 0.08, education_abroad: 0.065,
                  health_costs: 0.08, health_insurance_premium: 0.10, house_purchase: 0.05, wedding: 0.06, car: 0.05 },
  optimistic:   { general: 0.04, retirement_living: 0.04, education_india: 0.06, education_abroad: 0.05,
                  health_costs: 0.06, health_insurance_premium: 0.08, house_purchase: 0.04, wedding: 0.05, car: 0.04 },
};
// Small savings are contractual, not forecasts: read from TaxRules, refreshed quarterly.
// Oct–Dec 2026: PPF 0.071, SCSS 0.082, SSY 0.082, NSC 0.077.

export const ASSUMPTIONS_REVIEWED = '2026-11-15';
