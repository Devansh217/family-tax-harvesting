# Indian return, risk and inflation data: capital market assumptions for the planner

Research note, 15 Nov 2026. Topic 2 of the research agenda in `docs/PLANNER-NOTES.md`. It replaces the placeholder `ASSUMED_RETURNS` in plan Task 9.

Labels: **Data** = primary statistics (index provider, RBI, MOSPI, Ministry of Finance). **Paper** = academic or working paper. **Institution** = published forecast by an asset manager or bank. **Opinion** = expert, AMC blog or media estimate. Confidence: High / Medium / Low. **"Calc"** marks a figure I worked out from published inputs; it is not itself published anywhere.

---

## 1. Product summary

- **Plan in real terms.** The engine should store expected returns *above inflation* and add an inflation rate for each goal type. Equity minus CPI has been the stable quantity in India. Nominal returns swing with the inflation regime: the Sensex earned about 15–16% a year in 1979–2020, when CPI ran at 7–8%. Since inflation targeting began in 2016 the target has been 4%.
- **Default equity return: 11% nominal (about 5.75% real), not 12%.** Nifty 50 TRI has returned 12.15% a year since inception, with CPI around 6% over that period. Forward-looking views point a little lower: Damodaran's India equity risk premium (Jan 2026) implies about 11.5–12%, and building up from earnings growth gives about 10.5–12% (both Calc). A 12% default would pay for history's higher inflation without the inflation that came with it.
- **Volatility: 18% a year for large caps.** At 11% / 18%, a lognormal model gives a 10% chance of loss over 5 years and 3.6% over 10. Sensex history (1979–2020) gives 8% and 3%. The model matches history and errs slightly cautious.
- **Most placeholders survive.** Debt 7%, balanced 9%, gold 8%, international 10% and PPF 7.1% are defensible. Equity falls from 12% to 11%, FD from 7% to 6.75%, and conservative hybrid from 8% to 7.8%.
- **Goal inflation differs a lot by goal.** General CPI: 5% default. Education: 8%. Health costs: 8%. House price: 5%. The popular "education inflation is 10–12%" figure is weakly sourced, so the engine should show it as the cautious case, not the default.
- **Ship three variants** (conservative / base / optimistic) and let probability-of-success use the volatility and correlation matrix below. Review the table once a year after the October JPM LTCMA and the January Damodaran update. Update small-savings rates every quarter, because the Ministry of Finance resets them quarterly.

---

## 2. Findings

### 2.1 Indian equity: index factsheets (NSE Indices, as of 30 Oct 2026)

| Index (TRI) | 1y | 5y CAGR | Since inception CAGR | Std dev 5y | Std dev since inception | Correlation vs Nifty 50 (since inception) | Base date | Source |
|---|---|---|---|---|---|---|---|---|
| Nifty 50 | −9.45% | 6.70% | **12.15%** | 13.85% | 22.38% | 1.00 | 3 Nov 1995 (TRI series later) | [S1] Data, High |
| Nifty 500 | −6.83% | 8.81% | **11.83%** | 14.47% | 21.90% | 0.95 | 1 Jan 1995 | [S2] Data, High |
| Nifty Midcap 150 | −3.90% | 13.84% | **16.47%** | 16.84% | 20.75% | 0.84 | 1 Apr 2005 | [S3] Data, High |
| Nifty Smallcap 250 | −2.61% | 13.11% | **15.25%** | 18.63% | 21.46% | 0.77 | 1 Apr 2005 | [S4] Data, High |

Notes:
- NSE's standard deviation is annualised from daily returns. Annual-return dispersion is larger: Nifty Midcap 100 fell 59.4% in 2008 and rose 99.0% in 2009 [S16, Opinion/data aggregator, Medium].
- The mid and small-cap series start in April 2005, so they cover one full crash (2008) and an unusually strong 2020–24 run. Their "since inception" premium over large caps (+3–4 pp) is not a forward estimate.
- Nifty 50 valuations on 30 Oct 2026: P/E 19.3, P/B 2.83, dividend yield 1.42% [S1].
- Nifty 50 was down 11.8% YTD at end-October 2026 [S1]. A one-year figure like this must never feed the assumptions.

### 2.2 Sensex rolling returns and probability of loss (Mar 1979 – Mar 2020)

| Holding period | Periods with a gain | Probability of loss | Worst rolling CAGR | Best rolling CAGR | Source |
|---|---|---|---|---|---|
| 1 year | 27/41 | 34% (Calc) | −47% (to Mar-93) | +267% (to Mar-92) | [S5] Data (AMC compilation), High |
| 3 years | 32/39 | 18% (Calc) | −15% (Mar-03) | +82% (Mar-92) | [S5] |
| 5 years | 34/37 | 8% (Calc) | −5% (Mar-97, Mar-03) | +53% (Mar-92) | [S5] |
| 10 years | 31/32 | 3% (Calc) | −2% (Mar-02) | +35% (Mar-92) | [S5] |
| 15 years | 27/27 | 0% | +6% (Mar-09) | +27% (Mar-94) | [S5] |
| 20 years | 22/22 | 0% | +7% (Mar-12) | +20% | [S5] |

The windows are annual (March to March) and the price index excludes dividends, so the true TRI loss frequencies are slightly lower. The 15-year worst of +6% was below the CPI of that period, so a real loss over 15 years remains possible.

Model check (Calc): a lognormal at 11% mean / 18% volatility gives loss probabilities of 28.5% (1y), 16.3% (3y), 10.2% (5y), 3.6% (10y) and 1.4% (15y). These sit close to the history above, so 18% is the right default volatility for large-cap equity.

### 2.3 Drawdowns and recovery (Nifty 50)

| Episode | Fall | Time to regain peak | Source |
|---|---|---|---|
| 2008 GFC | about −60% (Jan–Oct 2008) | about 23 months on TRI (Kalpi); about 71 months on price index, measured from trough to a sustained new high (Moneyvesta) | [S17] Opinion/data, Medium |
| 2020 COVID | −39.6% (Jan–Mar 2020) | about 8–10 months | [S17] Opinion; NISM table quoted, Medium |
| 1992 and 2000 crashes | Sensex 1-year −47% (to Mar-93); 3-year −15% CAGR (to Mar-03) | Several years | [S5] |
| Sep 2024 → 2026 | −16% by early 2025; Nifty 50 TRI −9.45% over 1y to Oct 2026 | Ongoing | [S1], media |

The engine should stress-test with a −55% equity shock (mid/small −65%) and a 3–5 year recovery.

### 2.4 Debt, cash, deposits and small savings

| Asset | Figure | Period | Source |
|---|---|---|---|
| Nifty 10 yr Benchmark G-Sec (TRI) | 6.24% since inception; 4.98% over 5y; −0.05% over 1y | Jan 2011 – Oct 2026 | [S6] Data, High |
| Nifty 1D Rate (overnight money, cash proxy) | 6.27% since inception; 5.80% over 5y; 5.23% over 1y | Jan 2011 – Oct 2026 | [S7] Data, High |
| RBI repo rate | Reported raised to 5.50% at the Oct 2026 MPC ("calibrated tightening") | 7 Oct 2026 | [S9] Data via third-party copy, Medium. Confirm on rbi.org.in |
| Small savings, Oct–Dec 2026 | PPF 7.1%, SCSS 8.2%, SSY 8.2%, NSC 7.7%; unchanged for about 2 years | Q3 FY27 | [S10] Data via media (DEA OM 30 Sep 2026), High |

Since 2011, long gilts returned about the same as overnight cash, because yields rose over the period. That is a useful reminder that the term premium in Indian debt is small and unreliable.

**Bank FD rates: no primary source pulled.** My estimate is about 6.5–7% for 1–5 years at large banks (Opinion, Low). Check against the SBI rate card before shipping.

### 2.5 Gold (INR)

| Measure | Figure | Period | Source |
|---|---|---|---|
| Gold annualised return, INR | 8.48% | Jan 1992 – Dec 2017 | [S11] Paper (Moradia & Mehta, MPRA 2018), Medium |
| Gold annualised std dev, INR | 15.61% | Same | [S11] |
| Correlation with Sensex (monthly) | −0.074, not statistically significant; 12-month rolling correlation from −0.60 to +0.45 | Same | [S11] |
| Gold, USD, 10–15y forecast | 5.5% | From Oct 2026 | [S8] Institution (JPM 2027 LTCMA), High |
| Gold, USD, history | 8.15% CAGR | 1971–2025 | [S18] Opinion/data aggregator, Medium |

Gold rallied hard in 2025 (+44% to +66% depending on source) [S18]. That puts the starting price high, so a forward view should sit below the trailing 10-year return.

### 2.6 International equity in INR

| Measure | Figure | Period | Source |
|---|---|---|---|
| US large cap, USD, 10–15y forecast | 7.5% | From Oct 2026 | [S8] Institution, High |
| EM equity, USD, 10–15y forecast | 7.1% (2027 LTCMA); 7.8% (2026 LTCMA) | From Oct 2026 / Oct 2025 | [S8], [S8b] Institution, High |
| US equity, USD, 10y forecast | 6.5% (6% EPS growth + 1.4% yield − 1% de-rating) | From Nov 2025 | [S12] Institution (Goldman Sachs), High |
| INR depreciation vs USD | about 2.6% a year (approx. ₹44.9 → ₹86 per USD, 2000 → 2025 annual averages) | 2000–2025 | Calc from approximate published averages, Medium |
| US equity in INR, forward | 7.5% + 2.5% ≈ 10% | — | Calc |

The INR leg adds return and also diversifies: the rupee tends to weaken when Indian equities fall. No primary India-specific correlation source was found. The 0.45 correlation used below is my estimate (Opinion, Low).

### 2.7 Inflation

| Series | Figure | Period | Source |
|---|---|---|---|
| CPI (combined), latest | 6.09% y/y in Oct 2026 (index 110.05, new base), above the 6% upper band for the first time since Oct 2024; food 8.94% | Oct 2026 | [S13] Data (MOSPI release via GoIStats / Trading Economics), High |
| CPI average | 5.58% | 2012–2026 | [S13] Data aggregator, High |
| RBI projection | CPI 5.2% for FY 2026-27; core 4.4%; about 5.6% in Q1 FY28 | Oct 2026 MPC | [S9] Institution (RBI), Medium. The copy's tables differ slightly from its text; confirm |
| RBI target | 4% ± 2% (flexible inflation targeting since 2016) | Current | RBI Act s.45ZA, High |
| Medical trend, India (employer group cover, gross) | 13.0% (2025), 11.5% (2026); net of general inflation 8.8% and 7.4% | 2025–26 | [S14] Institution (Aon Global Medical Trend Rates 2026), High for what it measures |
| Medical trend, APAC | 14.0% in 2026 | 2026 | [S15] Institution (WTW), High |
| Education inflation | "10–12% a year" | Undated | [S19] Opinion (Kotak MF blog and others citing "studies"), Low. No primary series found |
| House prices, RBI HPI (18 cities) | +3.6% y/y Q1 FY27; +4.2% y/y Q4 FY26 | 2025–26 | [S20] Data (RBI), High |

The medical trend measures employer insurance claim cost. It includes more people using care and more expensive care, not only higher prices. It is the right input for a "health insurance premium" goal. For out-of-pocket costs it overstates; the CPI health sub-index runs much lower.

The CPI education sub-index sits near general CPI. The 10–12% folk figure tracks private school and college fees, not the CPI basket. For a child's higher education the truth is likely between the two.

### 2.8 Forward-looking assumptions for Indian equity

| Approach | Figure | Source |
|---|---|---|
| Damodaran India total ERP | 7.08% (Baa3, default spread 1.87%, country risk premium 2.85%), Jan 2026 | [S21] Opinion/academic dataset, High |
| Implied INR cost of equity | INR risk-free (10y G-sec ≈ 6.5% − 1.87% default spread ≈ 4.6%) + 7.08% ≈ **11.7%** | Calc. The 10y yield is an assumption; check the live yield |
| Building blocks | Dividend 1.4% + EPS growth (GS: India 12.6% CAGR over 10y in MSCI EM, local; Asia note says 8% average) + re-rating ~0 (P/E 19.3 near its long average) → **10–13%**. Historically EPS grew more slowly than nominal GDP because of dilution, so take the middle, about 11% | [S12] Institution; [S1]; Calc |
| JPM EM equity (USD) + INR depreciation | 7.1% + 2.5% ≈ 9.6% in INR, but for all of EM; JPM's India-specific number is behind a login | [S8] Institution; Calc |
| History | Nifty 50 TRI 12.15%; Nifty 500 TRI 11.83% (1995/99 → 2026) | [S1], [S2] |

**How the forecasts differ from history:** the forecasts sit 0.5–2 pp below the realised Nifty TRI. Inflation explains most of the gap: CPI was about 6% or higher over the history, against an expected 4–5% now. Real-return forecasts (about 5.5–7%) sit close to realised real returns (about 6%).

Vanguard, BlackRock and Morningstar India-specific CMAs are not public at article level; these are listed in Section 5.

---

## 3. Recommended assumption table for the engine

Design: store **real** expected returns (arithmetic mean of annual returns, after fund costs for a low-cost direct or index fund, before tax). Derive nominal returns with `(1 + real) × (1 + inflation) − 1`. Tax is applied by the existing engine.

Base CPI is **5.0%**. It sits between the RBI target of 4%, the 2012–26 average of 5.6% and the FY27 projection of 5.2%.

Nominal figures are Calc. Every number in this table is my recommendation, built from the evidence above; none is a published figure.

```ts
// src/engine/marketAssumptions.ts: data only. Reviewed 2026-11-15. Next review: Nov 2027 (after JPM LTCMA, Oct).
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
```

**Base nominal returns, for comparison with the Task 9 placeholders** (Calc, at 5% CPI):

| `ReturnClass` (Task 9) | Placeholder | Recommended base | Built from |
|---|---|---|---|
| equity | 12% | **11.0%** | equity_large real 5.75%; flexi 11.3% |
| debt | 7% | **7.0%** | debt_short 1.9% real (gilt 7.1%) |
| conservative_hybrid | 8% | **7.8%** | 20% large + 80% debt_short |
| balanced | 9% | **9.0%** | 50% large + 50% debt_short |
| gold | 8% | **8.0%** | real 2.9%: JPM 5.5% USD + 2.5% INR depreciation |
| international | 10% | **10.0%** | real 4.8%: JPM US 7.5% USD + 2.5% INR depreciation |
| fd | 7% | **6.75%** | real 1.65% |
| ppf | 7.1% | **7.1%** | Contractual; quarterly |

Reasoning for the main choices:
- **Equity large, 5.75% real.** History gives about 6% real (Nifty 50 TRI 12.15% minus CPI of about 6%). The Damodaran implied rate gives about 6.5% real. Building blocks give 5.5–7% real. I shade the default down for the 2026 starting P/E near its average, fund costs (direct index funds about 0.1–0.2%) and model humility.
- **Mid and small caps get only a small premium (+0.75 pp) over large caps** despite +3–4 pp since 2005. That history covers one cycle and ends near a peak. The SPIVA and size-premium literature (topic 9) does not support a large forward premium. They do get more volatility.
- **The conservative variant gives every equity class 4% real.** Japan-style or 1994–2003 India-style decades exist; the Sensex 10-year rolling CAGR was −2% to Mar-02.
- **Debt about 2% real** reflects the 10y G-sec index ≈ overnight ≈ 6.25% since 2011 against roughly 5.5–6% CPI. The current curve gives somewhat more. Volatility for short debt (2.5%) and gilt (6.5%) is my estimate (Opinion, Medium), since the NSE debt factsheets do not publish standard deviation.
- **Correlations**: the equity pairs are from NSE factsheets, rounded (0.95 / 0.84 / 0.77) [S2–S4]; mid–small (0.92) is my estimate. Equity–gold is set to 0 (the paper finds −0.07, not significant) [S11]. Equity–debt is set to +0.1, an estimate: Indian equity–bond correlation has been near zero and positive during inflation shocks. Equity–international is set to 0.45 and gold–international to 0.15, both estimates; they share the INR factor.
- **Goal inflation**: `health_insurance_premium` at 10% sits below Aon's 11.5% gross trend, which includes extra care used [S14]. `health_costs` at 8% is close to Aon's net trend plus CPI. `education_india` at 8% is midway between CPI and the 10–12% folk figure. `education_abroad` is US/UK fee inflation of about 3.5–4% plus INR depreciation of 2.5% (Calc). `house_purchase` at 5% is above RBI HPI's recent 3.6–4.2% but city dispersion is wide.

**Update cadence:**
1. Small-savings rates every quarter (DEA notification; TaxRules data).
2. CPI base, debt yields and the full review once a year in November, after JPM LTCMA (Oct) and RBI's October MPC.
3. Damodaran ERP in January as a cross-check.
4. Never change the table because of a single year's market move. Record the review date in the data file and show "assumptions reviewed Nov 2026" in the UI.

---

## 4. Features this enables

- **Probability of reaching a goal.** A Monte Carlo or analytic lognormal using `REAL_RETURN` + `VOLATILITY` + `CORRELATION`. Evidence: the model's 5- and 10-year loss probabilities match Sensex history (§2.2).
- **"Can you lose money over N years?" card.** Show the Sensex 1979–2020 table: 34% at 1y, 8% at 5y, 0 of 27 fifteen-year periods (§2.2, [S5]).
- **Glide path that moves equity out within 3–5 years of a goal.** Evidence: the worst 3-year CAGR was −15% and the 5-year −5%, with recoveries up to 2–6 years (§2.2–2.3).
- **Goal-specific inflation.** Education and health goals grow faster than CPI (Aon India 11.5% medical trend [S14]; RBI HPI 3.6% [S20]).
- **Three-scenario plan view** (conservative / base / optimistic), so families see the range rather than one number (§3).
- **Stress test.** "If markets fell 55% next year, would the plan still meet the near-term goals?" (2008: −60% [S17]).
- **Gold and international as diversifiers.** These are justified by near-zero correlation (gold vs Sensex −0.07 [S11]) and the INR depreciation hedge (§2.6).
- **"Real return" labels.** "After inflation, this FD earns about 1.7% a year" (FD 6.75% vs CPI 5%; current CPI 6.09% [S13]).
- **Quarterly small-savings refresh**, so PPF, SCSS, SSY and NSC rates stay exact (DEA, [S10]).

---

## 5. Disagreements and open questions

1. **History or forecast for equity?** History says 12–12.5%. Forecasts say 10.5–12%. I chose 11% nominal and model in real terms. Indian AMC and advisor tools commonly use 12%, so families comparing calculators will see a lower number from this app. Explain it in the UI: "about 6% above inflation".
2. **Mid and small-cap premium.** The factsheets show +3–4 pp since 2005. I give +0.75 pp. Reasonable people disagree; revisit with the SPIVA India and size-factor evidence in topic 9.
3. **Education inflation has no primary series.** The 10–12% figure appears in AMC blogs and media citing unnamed "studies". The CPI education sub-index is much lower. Open: build our own index from published fee notifications (IIT/IIM/NIT fees, a few large private school chains) for 2010–2026.
4. **Medical trend vs price inflation.** Aon and WTW figures are employer claims trends, not consumer price inflation. Use them for insurance premiums and health-cost goals, not general retirement spending.
5. **Equity–bond correlation in India** is not well documented in public sources. The 0.10 is an estimate; compute it from NSE TRI daily data (Nifty 50 TRI vs Nifty 10y G-Sec, 2011–2026) before the full planner ships.
6. **The international-in-INR correlation of 0.45** is an estimate. Compute it from S&P 500 TR × USDINR (RBI reference rate) vs Nifty 50 TRI monthly, 2000–2026.
7. **India-specific institutional CMAs** (JPM India equity in INR, Vanguard VCMM India, BlackRock, Morningstar India) were not retrievable without a login. If the founder has access, record them in this note; they would raise confidence in §3.
8. **RBI October 2026 figures** came via a third-party copy whose tables do not match its text (5.2% FY27 in the text, quarterly figures differ). Confirm on rbi.org.in. The 5.50% repo hike also needs confirming.
9. **Distribution shape.** India has fat left tails (1-year −47%). A lognormal with 18% volatility under-weights single-year crashes slightly. Consider a stress overlay (§4) rather than a fat-tailed model in v1.
10. **Arithmetic vs geometric.** The table stores arithmetic means. For a deterministic "Brings home" projection (Task 9), use the geometric approximation `real − σ²/2` (equity large: about 4.1% real, about 9.3% nominal) **or** label the deterministic number as "median-ish". Decide in topic 1 (goal-based planning method). This is a real choice: using 11% deterministically overstates the median outcome.

---

## 6. Sources

| # | Source | Type | Confidence | Covers |
|---|---|---|---|---|
| S1 | NSE Indices, Nifty 50 factsheet, 30 Oct 2026, https://archives.nseindia.com/content/indices/ind_nifty50.pdf | Data | High | Returns, std dev, P/E |
| S2 | NSE Indices, Nifty 500 factsheet, https://www.niftyindices.com/Factsheet/ind_nifty_500.pdf | Data | High | Returns, std dev, correlation |
| S3 | NSE Indices, Nifty Midcap 150 factsheet, https://www.niftyindices.com/Factsheet/ind_Nifty_Midcap_150.pdf | Data | High | Same |
| S4 | NSE Indices, Nifty Smallcap 250 factsheet, https://www.niftyindices.com/Factsheet/ind_Nifty_Smallcap_250.pdf | Data | High | Same |
| S5 | HDFC MF, "Investment Mantra" May 2020 (Sensex rolling returns 1979–2020), https://files.hdfcfund.com/s3fs-public/2020-06/Investment%20Mantra-May%202020.pdf | Data (AMC compilation of BSE data) | High | Rolling returns, probability of gain |
| S6 | NSE Indices, Nifty 10 yr Benchmark G-Sec factsheet, https://www.niftyindices.com/Factsheet/Nifty_10_Benchmark_G-Sec.pdf | Data | High | Gilt returns |
| S7 | NSE Indices, Nifty 1D Rate factsheet, https://www.niftyindices.com/Factsheet/Factsheet_Nifty_1D_Rate.pdf | Data | High | Cash returns |
| S8 | J.P. Morgan AM, 2027 LTCMA press release, 19 Oct 2026, https://www.prnewswire.com/news-releases/jp-morgan-releases-2027-longterm-capital-market-assumptions-projecting-7-0-return-for-6040-portfolio-over-10-15-years-302912421.html | Institution | High | US/EM equity, gold, bonds (USD) |
| S8b | J.P. Morgan AM, 2026 LTCMA press release, https://am.jpmorgan.com/us/en/asset-management/institutional/about-us/media/press-releases/jp-morgan-releases-2026-long-term-capital-market-assumptions/ | Institution | High | EM 7.8% (prior year) |
| S9 | RBI Monetary Policy Statement, 5–7 Oct 2026 (third-party copy), https://avantiscdnprodstorage.blob.core.windows.net/legalupdatedocs/60123/RBI-MPC-hikes-Repo-Rate-to-5-50-and-adopts-Calibrated-Tightening-stance-October072026.pdf; RBI Bulletin, https://www.rbi.org.in/scripts/BS_ViewBulletin.aspx?Id=24511 | Institution / Data | Medium (confirm on RBI) | CPI projection, repo |
| S10 | Times of India, small savings rates Oct–Dec 2026, quoting the DEA office memorandum of 30 Sep 2026, https://timesofindia.indiatimes.com/business/india-business/ppf-at-7-1-scss-8-2-nsc-7-7-check-small-savings-interest-rates-for-october-december-2026-and-what-investors-will-earn-on-post-office-schemes-like-ssy-time-deposits/articleshow/134704207.cms | Data via media | High | PPF, SCSS, SSY, NSC |
| S11 | Moradia, A. & Mehta, A. C. (2018), "Analyzing gold returns: Indian perspective", MPRA Paper 92989, https://mpra.ub.uni-muenchen.de/92989/1/MPRA_paper_92989.pdf | Paper | Medium | Gold INR return, volatility, correlation 1992–2017 |
| S12 | Goldman Sachs Research, "Building Long-Term Returns: Our 10-Year Forecasts", Nov 2025, https://www.gspublishing.com/content/research/en/reports/2025/11/12/0c292cc7-ce42-4fba-a026-744231e9f4f4.html | Institution | High | S&P 6.5%, India EPS 12.6% |
| S13 | MOSPI CPI release Oct 2026 (via GoIStats, https://www.facebook.com/GoIStats/posts/consumer-price-index-and-corresponding-inflation-for-october-2026-are-11005-and-/1487036183530016/); Trading Economics, https://tradingeconomics.com/india/inflation-cpi | Data | High | CPI level and average |
| S14 | Aon, 2026 Global Medical Trend Rates Report, https://www.neebc.org/assets/pdfs/Blogs/Aon%20global%20med%20trends%202026.pdf; Aon press release, https://www.aon.com/apac/in-the-press/asia-newsroom/2025/india-outpaces-global-average-with-2026-medical-trend-at-11-5-percent-aon-reports | Institution | High | India medical trend |
| S15 | WTW, 2026 Global Medical Trends Survey, https://www.wtwco.com/en-cm/insights/2025/10/2026-global-medical-trends-survey | Institution | High | APAC medical trend |
| S16 | BacktestIndia, Nifty Midcap 100 CAGR, https://backtestindia.com/data/nifty-midcap-100-cagr | Opinion / data aggregator | Medium | 2008/2009 midcap years |
| S17 | Kalpi, https://kalpi.ai/mutual-fund-drawdown; Moneyvesta, https://moneyvesta.com/nifty-50-drawdowns-and-recoveries/ | Opinion / data aggregator | Medium | Drawdowns, recovery |
| S18 | Monetary Metals (using NYU Stern data), https://www.monetary-metals.com/insights/articles/gold-vs-the-sp-500/; Curvo, https://curvo.eu/backtest/en/compare-indexes/gold-bullion-vs-sp-500 | Opinion / data aggregator | Medium | Gold USD history |
| S19 | Kotak MF blog, https://www.kotakmf.com/Information/blogs/education-inflation-india-rising-costs; Down To Earth, https://www.downtoearth.org.in/governance/rising-education-cost-is-a-quieter-and-more-consequential-form-of-inflation-that-india-is-overlooking | Opinion | Low | Education inflation 10–12% |
| S20 | RBI, All-India House Price Index Q1:2026-27, https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=63436 | Data | High | HPI growth |
| S21 | Damodaran, Country Default Spreads and Risk Premiums (Jan 2026), https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html | Opinion (academic dataset) | High | India ERP 7.08% |
