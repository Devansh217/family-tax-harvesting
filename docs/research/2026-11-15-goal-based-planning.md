# Goal-based planning method for the family planner

Research note, 15 Nov 2026. Research agenda topic 1 in `docs/PLANNER-NOTES.md`. Tax year FY 2026-27. Tax facts come from `docs/research/2026-11-15-family-financial-planning.md`; return, volatility and inflation numbers come later from agenda topic 2 and are placeholders here.

Source labels: **Paper** (peer-reviewed or academic working paper), **Regulator**, **Practitioner** (fund house, planner, curriculum), **Opinion** (blog or book view). Confidence: **High** (read in the source, or settled), **Medium** (read in a summary or secondary listing), **Low** (from memory or a single weak source).

---

## 1. Summary for the product

1. **A goal is a cash flow, not a number on a slider.** Inflate today's cost at the goal's own inflation rate, subtract what is already earmarked, then solve for the SIP or lump sum. The formula is standard and every Indian calculator uses it. What makes ours better is what goes into it: after-tax returns per member, a glide path, and a probability.
2. **A single assumed return gives a 50/50 answer.** If the plan's expected return equals the required return, the chance of reaching the goal is only about half. Families should see a probability and a bad-case rupee shortfall, not one projected figure.
3. **Use Monte Carlo with fat tails, then size the SIP to a target probability.** Needs at 90%, wants at 75%, wishes at 50% by default (the CFA curriculum uses 95/80/75 for similar tiers). Resample Indian historical returns in yearly blocks, so crashes appear as often as they really did.
4. **Each goal gets its own glide path.** More equity when the date is far; move to debt over the last 5–7 years, not in the last year. Stop taking equity risk once the goal is already funded at the safe return. This rule is backed by both Indian practitioners and the dynamic-programming papers.
5. **Several goals share one budget through a priority waterfall.** Emergency fund first, then needs by date, then wants, then wishes. When money falls short, the app shows which goals are underfunded and the cheapest levers: delay, shrink, step up the SIP, or accept a lower probability for wishes only.
6. **Tax enters twice.** Growth is after tax for the member who holds the money. Withdrawal is grossed up for the tax due when the goal is paid. In India de-risking is itself a taxable sale, so the app should de-risk mainly by redirecting new SIPs, and use each member's ₹1.25 L yearly equity LTCG exemption to switch the rest tax-free over several years. No Indian fintech documents doing this publicly.
7. **Dynamic programming (Das et al.) is the research frontier.** It beats fixed glide paths by a few percentage points of success probability, but it raises risk when a family falls behind. That clashes with SEBI suitability and with how families behave. Use it later as a check, capped by the risk profile, not as the first engine.

---

## 2. Findings

### 2.1 From a goal to a monthly investment

- **The arithmetic is settled.** Future cost = today's cost × (1 + goal inflation)^years. Required SIP is the future-value-of-annuity formula, reversed. Indian calculators (SBI MF, Dhan, Finnovate, Wealthy) all do this, some with a yearly step-up. ([Dhan](https://dhan.co/mutual-fund-calculators/sip-goal-calculator-with-inflation/); [SBI MF goal tool](https://www.sbimf.com/en-us/financial-planning-calculators/family-solution-tool/personal-goal-calculator)). Practitioner, High.
- **Goal-specific inflation is common practice.** Indian planners use 5–6% for general costs and 8–10% for education (see the family planning note, table row 5). Planner convention, not measured data. Practitioner, Medium. Topic 2 must replace these with MOSPI CPI sub-indices.
- **Recalculate yearly; track funded ratio, not returns.** Pattabiraman (freefincal) tells families to recompute the target corpus each year and measure progress as "corpus as a % of target". He uses 10% for equity and 6% for fixed income, post-tax, and says to revise these only downward. ([freefincal](https://freefincal.com/stop-worrying-about-market-conditions-and-focus-on-goal-based-risk-management/)). Practitioner, High (read).
- **Contributions should rise with income.** Shenoy (Capitalmind) plans his child's education SIP rising 5% a year and recomputes the path whenever he is ahead or behind. ([Capitalmind](https://www.capitalmind.in/podcasts/how-i-use-glide-path-investing-in-financial-planning-for-my-childs-education)). Practitioner, High (read).

### 2.2 Allocation by horizon and glide paths

- **Indian practitioners de-risk early and hard.** Pattabiraman: 0% equity under 5 years, about 20–25% for 5–10 years, 50–60% beyond 10 years; start reducing well before the date, not in the last three years. ([freefincal](https://freefincal.com/stop-worrying-about-market-conditions-and-focus-on-goal-based-risk-management/)). Shenoy: below 50% equity with under three years left, about 10% in the final year; he started at 60/40. ([Capitalmind](https://www.capitalmind.in/podcasts/how-i-use-glide-path-investing-in-financial-planning-for-my-childs-education)). Practitioner, High.
- **CFA curriculum: horizon buckets.** Goals are short (under 5 years), intermediate (5–15) and long (over 15). Short-term lifestyle money sits in cash and high-quality short debt. ([AnalystPrep summary of CFA L-III](https://analystprep.com/study-notes/cfa-level-iii/goals-based-planning/)). Practitioner, Medium (summary of the curriculum).
- **Target-date funds (US) glide down.** Vanguard builds its glide path from a utility-based life-cycle model (VLCM). Its path holds about 90% equity until roughly 25 years before retirement and falls to about 50% at retirement (figures from memory of the paper). Vanguard itself says the debate on glide-path shape is "unsettled", and that the ability to bear risk is not the same as the willingness. ([Vanguard's approach to TDFs, 2022](https://corporate.vanguard.com/content/dam/corp/research/pdf/vanguards_approach_to_target_date_funds.pdf); [VLCM, 2021](https://corpaemdisp.essp.c1.vanguard.com/content/dam/corp/research/pdf/Vanguards-Life-Cycle-Investing-Model-VLCM-A-general-portfolio-framework-US-ISGVLCM_032021_online.pdf)). Practitioner, Medium.
- **Critics say declining glide paths do not pay.** Arnott, Sherrerd and Wu (2013) find the usual path does not give more wealth or less uncertainty than alternatives. ([Research Affiliates](https://www.researchaffiliates.com/content/dam/ra/publications/pdf/241-the-glidepath-illusion.pdf)). Estrada (2014), on 19 countries over 110 years, finds contrarian (rising-equity) paths end with more wealth. ([IESE](https://www.iese.edu/insight/articles/retirement-target-date-funds/)). Pfau and Kitces find a flat or rising equity path better in retirement. Paper, High. **Caveat:** these study accumulation for retirement, judged on terminal wealth. For a fixed-date, fixed-amount goal like school fees, the cost of a crash in the last two years is a missed goal, and the next three findings favour de-risking.
- **Dynamic optimisation: take less risk when ahead.** In Das, Ostrov, Radhakrishnan and Srivastav's dynamic-programming method, the optimal portfolio is riskier when wealth is below the path to the goal and safer when above it. ([Das et al., regime-switching paper, 2021](https://srdas.github.io/Papers/RiskRegimes.pdf)). Paper, High (read). This supports a "lock in once funded" rule.

### 2.3 Probability of success

- **Expected return = required return gives about 50%.** With a symmetric-ish distribution, a plan built on the mean return has roughly even odds. ([Sharpely](https://sharpely.in/blogs/financial-goal-planning-the-traditional-approach/)). Practitioner, High (standard result).
- **Normal distributions understate crashes.** A bootstrap of actual historical returns gave 40% falls 1.79% of the time, against 0.19% under a normal model. ([Wharton Pension Research Council, ch. 4](https://pensionresearchcouncil.wharton.upenn.edu/wp-content/uploads/2016/09/Chapter-4.pdf)). Paper, Medium.
- **Regimes matter but are hard to forecast.** Das et al. fit a two-regime (calm/volatile) model. Knowing the regime raises goal probability from 0.739 to 0.806 in their example. Inferring the regime from past data alone did worse (0.674) than ignoring regimes (0.743). ([Das et al. 2021](https://srdas.github.io/Papers/RiskRegimes.pdf)). Paper, High. **Implication:** do not build regime-timing into a consumer engine.
- **How to say "70% likely".** Kitces: "probability of success" frames a plan as pass/fail. Reframe as the chance a mid-course adjustment is needed, and show the size of the adjustment in rupees. Also, a probability alone hides the magnitude of the shortfall. ([Kitces on adjustment](https://www.kitces.com/blog/renaming-the-outcomes-of-a-monte-carlo-retirement-projection/); [Kitces on magnitude](https://www.kitces.com/blog/multidimensional-abstraction-to-communicate-monte-carlo-simulation-probability-and-magnitude-of-success/); [Kitces, guardrails in rupees/dollars](https://www.kitces.com/blog/monte-carlo-guardrails-probability-of-adjustment-success-client-communication-dynamic-retirement-spending/)). Opinion, High (widely cited practitioner research). Most US advisers aim for about 90% on retirement.
- **Required probability by goal tier.** CFA curriculum minimums: short-term lifestyle over 95%, long-term lifestyle over 80%, capital preservation over 75%, growth up to 75%. ([AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/goals-based-planning/)). Practitioner, Medium.

### 2.4 Several goals in one plan

- **Mental accounts can be optimal.** Das, Markowitz, Scheid and Statman (2010) treat each goal as a sub-portfolio with its own threshold and probability of missing it. Under their assumptions each sub-portfolio sits on the mean-variance frontier, and the total is too. So goal buckets cost little efficiency. ([JFQA 45(2):311–334](https://ideas.repec.org/a/cup/jfinqa/v45y2010i02p311-334_00.html)). Paper, High.
- **Risk allocation before asset allocation.** Chhabra splits wealth into a safety portfolio (protect against the nightmare), a market portfolio, and an aspirational portfolio. ([Beyond Markowitz, J. Wealth Mgmt, 2005](https://aatheory.blogspot.com/2007/01/beyond-markowitz-comprehensive-wealth.html); [CFA Institute blog](https://blogs.cfainstitute.org/blog/2012/05/08/a-new-framework-for-taming-wildly-random-markets/)). Paper, Medium.
- **Needs, wants, wishes, dreams.** Brunel's goals-based wealth management ranks goals into these tiers and asks the client to name the nightmares to avoid. ([Brunel, Wiley 2015](https://www.oreilly.com/library/view/goals-based-wealth-management/9781118995938/)). Practitioner (book), Medium.
- **Dynamic programming over many goals.** Das, Ostrov, Radhakrishnan and Srivastav extend the method: each year the investor chooses a portfolio and whether to fund, partly fund or skip each goal due that year, maximising total utility. Goal priority enters as a utility weight. They report it "vastly outperforms" static portfolios and target-date funds. ([SCU announcement, J. Banking & Finance](https://www.scu.edu/cas/mathcs/news-and-events/stories/journal-of-banking-and-finance-publishes-paper-by-dan-ostrov-and-three-scu-students.html)). Paper, Medium (full text not reachable; year 2021–22). A 2026 meta-reinforcement-learning version reaches 97.8% of the optimal utility in hundredths of a second. ([arXiv 2605.02300](https://arxiv.org/abs/2605.02300)). Paper, High (abstract).
- **Emergency money crowds out growth.** A random-date "must pay" goal (medical emergency) reduces risk-taking for the other goals. Separate accounts per goal lose fungibility; committing to a goal early loses flexibility; both matter most at middle wealth. ([Campbell, Capponi, Parashar 2026, arXiv 2606.03158](https://arxiv.org/abs/2606.03158)). Paper, High (abstract). Supports funding the emergency fund first.
- **Surplus from an important goal should move late.** With mental costs on moving money between goals, the optimal investor waits until the important goal's deadline nears before releasing its surplus to a lesser goal. ([Bayraktar and Han, arXiv 2506.06654](https://arxiv.org/abs/2506.06654)). Paper, High (abstract).
- **Surplus is not automatically "growth" money.** CFA: discretionary wealth goes to a long-term portfolio, but "surplus assets should not always be directed towards growth". ([AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/goals-based-planning/)). Practitioner, Medium.

### 2.5 Tax inside goal planning

- **Projections in India are usually pre-tax.** Shenoy's own goal projection ignored tax. Pattabiraman uses post-tax returns but one flat rate for everyone. ([Capitalmind](https://www.capitalmind.in/podcasts/how-i-use-glide-path-investing-in-financial-planning-for-my-childs-education); [freefincal](https://freefincal.com/stop-worrying-about-market-conditions-and-focus-on-goal-based-risk-management/)). Practitioner, High.
- **Tax depends on the holder and the tax type.** Equity LTCG 12.5% above ₹1.25 L per member per year; debt-like funds and interest at slab; the ₹12 L rebate and basic-exemption gap shelter a low-income member. (Family planning note, section 1.) Regulator, High.
- **De-risking is a sale.** Moving from an equity fund to a debt fund is a redemption and triggers capital gains tax. A US target-date fund rebalances inside the fund, tax-free to the holder. India has no common equivalent: the main goal-labelled categories are SEBI's "solution-oriented" children's and retirement funds (5-year lock-in), which are not glide-path funds. (SEBI categorisation, 2017; from memory.) Regulator, Medium. So the glide path must be implemented with new money first and harvested gains second.
- **Goal-based ownership.** A goal is "for" one member (a child's degree) but can be funded by any member. Who holds the money is the placement problem of agenda topic 3. Gifts to an adult child are not clubbed; to a minor child they are (s.99, old s.64). Regulator, High.

### 2.6 Indian practice

- **Fintech goal features are not documented publicly.** Kuvera, Scripbox, ET Money, INDmoney and Groww offer goal planners, but none publishes its formula, return assumptions or glide-path rule. Third-party summaries describe the same deterministic annuity method, sometimes with a step-up and an equity-to-debt shift in the last 2–3 years. ([Kuvera calculators](https://kuvera.in/calculators); [The Quint on Kuvera](https://www.thequint.com/save-and-grow/kuvera-wealth-management-the-power-of-goal-based-investing-demystified-heres-how-it-works)). Practitioner, Low. No Indian app found shows a probability of success.
- **Fee-only planners teach the deterministic method plus a glide path and yearly review** (freefincal, Capitalmind above). Practitioner, High.
- **SEBI requires a risk profile and suitability before advice, not a method.** (Family planning note, section 2.1.) Regulator, High. Any allocation, including a glide path, must stay inside the member's risk profile.

---

## 3. Recommended method for the engine

Three layers. Layer A is the deterministic core and the fallback. Layer B adds probability. Layer C is a later upgrade. Every number marked *default* is editable and must be a named constant.

### 3.1 Inputs

Per **goal** `g`:

| Field | Type | Notes |
|---|---|---|
| `amountToday` | ₹ | Cost in today's rupees. |
| `targetDate` | date | Month precision. |
| `inflation` | % a year | *Default* by goal kind: general 6%, education 10%, health 10%, wedding 7%, house 7%. Placeholders until topic 2. |
| `tier` | `essential` / `need` / `want` / `wish` | `essential` = emergency fund. |
| `forMember` | member id | Who the goal is for. |
| `earmarked` | list of holdings | Existing assets assigned to this goal, each with member and tax type. |
| `stepUp` | % a year | SIP growth. *Default* 5% (Capitalmind uses 5%). 0 allowed. |
| `withdrawal` | `lump` or `spread` | Spread = paid over k years, e.g. 4 years of fees. Treat as k sub-goals. |

Per **member**: risk profile cap `equityCap` (from agenda topic 5; *default* 70%), and the after-tax return per tax type for that member from the foundation's "what it brings home" table.

**Capital-market assumptions** (topic 2 replaces): per asset class (Indian equity, short debt, gold, liquid): expected return, volatility, correlation, and a monthly historical series for resampling.

### 3.2 Glide path (per goal)

Equity share as a function of months left `m`, before the cap:

| Years left | Need / essential | Want | Wish |
|---|---|---|---|
| ≥ 10 | 70% | 80% | 90% |
| 7 | 55% | 65% | 75% |
| 5 | 35% | 45% | 60% |
| 3 | 15% | 25% | 40% |
| 1 | 0% | 10% | 20% |
| < 1 | 0% | 0% | 10% |

Interpolate linearly between rows. Then:

1. `equity(m) = min(table(m, tier), equityCap of the holding member)`.
2. **Lock-in rule.** If the goal's current value, grown at the after-tax debt return to the target date, already covers the after-tax goal cost, set equity to 0% for that goal (move surplus later, see 3.6).
3. Essential goals (emergency fund) are 0% equity always: liquid fund, sweep FD or arbitrage fund.
4. The rest of each goal's money sits in debt matching the horizon (liquid under 1 year, short duration 1–3 years, longer beyond). Gold is optional and off by default.

Why this table: it sits between the Indian practitioners (Pattabiraman is more conservative, Shenoy's end-point is about 10%) and US target-date funds (90% far out). It de-risks over the last 5–7 years, as Pattabiraman advises, rather than the last 2–3 years that third-party calculators use. Its "want" column at 1 year matches Shenoy's 10% in the final year.

### 3.3 Layer A: deterministic sizing (always computed)

Let `n` = months to target date. For month `t = 1..n`, the after-tax monthly return of the goal is

`r_t = (1 + R_eq)^(1/12) − 1` weighted by `equity(n − t)`, plus the same for debt, where `R_eq` and `R_debt` are the **holder's after-tax annual returns** for those tax types. (Use the planned holder; if not yet chosen, use the family's best available holder from topic 3.)

Steps:

1. **Future cost.** `FV = amountToday × (1 + inflation)^(n/12)`.
2. **Tax gross-up at withdrawal.** If the model uses pre-tax growth with tax at sale, the corpus must cover the tax: `FVgross = FV + tax(gains at sale)`, computed with the holder's rules (LTCG 12.5% above the unused part of ₹1.25 L, slab for debt-like). If the model uses after-tax returns throughout (simpler, recommended for v1), skip this step; the after-tax return already includes the exit tax, applied as an annualised drag.
3. **Earmarked assets.** `A_n = Σ holdings value × Π_{t=1..n} (1 + r_t)`.
4. **Gap.** `Gap = max(0, FV − A_n)`.
5. **Growth factor of one rupee invested in month t:** `G_t = Π_{u=t+1..n} (1 + r_u)` (contribution at end of month `t`).
6. **Required SIP, with step-up `s`.** The month-t amount is `S × (1 + s)^floor((t−1)/12)`. Since the future value is linear in `S`:
   `S = Gap / Σ_{t=1..n} (1 + s)^floor((t−1)/12) × G_t`.
7. **Required lump sum today.** `L = Gap / G_0`.
8. Round SIP up to the nearest ₹100.

**Test case (constant 10% return, 10% inflation, no tax, no earmark):** ₹20,00,000 today, 120 months.
- `FV` = ₹51,87,485.
- Level SIP, end of month: ₹25,955. Start of month: ₹25,750.
- Step-up 10% a year: first-year SIP ₹17,543.
- Lump sum today: ₹20,00,000 (return equals inflation, so the lump sum equals today's cost; a good sanity test).

### 3.4 Layer B: probability of success (Monte Carlo)

1. **Paths.** 2,000 paths, monthly steps, fixed seed in tests. (Standard error of a probability near 75% is about 1 percentage point at 2,000 paths.)
2. **Return generator, default: block bootstrap.** Draw 12-month blocks of *joint* monthly returns (equity, debt, gold, CPI) from Indian history, so fat tails, crashes and correlations are kept. *Fallback generator:* multivariate Student-t with 5 degrees of freedom, scaled to the topic-2 means, volatilities and correlations. Never a plain normal.
3. **Shrink the mean.** Subtract a *default* 1 percentage point a year from historical equity returns before resampling (Pattabiraman: only revise assumptions down). Record it as a named assumption.
4. **Goal inflation.** v1: deterministic at the goal's rate. v2: goal inflation = sampled CPI + the goal's fixed premium over CPI (education ≈ CPI + 4%), so inflation shocks hit the goal too.
5. **Simulate** each path month by month with the glide path, the lock-in rule, the SIP schedule and tax as in Layer A. Record `W_n` and whether `W_n ≥ FV`.
6. **Outputs per goal:** probability of success `p`; median, 10th and 90th percentile of `W_n` in today's rupees; the 10th-percentile shortfall in rupees.
7. **Size to a target probability.** *Default* targets: essential 95%, need 90%, want 75%, wish 50%. Success probability rises with `S`, so find the smallest `S` meeting the target by bisection between the Layer A SIP and 3× it (about 15 iterations; reuse the same random paths for every trial so the result is smooth and testable).

### 3.5 Several goals: the priority waterfall

Inputs: the family's investable monthly surplus `B` (after expenses, EMIs and insurance), plus unassigned lump sums.

1. Sort goals: `essential`, then `need`, `want`, `wish`; inside a tier, the nearest date first.
2. **Assign existing assets** before new money: safest assets to the nearest needs (liability matching), equity holdings to the farthest goals, so few sales are needed. Each holding is assigned whole or split by rupee amount.
3. Walk the sorted list. For each goal compute `S_g` at its target probability (Layer B) or Layer A if B is off. If `B ≥ S_g`, fund it and subtract. Otherwise put what is left of `B` into this goal and mark it **short**. Every later goal gets no monthly money; it can still receive unassigned lump sums, in the same order.
4. For each short goal compute the **levers**, each holding the others fixed: extra SIP needed; months of delay that close the gap; amount that is affordable now (in today's rupees); probability reached with the money available. For wishes only, also show the probability at the SIP the family can afford.
5. **Surplus.** If a goal is past its lock-in point, its excess beyond 105% of the after-tax cost is released to the next short goal only within 12 months of its date (Bayraktar and Han: release late), never earlier.
6. Re-run on every statement import and at least yearly.

Output: per goal `S_g`, lump sum, probability, percentile band, funded ratio, status (`on track` ≥ target, `at risk` within 15 points, `short`), and the levers.

### 3.6 Tax-aware glide path implementation

The glide path says what each goal *should* hold. Getting there in India costs tax, so:

1. Each month, direct new SIP money to whichever asset is under its target weight first (cash-flow rebalancing).
2. If drift remains above a *default* 5-percentage-point band, sell equity using the holding member's unused ₹1.25 L LTCG exemption first, and the basic-exemption gap of low-income members (family note, nuance 3), spread across financial years before the goal date.
3. Only then sell with tax, choosing lots with the least tax (agenda topic 4).
4. Start the de-risking early enough that steps 1–2 can do most of it. Report the tax saved against selling everything in the final year.

### 3.7 Layer C (later): constrained dynamic programming

Implement the Das et al. method for one goal, with yearly steps:
- Wealth grid: about 300 points, evenly spaced in log wealth, bounds at ±3 standard deviations of the riskiest portfolio around the path.
- Portfolios: 10–15 points on the frontier of Indian equity/debt mixes, but **only those within the member's equity cap**.
- Transition probability from `W_i` to `W_j`: lognormal density at `ln(W_j / (W_i + SIP))`, normalised over the grid.
- Terminal value 1 if `W ≥ FV`, else 0. Recurse backward, choosing the portfolio that maximises the probability.

Use it as a benchmark for the rules glide path (how many points of probability it loses) and for research, not for live advice, until SEBI suitability questions are settled.

### 3.8 Simpler fallback (if Layer B is not ready)

Layer A only, run three times: at the base return, at base − 2 percentage points for equity ("cautious"), and with a 30% equity fall in the year before the goal date ("bad timing"). Show all three SIPs. Size the plan to the "cautious" SIP for needs, base for wants and wishes. No probabilities shown.

### 3.9 Tests the engine must pass

- The worked example in 3.3, to the rupee.
- Return equal to inflation: lump sum equals today's cost.
- With 0% volatility, Layer B probability is 100% at the Layer A SIP and 0% at 1 rupee less.
- Probability is monotonic in SIP on fixed seeds.
- Glide path: equity never exceeds the member cap; essential goals always 0%.
- Waterfall: a need is never short while a want is funded.
- Lock-in: once funded at the debt return, equity is 0%.

---

## 4. Features this enables

- **Monthly SIP per goal in today's and future rupees.** Evidence: standard annuity method used by all Indian planners and calculators.
- **"7 in 10 market paths reach this goal" plus the bad-case rupee gap.** Evidence: Kitces on probability and magnitude; the 50% problem of single-return plans.
- **Need / want / wish tiers with different safety levels.** Evidence: Brunel; CFA curriculum thresholds; Das, Markowitz, Scheid and Statman 2010.
- **Glide path per goal with automatic lock-in when funded.** Evidence: Das et al. (less risk when ahead); Pattabiraman and Shenoy.
- **"You are short by ₹X a month: delay 14 months, or cut to ₹Y, or step up 8%".** Evidence: Kitces adjustment framing; Das et al. multi-goal model (fund, partly fund or skip).
- **Emergency fund funded first and kept out of equity.** Evidence: Campbell, Capponi and Parashar 2026; CFA short-term lifestyle bucket.
- **Tax-free de-risking plan using each member's ₹1.25 L LTCG exemption.** Evidence: Indian tax rules (family note); de-risking is a taxable sale in India.
- **After-tax goal projection per holder** ("hold this in Mother's name and the SIP drops ₹2,300"). Evidence: Indian practitioners ignore holder-specific tax; family note nuances 1–3.
- **Yearly review that recomputes targets and funded ratio.** Evidence: Pattabiraman; FPSB step 6 (review).
- **Assigning existing holdings to goals with few sales.** Evidence: liability matching in the CFA curriculum; tax cost of switching.

---

## 5. Disagreements and open questions

**Disagreements among experts**

1. **Glide-path shape.** Vanguard and most target-date funds glide down. Arnott et al., Estrada, and Pfau and Kitces find flat or rising equity paths give more wealth. The disagreement is mostly about retirement wealth; for a fixed-date, fixed-amount goal, de-risking near the date protects the goal. This note sides with de-risking for dated goals and leaves retirement to agenda topic 7.
2. **How much equity far from the date.** Pattabiraman: 50–60% beyond 10 years. Vanguard: about 90%. Shenoy: 60–75%. The table uses 70–90% by tier, capped by risk profile. Topic 2's Indian data should test this.
3. **Risk when behind.** Dynamic programming says take more risk when behind the goal. Behavioural finance and SEBI suitability say do not escalate risk beyond the profile. This note caps at the profile.
4. **Separate goal buckets vs one total portfolio.** Das, Markowitz, Scheid and Statman show little efficiency is lost. Campbell, Capponi and Parashar show separate accounts lose fungibility. The waterfall keeps buckets for explanation but allows late surplus release.
5. **Which success threshold.** US advisers aim for about 90% on retirement; the CFA curriculum uses 95/80/75; Kitces argues the threshold matters less than adjustment planning. The defaults here (95/90/75/50) are a judgment call.
6. **Return distribution.** Normal is simple but understates crashes. Bootstrap depends on a short Indian history (about 30 years of Nifty total return data). Student-t needs a chosen tail parameter.

**Open questions**

1. Indian return, volatility, correlation and education/health inflation data (agenda topic 2) to replace every placeholder here.
2. Does SEBI's RIA framework constrain how probabilities are shown (for example, the ban on implying assured returns)? Not checked here; check before the public launch.
3. Is there an Indian study of glide paths on Indian data (Nifty vs gilt)? None found in this pass.
4. How should the waterfall treat a goal shared by two members (parents both paying for a child)? Proposed: one goal, funded from any member, placement decided by topic 3.
5. Full text of the Das et al. multi-goal paper (J. Banking & Finance) was not reachable; the volume and year need checking before citing in user-facing material.
6. Kuvera, Scripbox, ET Money, INDmoney and Groww publish no method; their actual assumptions are unknown.
7. Retirement is a spending goal, not a dated lump sum; agenda topic 7 should define its model (corpus via withdrawal rate vs a ladder of yearly sub-goals).

---

## 6. Sources

| # | Source | Type | Confidence |
|---|---|---|---|
| 1 | Das, Markowitz, Scheid, Statman, "Portfolio Optimization with Mental Accounts", JFQA 45(2), 2010. [IDEAS](https://ideas.repec.org/a/cup/jfinqa/v45y2010i02p311-334_00.html) | Paper | High |
| 2 | Das, Ostrov, Casanova, Radhakrishnan, Srivastav, "Optimal Goals-Based Investment Strategies for Switching Between Bull and Bear Markets", 2021. [PDF](https://srdas.github.io/Papers/RiskRegimes.pdf) | Paper | High (read) |
| 3 | Das, Ostrov, Radhakrishnan, Srivastav, "Dynamic Optimization for Multi-Goals Wealth Management", J. Banking & Finance (2021–22). [SCU](https://www.scu.edu/cas/mathcs/news-and-events/stories/journal-of-banking-and-finance-publishes-paper-by-dan-ostrov-and-three-scu-students.html) | Paper | Medium (not read in full) |
| 4 | Das et al., "A Meta Reinforcement Learning Approach to Goals-Based Wealth Management", 2026. [arXiv 2605.02300](https://arxiv.org/abs/2605.02300) | Paper | High (abstract) |
| 5 | Campbell, Capponi, Parashar, "Portfolio Choice with Competing Precautionary and Accumulation Goals", 2026. [arXiv 2606.03158](https://arxiv.org/abs/2606.03158) | Paper | High (abstract) |
| 6 | Bayraktar, Han, "Goal-based portfolio selection with mental accounting", 2025. [arXiv 2506.06654](https://arxiv.org/abs/2506.06654) | Paper | High (abstract) |
| 7 | Arnott, Sherrerd, Wu, "The Glidepath Illusion", J. Portfolio Mgmt, 2013. [Research Affiliates](https://www.researchaffiliates.com/content/dam/ra/publications/pdf/241-the-glidepath-illusion.pdf) | Paper | High |
| 8 | Estrada, "The Glidepath Illusion: An International Perspective", J. Portfolio Mgmt, 2014. [IESE](https://www.iese.edu/insight/articles/retirement-target-date-funds/) | Paper | High |
| 9 | Pfau, Kitces, "Reducing Retirement Risk with a Rising Equity Glide Path", J. Financial Planning, 2014. | Paper | Medium (from summary) |
| 10 | Chhabra, "Beyond Markowitz", J. Wealth Mgmt, 2005; *The Aspirational Investor*, 2015. [CFA Institute blog](https://blogs.cfainstitute.org/blog/2012/05/08/a-new-framework-for-taming-wildly-random-markets/) | Paper | Medium |
| 11 | Brunel, *Goals-Based Wealth Management*, Wiley, 2015. [O'Reilly](https://www.oreilly.com/library/view/goals-based-wealth-management/9781118995938/) | Practitioner (book) | Medium |
| 12 | Vanguard, "Vanguard's approach to target-date funds", 2022. [PDF](https://corporate.vanguard.com/content/dam/corp/research/pdf/vanguards_approach_to_target_date_funds.pdf) | Practitioner | Medium |
| 13 | Vanguard, "Vanguard's Life-Cycle Investing Model (VLCM)", 2021. [PDF](https://corpaemdisp.essp.c1.vanguard.com/content/dam/corp/research/pdf/Vanguards-Life-Cycle-Investing-Model-VLCM-A-general-portfolio-framework-US-ISGVLCM_032021_online.pdf) | Practitioner | Medium |
| 14 | CFA Institute Level III curriculum, goals-based planning, via [AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/goals-based-planning/) | Practitioner | Medium |
| 15 | Kitces, "Renaming the outcomes of a Monte Carlo retirement projection". [Kitces](https://www.kitces.com/blog/renaming-the-outcomes-of-a-monte-carlo-retirement-projection/) | Opinion | High |
| 16 | Kitces, "Probability and magnitude of success in Monte Carlo". [Kitces](https://www.kitces.com/blog/multidimensional-abstraction-to-communicate-monte-carlo-simulation-probability-and-magnitude-of-success/) | Opinion | High |
| 17 | Kitces, "Monte Carlo guardrails and probability of adjustment". [Kitces](https://www.kitces.com/blog/monte-carlo-guardrails-probability-of-adjustment-success-client-communication-dynamic-retirement-spending/) | Opinion | High |
| 18 | Wharton Pension Research Council, chapter 4 (bootstrap vs normal tails). [PDF](https://pensionresearchcouncil.wharton.upenn.edu/wp-content/uploads/2016/09/Chapter-4.pdf) | Paper | Medium |
| 19 | Pattabiraman (freefincal), "Focus on goal-based risk management". [freefincal](https://freefincal.com/stop-worrying-about-market-conditions-and-focus-on-goal-based-risk-management/) | Practitioner (India) | High |
| 20 | Shenoy (Capitalmind), "How I use glide path investing for my child's education", 2022. [Capitalmind](https://www.capitalmind.in/podcasts/how-i-use-glide-path-investing-in-financial-planning-for-my-childs-education) | Practitioner (India) | High |
| 21 | Sharpely, "Financial goal planning: the traditional approach". [Sharpely](https://sharpely.in/blogs/financial-goal-planning-the-traditional-approach/) | Practitioner (India) | Medium |
| 22 | Dhan, SBI MF goal calculators. [Dhan](https://dhan.co/mutual-fund-calculators/sip-goal-calculator-with-inflation/); [SBI MF](https://www.sbimf.com/en-us/financial-planning-calculators/family-solution-tool/personal-goal-calculator) | Practitioner (India) | Medium |
| 23 | Kuvera calculators; The Quint on Kuvera. [Kuvera](https://kuvera.in/calculators); [The Quint](https://www.thequint.com/save-and-grow/kuvera-wealth-management-the-power-of-goal-based-investing-demystified-heres-how-it-works) | Practitioner (India) | Low |
| 24 | Tax rules, SEBI RIA rules, FPSB process: `docs/research/2026-11-15-family-financial-planning.md` (primary sources listed there). | Regulator | High |
