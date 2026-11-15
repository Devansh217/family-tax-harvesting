# Core feature list, backed by research

15 Nov 2026. A synthesis of the six research notes in this folder. Each feature names the evidence behind it and the note that holds the method. Read a feature's note before designing it.

| Short name | Note |
|---|---|
| **TAX** | `2026-11-15-family-financial-planning.md`: Indian tax rules FY 2026-27, planning process |
| **GOAL** | `2026-11-15-goal-based-planning.md`: goal sizing, glide paths, probability, multi-goal waterfall |
| **DATA** | `2026-11-15-india-returns-risk-inflation.md`: returns, volatility, correlations, inflation |
| **PLACE** | `2026-11-15-family-asset-placement.md`: which member holds which asset |
| **SELL** | `2026-11-15-tax-aware-selling-rebalancing.md`: raise ₹X, rebalance, harvest |
| **RISK** | `2026-11-15-risk-profiling.md`: SEBI rules, questionnaire, scoring |

## 1. What the research says the product should believe

1. **Tax savings in India come from yearly allowances that lapse on 31 March,** not mainly from deferring tax as in the US: each member's ₹1.25 L equity exemption, the unused nil band (₹4 L new regime), and the ₹12 L rebate headroom for slab-taxed income. (SELL §2, TAX §3.9, PLACE §2.2)
2. **Family members are the "accounts".** US asset-location research (0.1–0.6% a year) carries over once each member is treated as a tax schedule with limited room. The worked family saves about 0.9% a year. (PLACE §2.1, §4)
3. **A single assumed return gives about even odds.** Plans should be sized to a probability of success, shown as "7 in 10 market paths", with the bad-case shortfall in rupees. (GOAL §2.3, DATA §2.2)
4. **Indian equity needs time:** about 34% chance of loss over 1 year, 8% over 5, 3% over 10, none in 15-year periods, though the worst 15 years beat inflation by little. Equity is for goals 5–7+ years away. (DATA §2.2)
5. **Risk willingness and capacity are scored separately and never averaged.** The lowest of willingness, capacity and time-to-goal sets each goal's equity limit; a goal "needing" more return never raises it. (RISK §3.1, §4.3)
6. **India's FIFO rule changes the maths.** The cheapest rupee to sell is often not obvious, so selling needs breakpoints and look-ahead, not a simple rank. (SELL §2.4, §3.1)
7. **Moving from equity to debt is a taxable sale in India,** so de-risking uses new money first, then each member's yearly exemption over several years. No Indian app documents doing this. (GOAL §3.6)
8. **Gifts to relatives move assets in kind with no tax,** but are irrevocable and pass by the receiver's will. Every gift needs real transfer of control and paperwork. (PLACE §2.2, §6; TAX §3.10)

## 2. Features

Columns: **Why** gives the evidence; **Method** points to the section an engineer builds from; **Edge** marks what no Indian app documents today (per the research).

### 2.1 Foundation (designed; plan ready, not started)

| Feature | Why | Method | Edge |
|---|---|---|---|
| Every asset taxed correctly (5 tax types, AMFI categories, per-lot debt rule) | Debt and conservative hybrid are slab-taxed; dynamic allocation depends on the fund (TAX §3.9) | Foundation spec §4 | |
| What it brings home, per member | Same fund costs 0% to 31.2% depending on holder (TAX §4.2 ex. 1) | Foundation spec §5 | ✓ |
| ₹12 L cliff and marginal relief | ₹1 L more gains can cost ₹61,750 (TAX §4.2 ex. 3) | Foundation spec §4.3 | ✓ |
| Member profile with links, income sources, consent | Clubbing depends on any pair, not relation to the manager (TAX §3.10) | Foundation spec §3, §6.2 | |

### 2.2 Beta (this season, starts from holdings)

| Feature | Why | Method | Edge |
|---|---|---|---|
| **Where to put new money** across members and asset classes | ₹2.74 L tax saved over 5 years in the worked family (PLACE §4) | PLACE §3 ("regret" greedy, swap pass, cliff check); fallback PLACE §3.6 | ✓ |
| **Cheapest way to raise ₹X** | ₹45,370 better off than the high earner selling, in the worked example (SELL §4) | SELL §3.1 (per-person cost curves, cash-grid dynamic programming) | ✓ |
| **Harvesting with alerts** (existing, extended) | Allowances lapse on 31 March; buy back on T+1, not same day (SELL §2.4, §3.3) | SELL §3.3; foundation spec §6.5 events | |
| **Gift-then-sell** suggestions | No tax on gifts to relatives; receiver uses own room (TAX §3.10, PLACE §2.2) | SELL §3.3, PLACE §6 cautions | ✓ |
| Advance tax tracker | Due dates and interest rules (TAX §3.11); seniors without business income exempt | TAX §3.11 | |
| Regular-to-direct switch | Direct plans required for RIA implementation (RISK §2); cost drag (agenda topic 9) | Not yet researched in depth | |
| Capital gains schedule for the return | Required reporting even below exemption (TAX §3.9) | TAX §3.9 | |

### 2.3 Full planner (after beta feedback, target-first)

| Feature | Why | Method | Edge |
|---|---|---|---|
| **Risk profile per adult** (2-minute questionnaire) | SEBI Reg 16–17 make it a hard limit on advice; typical questionnaires explain under 15% of real risk-taking (RISK §2, §3.2) | RISK §4 (5 willingness questions, capacity from app data, consistency checks, 7 test cases) | ✓ |
| **Goals with probability of success** | Single return ≈ 50% odds (GOAL §2.3) | GOAL §3.3–3.4 (deterministic sizing + 2,000 block-bootstrap paths) | ✓ |
| **Multi-goal priority waterfall** | Needs before wants before wishes; levers in rupees and months (GOAL §2.4) | GOAL §3.5 | |
| **Glide path per goal, de-risked tax-aware** | Equity → debt is a taxable sale (GOAL §3.6) | GOAL §3.2, §3.6 | ✓ |
| **Rebalance on a tax budget** | Bands of 5 points, trade to band edge (SELL §2.2) | SELL §3.2 with "drift vs tax" slider | ✓ |
| Emergency fund and insurance checks | Planner order: protection before investing (TAX §2.2) | TAX §2.2; agenda topic 8 | |
| Retirement drawdown (SWP order) | Withdrawal sequencing research, translated (SELL §3.4) | SELL §3.4; agenda topic 7 | |
| Capital market assumptions as data, three scenarios | History vs forecasts differ 0.5–2 points (DATA §2.8) | DATA §3 table, reviewed every November | |

### 2.4 Public launch

| Feature | Why | Method |
|---|---|---|
| Consent to the completed risk profile, per adult client | SEBI: advice only after consent (RISK §2); an earning spouse or adult child is a separate client | RISK §4.5, §4.8 |
| 5-year records of profile, suitability and each advice with reasons | SEBI Reg 19 (RISK §4.8) | Foundation spec §6.2 records |
| AI-use disclosure | SEBI Reg 18(9) (RISK §2) | — |
| Fee within SEBI cap (₹1.51 L/family/yr or 2.5% of assets) | RISK §2 | — |

## 3. Changes the research suggests to the approved foundation spec

Not yet applied; review with the founder before building.

1. **Default assumed returns** (spec §5.2, plan Task 9): equity 11% (was 12%), FD 6.75% (was 7%), conservative hybrid 7.8% (was 8%); store as real returns over 5% CPI, with conservative/base/optimistic variants (DATA §3).
2. **Label single-return figures as an average,** or show the median (≈ 9.3% for equity) — DATA §5, GOAL §2.3.
3. **Gold's 12.5% long-term gains vs the ₹12 L rebate:** confirm treatment (PLACE §6). Affects "brings home" for gold.
4. **Short-term loss set-off order:** whether a short-term loss must offset long-term gains that would have been exempt (SELL §6). The spec's fixed order (Task 5) may need to become a choice that minimises tax.
5. **Free-trial ban citation:** the "Oct 2024 circular" in `PLANNER-NOTES.md` could not be traced; RISK cites the IA Regulations and Master Circular instead.

## 4. Open questions across the notes (need a CA, lawyer or primary text)

- Do s.196 / s.198 gains count toward the ₹12 L rebate test? (TAX, PLACE, SELL)
- Does in-app consent count as SEBI's "registered email" consent? (RISK)
- Gift cost and holding-period carry-over: which section of the new Act? (TAX, PLACE)
- Interest-free or market-rate loans to a spouse and clubbing. (TAX, PLACE)
- Gifting mutual fund units held outside demat. (PLACE, SELL)
- RBI October 2026 figures and repo rate, from rbi.org.in. (DATA)
- No Indian backtest of harvesting value, and no glide-path study on Indian data: candidates for the app's own analysis. (SELL, GOAL)

## 5. Research still to do (agenda topics 6–10 in `docs/PLANNER-NOTES.md`)

6. Family archetypes as fixed test cases. 7. Retirement income. 8. Debt and insurance in the plan. 9. Product universe (direct vs regular, index vs active in India). 10. Behaviour and explanation.
