# Family archetypes as fixed test cases

15 Nov 2026. Research agenda topic 6 (`docs/PLANNER-NOTES.md`). Tax year FY 2026-27. Builds on the six notes in this folder:

| Short name | Note |
|---|---|
| **TAX** | `2026-11-15-family-financial-planning.md` |
| **GOAL** | `2026-11-15-goal-based-planning.md` |
| **DATA** | `2026-11-15-india-returns-risk-inflation.md` |
| **PLACE** | `2026-11-15-family-asset-placement.md` |
| **SELL** | `2026-11-15-tax-aware-selling-rebalancing.md` |
| **RISK** | `2026-11-15-risk-profiling.md` |

Marks used below: **[J]** = a judgement call (an expert planner could reasonably choose differently); **[Calc]** = computed by me from the rules in TAX and the methods in GOAL/RISK; **[OOS]** = out of scope for the engine, flag only.

---

## 1. Summary

1. **Indian household wealth is physical.** The average household holds 77% of its assets in real estate, 7% in other durables, 11% in gold and only 5% in financial assets (RBI Household Finance Committee, 2017). The 2019 NSO survey agrees: land and buildings are 91% of rural and 87% of urban household assets; deposits 5% and 9%. Debt is mostly unsecured (56%); mortgages are only 23% of liabilities and, unusually, their share *rises* towards retirement.
2. **The app's users are a thin, richer slice.** Only 9.5% of households invest in securities (SEBI Investor Survey 2025), 15% urban, 23% in the top nine metros. About 7.5 crore individuals filed returns for FY 2022-23 (about 6% of the population) and 63% of them owed no tax; 72% chose the new regime. India has about 13.5 crore unique NSE investors and 6.3 crore unique mutual fund investors (2026). So the archetypes are set at household incomes of ₹12 L to ₹50 L: the "middle class" of PRICE's ICE 360 bands (₹5–30 L), which is roughly the top fifth of households, plus a few above it.
3. **Seven test families are fixed below** as data fixtures with members, regimes, assets by tax type and owner, loans, expenses, goals and risk answers. Each has an expert plan (emergency fund, insurance, debt, regime, placement, goal SIPs, harvesting) with rupee figures **computed with the FY 2026-27 rules and the methods already in the research notes**, so the engine can be tested against them.
4. **What the families teach the engine (headline expected outputs):**
   - Almost every member is on the **new regime**. The two closest calls are a renting single earner with parents to insure (old regime loses by ₹24,544) and a parent with a ₹4 L/yr education-loan interest (80E) claim (old loses by ₹39,000). A regime engine that defaults to "old if there's a home loan" fails 3 of 7 families.
   - The **₹12 L cliff bites a salaried spouse**, not just retirees: a wife on ₹12 L salary (₹11.25 L taxable) pays **₹26,000** to harvest ₹1 L of LTCG that would be "free" for anyone else; the cap is ₹75,000.
   - **Retired parents and an HUF are nil-tax shelters** worth ₹43,680 a year per ₹20 L of debt fund moved from a 31.2% earner, but the parent's own **risk cap (30%) limits how much harvest-and-rebuy equity she can hold**, a conflict the placement engine must resolve.
   - **Most families cannot fund every goal.** In 6 of 7 families the priority waterfall marks at least one goal "short" with the stated surplus. The levers (delay, shrink, grandparents' surplus, retire at 62) are the real advice.
   - A **retired couple on FDs/SCSS pays zero tax** and needs no tax moves (a null-move test), but their 6.4% withdrawal rate means the money runs out at about 89 on deterministic maths: inflation, not tax, is their risk.
5. **Data gaps that matter for fixtures:** no Indian public dataset gives a joint distribution of income, holdings and goals per household; the archetypes are therefore *constructed* families, anchored to the aggregate shares above, not sampled ones.

---

## 2. What Indian household data shows

### 2.1 Where the wealth sits

| Finding | Figure | Source | Label, confidence |
|---|---|---|---|
| Share of average household assets | Real estate 77%, other durables 7%, gold 11%, financial assets 5% | RBI HFC 2017, ch. 1.1 [S1] | Regulator/Data, High (built on AIDIS 2013 data) |
| Even the richest households | Financial assets and pensions only 3.7% of the balance sheet | RBI HFC 2017, ch. 1.3 [S1] | Regulator/Data, Medium |
| Rural asset mix (30 Jun 2018) | Land 69%, buildings 22%, deposits 5%, other 4% | AIDIS 2019 press note [S2] | Data, High |
| Urban asset mix | Land 49%, buildings 38%, deposits 9%, other 4% ("other" includes vehicles, business equipment and shares) | AIDIS 2019 [S2] | Data, High |
| Average assets per household | Rural ₹15.9 L (financial ₹72,608); urban ₹27.2 L (financial ₹2.52 L); urban self-employed ₹41.5 L | AIDIS 2019 [S2] | Data, High |
| Pension wealth | "Nearly absent"; retirement is financed by informal arrangements between parents and children | RBI HFC 2017 [S1] | Regulator, High |
| New financial savings, FY 2024-25 | Bank deposits about a third of new financial assets; mutual funds up from 2.6% (2019-20) to 13.1%; currency down to 5.9% | RBI data via The Hindu/The Wire analysis [S10] | Data (secondary), Medium |
| Net household financial savings | 7.0% of GNDI in 2024-25 (5.8% a year earlier); gross 11.8% | RBI Annual Report via press [S10] | Regulator (secondary), Medium |

**Reading for the app.** Property and gold are the default "investments", and they are lumpy, illiquid and in one member's name. The engine must hold them in net worth and in goal earmarks (land for retirement, jewellery for a wedding) but never count them as emergency money. Pension wealth is thin, so retirement is under-funded in almost every archetype.

### 2.2 Debt

| Finding | Figure | Source | Label, confidence |
|---|---|---|---|
| Households in debt (30 Jun 2018) | Rural 35% (cultivators 40%); urban 22.4% (self-employed 27.5%) | AIDIS 2019 [S2] | Data, High |
| Average debt per household | Rural ₹59,748; urban ₹1,20,336 (self-employed ₹1,79,765) | AIDIS 2019 [S2] | Data, High |
| Non-institutional only | Rural 10.2%, urban 4.9% of households | AIDIS 2019 [S2] | Data, High |
| Composition | Unsecured 56% of debt; mortgages 23%; gold loans 7.6% | RBI HFC 2017 [S1] | Regulator, High |
| Age profile | India is the only country in the comparison where the mortgage share rises approaching retirement | RBI HFC 2017 [S1] | Regulator, High |
| Medical shocks | 69% of households finance medical expenses informally (26% from moneylenders) | RBI HFC 2017 [S1] | Regulator, Medium (older Finscope/IHDS data) |

**Reading for the app.** The archetypes carry the common Indian debts: a home loan (A, future F), a personal loan taken for a parent's surgery (D), a business overdraft (C), a car loan (F) and an education loan (G). Health cover for parents is the most frequent gap (B, D), matching the HFC finding that medical costs drive informal borrowing.

### 2.3 Who invests in markets

| Finding | Figure | Source | Label, confidence |
|---|---|---|---|
| Aware of at least one securities product | 63% of households (urban 74%, rural 56%; top 9 metros 89%) | SEBI Investor Survey 2025 [S3] | Regulator, High (read via summary) |
| Invest in securities | 9.5% of households (≈3.2 crore); urban ≈15%, rural ≈6%; top-9 metros ≈23% | SEBI 2025 [S3] | Regulator, High |
| Invest in mutual funds | 6.7% of households | SEBI 2025 [S3] | Regulator, High |
| Older households | 85% of the "silver generation" prioritise capital safety | SEBI 2025 [S3] | Regulator, Medium |
| Unique NSE investors | 13.5 crore PANs (31 Aug 2026) | NSE Market Pulse Sep 2026 [S4] | Data, High |
| Unique MF investors | ≈6.33 crore (Sep 2026); women 26.4% (Mar 2026) | AMFI / AMFI-Crisil Factbook via press [S5] | Data (secondary), Medium |
| SIP accounts and ticket | 10.89 crore SIP accounts (Sep 2026); average SIP ≈₹5,000 (FY26) | AMFI via press [S5]; CAMS women investor report 2026 [S6] | Data, Medium |
| Average AUM per folio | T30 ₹2.71 L, B30 ₹1.02 L (Feb 2026) | AMFI via press [S5] | Data, Medium |

### 2.4 Income and tax

| Finding | Figure | Source | Label, confidence |
|---|---|---|---|
| Individual return filers | 7.5 crore for FY 2022-23, about 6% of population | CBDT ITR statistics via PRS [S7] | Data, High |
| Zero tax liability | 63% of filers (4.7 crore) | PRS [S7] | Data, High |
| New regime uptake | 72% of filers (AY 2024-25: 5.27 crore new vs 2.01 crore old) | CBDT via PRS [S7] and press [S8] | Regulator, High |
| Income classes (2020-21 prices, household) | Destitute < ₹1.25 L; aspirer ₹1.25–5 L; middle class ₹5–30 L (seekers ₹5–15 L, strivers ₹15–30 L); near-rich ₹30–50 L | PRICE ICE 360 via ThePrint [S9] | Data (survey), Medium |
| Where the "middle class" sits | Households in PRICE's middle class are in roughly the top 20% by income | Commentary on PRICE data [S9] | Opinion, Medium |

**Reading for the app.** The archetypes' household incomes (₹12 L to ₹50 L) put every family in PRICE's strivers or near-rich bands, i.e. the top fifth. That is who files returns, holds mutual funds and benefits from tax planning. Since the ₹12 L rebate makes most of the 63% zero-tax filers' slab income tax-free, the high-value moves are (a) moving slab income into such members and (b) watching the cliff.

### 2.5 Typical goals and protection gaps (practitioner)

Practitioner case studies (Business Today, Value Research, Outlook Money columns [S13]) repeat the same goals: children's higher education (India and abroad), a house down payment, a child's wedding, retirement, parents' health, a car. They repeat the same gaps: no or low term cover, health cover only through the employer, high EMIs crowding out goals, endowment policies sold as investments, and money left in savings accounts. The archetypes include each of these. **Practitioner, Medium:** these are magazine case studies, not a survey.

---

## 3. The seven archetypes

### 3.0 Conventions for every fixture

- **Date:** plans start **15 Nov 2026**. Horizons in years from that date (June 2040 = 13.6 years).
- **Tax:** FY 2026-27 rules in TAX §3 (new regime slabs in ₹4 L steps, ₹75,000 standard deduction, ₹12 L rebate with marginal relief, 4% cess, no surcharge: every member is kept under ₹50 L). Old-regime comparisons use the deductions listed per member.
- **Returns (DATA §3 base):** equity 11% nominal; debt 7%; FD 7.25% for seniors, 6.75% otherwise; SCSS 8.2%; PPF 7.1%; EPF 8.25% (assumed, contractual); NPS 9% [J].
- **After-tax returns used in goal sizing (GOAL §3.3 Layer A, "after-tax returns throughout"):** equity **10.0%** for every holder [J: 11% less exit LTCG at 12.5% × 1.04 over 10–15 years gives 10.0–10.2%; ignores harvesting, which adds back]; debt **7% × (1 − holder's marginal rate incl. cess)**: 4.82% at 31.2%, 5.18% at 26%, 5.54% at 20.8%, 5.91% at 15.6%, 7% for a nil-tax holder.
- **Goal inflation (DATA §3 base):** general 5%, retirement living 5%, education India 8%, abroad 6.5%, house 5%, wedding 6%, car 5%, health costs 8%.
- **Goal sizing:** GOAL §3.2 glide table by tier, capped by the member's ceiling from RISK §4; 5% yearly SIP step-up; end-of-month contributions; SIP rounded up to ₹100. The calculator reproduces the GOAL §3.3 test case (₹25,955 → ₹26,000).
- **Retirement corpus:** 25 × first-year living cost at retirement [J: convention from TAX §2.2 (25–33×); topic 7 will replace]. Living cost = 70% of today's household expenses unless stated [J]. EPF/PPF/NPS balances and continuing EPF contributions (employee + employer, 12% each of a basic of 40% of gross, growing 5%/yr) are earmarked first.
- **Emergency fund (EF):** months of (expenses + EMIs): 6 for dual-income salaried, 6 for single earner, 12 for business income [J, TAX §2.2 convention].
- **Term cover rule of thumb:** 10–15 × annual income, cross-checked against needs (loans + goal lump sums) [J, TAX §2.2].
- **Risk:** RISK §4 scoring: T from W1–W5, K from K1–K5, ceiling = min(W cap, K cap, horizon cap). Override: EF < 3 months caps *new* money at 40%.
- **Tolerances for tests:** tax figures exact to the rupee; SIPs ±₹100 under these assumptions; corpus-depletion years ±1.

Fixture schema (all money in ₹; `owner` is a member id; `taxType` uses the foundation's six types):

```text
family { id, city, members[], assets[], loans[], expensesMonthly, insurance[], goals[], risk{} }
member { id, name, age, relation, panType: person|HUF, regime, residency, income{salary, pension, interest, rent, business, professional} }
asset  { id, owner, kind, taxType: equity|debtLike|inBetween|interest|taxFree|dividend|property|gold, value, cost?, longTerm?, earmark? }
goal   { id, forMember, amountToday, date, tier: essential|need|want|wish, kind, spread? }
```

---

### 3.1 Archetype A: salaried nuclear family, metro, home loan, young child

**Fixture**

```json
{
  "id": "A-metro-salaried",
  "city": "Bengaluru",
  "members": [
    {"id":"rohan","age":36,"relation":"self","panType":"person","regime":"new","residency":"resident",
     "income":{"salary":2800000},"notes":"private sector, 3 yrs in job, basic 40%"},
    {"id":"priya","age":34,"relation":"spouse","panType":"person","regime":"new","residency":"resident",
     "income":{"salary":1200000}},
    {"id":"aarav","age":4,"relation":"son","panType":"none","minor":true}
  ],
  "assets": [
    {"id":"a1","owner":"rohan","kind":"equity MF (flexi/index)","taxType":"equity","value":1800000,"cost":1200000,"longTerm":true},
    {"id":"a2","owner":"rohan","kind":"EPF","taxType":"taxFree","value":1400000},
    {"id":"a3","owner":"rohan","kind":"PPF","taxType":"taxFree","value":400000},
    {"id":"a4","owner":"rohan","kind":"savings + sweep FD (joint, Rohan first holder)","taxType":"interest","value":300000},
    {"id":"a5","owner":"priya","kind":"equity MF","taxType":"equity","value":500000,"cost":400000,"longTerm":true},
    {"id":"a6","owner":"priya","kind":"EPF","taxType":"taxFree","value":500000},
    {"id":"a7","owner":"priya","kind":"gold jewellery","taxType":"gold","value":600000},
    {"id":"a8","owner":"rohan+priya 50:50","kind":"self-occupied flat","taxType":"property","value":11000000}
  ],
  "loans": [{"id":"l1","kind":"home loan","borrowers":["rohan","priya"],"outstanding":6000000,"rate":0.085,"monthsLeft":204,"emi":55698}],
  "expensesMonthly": 110000,
  "insurance": [{"member":"rohan","term":10000000},{"member":"family","health":"employer group ₹5 L only"}],
  "goals": [
    {"id":"g0","kind":"emergency","tier":"essential"},
    {"id":"g1","forMember":"aarav","kind":"education_india","amountToday":2500000,"date":"2040-06","tier":"need"},
    {"id":"g2","forMember":"aarav","kind":"education_abroad","amountToday":2000000,"date":"2044-06","tier":"want"},
    {"id":"g3","forMember":"family","kind":"car","amountToday":1000000,"date":"2029-06","tier":"want"},
    {"id":"g4","forMember":"rohan","kind":"retirement_living","amountTodayMonthly":77000,"date":"2050-11","tier":"need"}
  ],
  "risk": {"rohan":{"W":[4,4,4,"slider 7",4],"K":[4,2,3,3,4]},"priya":{"W":[4,4,4,"slider 7",4]}}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Cash flow | Take-home Rohan ₹1,87,483, Priya ₹95,000 a month (after EPF, tax, ₹200 PT). Surplus after expenses, EMI and ₹6,000 premiums: **₹1,10,786/month** | [Calc] | |
| Regime | Both **new**. Rohan new ₹4,13,400 vs old ₹5,30,400 (with 80C ₹1.5 L, 1B ₹50k, 80D ₹25k, home-loan interest ₹2 L). Priya new **₹0** vs old ₹1,01,400 | [Calc] | Self-occupied home-loan interest is lost in the new regime; it still loses |
| Emergency fund | Target 6 × (₹1.1 L + ₹55,698) = **₹9.94 L**. Have ₹3 L (1.8 months). Build ₹6.94 L over 12 months (₹58,000/month). Hold ₹3 L in sweep FD, the rest in an **arbitrage fund in Rohan's name** | [J] 6 months; [J] arbitrage (equity-taxed) beats a liquid fund at 31.2% | Do **not** put EF interest in Priya's name: she has only ₹75,000 of headroom under ₹12 L |
| Insurance | Rohan: add ≈₹2 Cr term (to ≈₹3 Cr; 10–15× = ₹2.8–4.2 Cr; needs: loan ₹60 L + goal lump sums ≈₹51 L + 15 yrs of household costs). Priya: ₹1 Cr term. Health: own floater ₹10 L + super top-up ₹25–50 L, not just employer cover | [J] all amounts | Protection before goals (TAX §2.2) |
| Debt | Loan costs **8.5% after tax** (new regime, no deduction). Keep long-goal money in equity (after-tax expectation 10.0%, risky); hold no taxable debt beyond the EF while the loan runs (Rohan's debt earns 4.82% after tax); put an annual bonus to prepayment | [J] prepay vs invest; Indian planners split on this | EMI is 20% of take-home: fine |
| Who holds what | Debt legs of goals: PPF first (tax-free 7.1% > 4.82%), ₹1.5 L/yr each for Rohan and Priya; equity SIPs in either name. Priya's own surplus can hold her goals' equity | [Calc] + [J] PPF lock-in fits the 2040 goal only partly | Gifts Rohan → Priya are clubbed (s.99): no gain from moving money to her |
| Risk | Rohan T = 75 (Growth, cap 75%); K = 55 (cap 60%); EF 1.8 months → **new money capped at 40%** until EF reaches 3 months (₹5 L) | [Calc] RISK §4 | Tests the EF override |
| Goal SIPs (cap 60%, Rohan as debt holder) | UG 2040 ₹25 L → FV ₹71.2 L; Priya's MF ₹5 L earmarked → **₹17,600/month**. PG 2044 ₹20 L → FV ₹60.6 L → **₹10,700**. Car 2029 ₹10 L → FV ₹11.4 L → **₹33,100**. Retirement: target ₹7.45 Cr in 2050; EPF + contributions + PPF + Rohan's MF cover all but ₹8.7 L → **₹800** | [Calc] Layer A | Retirement looks funded only because EPF compounding at 8.25% is assumed for 24 years [J] |
| Waterfall | Surplus ₹1,10,786: EF ₹58,000 → UG ₹17,600 → retirement ₹800 → car (want, nearer) ₹33,100 → PG gets **₹1,286 vs ₹10,700: short** for the first 12 months; fully funded once the EF is built | [Calc] GOAL §3.5 | [J] many planners would rank the child's PG above the car; the waterfall ranks wants by date |
| Harvesting | Rohan: book ₹1.25 L LTCG each year at nil tax (saves up to **₹16,250/yr** of future tax). **Priya: harvest at most ₹75,000**; harvesting ₹1 L takes her total income to ₹12.25 L and costs **₹26,000** (marginal relief) | [Calc] TAX ex. 3 logic | Key cliff test |
| After-tax outcome | Family tax ₹4,13,400/yr (unchanged by the plan); avoided loss on Priya's harvest ₹26,000; yearly harvest value up to ₹16,250 | [Calc] | |

---

### 3.2 Archetype B: joint family with retired parents, an HUF and ancestral property

**Fixture**

```json
{
  "id": "B-joint-HUF",
  "city": "Ahmedabad",
  "members": [
    {"id":"ramesh","age":68,"relation":"father (karta)","panType":"person","regime":"new","income":{"pension":360000,"interest":536000}},
    {"id":"kokila","age":64,"relation":"mother","panType":"person","regime":"new","income":{"interest":72500}},
    {"id":"amit","age":42,"relation":"self","panType":"person","regime":"new","income":{"salary":3000000}},
    {"id":"neha","age":39,"relation":"spouse (son's wife to Ramesh)","panType":"person","regime":"new","income":{}},
    {"id":"riya","age":14,"relation":"daughter","minor":true},
    {"id":"dhruv","age":10,"relation":"son","minor":true},
    {"id":"shahHUF","relation":"HUF, karta Ramesh","panType":"HUF","regime":"new","income":{"rent":480000,"interest":105000}}
  ],
  "assets": [
    {"owner":"ramesh","kind":"bank FD","taxType":"interest","value":4000000,"rate":0.0725},
    {"owner":"ramesh","kind":"SCSS","taxType":"interest","value":3000000,"rate":0.082},
    {"owner":"kokila","kind":"bank FD","taxType":"interest","value":1000000,"rate":0.0725},
    {"owner":"kokila","kind":"gold jewellery","taxType":"gold","value":1500000},
    {"owner":"amit","kind":"equity MF","taxType":"equity","value":3500000,"cost":2000000,"longTerm":true},
    {"owner":"amit","kind":"EPF","taxType":"taxFree","value":2000000},
    {"owner":"amit","kind":"PPF","taxType":"taxFree","value":800000},
    {"owner":"neha","kind":"gold jewellery (streedhan)","taxType":"gold","value":1000000},
    {"owner":"neha","kind":"savings","taxType":"interest","value":200000},
    {"owner":"shahHUF","kind":"ancestral house, self-occupied by family","taxType":"property","value":25000000},
    {"owner":"shahHUF","kind":"let-out shop (ancestral)","taxType":"property","value":6000000,"rentYearly":480000},
    {"owner":"shahHUF","kind":"bank FD","taxType":"interest","value":1500000,"rate":0.07}
  ],
  "loans": [],
  "expensesMonthly": 140000,
  "expenseSplit": {"amit":100000,"ramesh":40000},
  "insurance": [{"member":"amit","term":5000000},{"member":"amit family","health":"employer ₹5 L"},{"member":"ramesh,kokila","health":"none"}],
  "goals": [
    {"id":"g0","kind":"emergency","tier":"essential"},
    {"id":"g1","forMember":"riya","kind":"education_india","amountToday":3000000,"date":"2030-06","tier":"need","earmark":"₹20 L of Ramesh's FD (grandparents pay fees directly)"},
    {"id":"g2","forMember":"dhruv","kind":"education_india","amountToday":3000000,"date":"2034-06","tier":"need"},
    {"id":"g3","forMember":"riya","kind":"wedding","amountToday":2000000,"date":"2040-06","tier":"want"},
    {"id":"g4","forMember":"amit","kind":"retirement_living","amountTodayMonthly":98000,"date":"2044-04","tier":"need"},
    {"id":"g5","forMember":"ramesh,kokila","kind":"health_costs","amountToday":1500000,"date":"ongoing","tier":"essential"}
  ],
  "risk": {"amit":{"W":[4,3,4,"slider 7",3],"K":[4,4,4,5,3]},"ramesh":{"W":[2,2,2,"slider 3",2],"K1":"interest covers 100%+"},"kokila":"same answers as ramesh","shahHUF":"karta = ramesh"}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Regime | All **new**. HUF taxable ₹4.41 L (rent less 30% + interest) → **₹0**. Ramesh ₹8.21 L → **₹0** (old ₹61,568). Kokila ₹72,500 → ₹0. Amit new ₹4,75,800 vs old ₹6,39,600 | [Calc] | Seniors with interest income default to new (TAX ex. 5) |
| Headroom (nil-tax room) | Slab room to ₹12 L: HUF ₹7.59 L, Ramesh ₹3.79 L, Kokila ₹11.28 L. Equity gains at nil tax: Kokila ₹4.53 L/yr (gap ₹3.28 L + ₹1.25 L); HUF and Ramesh ₹1.25 L each (no gap left) | [Calc] | Inputs to PLACE §3.6 buckets |
| Emergency fund | 6 months × ₹1.4 L = **₹8.4 L**, earmarked from Kokila's ₹10 L FD (already nil-tax) | [J] 6 months for a single earning adult with retired parents' income behind it | No new money needed |
| Insurance | Amit: term ₹50 L → raise to ≈₹2.5 Cr (10–15× = ₹3–4.5 Cr; parents self-funded lowers the need). Parents: senior floater (expect loadings and waiting periods at 64/68) **plus** a ₹15 L health corpus in Ramesh's FD. Neha: optional ₹50 L term | [J] all | HFC: medical costs drive informal borrowing |
| Placement | (1) Amit's future debt allocation: gift to Kokila, who holds a debt fund: **₹43,680/yr saved per ₹20 L** at 7% (31.2% vs 0%). (2) Harvest via Kokila: Amit gifts long-term units, she sells and rebuys; with ₹20 L of debt fund in her name her nil room for LTCG falls from ₹4.53 L to **₹3.13 L**. Amit selling ₹4.55 L of gains himself costs **₹42,900**. (3) HUF: invest accumulated rent (≈₹3–4 L/yr) in an equity index fund in the HUF's name to use its own ₹1.25 L exemption later; keep debt inside its ₹7.59 L headroom | [Calc]; [J] whether to gift at all (money becomes Kokila's and passes under her will; Amit's sister, if any, may inherit a share) | PLACE §6 cautions |
| Clubbing traps (tests) | Gifts from Ramesh or Kokila to **Neha (son's wife)** are clubbed back to the giver; gifts to Riya/Dhruv (minors) are clubbed with Amit (higher-income parent); Amit's gifts to the HUF stay clubbed with Amit (s.99(3)) | Law (TAX §3.10) | Engine must not suggest these as tax moves |
| Risk | Amit T 65 (cap 75%), K 75 (cap 80%) → **75%**. Ramesh and Kokila T 25 → **30%**. HUF uses the karta's willingness → **30%** | [Calc] | **Conflict:** placement wants equity with Kokila for harvesting; her cap allows ≤30% of her holdings. Expected: the engine harvests through her (sell-and-rebuy is risk-neutral) but must not raise her long-run equity above 30% [J] |
| Goal SIPs | Riya UG 2030 ₹30 L → FV ₹39.6 L; ₹20 L of Ramesh's FD earmarked (at 7%, nil tax) → **₹26,900** (₹79,300 without the earmark). Dhruv UG 2034 → **₹41,200**. Wedding 2040 ₹20 L → **₹12,800**. Amit retirement 2044: target ₹6.87 Cr; EPF, PPF, MF cover ₹4.28 Cr → **₹47,300** | [Calc] | |
| Waterfall | Amit's surplus ₹90,150/month (take-home ₹1,98,150 − ₹1 L household share − ₹8,000 premiums): Riya ₹26,900 → Dhruv ₹41,200 → retirement gets **₹22,050 of ₹47,300: short**; wedding unfunded | [Calc] | |
| Lever (family-level) | Ramesh and Kokila's interest exceeds their share of expenses by ≈**₹4.9 L a year** (₹40,700/month). If they choose to pay Dhruv's fees, Amit's retirement is fully funded | [Calc]; [J] a family decision, never assumed | Expected: shown as a lever, not applied by default |
| Ramesh admin | Form 121 to stop TDS; no advance tax (60+, no business income); SCSS at the ₹30 L cap | Law | |
| HUF | Keep the HUF for the ancestral assets; do not throw new self-earned money into it (clubbed). [OOS] partition and succession under Hindu law | [J] | |

---

### 3.3 Archetype C: business owner on presumptive income, irregular cash flow

**Fixture**

```json
{
  "id": "C-business-presumptive",
  "city": "Surat",
  "members": [
    {"id":"suresh","age":45,"relation":"self","panType":"person","regime":"new","residency":"resident",
     "income":{"business":1400000},"notes":"textile trader, turnover ₹1.8 Cr, >95% digital receipts, presumptive under s.58 (old 44AD), declares ≈7.8% of turnover"},
    {"id":"meena","age":42,"relation":"spouse","panType":"person","regime":"new","income":{}},
    {"id":"jay","age":17,"relation":"son","minor":true,"dob":"2009-03-10","majorityOn":"2027-03-10"},
    {"id":"nisha","age":13,"relation":"daughter","minor":true}
  ],
  "assets": [
    {"owner":"suresh","kind":"direct shares","taxType":"equity","value":1000000,"cost":700000,"longTerm":"mixed"},
    {"owner":"suresh","kind":"bank FD","taxType":"interest","value":1200000},
    {"owner":"suresh","kind":"business current account (working capital)","taxType":"interest","value":800000,"excludeFromEmergency":true},
    {"owner":"suresh","kind":"LIC endowment ×3","taxType":"taxFree","premiumYearly":150000,"sumAssured":2500000,"surrenderValue":900000,"maturity":"2033"},
    {"owner":"suresh","kind":"land plot","taxType":"property","value":4000000},
    {"owner":"suresh","kind":"house, self-occupied, no loan","taxType":"property","value":9000000},
    {"owner":"meena","kind":"gold jewellery (streedhan)","taxType":"gold","value":2500000}
  ],
  "loans": [{"kind":"business overdraft","limit":2000000,"averageDrawn":1500000,"rate":0.105}],
  "expensesMonthly": 70000,
  "cashFlow": {"drawingsMonthlyAvg":140000,"range":[40000,300000]},
  "insurance": [{"member":"suresh","term":0},{"member":"family","health":300000}],
  "goals": [
    {"id":"g0","kind":"emergency","tier":"essential"},
    {"id":"g1","forMember":"jay","kind":"education_india","amountTodayPerYear":450000,"spread":{"from":"2027-07","years":4},"tier":"need"},
    {"id":"g2","forMember":"nisha","kind":"education_india","amountToday":2000000,"date":"2031-06","tier":"need"},
    {"id":"g3","forMember":"suresh","kind":"retirement_living","amountTodayMonthly":56000,"date":"2041-11","tier":"need"}
  ],
  "risk": {"suresh":{"W":[3,4,4,"slider 8",4],"K":[2,5,2,5,3]}}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Regime | **New**: ₹93,600 vs old ₹1,71,600 (80C via LIC ₹1.5 L, 1B ₹50k, 80D ₹25k). With business income the choice is sticky: one switch back to old allowed (s.202(4)) | [Calc] | Engine must warn before suggesting a switch |
| Advance tax | Presumptive: **100% (₹93,600) by 15 March** (s.408) | Law | Feature test: single-instalment schedule |
| Emergency fund | **12 months × ₹70,000 = ₹8.4 L**, separate from business cash, from the ₹12 L FD; hold in FD/liquid | [J] 12 months for irregular income | Business current account excluded |
| Debt | Use the other ₹3.6 L of FD to cut the overdraft: saves ≈₹37,800/yr interest at 10.5% vs ≈₹20,500 FD interest (6.75%) after 15.6% tax. Under presumptive income the OD interest is not separately deductible, so its cost is the full 10.5% | [Calc]; [J] keep OD headroom as the business buffer | |
| Insurance | **Term ≈₹1.5–2 Cr** (10–15× of ₹14 L) — the biggest gap; family floater ₹10 L + super top-up. LIC endowments: get the policy IRR; if under ≈5–6%, make paid-up rather than surrender, and redirect the ₹12,500/month to goals | [J] all; IRR needs policy data | Typical "insurance sold as investment" case |
| Jay's education | Years 1–2 (2027-28, 2028-29, FV ≈₹10 L) from **selling the ₹10 L of shares across FY 2026-27 and FY 2027-28**: the ₹3 L gain split ₹1.5 L per year costs **₹6,500** vs **₹22,750** in one year. Years 3–4: SIPs **₹14,800 + ₹11,600** (no step-up) | [Calc] SELL §3.4 (per-year allowances) | |
| Majority date | Jay turns 18 on **10 Mar 2027**. Income on assets gifted to him after that is his, not clubbed: from FY 2027-28 he has a ₹4 L gap + ₹1.25 L exemption as a harvesting member | Law (s.99(1)(c)); [J] gifting to an 18-year-old | Test: clubbing flag flips on the birthday |
| Goal SIPs (ceiling 75%) | Nisha UG 2031 ₹20 L → FV ₹28.5 L → **₹41,500**. Retirement 2041 (₹56,000/month today) → target ₹3.49 Cr → **₹81,600** | [Calc] | |
| Waterfall and cash flow | Average surplus ≈₹57,500 (₹1.4 L drawings − ₹70,000 − ₹12,500 LIC). Jay yrs 3–4 ₹26,400 → Nisha gets ₹31,100 of ₹41,500: **short**; retirement **unfunded**. Mechanics: a fixed SIP floor of ≈₹30,000, the rest as quarterly lump sums from a liquid-fund "parking" account in good months | [Calc]; [J] floor-plus-top-up | |
| Levers | LIC paid-up frees ₹12,500/month; land plot (₹40 L) earmarked to retirement [J]; Meena's gold is hers and not a goal asset unless she chooses | [J] | Planners usually exclude the home and jewellery from retirement assets |
| Risk | T 70 (cap 75%); K 60 (cap 80%) → **75%** | [Calc] | Business-income stability scored K1 = 2 |
| [OOS] | GST, business accounts, the 6%/8% presumptive minimum, audit triggers (s.63), partnership vs proprietorship | | |

---

### 3.4 Archetype D: single earner supporting dependent parents

**Fixture**

```json
{
  "id": "D-single-earner-parents",
  "city": "Hyderabad (parents in Vijayawada)",
  "members": [
    {"id":"karthik","age":31,"relation":"self","panType":"person","regime":"new",
     "income":{"salary":1800000},"salaryStructure":{"basic":720000,"hra":360000},"rentPaidYearly":360000},
    {"id":"mohan","age":63,"relation":"father","panType":"person","regime":"new","income":{"interest":58000},"health":"diabetic"},
    {"id":"lata","age":58,"relation":"mother","panType":"person","regime":"new","income":{}}
  ],
  "assets": [
    {"owner":"karthik","kind":"equity MF","taxType":"equity","value":600000,"cost":450000,"longTerm":true},
    {"owner":"karthik","kind":"EPF","taxType":"taxFree","value":400000},
    {"owner":"karthik","kind":"bank FD","taxType":"interest","value":200000},
    {"owner":"mohan","kind":"bank FD","taxType":"interest","value":800000,"rate":0.0725},
    {"owner":"lata","kind":"gold jewellery","taxType":"gold","value":400000},
    {"owner":"mohan","kind":"house (parents live in it)","taxType":"property","value":6000000}
  ],
  "loans": [{"kind":"personal loan (father's surgery)","borrower":"karthik","outstanding":200000,"rate":0.14,"monthsLeft":18}],
  "expensesMonthly": 74000,
  "expenseDetail": {"own incl. rent":45000,"sent to parents":25000,"premiums":4000},
  "insurance": [{"member":"karthik","term":0,"health":"employer ₹5 L, self only"},{"member":"mohan,lata","health":"none"}],
  "goals": [
    {"id":"g0","kind":"emergency","tier":"essential"},
    {"id":"g1","forMember":"mohan,lata","kind":"health_costs","amountToday":1000000,"date":"2029-11","tier":"need"},
    {"id":"g2","forMember":"karthik","kind":"house_purchase (down payment + costs)","amountToday":3200000,"date":"2032-06","tier":"need"},
    {"id":"g3","forMember":"karthik","kind":"wedding","amountToday":1500000,"date":"2028-06","tier":"want"},
    {"id":"g4","forMember":"karthik","kind":"retirement_living","amountTodayMonthly":60000,"date":"2055-05","tier":"need"}
  ],
  "risk": {"karthik":{"W":[4,4,3,"slider 7",4],"K":[4,2,3,4,2]},"mohan,lata":"use karthik's profile (dependants), capped by household K"}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Regime (close call) | HRA exempt = min(₹3.6 L, ₹3.6 L − ₹72,000, 50% × ₹7.2 L) = **₹2.88 L** (Hyderabad is a 50% city from FY 2026-27). Old with HRA + 80C ₹1.5 L + 1B ₹50k + 80D ₹25k self + ₹50k senior father = ₹6.63 L of deductions: **₹1,75,344** vs new **₹1,50,800**. New wins by ₹24,544; without 1B the gap is ₹40,144 | [Calc] | Test: the engine must compute both, not assume |
| Debt first | Prepay the ₹2 L personal loan from the FD (14% vs ≈5.3% on a 6.75% FD after 20.8% tax): saves ≈₹28,000 of interest a year | [Calc]; standard planner rule (> 10–12% first) | |
| Emergency fund | 6 × ₹74,000 = **₹4.44 L**, built from zero after the prepayment: ₹37,000/month for 12 months | [J] 6 months (some planners say 9 for a sole earner with dependants) | |
| Insurance | Parents' health first: senior policy for father (diabetes: expect waiting period and loading) and mother; until it covers, the ₹10 L health corpus is the backstop. Karthik: **term ₹1–1.5 Cr** (₹25,000/month to parents for ~25 years, plus his goals) and a personal health policy beyond employer cover | [J] all | Matches HFC finding on medical shocks |
| Placement | Father as nil-tax holder: income ₹58,000, so ₹11.42 L of slab room and ₹4.67 L of LTCG room. Money for the parents' health corpus belongs in **father's SCSS** (8.2%, nil tax) rather than Karthik's FD (6.75% less 20.8%): on ₹15 L that is ₹1.23 L interest at nil tax vs ₹21,060 of tax a year on ₹1.01 L of FD interest | [Calc]; [J] gift is irrevocable and becomes part of the father's estate (mother; any siblings) | Gift to a parent is not clubbed |
| Harvesting | Karthik's gain ₹1.5 L: harvest ₹1.25 L himself this year (nil). No need to gift | [Calc] | |
| Risk | T 70 (cap 75%); K 50 (cap 60%); EF 2.7 months → **new money ≤40%** until EF ≥ 3 months | [Calc] | |
| Goal SIPs | Parents' health ₹10 L by Nov 2029 (debt, 7% nil-tax holder) → **₹30,200**. House 2032 ₹32 L → FV ₹42.1 L → **₹47,900**. Retirement 2055 (MF ₹6 L earmarked) → **₹35,400**. Wedding 2028 ₹15 L → ₹71,400 (₹60,600 if ₹4 L earmarked) | [Calc] | |
| Waterfall | Surplus ₹56,033/month. EF ₹37,000 → health corpus gets ₹19,033 of ₹30,200: **short**; house, retirement, wedding unfunded for the first 12 months. After the EF: health ₹30,200 → house gets ₹25,833 of ₹47,900: short | [Calc] | Expected: the engine reports this honestly |
| Levers | Delay the house to 2034+; smaller down payment; shrink wedding to ₹10 L (₹33,200 with ₹4 L earmarked); keep retirement ahead of the house | [J] an expert would protect retirement and parents' health first | |

---

### 3.5 Archetype E: retired couple living on FD and SCSS interest

**Fixture**

```json
{
  "id": "E-retired-interest",
  "city": "Chennai",
  "members": [
    {"id":"venkat","age":70,"relation":"self","panType":"person","regime":"new","income":{"pension":36000,"interest":572250}},
    {"id":"lakshmi","age":66,"relation":"spouse","panType":"person","regime":"new","income":{"interest":391000}}
  ],
  "assets": [
    {"owner":"venkat","kind":"SCSS","taxType":"interest","value":3000000,"rate":0.082},
    {"owner":"venkat","kind":"bank FD (senior)","taxType":"interest","value":4500000,"rate":0.0725},
    {"owner":"venkat","kind":"equity MF","taxType":"equity","value":1500000,"cost":800000,"longTerm":true},
    {"owner":"venkat","kind":"savings (joint)","taxType":"interest","value":500000},
    {"owner":"lakshmi","kind":"SCSS","taxType":"interest","value":3000000,"rate":0.082},
    {"owner":"lakshmi","kind":"bank FD (senior)","taxType":"interest","value":2000000,"rate":0.0725},
    {"owner":"lakshmi","kind":"gold jewellery","taxType":"gold","value":1000000},
    {"owner":"venkat","kind":"house, self-occupied","taxType":"property","value":15000000}
  ],
  "loans": [],
  "expensesMonthly": 65000,
  "healthPremiumsYearly": 90000,
  "insurance": [{"member":"venkat","health":500000},{"member":"lakshmi","health":500000}],
  "goals": [
    {"id":"g1","kind":"retirement_income","amountTodayYearly":930000,"until":"venkat age 95","tier":"need"},
    {"id":"g2","kind":"health_costs","amountToday":1000000,"tier":"essential"},
    {"id":"g3","kind":"gift to grandchild","amountToday":500000,"date":"2030-06","tier":"wish"}
  ],
  "risk": {"venkat":{"W":[2,2,2,"slider 3",2],"K":[5,5,4,5,3]},"lakshmi":{"W":[2,2,2,"slider 3",2]}}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Tax | Venkat total income ₹6.08 L, Lakshmi ₹3.91 L: **₹0 each** in the new regime (old is also ₹0 for both). Headroom to ₹12 L: ₹5.92 L and ₹8.09 L | [Calc] | **Null-move test:** the engine should propose no gifts or placement moves for tax |
| Admin | Form 121 at each bank to stop TDS (interest > ₹1 L threshold); no advance tax (60+, no business income) | Law | |
| Sustainability | Financial assets ₹1.45 Cr; spending ₹9.3 L/yr = **6.4% withdrawal**. All in debt at 7.2% with spending rising 6%/yr: lasts **≈19 years (to Venkat ≈89)**. With 25–30% equity (blended 8.2–8.3%): **≈21 years** | [Calc] deterministic; [J] 6% spending inflation (health-heavy) | Status: **at risk**. Topic 7 will add Monte Carlo |
| Buckets | 2 years of spending (**₹18.6 L**) in savings/sweep FD/liquid; SCSS renewed at maturity; FD ladder for years 3–7; 20–30% equity for years 8+ | [J] bucket split | |
| Equity and harvesting | Venkat's MF gain ₹7 L: realise **₹1.25 L a year at nil tax** (no gap left: his income exceeds ₹4 L). Selling all at once costs **₹75,140**; gifting to Lakshmi does not help (her gap is only ₹9,000; ₹73,580) | [Calc] | Gift test: engine must find that the gift is worthless here |
| Risk | Both T 25 → **30%**; Venkat K 85 (interest covers 108% of spending) → ceiling **30%** | [Calc] | Matches RISK case B |
| Insurance | Add a super top-up (₹20–25 L) on the ₹5 L base policies; keep the ₹10 L health corpus in FD | [J] | |
| Levers if short | Trim spending; the house (₹1.5 Cr) as last reserve (downsize or reverse mortgage); son's support | [J]; [OOS] reverse mortgage terms | |
| Estate | Wills for both; nominee on every FD, SCSS and folio; joint "either or survivor" on bank FDs | [J] | |

---

### 3.6 Archetype F: young couple, both earning, saving for a house and a child's education

**Fixture**

```json
{
  "id": "F-young-couple",
  "city": "Gurugram",
  "members": [
    {"id":"ananya","age":29,"relation":"self","panType":"person","regime":"new",
     "income":{"salary":1600000},"salaryStructure":{"basic":640000},"rentPaidYearly":420000},
    {"id":"kabir","age":31,"relation":"spouse","panType":"person","regime":"new","income":{"salary":2200000}},
    {"id":"child","relation":"planned child","expectedBirth":"2028"}
  ],
  "assets": [
    {"owner":"ananya","kind":"equity MF","taxType":"equity","value":400000,"cost":350000,"longTerm":true},
    {"owner":"ananya","kind":"EPF","taxType":"taxFree","value":300000},
    {"owner":"kabir","kind":"equity MF","taxType":"equity","value":700000,"cost":500000,"longTerm":true},
    {"owner":"kabir","kind":"direct shares","taxType":"equity","value":300000,"cost":350000,"longTerm":false},
    {"owner":"kabir","kind":"EPF","taxType":"taxFree","value":600000},
    {"owner":"ananya","kind":"bank FD (joint, her money)","taxType":"interest","value":500000}
  ],
  "loans": [{"kind":"car loan","borrower":"kabir","outstanding":500000,"rate":0.095,"monthsLeft":48,"emi":12562}],
  "expensesMonthly": 110000,
  "insurance": [{"member":"both","health":"employer only"},{"member":"both","term":0}],
  "goals": [
    {"id":"g0","kind":"emergency","tier":"essential"},
    {"id":"g1","kind":"house_purchase (₹1 Cr flat: 25% down + ₹7 L costs)","amountToday":3200000,"date":"2030-06","tier":"need"},
    {"id":"g2","forMember":"child","kind":"education_india","amountToday":2500000,"date":"2046-06","tier":"need"},
    {"id":"g3","forMember":"kabir","kind":"retirement_living","amountTodayMonthly":80000,"date":"2055-06","tier":"need"}
  ],
  "risk": {"ananya":{"W":[4,4,4,"slider 7",4]},"kabir":{"W":[5,4,4,"slider 9",4]},"household":{"K":[4,3,5,4,3]}}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Regime | Ananya: HRA exempt **₹2.56 L** (Gurugram is a 40% city); old ₹1,38,528 vs new **₹1,13,100** → new. Kabir: new **₹2,40,500** vs old ₹4,05,600 → new | [Calc] | Re-run after the 2030 home loan: joint borrowers get ₹2 L interest each only in the old regime [test: re-evaluate on loan event] |
| Marginal rates | Ananya 15.6% (taxable ₹15.25 L), Kabir 26% (₹21.25 L) | [Calc] | |
| Cash flow | Take-home ₹1,17,308 + ₹1,54,292 = ₹2,71,600; surplus after expenses, car EMI, ₹5,000 premiums **₹1,44,038** | [Calc] | |
| Emergency fund | 6 × (₹1.1 L + ₹12,562) = **₹7.35 L**; have ₹5 L FD; build ₹2.35 L over 6 months | [J] | |
| Insurance | Term ₹1.5 Cr Kabir, ₹1 Cr Ananya (before the house loan; raise by the loan amount in 2030); family floater ₹10 L + top-up before the child | [J] | Health cover with maternity waiting periods: buy before 2028 [J] |
| Placement without gifts | Each spends from own salary on the goal that suits own tax rate: the **house debt leg sits in Ananya's name from her own surplus** (on ≈₹25 L average balance: ₹27,300/yr tax vs ₹45,500 in Kabir's: **saves ≈₹18,200/yr**); Kabir's surplus goes to long-term equity | [Calc] | Gifts between spouses are clubbed; own-earned money is not. Test: the engine must place by *source of money*, not by gift |
| Debt | Car loan 9.5% vs Kabir's debt after tax 5.18%: prepay from his surplus once the EF is full | [J] | |
| Harvesting | Kabir: realise **₹1.75 L LTCG and the ₹50,000 short-term loss together** → net LTCG ₹1.25 L → **₹0** tax, both bases reset. Realising only the loss would waste it against exempt gains (SELL §3.3) | [Calc] | Set-off order test |
| Risk | Ananya T 75, Kabir T 85; shared goals use the **minimum** → 75%; K 70 → 80%. House goal 3.6 yrs → horizon cap 35% | [Calc] | RISK §4.5 shared-goal rule |
| Goal SIPs | House 2030 ₹32 L → FV ₹38.1 L → **₹75,100** (Ananya holds the debt; ₹76,000 if Kabir). Child UG 2046 → FV ₹1.13 Cr → **₹15,600**. Retirement 2055 (MFs ₹14 L earmarked) → **₹43,800** | [Calc] | |
| Waterfall | ₹1,44,038: EF ₹39,200 (6 months) → house ₹75,100 → child ₹15,600 → retirement gets ₹14,138 of ₹43,800: **short for 6 months**, then funded with ≈₹9,500 spare | [Calc] | |
| After the house | ₹75 L loan over 20 yrs at 8.5% → EMI ₹65,087 = 24% of today's take-home: within the 40–50% bank norm | [Calc] | Maternity income dip in 2028 not modelled [J] |

---

### 3.7 Archetype G: family with an adult child studying abroad

**Fixture**

```json
{
  "id": "G-child-abroad",
  "city": "Mumbai",
  "members": [
    {"id":"rajiv","age":50,"relation":"self","panType":"person","regime":"new","income":{"salary":4500000,"rent":240000}},
    {"id":"sunita","age":48,"relation":"spouse","panType":"person","regime":"new",
     "income":{"professional":600000,"presumptive":"s.58 (old 44ADA) at 50% → ₹3 L","interest":108750}},
    {"id":"isha","age":21,"relation":"daughter","panType":"person","residency":"likely non-resident from FY 2026-27 [OOS]","studying":"MS, USA, Aug 2026–May 2028"},
    {"id":"dev","age":16,"relation":"son","minor":true}
  ],
  "assets": [
    {"owner":"rajiv","kind":"equity MF","taxType":"equity","value":6000000,"cost":3000000,"longTerm":true},
    {"owner":"rajiv","kind":"direct shares","taxType":"equity","value":2000000,"cost":1200000,"longTerm":true},
    {"owner":"rajiv","kind":"EPF","taxType":"taxFree","value":4500000},
    {"owner":"rajiv","kind":"PPF","taxType":"taxFree","value":1400000},
    {"owner":"rajiv","kind":"NPS Tier 1","taxType":"inBetween","value":1800000},
    {"owner":"rajiv","kind":"bank FD (earmarked: Isha year 2)","taxType":"interest","value":3000000},
    {"owner":"rajiv","kind":"house, self-occupied","taxType":"property","value":25000000},
    {"owner":"rajiv","kind":"let-out flat","taxType":"property","value":9000000,"rentYearly":240000},
    {"owner":"sunita","kind":"bank FD","taxType":"interest","value":1500000},
    {"owner":"sunita","kind":"gold","taxType":"gold","value":2000000}
  ],
  "loans": [{"kind":"education loan","borrowers":["isha","rajiv"],"amount":4000000,"rate":0.10,"interestYearly":400000,"note":"80E eligible (old regime only)"}],
  "expensesMonthly": 150000,
  "insurance": [{"member":"rajiv","term":20000000},{"member":"family","health":"₹15 L floater + employer"}],
  "goals": [
    {"id":"g1","forMember":"isha","kind":"education_abroad (year 2 fees + living)","amountToday":4500000,"date":"2027-07","tier":"need"},
    {"id":"g2","forMember":"dev","kind":"education_india","amountToday":2500000,"date":"2028-07","tier":"need"},
    {"id":"g3","forMember":"rajiv","kind":"retirement_living","amountTodayMonthly":105000,"date":"2036-06","tier":"need"},
    {"id":"g4","forMember":"isha","kind":"wedding","amountToday":2500000,"date":"2032-12","tier":"wish"}
  ],
  "risk": {"rajiv":{"W":[3,4,4,"slider 6",4],"K":[4,4,3,5,4]},"sunita":"own profile, same answers"}
}
```

**Expert plan and expected outputs**

| Area | Recommendation | Figures | Notes |
|---|---|---|---|
| Regime | Rajiv: deductions in the old regime ₹6.75 L (80E ₹4 L + 80C ₹1.5 L + 1B ₹50k + 80D ₹75k): old **₹10,35,216** vs new **₹9,96,216** → new by ₹39,000. Sunita: ₹4.09 L → **₹0** | [Calc] | Test: a large 80E claim alone does not flip a ₹45 L earner (break-even ≈₹8 L) |
| Raising Isha's year-2 money (₹45 L, Jul 2027) | FD ₹30 L + ₹15 L of Rajiv's MF (₹7.5 L gain). All in FY 2027-28: tax **₹81,250**. Split: sell half in March 2027 (FY 2026-27) and half in April 2027: **₹65,000**, saving **₹16,250** | [Calc] SELL §3.1/§3.4 | Alternative lever: draw more of the education loan and keep equity invested [J] |
| TCS on remittance [OOS flag] | Self-funded LRS education remittances: TCS 2% on the amount above ₹10 L a year from 1 Apr 2026 (Budget 2026, reported) → on ₹50 L ≈**₹80,000** collected, creditable against Rajiv's tax. Loan-funded remittances: nil TCS (2025 rule, reported). LRS cap USD 250,000/yr | News reports of Budget 2026 [S11]; **primary text not read** | Engine shows it as a cash-flow timing item only |
| Isha's residency [OOS flag] | Abroad > 182 days → likely non-resident: the basic-exemption gap against capital gains is for residents only; NRI TDS on MF redemptions; FEMA account rules. **Do not use Isha as a harvesting or gift recipient** until residency is known | Law (TAX §3.9 "residents only") | Test: engine excludes a non-resident member from gap-based moves |
| Dev UG 2028 | Earmark the ₹20 L of direct shares (sell across FY 2026-27, 2027-28 to use ₹1.25 L each year) → SIP **₹33,600** (₹1,41,100 without the earmark) | [Calc] | |
| Retirement | At 60 (2036): target ₹5.03 Cr; EPF, NPS, PPF, MF (₹45 L after Isha's sale) reach ₹3.42 Cr → **₹86,900/month**. At 62 (2038): **₹53,600** | [Calc]; [J] NPS at 9% | Lever: retire at 62 |
| Waterfall | Surplus ₹1,33,782 (take-home + rent − ₹1.5 L − ₹10,000 premiums). EF 6 × ₹1.5 L = **₹9 L** earmarked from Sunita's FD (₹15 L, nil-tax holder) → Dev ₹33,600 → retirement ₹86,900 → **₹13,282 left**; Isha's wedding (wish) gets it: short | [Calc] | |
| Sunita | Keep the EF and other debt in her name (her money): ₹7.91 L of slab room. LTCG room ₹1.16 L. Gifts from Rajiv to her are clubbed | [Calc] | |
| Education loan | Interest gives no tax benefit in the new regime: treat it as a 10% loan; prepay from surplus after the moratorium if retirement is on track | [J] | |

---

## 4. Features the archetypes stress (one line each)

| Feature | Stressed by | What the test checks |
|---|---|---|
| Regime per member, both computed | A, C, D, F, G | Old vs new to the rupee; close calls (D ₹24,544, G ₹39,000) |
| ₹12 L cliff and marginal relief | A (Priya), B, E | Harvest cap ₹75,000 for Priya; ₹26,000 if exceeded |
| Basic-exemption gap for gains | B (Kokila), D (father), C (Jay after 18) | Room = ₹4 L − other income + ₹1.25 L; residents only (G) |
| Clubbing by relation and date | A, B, C, F, G | Spouse, son's wife, minors, HUF throw-in; majority on 10 Mar 2027 |
| Placement by source of money (no gift) | F | Debt leg in the lower-rate spouse's own name |
| Gift-then-sell, and when it is worthless | B (worth ₹42,900), E (worth ₹0) | Engine finds both |
| Risk cap of the receiving member | B | Harvesting through a 30%-cap parent |
| Shared-goal minimum willingness | F | 75% not 85% |
| EF override on new money | A, D | 40% cap until 3 months |
| Raise ₹X across tax years | C, G | ₹6,500 vs ₹22,750; ₹65,000 vs ₹81,250 |
| Loss set-off order | F | LTCG + STCL realised together |
| Priority waterfall and levers | A, B, C, D, F, G | Short goals named, levers in rupees and months |
| Family-level lever (grandparents' surplus) | B | Shown, never assumed |
| Spread goals (fees over years) | C, G | Per-tranche sizing |
| Null-move | E | No tax moves when every member is at nil tax |
| Retirement sustainability | E | Years to depletion; withdrawal rate flag |
| Advance tax schedule | C (presumptive, single instalment), B/E (seniors exempt) | Dates and amounts |
| Non-resident member flag | G | Excluded from gap moves; TCS shown as cash-flow note |
| Physical assets in net worth, not in EF | B, C, E | Land/gold/house excluded from emergency money |
| Insurance gap checks | A, B, C, D, F | Term vs 10–15×; parents' health |

---

## 5. Open questions

1. **Equity after-tax return of 10.0% flat** ignores each holder's harvesting room. Should Layer A use holder-specific after-tax equity returns (a nil-tax parent ≈10.6%)? Changes several SIPs by 2–5%.
2. **Retirement glide to 0% equity at the retirement date** (GOAL §3.2 table) is too conservative for money spent over 25 years; topic 7 should replace the 25× corpus and the end-date glide with a drawdown model. A and G retirement figures will move.
3. **EPF at 8.25% for 24 years** makes A's retirement look fully funded. Use a lower long-run EPF assumption (e.g. 7.5%) [J]?
4. **Waterfall: wants by date** puts A's car before the child's PG study. Do families accept that, or should "for a child" rank higher inside a tier?
5. **TCS on education remittances** (2% above ₹10 L; nil if loan-funded) and its section in the Income-tax Act 2025: read the Finance Act 2026 text.
6. **Presumptive s.58 table** (turnover limits, 6%/8% rates, digital-receipt condition) under the new Act: confirm from the Act; the fixture assumes 44AD carried over.
7. **Gifts to a parent who has other heirs** (B, D): should the app require a sibling-acknowledgement step, or only warn?
8. **Grandparent paying a grandchild's fees directly** (B) is not a gift to a minor and so not clubbed: confirm no deemed-income issue.
9. **Health inflation 6%** for retirees' spending (E) vs DATA's 5% general and 8% health: blend by spending mix?
10. **Calibration:** no public microdata links income, holdings and goals per household. AIDIS unit-level data (MoSPI) could be used later to check that the archetypes' asset mixes sit near real percentiles for their income band.

---

## 6. Sources

| # | Source | Used for | Label, confidence |
|---|---|---|---|
| S1 | RBI, *Report of the Household Finance Committee* (Jul/Aug 2017): [rbi.org.in](https://www.rbi.org.in/Scripts/PublicationReportDetails.aspx?ID=877) | Asset shares, debt mix, retirement, medical borrowing | Regulator/Data, High |
| S2 | MoSPI NSO, *All India Debt & Investment Survey, NSS 77th round (2019)*, press note 10 Sep 2021: [mospi.gov.in](https://www.mospi.gov.in/sites/default/files/press_release/press_note-AIDIS-240821.pdf) | Asset values and mix, indebtedness, debt per household | Data, High |
| S3 | SEBI, *Investor Survey 2025* main report: [sebi.gov.in](https://www.sebi.gov.in/sebi_data/commondocs/jan-2026/Investor%20Survey%202025%20Main%20Report.pdf); read via [Outlook Money summary](https://www.outlookmoney.com/invest/sebi-investor-survey-63-per-cent-households-aware-of-market-products-participation-lags-at-950-per-cent) | Awareness and participation | Regulator, High (figures via secondary) |
| S4 | NSE, *Market Pulse* Sep 2026: [nseindia.com](https://nsearchives.nseindia.com//web/mediaattachment/2026-09/Market_Pulse_September_2026_Final.pdf) | Unique investor count | Data, High (figure via search extract) |
| S5 | AMFI monthly data and AMFI-Crisil Factbook 2026, via press ([Angel One](https://www.angelone.in/news/mutual-funds/mutual-fund-industry-adds-7-64-lakh-unique-investors-in-february-total-crosses-6-09-crore); [Outlook Money](https://www.outlookmoney.com/invest/move-over-mumbai-delhi-women-in-mizoram-odisha-now-lead-indias-mutual-fund-boom)) | Unique MF investors, women share, SIP accounts, AUM per folio | Data (secondary), Medium |
| S6 | CAMS, *Women Investor Report 2026*: [camsonline.com](https://www.camsonline.com/assets/PDF/Report_Women_Investor_2026.pdf) | Average SIP ticket | Data, Medium (not opened; via search) |
| S7 | PRS Legislative Research, *Vital Stats: Direct Taxes in India* (23 Jul 2025), from CBDT ITR statistics: [prsindia.org](https://prsindia.org/files/bills_acts/bills_parliament/2025/Vital_Stats-Direct_Taxes_in_India.pdf) | Filers, zero-tax share, new-regime share | Data, High |
| S8 | CBDT figures via [StudyCafe](https://studycafe.in/72-of-taxpayers-opted-for-the-new-tax-regime-with-5-27-crore-itrs-filed-cbdt-337301.html) | New vs old regime counts AY 2024-25 | Regulator (secondary), Medium |
| S9 | PRICE ICE 360 via [ThePrint](https://theprint.in/india/middle-class-set-to-boom-in-india-avg-household-income-to-be-rs-20l-year-by-2047-finds-price-survey/1657450) and [Future IQ commentary](https://futureiq.substack.com/p/misconceptions-about-income-distribution) | Income-class bands | Data (survey, secondary), Medium; Opinion for the "top 20%" reading |
| S10 | RBI household savings data via [The Wire / The Hindu analysis](https://m.thewire.in/article/news/indian-household-debt-growing-twice-as-fast-as-assets-rbi-data-analysis-shows) and [TaxGuru](https://taxguru.in/?p=1045053) | FY 2024-25 savings flows | Data (secondary), Medium |
| S11 | Budget 2026 TCS changes: [Business Today, 1 Feb 2026](https://www.businesstoday.in/personal-finance/tax/story/budget-2026-fm-sitharaman-proposes-major-tcs-changes-on-overseas-tour-packages-education-medical-purposes-513917-2026-02-01); [Business Standard, 2025 (loan-funded nil)](https://www.business-standard.com/amp/budget/news/tcs-on-foreign-remittances-up-to-rs-10-lakh-none-on-foreign-education-loan-125020100857_1.html) | TCS on education remittances | Practitioner/news, Medium; primary not read |
| S12 | Presumptive taxation under the 2025 Act: [Taxmann](https://www.taxmann.com/post/blog/opinion-complexity-within-simplicity-presumptive-taxation-under-the-income-tax-act/); [TaxGuru](https://taxguru.in/income-tax/presumptive-taxation-residents-1961-act-via-a-vis-2025-act.html) | s.58 replaces 44AD/44ADA/44AE | Practitioner, Medium |
| S13 | Practitioner case studies: [Business Today 2018 (young couple)](https://www.businesstoday.in/amp/magazine/investment/story/financial-planning-of-a-young-couple-101963-2018-02-06); [Value Research, "First things first"](https://valueresearchonline.com/stories/34288/first-things-first); [Outlook Money, "A couple of good decisions"](https://www.outlookmoney.com/fixed-assets/a-couple-of-good-decisions-87) | Typical goals and gaps | Practitioner, Low–Medium (search summaries; not read in full) |
| — | Internal notes TAX, GOAL, DATA, PLACE, SELL, RISK (this folder) | Every tax rule, method and default used in the calculations | As labelled in each note |

All rupee figures marked [Calc] were computed with a small script implementing TAX §3.1 (slabs, rebate, marginal relief, gap, exemption, cess) and GOAL §3.3 Layer A; the script reproduces TAX worked examples 3, 4 and 5 and the GOAL §3.3 test case exactly. It was kept outside the repo.
