# Retirement income in India: corpus sizing and tax-aware drawdown for a couple (FY 2026-27)

15 Nov 2026. Research agenda topic 7 (`docs/PLANNER-NOTES.md`). It builds on **TAX** (`2026-11-15-family-financial-planning.md`), **DATA** (`2026-11-15-india-returns-risk-inflation.md`), **GOAL** (`2026-11-15-goal-based-planning.md`) and **SELL** (`2026-11-15-tax-aware-selling-rebalancing.md`), and uses their section numbers.

Source labels: **Paper**, **Regulator**, **Data**, **Practitioner**, **Opinion**, each with a confidence level. **Calc** marks my own arithmetic or simulation. The simulation script was a scratch file and is not in the repo; its model is described in §2.6 so it can be rebuilt as an engine test.

---

## 1. Summary

1. **The US "4% rule" is too high for India.** Bengen's 4% comes from one unusually good market (the US). Across 17 countries, 4% would have been safe in only 4 (Pfau 2010). Indian studies find 2.8–3.5% for a 35-year retirement (Raju & Saraogi; freefincal). My simulation on the DATA assumptions gives **3.1% under the conservative scenario and 3.7% under the base scenario**, both at 85% success over 35 years. **Default: 3.0–3.25% for a couple retiring at 60.**
2. **Plan to age 95 for the younger spouse, not to average life expectancy.** At 60, average remaining life in India is 18.3 years (SRS 2015-19: men 17.5, women 19.0). Averages are the wrong target, because half of retirees outlive them. Affluent urban women live longest.
3. **Being flexible about spending is worth more than any withdrawal-order trick.** In the decumulation literature, allowing withdrawals to vary within a floor and a ceiling gives large efficiency gains (Forsyth et al. 2021). Guardrails let a ₹3 Cr couple start at ₹12 L a year with almost no risk of running out in the base case, but the price is a 1-in-4 chance of being cut to the essential floor at some point.
4. **The ₹12 L new-regime rebate makes a retired couple's slab income almost tax-free, if each spouse owns money in their own right.** Two spouses can each have up to ₹12 L of interest, pension and debt gains at ₹0 tax (TAX §3.1). In one name, the same ₹20.25 L of FD interest costs ₹2,14,500 a year. **Splitting needs own-source money:** income from assets gifted to a spouse is clubbed back to the giver (TAX §3.10).
5. **A floor of government products covers most essential spending:** SCSS (₹30 L per person at 8.2%, so ₹60 L per couple), Post Office MIS (₹9 L single, ₹15 L joint, 7.4%) and RBI Floating Rate Savings Bonds (8.05%, resets every six months). PMVVY closed to new money in March 2023. All of them are slab-taxed, which costs nothing under the rebate.
6. **Annuities are a weak floor in India today.** Joint-life annuities with return of purchase price pay about 5.5–6.5% a year, fixed in rupees with no inflation increase, and fully taxed. Use them only for longevity insurance late in life, or where NPS forces it.
7. **NPS changed in December 2025:** non-government subscribers can take up to 80% as a lump sum at exit, with at least 20% buying an annuity; corpus ≤ ₹8 L can be taken in full. **Tax did not follow:** only 60% is exempt, so the extra 20% is taxed at slab in the year it is taken. That can push a member over ₹12 L. Spread it over several years.
8. **Buckets are a way to explain the plan, not a source of return.** Buckets that are never rebalanced underperform a static mix (Estrada; Kitces). The engine uses a cash bucket plus annual rebalancing, and shows it to the user as buckets.
9. **The withdrawal order for a couple in India is "fill each spouse's free allowances first".** The order inside each year: contractual income, then the cash bucket, then redemptions chosen by the rebalancing rule, then the member and lot chosen by SELL Algorithm A, keeping each spouse's total income ≤ ₹12 L and each spouse's equity gains within ₹1.25 L. With room left, harvest gains to reset cost. File Form 121 so no TDS is taken.
10. **Worked example (§4): ₹3 Cr at 60, wanting ₹12 L a year.** At a fixed ₹12 L the plan succeeds in 76% of base paths and 44% of conservative paths. A fixed ₹10.5 L reaches 91% and 68%. With guardrails, ₹12 L lasts in 98% of base paths and 89% of conservative paths; spending averages ₹10.9 L and ₹9.6 L. Tax in year 1 is ₹0 for both spouses.

---

## 2. Findings with citations

### 2.1 Safe withdrawal rates: the literature

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| R1 | Starting at 4% of the corpus and raising it with inflation survived every rolling 30-year US period since 1926, with 50–75% in equities. | Bengen, "Determining Withdrawal Rates Using Historical Data", *J. Financial Planning* Oct 1994 | Paper, High |
| R2 | The "Trinity study" (US data 1926–95): 4% inflation-adjusted with 50–75% stocks succeeded in about 95%+ of 30-year periods, and success falls quickly above 5%. | Cooley, Hubbard & Walz, "Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable", *AAII Journal* 1998 | Paper, High |
| R3 | 17 countries, 109 years, 30-year retirements, with the best fixed allocation in each case: 4% would have been safe in only 4 of 17 countries. The safe maximum was under 3% in Spain, Italy, Belgium, France, Germany and Japan. The US was lucky. | Pfau, "An International Perspective on Safe Withdrawal Rates: The Demise of the 4 Percent Rule?", *JFP* Dec 2010 ([FPA PDF](https://www.financialplanningassociation.org/sites/default/files/2021-10/DEC10%20JFP%20Pfau%20PDF.pdf)) | Paper, High |
| R4 | Germany: a maximum safe rate of about 4% with 50/50 equities and government bonds over 15–35 years. | Dziwisch, Krahnhof & Zureck, *Financial Markets and Portfolio Management* 2021 ([PMC8475470](https://pmc.ncbi.nlm.nih.gov/articles/PMC8475470/)) | Paper, Medium |
| R5 | Allowing withdrawals to vary within a cap and a floor gives "large improvements in efficiency" over a constant real withdrawal. A dynamic allocation adds further gains. | Forsyth, Vetzal & Westmacott, arXiv 2101.02760 (2021); Forsyth arXiv 2008.06598 | Paper, High |
| R6 | Capping equity at 50% hardly reduced decumulation efficiency in an optimal-control model. | Forsyth & Labahn, arXiv 2605.17744 (2026) | Paper, Medium |
| R7 | **India:** 2.8% for a 35-year horizon, in real terms after tax. Built from equity, FD and 10% gold, with block bootstrap and out-of-sample checks. An earlier 1979–2022 study gave 2.6%. A moderate equity share is best: an all-FD portfolio gives under 2%, and around 40% equity gives about 3%. The authors' practical range is 3–3.5%. | Raju & Saraogi, "Balancing Acts: Safe Withdrawal Rates in the Indian Context", SSRN 4697720 (2024), read via [Business Standard](https://www.business-standard.com/amp/finance/personal-finance/make-your-retirement-portfolio-last-longer-withdraw-funds-conservatively-124022901095_1.html) and a [summary](https://kartick.substack.com/p/summary-of-balancing-acts-safe-withdrawal) | Paper (working), Medium: full text not read |
| R8 | Initial withdrawal rate below 3.5%: "likely adequate". 3.5–4.5%: a grey zone. Above 4.5%: put most of it into a pension. From a decade of calculators and backtests; the assumptions are not stated. | Pattabiraman, [freefincal](https://freefincal.com/how-to-use-safe-withdrawal-rates-to-gauge-retirement-corpus-health) | Practitioner, Medium |
| R9 | A Sensex TRI backtest: "the 4% rule does not work in India" for 30 years. | [Arthgyaan](https://arthgyaan.com/blog/does-the-4-percent-rule-work-in-india.html) | Practitioner, Low–Medium (not read in full) |

**Why India is lower although equity returns are higher.** India's nominal returns are higher, but the safe rate depends on **real** returns, volatility and the order of returns. Indian real equity returns are about 6% (DATA §2.8). Debt earns only about 1–2% real (DATA §2.4), well below the 2–3% real on US bonds in Bengen's data. Indian equity has about 18% volatility (DATA §2.2) with deep drawdowns: −60% in 2008 and −47% in a single year to Mar-93 (DATA §2.3). And the Indian series is short (1979 onward), so the worst case has not yet been seen.

### 2.2 Sequence of returns and longevity

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| L1 | Life expectancy at 60: **18.3 years** (men 17.5, women 19.0). | SRS Based Abridged Life Tables 2015-19, ORGI, via [lifetable.de](https://www.lifetable.de/File/GetDocument/data%5CIND%5CIND000020152019AU1.pdf) | Data, High (2019-23 table exists but its e60 was not read) |
| L2 | Under the 2019-23 tables, a person who reaches 65 lives "to be over 81" on average. | [Data for India](https://www.dataforindia.com/life-expectancy/) (SRS 2019-23) | Data, Medium |
| L3 | e60 is 17.4 years for men and 19.2 for women nationally; states differ widely. | Karun et al., *Genus* 2025 | Paper, Medium |
| L4 | Planning horizon: the averages above understate it for affluent, urban, insured families, and for the second death of a couple. **Default plan-to age is 95 for the younger spouse.** For a couple both aged 60 that is a 35-year horizon, which matches Raju & Saraogi's 35 years. | Opinion, Medium (no Indian annuitant mortality table read; IRDAI's IALM 2012-14 is the place to check) | Opinion |
| L5 | Sequence risk: the same average return with losses early in retirement fails far more often, because withdrawals lock in the losses. The −55% equity shock with 3–5 years to recover (DATA §2.3) is the stress test. | Implied by R1–R3; DATA §2.3 | Paper / Calc |

### 2.3 Drawdown methods compared

| Method | How it works | Evidence | Fit for the app |
|---|---|---|---|
| **Fixed real withdrawal (SWR)** | Withdraw X% of the starting corpus and raise it with CPI every year | R1–R3, R7. Simple, but ignores what markets actually do | Fallback and headline number |
| **Guardrails (Guyton–Klinger)** | Start higher (5.2–5.6% in the US with ≥ 65% equity). Cut spending 10% if the current withdrawal rate rises 20% above the starting rate; raise it 10% if the rate falls 20% below. The cut rule stops 15 years before the plan-to age. The original also skipped the inflation raise after a losing year. | Guyton & Klinger, *JFP* Mar 2006 ([PDF](https://www.financialplanningassociation.org/sites/default/files/2021-11/2006%20-%20Guyton%20and%20Klinger%20-%20Decision%20Rules%20and%20SWR%20(1).PDF)), Paper, Medium–High. Kitces notes that practitioners round, reset and act quarterly, and dollar terms explain it better than percentages ([Kitces](https://www.kitces.com/blog/implementing-retirement-income-guardrails-to-facilitate-the-right-spending-raises-and-spending-cuts/)), Practitioner, High | **Primary rule** (§3), without the skip-inflation rule: in my simulation it ratchets spending down permanently (§2.6) |
| **Risk-based guardrails** | Re-run Monte Carlo each year; cut when the probability of success falls below a lower band, raise when it rises above an upper band | Kitces / Income Lab (Practitioner, Medium; exact bands not read) | **Annual review display** (§3.4 step 9); too heavy to nest inside the simulation |
| **Bucket strategy** | Cash for 1–2 years, debt for 3–7, equity for the rest; refill from equity | Unrebalanced buckets underperform static mixes; with rebalancing they match them. Their value is behavioural: no forced equity sale in a crash. (Estrada, IESE working paper, [PDF](https://blog.iese.edu/jestrada/files/2019/07/BucketApproach.pdf), Paper, Medium; Kitces 2014 per Estrada) | **The way the plan is shown**; the money is run as one portfolio |
| **Floor-and-upside** | Guaranteed or near-guaranteed income covers essentials; risky assets fund wants | Standard practitioner framework (freefincal "income flooring", R8) | **Yes**: the floor uses SCSS, POMIS and FRSB (§2.4) |
| **Rising equity glide path** | Start retirement with less equity and raise it | Kitces & Pfau, *JFP* Jan 2014, lower failure in Monte Carlo; Estrada finds the opposite on international data (via [Swedroe](https://www.etf.com/sections/index-investor-corner/swedroe-declining-or-rising-equity-strategy-retirement)) | Not a default. The SCSS floor rolling off after 5–8 years already raises the equity share gently |
| **Annuity** | Buy guaranteed lifetime income | See §2.4 | Only for NPS's mandatory part, or longevity cover after 75 |

### 2.4 The Indian floor: products, rates and rules (as of Q3 FY 2026-27)

| Product | Rate | Limit | Liquidity | Tax | Source |
|---|---|---|---|---|---|
| **SCSS** | 8.2%, fixed for the 5-year term; paid quarterly (1 Apr / Jul / Oct / Jan) | ₹30 L per individual, across accounts. So **₹60 L for a couple** if each has their own money. | 5 years, extendable in 3-year blocks at the rate then in force. Early closure: 1.5% penalty after 1 year, 1% after 2 years; no interest if closed within year 1 | Interest at slab. Old regime: inside ₹1.5 L 80C and 80TTB ₹50,000. | TAX §3.7; rate DATA §2.4 [S10]; rules per [Zee Biz FY27](https://www.zeebiz.com/personal-finance/news-senior-citizen-savings-scheme-fy-2026-27-check-latest-interest-rate-tax-savings-deposit-limit-394325) and bank pages. Media/Practitioner, Medium (NSI page did not load; confirm against the SCSS Rules 2019 as amended in 2023) |
| **Post Office MIS** | 7.4%, paid monthly, fixed for 5 years | ₹9 L single; ₹15 L joint | No exit in year 1; 2% penalty in years 1–3; 1% after | Slab | [India Post scheme rules](https://IndiaPost.gov.in/VAS/DOP_PDFFiles/Savings%20Bank/Monthly%20Income%20Account%20Scheme%202019%20English.pdf); rate per media (Practitioner, Medium) |
| **RBI Floating Rate Savings Bonds 2020 (T)** | **8.05%** for Jan–Jun 2026 (NSC rate 7.70% + 0.35%), reset every 6 months, paid half-yearly | No cap | 7-year lock-in; earlier for seniors (6 years at 60–70, 5 at 70–80, 4 at 80+, per RBI terms, not re-read) | Slab | [RBI press release](https://website.rbi.org.in/web/rbi/-/press-releases/rate-of-interest-on-floating-rate-savings-bond-2020-taxable-frsb-2020-t-for-the-period-january-01-2026-june-30-2026), Regulator, High |
| **PMVVY** | – | **Closed to new subscribers after 31 Mar 2023** | – | – | Opinion/known, Medium–High |
| **Immediate annuity, joint life, return of purchase price** | ~5.5–6.5% a year at 60, level in rupees. HDFC Life illustration ≈ 5.9%. LIC Jeevan Akshay VII ≈ 6.0–6.3% single life with return of purchase price (indicative). | No cap | None: irreversible | Fully taxed at slab every year | [PolicyX](https://www.policyx.com/life-insurance/articles/immediate-annuity-rates-2026/), [Cleartax](https://cleartax.in/s/hdfc-life-new-immediate-annuity-plan): Practitioner, **Low**. Get live quotes |
| **Bank FD** | ~6.5–7%, plus about 0.5% for seniors | DICGC cover ₹5 L per bank | Breakable | Slab; TDS above ₹1 L for seniors | DATA §2.4 (Opinion, Low) |

**What a level annuity really pays.** A 6% annuity with no inflation increase loses buying power at 5% CPI. After 15 years it buys 48% of what it bought at the start (Calc: 1.05^−15 = 0.48). Over 35 years it is worth the same as an inflation-rising payout of about 2.9% of the price (Calc: a 6% level stream discounted at 6.05% nominal is worth 86.5% of the price; spread as a rising stream at 1% real over 35 years, that is 2.9% a year). That is below the 3.0–3.25% safe withdrawal rate, and it gives up the corpus. Return-of-purchase-price variants pay less still.

### 2.5 Retirement tax rules (FY 2026-27)

| # | Rule | Effect on drawdown | Source |
|---|---|---|---|
| T1 | New-regime rebate: tax is nil if total income is ≤ ₹12 L, with marginal relief just above. The rebate does not cover tax on special-rate gains (s.196/198). | Each spouse can draw up to ₹12 L of slab income at ₹0. Across a couple that is ₹24 L. | TAX §3.1; s.156 |
| T2 | No age benefit in the new regime (₹4 L nil band at every age). The old regime gives ₹3 L nil band (₹5 L at 80+) and 80TTB ₹50,000 on deposit interest. | The new regime wins for almost every retiree under ₹12 L. Old wins only where large 80D or medical deductions apply. | TAX §3.8 |
| T3 | Standard deduction of ₹75,000 on salary or **pension** (new regime). Annuity from an insurer is usually treated as income from other sources, with no standard deduction. | A pensioner can have ₹12.75 L of pension at ₹0 tax | TAX §3.1; annuity treatment: Opinion, Medium |
| T4 | **SWP: only the gain in each redemption is taxed.** Units are redeemed FIFO per folio. Equity (≥ 65% domestic equity): LTCG 12.5% above ₹1.25 L, if held over 12 months. Debt funds bought from 1 Apr 2023: gain at slab. | Early SWP years are mostly return of capital: a ₹1 L redemption at a 30% gain fraction carries ₹30,000 of gain. | TAX §3.9; SELL §2.3 |
| T5 | The basic exemption gap (resident) reduces STCG and LTCG only if slab income is below ₹4 L. | A spouse with < ₹4 L of slab income can take up to ₹5.25 L of equity LTCG tax-free (SELL §3.4). | TAX §3.9 |
| T6 | **Special-rate gains count toward the ₹12 L test** but the rebate does not cover their tax. | Keep slab income **plus** equity gains ≤ ₹12 L per member, or the rebate on the slab tax is lost (TAX §4.2 ex. 3: ₹1 L more gain can cost ₹61,750). Whether this applies is an open question across notes. | TAX §3.1; core list §4 |
| T7 | Seniors (60+) with no business income pay **no advance tax**. | No quarterly instalments to track | TAX §3.8, s.403(3) |
| T8 | TDS on interest for seniors starts at ₹1 L a year per payer. **Form 121** replaces 15G/15H from 1 Apr 2026; a senior can file it when tax on estimated income is nil. | SCSS at ₹30 L pays ₹2.46 L a year, so TDS is deducted unless Form 121 is filed. The engine prompts each April. | TAX §3.8 |
| T9 | **Clubbing:** income from assets a spouse received as a gift is taxed in the giver's hands. Income earned on that clubbed income (accretion) is not clubbed again. | The ₹24 L couple allowance only works on money each spouse earned, inherited or received from someone other than the spouse, or lent at a market rate. | TAX §3.10 |
| T10 | **NPS exit, non-government (PFRDA amendment, Dec 2025):** corpus ≤ ₹8 L, take it all. ₹8–12 L: up to ₹6 L lump sum plus systematic withdrawal or annuity for the rest, or 80/20. Above ₹12 L: up to 80% lump sum, at least 20% to an annuity. Exit and annuity can be deferred to 85. Government subscribers stay at 60/40. | NPS now acts like a mostly liquid corpus | [Business Today, 17 Dec 2025](https://www.businesstoday.in/personal-finance/retirement-planning/story/pfrda-eases-nps-exit-rules-for-non-government-subscribers-lowers-mandatory-annuity-to-20-507010-2025-12-17); [Business Standard](https://www.business-standard.com/finance/personal-finance/nps-changes-2025-80-withdrawal-more-lump-sum-less-annuity-exit-relief-125122200156_1.html). Regulator via media, Medium–High (gazette not read) |
| T11 | **NPS tax:** 60% of the corpus at closure is exempt (carried into the 2025 Act per secondary sources). **The 60–80% slice is taxed at slab** in the year it is taken. Budget 2026 did not change this. Annuity income is taxed at slab. | Taking 80% at once can push a member over ₹12 L. Take the taxable 20% over several years, or defer it. | [Business Standard, 23 Dec 2025](https://www.business-standard.com/finance/personal-finance/nps-withdrawal-norms-fund-access-comes-with-onus-to-manage-longevity-risk-125122300130_1.html); [1Finance](https://1finance.co.in/blog/new-nps-withdrawal-rules-taxation). Practitioner, Medium. **Section in the 2025 Act not confirmed.** |
| T12 | **EPF:** withdrawal after 5 years' continuous service is tax-free. The account keeps earning interest until 3 years of no contributions (about age 61 for a retirement at 58). Sources disagree on whether interest credited after retirement is taxable. Interest on employee contributions above ₹2.5 L a year is taxable while working (TAX §3.7). | Withdraw EPF within 3 years of retiring; keep it as debt until then | [Business Today, Jul 2026](https://www.businesstoday.in/personal-finance/tax/story/my-pf-is-tax-free-myth-or-truth-know-the-epf-withdrawal-tax-rules-before-you-cash-out-540381-2026-07-02); Practitioner, Medium |
| T13 | **PPF:** extension in 5-year blocks, with or without contributions; interest is tax-free. | Under the rebate, "tax-free" is worth nothing to a retiree who pays no tax anyway. Judge PPF on its 7.1% rate and liquidity only. | TAX §3.7; Calc |

**The key insight for the engine.** For most retired couples with a corpus under about ₹5 Cr, tax is not the binding constraint, as long as income stays within each spouse's ₹12 L and ₹1.25 L allowances. The tax value comes from **staying under the cliffs**, **ownership** (which spouse holds what), **NPS timing** and **Form 121**, not from clever ordering. Order matters again for larger corpora, or when one spouse has a big pension.

### 2.6 My simulation (Calc)

Model: 20,000 paths of annual real returns, lognormal, using the DATA §3 base and conservative assumptions. Base: equity_large 5.75% real, 18% volatility; debt_short 1.9% real, 2.5% volatility; correlation 0.1; CPI 5%. Conservative: equity 4.0%, debt 1.0%, CPI 6%. ₹60 L sits in SCSS at 8.2% nominal for 5 years, then follows debt. The portfolio is rebalanced every year, and the withdrawal is taken at the start of each year. Success means spending is never left unfunded through 35 years.

**Limits:** lognormal returns have thinner tails than Indian history. CPI is held fixed (no inflation shock). There are no health shocks and no tax (tax is about ₹0 in this setup, §4). These limits are why the default (§3.2) uses the **conservative** scenario.

Maximum initial withdrawal rate at 40% equity, by horizon (inflation-adjusted, fixed):

| Horizon | Base, 85% success | Conservative, 85% success |
|---|---|---|
| 25 years | 4.73% | 4.10% |
| 30 years | 4.15% | 3.51% |
| 35 years | 3.74% | 3.08% |
| 40 years | 3.43% | 2.78% |

At 35 years, base scenario: 3.89% at 80% success, 3.54% at 90%, 3.27% at 95%. Equity share, ₹3 Cr corpus, base, success of a fixed ₹10.5 L: 30% equity → 93%; 40% → 91%; 50% → 89%; 60% → 87%. In the conservative scenario success is flat at about 67–68% across 30–60% equity. This is consistent with R7: with India's low real debt returns, extra equity barely helps a fixed withdrawal over 35 years.

The conservative 35-year figure (3.08%) sits beside Raju & Saraogi's 2.8–3.5% and freefincal's 3.5% threshold. The base figure (3.74%) is above all of them, which is expected given the thin tails.

---

## 3. Recommended method

### 3.1 Shape of the module

`src/engine/retirement/` (names indicative). It reuses GOAL's path generator (GOAL §3.4), DATA's `marketAssumptions.ts`, TAX's per-member tax function (foundation spec §4.3) and SELL Algorithm A (SELL §3.1).

```ts
type RetirementInput = {
  members: { id: string; birthYear: number; retireYear: number; sex?: 'f'|'m';
             regime: 'new'|'old'; pensionYearly?: number; pensionIndexed?: boolean;
             nps?: { corpus: number; government: boolean };
             epf?: number; ppf?: number }[];
  spendingToday: { essential: number; discretionary: number };   // ₹/yr, today's prices
  healthPremiumToday?: number;                                    // inflated at health_insurance_premium
  holdings: Holding[];                                            // existing model, per member, with lots
  equityTarget?: number;                                          // default 0.40; capped by the RISK profile limit
  planToAge?: number;                                             // default 95, for the younger spouse
  successTarget?: number;                                         // default 0.85
  scenario?: Scenario;                                            // default 'conservative' for the headline
  floorPreference?: 'govt'|'annuity'|'none';                      // default 'govt'
};
type RetirementPlan = {
  sustainableSpend: { fixed: number; guardrailStart: number };    // ₹/yr, today's prices
  corpusNeeded: number; corpusGap: number;                        // if not yet retired
  successFixed: number; successGuardrail: number;                 // at the user's chosen spend
  spendDistribution: { p10: number; p50: number; p90: number };   // average real spending over life
  pFloorHit: number;                                              // chance spending is ever cut to essentials
  floor: FloorLadder;                                             // SCSS/MIS/FRSB per member
  yearPlan: YearAction[];                                         // this FY: what to redeem, from whom, harvests, Form 121
  guardrails: { lowerValue: number; upperValue: number };         // ₹ portfolio values that trigger a cut or raise
  explanation: string[];
};
```

### 3.2 Corpus sizing (accumulating members)

1. **Horizon.** `T = planToAge − retireAge` for the younger spouse. If the spouses retire in different years, simulate year by year; the couple's horizon ends when the younger spouse reaches `planToAge`.
2. **Need, in today's rupees.** `N_t = essential + discretionary + healthPremium_t`. Inflate health at `health_insurance_premium` (10% base) and everything else at `retirement_living` (5%). Subtract guaranteed income: pensions (indexed or not) and existing annuities. Optional: discretionary spending falls 1% a year in real terms after 75 (spending usually falls with age; Opinion, Medium; off by default).
3. **First estimate** (closed form, used as the bisection start): `C0 = Σ_t N_t / (1 + r_g)^t`, where `r_g` is the portfolio's geometric real return, `r_g ≈ Σ w_i μ_i − σ_p²/2` (base, 40% equity ≈ 3.4%).
4. **Monte Carlo sizing.** Bisect on corpus `C` until `P(success) = successTarget` under the chosen **scenario**, with spending drawn by the **guardrail rule in §3.4** and a floor at `essential`. Success means the portfolio is never depleted before the horizon **and** spending never falls below essential. Report `C` for both base and conservative.
5. **Headline and checks.** Show the conservative-scenario corpus as "enough for 85 of 100 harder futures". Also show the implied initial rate `IWR = N_1 / C`. Flag when IWR > 3.5% (freefincal grey zone) or > 4.5% (inadequate).
6. **Tax.** Simulate after-tax spending. Each year, run §3.4 steps 4–7 on a simplified model: one equity pool and one debt pool per member with average gain fractions. A full lot model is not needed inside 2,000 paths × 35 years.
7. **Output to GOAL.** The corpus becomes the retirement goal's target, with priority "need" for the essential part and "want" for the discretionary part (GOAL §3.5 waterfall).

**Default targets:** success 85%; conservative scenario; plan-to age 95; equity 40%, capped by RISK (RISK §4.3). In retirement, capacity uses the ratio of years of essential spending covered by the floor and guaranteed income, not job stability.

### 3.3 Floor ladder (at retirement and every year)

1. **Floor need:** `F = max(0, essential − guaranteed income)` per year.
2. **Fill per member, in this order, from that member's own money** (never by gift between spouses, because of clubbing):
   1. SCSS up to ₹30 L per member aged 60+, or 55+ for retirees within the eligibility window.
   2. POMIS up to ₹9 L each, or ₹15 L joint.
   3. RBI FRSB for any further fixed income wanted with a floating rate.
   4. Short-duration debt funds or an FD ladder for the rest.
3. **Floor size:** the default target is the floor income covering `F` for the first 5 years. Cap the floor at 60% of the corpus, so that equity ≥ `equityTarget` is still possible.
4. **Annuity:** offered only for (a) the NPS-mandated part (choose joint life, 100% to the survivor; return of purchase price only if leaving money to heirs matters), or (b) a "longevity top-up" bought at 75–80, when annuity rates are higher. Never as the default floor at 60 (see §2.4).
5. **Cash bucket:** 12 months of `need − floor income` in a liquid fund or sweep FD, refilled each April.

### 3.4 Annual drawdown algorithm (run each 1 April, and simulated each year in Monte Carlo)

Inputs: holdings with lots per member, last year's spending `S_{t−1}`, the initial withdrawal rate `WR0`, the current portfolio value `P_t`, and this FY's TaxRules.

1. **Spending (guardrails, adapted from Guyton–Klinger):**
   - `S_t = S_{t−1} × (1 + CPI_{t−1})` (actual CPI, from TaxRules data).
   - `WR_t = (S_t − guaranteed_t − floorIncome_t) / P_t`, where `P_t` is the market value of investable assets.
   - If `WR_t > 1.2 × WR0` and more than 15 years remain: `S_t ×= 0.90`. **Never below `essential_t`.**
   - If `WR_t < 0.8 × WR0`: `S_t ×= 1.10`.
   - **No skip-inflation rule.** In my simulation, the original "no raise after a losing year" rule lowered median lifetime spending by about ₹0.6 L a year (₹10.9 L → ₹10.3 L at a ₹12 L start) and raised the chance of reaching the essential floor from 25% to 42% (§4.3), with no gain in success.
   - Show the triggers in rupees: "If your investments fall below ₹X, we will suggest trimming spending by 10%; above ₹Y, you can raise it."
2. **Cash needed:** `need_t = S_t − (pensions + annuity + floor interest + dividends arriving this FY) − cash bucket surplus`, plus the cash bucket refill.
3. **Fixed income first.** Floor interest arrives anyway. Credit each member with their own interest when computing slab income.
4. **Allowance map per member** (TaxRules):
   - `slabIncome_i` = pension − ₹75,000 + interest + annuity + projected debt gains;
   - `rebateRoom_i = 12,00,000 − slabIncome_i − plannedSpecialRateGains_i` (conservative reading of T6);
   - `ltcgRoom_i = 1,25,000 − realised equity LTCG_i`;
   - `gapRoom_i = max(0, 4,00,000 − slabIncome_i)` (resident only).
5. **What to sell (asset class): the rebalancing rule.** Compare the current equity share with `equityTarget`, using bands of ±5 points (SELL §2.2).
   - Above the band: raise `need_t` from equity first, and trade back to the band edge.
   - Inside the band: take `need_t` pro rata.
   - Below the band, or **equity fell more than 15% in the last 12 months**: take `need_t` from cash, debt and maturing floor; **sell no equity**. This is what the bucket picture promises.
6. **Who and which lots: SELL Algorithm A** for the chosen class, using each member's cost curve from step 4. The marginal cost is 0 inside `ltcgRoom + gapRoom` for equity and inside `rebateRoom` for debt. Above that it is the real marginal cost, **including the ₹12 L cliff** (TAX §4.2 ex. 3). Keep FIFO (SELL I1). If several members cost ₹0, prefer the member whose income is **expected to rise** later (pension start, NPS taxable slice, SCSS renewal), so their room is used while it is free.
7. **Free harvests:**
   - Equity: if `ltcgRoom_i > 0` after step 6, sell and rebuy on T+1 to realise gains up to `ltcgRoom_i` (SELL §3.3). This resets cost basis at no tax.
   - Debt: optional, if `rebateRoom_i` is still positive. Realising debt gains under the rebate resets their cost at ₹0 tax. Worth doing only if the member may exceed ₹12 L later.
8. **One-off sources, timed:**
   - **NPS:** if corpus ≤ ₹8 L, take it all. Otherwise take the tax-free 60%. For the taxable slice (up to 20%), use systematic withdrawal, or defer and take it in years when `rebateRoom_i` absorbs it. Buy the mandatory 20% annuity as joint life; it adds slab income every year, so include it in step 4 for future years.
   - **EPF:** withdraw within 3 years of the last contribution; move it into the floor or growth pools.
   - **PPF:** keep extending only while 7.1% beats the floor alternatives for that member's liquidity needs.
9. **Paperwork and checks:**
   - Form 121 to each payer (post office, bank, RBI bond agent) for each member whose tax is nil;
   - no advance tax for seniors (s.403(3));
   - regime check per member (new is the default; old only if 80D, 80DDB or 80TTB give a lower tax);
   - re-run the Monte Carlo and show "chance this plan lasts to 95" next to last year's figure. Risk-based guardrail display: show amber below 75% and green above 95%. These are display bands, my choice (Opinion).
10. **Survivor event:** when a member dies, the survivor's allowances halve (one ₹12 L, one ₹1.25 L). Holdings pass by nomination or will, and SCSS can continue for an eligible spouse. Re-run the plan; essential spending defaults to 70% of the couple's figure (Opinion; editable).

### 3.5 Defaults

| Parameter | Default | Basis |
|---|---|---|
| Plan-to age | 95 (younger spouse) | L1–L4 |
| Success target | 85% | GOAL §2.3 practice; R7 uses 95% CI |
| Scenario for the headline | Conservative | §2.6 limits; R7–R9 |
| Equity share | 40% (range 30–60, capped by RISK) | R7; §2.6 |
| Guardrails | ±20% of WR0, ±10% change, cuts stop 15 years before the end, floor at essential | Guyton–Klinger 2006 |
| Cash bucket | 12 months of net need | Bucket practice; Estrada |
| Floor | SCSS, then POMIS, then FRSB, then debt; ≤ 60% of the corpus | §2.4 |
| Rebalance band | ±5 points; no equity sale after a > 15% fall | SELL §2.2 |
| Survivor spending | 70% of the couple's | Opinion |
| Retirement inflation | `retirement_living` (5% base); health premium 10% | DATA §3 |

### 3.6 Simpler fallback (no Monte Carlo, no lots)

1. **Corpus = net yearly need ÷ IWR**, with IWR from the table below (conservative column of §2.6, rounded down, cross-checked with R7–R8):

   | Years in retirement | ≤ 25 | 26–30 | 31–35 | 36–40 | > 40 |
   |---|---|---|---|---|---|
   | IWR | 4.0% | 3.5% | 3.0% | 2.75% | 2.5% |

2. Three buckets: 12 months of cash; SCSS/POMIS/FRSB/debt covering years 2–7 of need; the rest (≥ 40% of the corpus) in equity index funds.
3. Each April: raise spending by last year's CPI. Refill cash from equity if equity is above 40%, else from debt. Redeem from the spouse with the most `rebateRoom` (debt) or `ltcgRoom` (equity). File Form 121.
4. If `WR_t > 1.2 × WR0`, show a "review spending" alert.

### 3.7 Tests (fixed inputs, exact or ranged outputs)

1. **SWR table reproduction:** 40% equity, conservative, 35 years, 85% → IWR in [2.9%, 3.3%]; base → [3.5%, 3.9%]. Fixed seed; tolerance 0.15 points.
2. **Monotonicity:** a higher success target means a lower sustainable spend; a longer horizon means a lower spend; more guaranteed income means a smaller corpus needed.
3. **Rebate split:** ₹20.25 L of interest in one name → tax ₹2,14,500 (new regime, with cess). Split ₹10.125 L each → ₹0 each.
4. **Clubbing guard:** a spouse's holding tagged "gift from spouse" adds its income to the giver's `slabIncome`, so splitting via gift gives no saving.
5. **Cliff guard:** a member with ₹11.5 L of slab income and ₹1 L of planned LTCG → the algorithm moves the gain to the other spouse or to next FY rather than lose the rebate.
6. **NPS:** ₹50 L non-government corpus → plan takes ₹30 L tax-free in year 1. The ₹10 L taxable slice is spread so no member exceeds ₹12 L. ₹10 L (20%) goes to a joint-life annuity, whose income appears in later years' slab income. A ₹7.5 L corpus → full lump sum, no annuity.
7. **Guardrails:** WR0 = 4%, portfolio falls so WR = 5% (> 4.8%) with 20 years left → spending −10%. Same with 14 years left → no cut. WR = 3.1% → +10%. Spending never goes below essential.
8. **Crash rule:** equity −20% over 12 months → no equity redemptions this year; need met from cash and debt.
9. **Form 121:** a senior with SCSS interest of ₹2.46 L and total tax nil → Form 121 action generated for that payer.
10. **Worked example (§4):** year-1 actions and tax match the table exactly.

---

## 4. Worked example: couple retiring at 60 with ₹3 Cr

### 4.1 Inputs

- Both spouses are 60, resident, new regime, no pension, own home. The plan runs to 95 (35 years).
- **Each spouse's money is their own** (from their own earnings and EPF), so nothing is clubbed: Member A has ₹2 Cr, Member B has ₹1 Cr.
- They want **₹12 L a year (₹1 L a month)** in today's money: ₹8 L essential, ₹4 L discretionary, including their health premium.
- Initial withdrawal rate: 12 ÷ 300 = **4.0%**, above freefincal's 3.5% line and the 3.0% default.

Holdings after the floor ladder (§3.3), at 40% equity:

| | Member A (₹2 Cr) | Member B (₹1 Cr) | Couple |
|---|---|---|---|
| SCSS (8.2%) | ₹30 L | ₹30 L | ₹60 L |
| POMIS (7.4%) | – | ₹9 L | ₹9 L |
| RBI FRSB (8.05%) | – | ₹15 L | ₹15 L |
| FD ladder (6.75%) | ₹35 L | – | ₹35 L |
| Debt funds (bought after Apr 2023) | ₹25 L | ₹6 L | ₹31 L |
| Liquid fund (cash bucket) | ₹10 L | – | ₹10 L |
| Equity index funds | ₹80 L (cost ₹50 L; gain fraction 37.5%) | ₹40 L (cost ₹30 L; 25%) | ₹1.20 Cr (40%) |
| **Total** | **₹2.00 Cr** | **₹1.00 Cr** | **₹3.00 Cr** |

### 4.2 What the engine says about ₹12 L (§2.6 simulation, 40% equity, 35 years)

| Plan | Base: chance it lasts to 95 | Conservative | Average real spending over life (base / conservative, median) | Chance of being cut to ₹8 L at some point |
|---|---|---|---|---|
| Fixed ₹12 L, rising with CPI | 76% | 44% | ₹12 L if it lasts | – |
| Fixed ₹10.5 L (IWR 3.5%) | 91% | 68% | ₹10.5 L | – |
| Fixed ₹9.3 L (IWR 3.1%, the conservative 85% level) | ~97% | 85% | ₹9.3 L | – |
| **₹12 L start with guardrails (§3.4)** | **98%** | **89%** | **₹10.9 L / ₹9.6 L** (10th–90th percentile base: ₹9.0–14.2 L) | 25% base / 51% conservative |

The "lasts to 95" columns for guardrails count a path as successful while spending stays at or above the ₹8 L essential floor.

**Plain-English message:** "₹1 L a month from ₹3 Cr is possible if you are willing to trim it in bad years. Expect to average about ₹90,000 a month over your retirement in today's money. If you want ₹1 L a month that never drops, you need about ₹3.9 Cr (₹12 L ÷ 3.1%), or a ₹9.3 L budget now."

Guardrail triggers in rupees for year 1:
- To keep it simple and testable, the engine uses `WR0 = S / P` on the whole investable corpus, floor included: 12 / 300 = 4%. (The §3.4 step 1 formula, net of floor income, is the refinement; the simulation in §2.6 used this simpler form.)
- **Cut** if `S_t / P_t > 4.8%`, which at ₹12.6 L of spending next year means the portfolio falls below ₹2.62 Cr.
- **Raise** if below 3.2%, which means above ₹3.94 Cr.

### 4.3 Year 1 (FY 2026-27 if they retire 1 April; illustrative), ₹12 L need

**Income that arrives anyway:**

| | Member A | Member B |
|---|---|---|
| SCSS interest (₹30 L × 8.2%) | ₹2,46,000 | ₹2,46,000 |
| FD interest (₹35 L × 6.75%) | ₹2,36,250 | – |
| POMIS (₹9 L × 7.4%) | – | ₹66,600 |
| FRSB (₹15 L × 8.05%) | – | ₹1,20,750 |
| **Slab income** | **₹4,82,250** | **₹4,33,350** |

Total ₹9,15,600, so **₹2,84,400 is still to raise.**

**Redemptions (steps 5–6).** Equity is at its 40% target, inside the band, so the need is met pro rata from the growth pool:
- ₹1,14,000 of equity from A. Its 37.5% gain fraction (FIFO head assumed at average) gives ₹42,750 of LTCG, inside the ₹1.25 L allowance.
- ₹1,70,400 from A's liquid fund. Accrued gain about ₹9,000, at slab, inside the rebate.

**Free harvests (step 7):**
- A sells and rebuys on T+1 equity carrying ₹82,250 more gain (₹2.19 L of units), taking A to ₹1.25 L of LTCG.
- B sells and rebuys ₹5 L of units (₹1.25 L gain at 25%).
- Tax now: ₹0. Deferred tax removed: ₹2.07 L × 12.5% × 1.04 = **₹26,900** (it is deferred, not exempt; it is worth this much only if the units are later sold above the allowance).

**Allowance check (step 4):**
- A: slab ₹4.91 L + LTCG ₹1.25 L = ₹6.16 L, under ₹12 L. Rebate room left: ₹5.84 L.
- B: ₹4.33 L + ₹1.25 L = ₹5.58 L, under ₹12 L.
- Neither has slab income below ₹4 L, so there is no basic exemption gap.

**Tax:**
- A: slab tax ₹4,563 (5% of ₹91,250 above ₹4 L), wiped by the rebate. LTCG ≤ ₹1.25 L, so ₹0. **Total ₹0.**
- B: ₹0.

**Paperwork:** both file **Form 121** with the post office, bank and RBI bond agent, because SCSS interest alone exceeds the ₹1 L senior TDS threshold. No advance tax.

**Contrast:**
- If the whole ₹3 Cr sat in FDs at 6.75% in A's name only, the ₹20.25 L of interest would cost ₹2,06,250 + 4% cess = **₹2,14,500 a year**.
- The same FDs owned ₹1.5 Cr each (₹10.125 L of interest each) would cost **₹0**. The split in §4.1 costs ₹0 too, with 40% in equity as well.

### 4.4 Later years (base path, illustrative)

- By year 10 (age 70) spending is ₹18.6 L nominal (12 × 1.05⁹). The floor interest stays near ₹9 L, so redemptions grow to about ₹9–10 L a year. Most of that is capital, so slab income stays well under ₹12 L per member.
- At year 5 the SCSS terms end. Extend for 3 years if the new rate is ≥ FRSB; otherwise move to FRSB or debt.
- If one spouse dies, the survivor's ₹12 L and ₹1.25 L limits apply to the whole corpus. Interest of ₹9.2 L plus redemption gains on ₹3 Cr may then approach ₹12 L, so the plan re-runs and moves part of the floor into equity or growth-option debt funds, which defer the gain.

---

## 5. Features this enables (one line each, with evidence)

| Feature | Evidence |
|---|---|
| **"How much can we spend?"**: a sustainable monthly spend, fixed and with guardrails, as "lasts to 95 in X of 100 futures" | R3, R7, §2.6 |
| **Retirement corpus target and gap** for working members, conservative scenario by default | §3.2; GOAL §3.4 |
| **Guardrail alerts in rupees** ("below ₹2.62 Cr, trim 10%; above ₹3.94 Cr, raise 10%") | Guyton–Klinger 2006; Kitces (rupee framing) |
| **Floor builder:** SCSS/POMIS/FRSB per spouse up to their limits, from each spouse's own money | §2.4; T9 |
| **"Each spouse ≤ ₹12 L" income planner** with a cliff warning, including gains | T1, T6; TAX §4.2 ex. 3 |
| **Yearly SWP plan:** which fund, which spouse, how much, with tax per redemption | T4; SELL §3.1, §3.4 |
| **Free gain harvest for retirees** (₹1.25 L equity each; debt under the rebate) | SELL §3.3; T1 |
| **NPS exit planner:** 60% tax-free now, the 20% taxable slice spread across years, annuity choice | T10, T11 |
| **EPF and PPF "keep or take" check** at retirement | T12, T13 |
| **Form 121 reminders** each April per payer; no advance tax for seniors | T7, T8 |
| **Annuity reality check:** a level 6% annuity's real value vs the safe withdrawal rate | §2.4 Calc |
| **Survivor re-plan** when one spouse dies | §3.4 step 10 |
| **Bucket view** of a rebalanced portfolio, with a "no equity sale after a crash" rule | Estrada; Kitces |

---

## 6. Disagreements and open questions

1. **Indian safe withdrawal rate: 2.8% or 3.5%?** Raju & Saraogi give 2.8% for 35 years, with practical advice of 3–3.5%. Freefincal treats < 3.5% as adequate. An informal "Unity Study" deck claims the Trinity 4% holds in India. My base model gives 3.7%. I chose 3.0–3.25% (conservative scenario), because Indian data are short and my model's tails are thin. An in-house **block-bootstrap backtest on Nifty TRI, CRISIL debt and CPI since 1999** would settle the default; it is a candidate for the app's own analysis (core list §4).
2. **Equity share in retirement.** R7 finds about 40% best; my model shows little sensitivity between 30% and 60%; Forsyth finds a 50% cap costs little. Kitces & Pfau favour a rising glide path; Estrada disagrees. Default 40%, within the RISK limit.
3. **The Guyton–Klinger inflation rule.** Sources disagree on whether the 2006 version kept the skip-inflation rule. I drop it on simulation evidence (§3.4 step 1). This needs the original paper read in full.
4. **Do special-rate gains count toward ₹12 L?** This is the open question shared across TAX, PLACE and SELL. The engine takes the conservative reading (T6), which may leave some room unused.
5. **NPS tax in the 2025 Act.** Secondary sources say the 60% exemption carried over and the extra 20% is taxable. The schedule and entry were not found. It is also unclear whether systematic withdrawals of the taxable slice are taxed as they are paid or in some other way. Needs the Act text or a CBDT clarification.
6. **EPF interest after retirement:** taxable or not? Sources conflict (T12).
7. **SCSS details:** the premature-closure rules in year 1 and the number of extensions allowed after the 2023 amendment. The NSI page did not load; read the SCSS Rules 2019 as amended.
8. **Annuity rates** came from aggregators only (Low). Get live LIC and HDFC Life quotes before showing figures, and refresh them quarterly as data.
9. **Mortality:** SRS 2019-23 e60 not read. No Indian annuitant table (IALM) read. Plan-to age 95 is a judgement.
10. **The annuity's tax head** (pension with standard deduction, or other income without it) was not confirmed for the new Act.
11. **Gifted money's accretion:** income on clubbed income is not clubbed again (settled under the old Act; not confirmed for the new one, TAX §3.10). Over a long retirement this could let a homemaker spouse's share grow in their own name. Needs a CA's view before the engine relies on it.
12. **Health shocks** are not modelled. The note relies on health insurance plus a health-cost inflation line. A "medical reserve" bucket (₹5–10 L) is worth testing with users.

---

## 7. Sources

| # | Source | Type / confidence |
|---|---|---|
| 1 | Bengen, "Determining Withdrawal Rates Using Historical Data", *Journal of Financial Planning*, Oct 1994 | Paper, High |
| 2 | Cooley, Hubbard & Walz, "Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable", *AAII Journal*, Feb 1998 (Trinity study) | Paper, High |
| 3 | Pfau, "An International Perspective on Safe Withdrawal Rates: The Demise of the 4 Percent Rule?", *JFP*, Dec 2010: [FPA PDF](https://www.financialplanningassociation.org/sites/default/files/2021-10/DEC10%20JFP%20Pfau%20PDF.pdf) | Paper, High |
| 4 | Guyton & Klinger, "Decision Rules and Maximum Initial Withdrawal Rates", *JFP*, Mar 2006: [FPA PDF](https://www.financialplanningassociation.org/sites/default/files/2021-11/2006%20-%20Guyton%20and%20Klinger%20-%20Decision%20Rules%20and%20SWR%20(1).PDF) | Paper, Medium–High (read via summaries) |
| 5 | Kitces, "Implementing Retirement Income Guardrails": [kitces.com](https://www.kitces.com/blog/implementing-retirement-income-guardrails-to-facilitate-the-right-spending-raises-and-spending-cuts/) | Practitioner, High |
| 6 | Forsyth, Vetzal & Westmacott, "Optimal control of the decumulation of a retirement portfolio with variable spending and dynamic asset allocation", arXiv 2101.02760 (2021); Forsyth arXiv 2008.06598; Forsyth & Labahn arXiv 2605.17744 (2026) | Paper, High (abstracts) |
| 7 | Dziwisch, Krahnhof & Zureck, "Empirical determination of sustainable withdrawal rates… Germany", 2021, doi 10.1007/s12297-021-00504-1 | Paper, Medium |
| 8 | Estrada, "The Bucket Approach for Retirement: A Suboptimal Behavioral Trick?", IESE: [PDF](https://blog.iese.edu/jestrada/files/2019/07/BucketApproach.pdf); Kitces & Pfau, "Reducing Retirement Risk with a Rising Equity Glide Path", *JFP* Jan 2014, via [Swedroe](https://www.etf.com/sections/index-investor-corner/swedroe-declining-or-rising-equity-strategy-retirement) | Paper, Medium |
| 9 | Raju & Saraogi, "Balancing Acts: Safe Withdrawal Rates in the Indian Context", SSRN 4697720, via [Business Standard](https://www.business-standard.com/amp/finance/personal-finance/make-your-retirement-portfolio-last-longer-withdraw-funds-conservatively-124022901095_1.html) and a [summary](https://kartick.substack.com/p/summary-of-balancing-acts-safe-withdrawal) | Paper (working), Medium |
| 10 | Pattabiraman, freefincal, "How to use safe withdrawal rates to gauge retirement corpus health": [link](https://freefincal.com/how-to-use-safe-withdrawal-rates-to-gauge-retirement-corpus-health) | Practitioner, Medium |
| 11 | Arthgyaan, "Does the 4 percent rule work in India": [link](https://arthgyaan.com/blog/does-the-4-percent-rule-work-in-india.html) | Practitioner, Low–Medium |
| 12 | SRS Based Abridged Life Tables 2015-19 (ORGI), India total: [lifetable.de](https://www.lifetable.de/File/GetDocument/data%5CIND%5CIND000020152019AU1.pdf); [Data for India](https://www.dataforindia.com/life-expectancy/) (2019-23) | Data, High / Medium |
| 13 | PFRDA NPS exit amendment, Dec 2025, via [Business Today](https://www.businesstoday.in/personal-finance/retirement-planning/story/pfrda-eases-nps-exit-rules-for-non-government-subscribers-lowers-mandatory-annuity-to-20-507010-2025-12-17) and [Business Standard](https://www.business-standard.com/finance/personal-finance/nps-changes-2025-80-withdrawal-more-lump-sum-less-annuity-exit-relief-125122200156_1.html) | Regulator via media, Medium–High |
| 14 | NPS 60% exemption, taxable 20%: [Business Standard, 23 Dec 2025](https://www.business-standard.com/finance/personal-finance/nps-withdrawal-norms-fund-access-comes-with-onus-to-manage-longevity-risk-125122300130_1.html); [1Finance](https://1finance.co.in/blog/new-nps-withdrawal-rules-taxation) | Practitioner, Medium |
| 15 | RBI, FRSB 2020 (T) rate for Jan–Jun 2026: [press release](https://website.rbi.org.in/web/rbi/-/press-releases/rate-of-interest-on-floating-rate-savings-bond-2020-taxable-frsb-2020-t-for-the-period-january-01-2026-june-30-2026) | Regulator, High |
| 16 | India Post, Monthly Income Account Scheme 2019: [PDF](https://IndiaPost.gov.in/VAS/DOP_PDFFiles/Savings%20Bank/Monthly%20Income%20Account%20Scheme%202019%20English.pdf); SCSS FY27: [Zee Business](https://www.zeebiz.com/personal-finance/news-senior-citizen-savings-scheme-fy-2026-27-check-latest-interest-rate-tax-savings-deposit-limit-394325) | Regulator / Media, Medium |
| 17 | Annuity rates: [PolicyX 2026](https://www.policyx.com/life-insurance/articles/immediate-annuity-rates-2026/); [Cleartax, HDFC Life](https://cleartax.in/s/hdfc-life-new-immediate-annuity-plan) | Practitioner, Low |
| 18 | EPF withdrawal tax: [Business Today, Jul 2026](https://www.businesstoday.in/personal-finance/tax/story/my-pf-is-tax-free-myth-or-truth-know-the-epf-withdrawal-tax-rules-before-you-cash-out-540381-2026-07-02) | Practitioner, Medium |
| 19 | In-repo notes: TAX §3.1, 3.7–3.10, 4.2; DATA §2.2–2.4, §3; SELL §2.2–2.4, §3.1–3.4; GOAL §2.3, 3.4–3.5; RISK §4.3 | Internal |
| 20 | Own simulation (§2.6), 20,000 lognormal paths, DATA §3 assumptions | Calc |
