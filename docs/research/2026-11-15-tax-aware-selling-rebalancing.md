# Tax-aware selling, withdrawal and rebalancing for an Indian family (FY 2026-27)

Research note, 15 Nov 2026. Research agenda topic 4 in `docs/PLANNER-NOTES.md`. Builds on the tax rules in `docs/research/2026-11-15-family-financial-planning.md` (sections 3.9–4) and on the engine in `prototype/src/engine/family.ts` (FIFO lots, `harvest_gain` / `harvest_loss` / `wait` / `gift` moves, `nowSaving` vs `laterSaving`).

Confidence labels: **High** = read in the source or settled law; **Medium** = read in a secondary source or abstract only; **Low** = my inference or unconfirmed.

---

## 1. Product summary

1. **One problem, three questions.** "Raise ₹X", "rebalance to target" and "harvest" are the same optimisation: choose how much to sell from each FIFO queue (one per member × demat account or folio × security) so that the family gets the cash or allocation it needs at the lowest tax, counting tax now and tax-free room used up.
2. **The family is the portfolio; the taxpayer is the tax unit.** Targets are set for the family as a whole. Tax is computed per *taxable person* (the member, or the parent for clubbed assets). That means the app can sell equity where it is free (a spouse with her own savings, a parent) and leave the high earner untouched.
3. **In India the biggest wins are allowances that expire each year, not deferral.** Each adult has ₹1.25 L of LTCG exemption a year. A low-income resident also has the unused basic exemption (up to ₹4 L in the new regime). An unused allowance is lost on 31 March. The US research's "tax alpha" (about 1% a year from loss harvesting) is mostly a deferral benefit. In India, filling these allowances is usually worth more.
4. **FIFO changes the maths.** India gives no specific lot choice: shares go FIFO per demat account, units FIFO per folio. The oldest lots usually carry the biggest gain per rupee, so the tax per rupee often *falls* the more you sell from one holding. A plain greedy "cheapest rupee first" can then pick the wrong holding. The algorithms below handle this with lot-boundary breakpoints and a per-taxpayer cost curve.
5. **Suggested default:** an exact per-taxpayer tax function, a per-taxpayer cost curve built greedily over breakpoints, and the curves combined across taxpayers by dynamic programming on a ₹1,000 grid. Small enough to run in the browser in milliseconds. It can be checked against brute force in tests.
6. **Rebalancing:** check monthly (it costs nothing in an app). Act when an asset class drifts 5 percentage points from target (25% relative for small sleeves), or in the January–March harvest window. Use new money, dividends and planned withdrawals first. Trade only back to the edge of the band, not all the way to target, unless the trade is free or cuts tax. Keep paid tax within a budget the user sets.
7. **Every suggestion carries its reason in rupees:** "Sell ₹3 L of Meena's index fund: ₹1.5 L gain, covered by her unused ₹4 L nil band, tax ₹0", and what the next-best alternative would have cost.
8. **Legal guardrails:** no same-day sell-and-buy-back of shares (it nets to an intraday trade). Rebuy shares on the next trading day or later. Show sham-transaction and bonus/dividend-stripping warnings. Treat gifts as real transfers. GAAR (₹3 Cr tax-benefit threshold) is unlikely to reach a retail family, but the court-made sham doctrine still can.

---

## 2. Findings with citations

### 2.1 Value of tax-loss harvesting (literature)

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| F1 | Loss harvesting on the 500 largest US stocks, 1926–2018, gave a pre-cost "tax alpha" of 1.08% a year at 35% short-term and 15% long-term rates. With the US 30-day wash-sale rule it fell to 0.82%. The value is larger in volatile, low-return periods. | Chaudhuri, Burnham & Lo, *FAJ* 76(3) 2020 | Paper, High (abstract) |
| F2 | Monte Carlo study: harvesting is worth most when stock-specific risk is high, average returns are low and dividend yield is high. A steady stream of new money keeps the benefit going. **Withdrawals reduce it.** Highest-in-first-out (HIFO) lot accounting adds value on top. | Berkin & Ye, *FAJ* 59(4) 2003 | Paper, High (abstract) |
| F3 | Harvesting is worth most in the first years. Once the portfolio's cost basis falls well below market value, fewer losses appear (the "lock-in" decay). | Arnott, Berkin & Ye, *J. Wealth Mgmt* 2001 | Paper, Medium (title and summary cited by UBS; not read) |
| F4 | In a 0% capital-gains bracket, harvesting losses has no value. Harvest **gains** to step up cost basis instead. A loss carried forward must be set against later gains, even ones that would have been taxed at 0%, so harvesting too many losses can backfire. The value of a loss depends on the tax rate **when it is used**. | Kitces (three articles, 2013–2022) | Practitioner, High (read) |
| F5 | India has no wash-sale rule. Zerodha says no regulation disallows harvesting. It also warns that selling and immediately buying back "could [be] question[ed] … during tax scrutiny". Its tool excludes synchronised and reversal trades and computes P&L by FIFO. | Zerodha support article (2026) | Practitioner, High (read) |

**Implication for India.** F1–F3 measure *deferral* plus the gap between short- and long-term rates. In India, equity STCG is 20% and LTCG 12.5%. The ₹1.25 L exemption and the basic-exemption gap give a **permanent** saving: a gain realised inside the allowance is never taxed. So the app should value moves in two buckets, as `family.ts` already does: `nowSaving` (tax cut this year) and `laterSaving` (future tax avoided by a cost step-up, uncertain and discounted).

### 2.2 Rebalancing

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| R1 | No frequency or threshold is optimal. Annual or semiannual checks with rebalancing at 5% thresholds give a reasonable balance between risk control and cost. Monthly monitoring with no threshold meant 1,008 rebalances (1926–2009); annual checks at 10% meant 15. Returns barely differed. | Jaconetti, Kinniry & Zilbering, *Best practices for portfolio rebalancing*, Vanguard 2010 (rev. 2015) | Institution, High (read in excerpt) |
| R2 | With proportional costs there is a **no-trade region** around the target. When the portfolio leaves it, trade only **to its boundary**, not back to the target. The region widens with costs and volatility. | Donohue & Yip, *JPM* 29(4) 2003; Holden & Holden 2013 (as summarised in a 2025 ScienceDirect paper) | Paper, High (abstracts) |
| R3 | Vanguard puts the value of disciplined rebalancing at about 14–48 bp a year, depending on the market studied. It puts the value of a tax-aware withdrawal order at 0–120 bp, largest when the client's accounts are of similar size. | Vanguard *Advisor's Alpha* (2022 LatAm; 2020 Europe) | Institution, Medium (excerpt; US/EU tax systems) |
| R4 | For DIY investors: check once or twice a year; rebalance when a major asset class is 5 points off or a small sleeve is 25% off (the "5/25" rule); use cash flows before selling. | Summitward summary of Vanguard and others | Practitioner, Medium |

**A tax drives the same logic as a trading cost.** Tax makes the no-trade region wider for holdings with large embedded gains. For holdings with losses or covered by unused allowances it shrinks to zero or less (selling them *earns* money).

### 2.3 Withdrawal sequencing and gain harvesting in low brackets

| # | Finding | Source | Type / confidence |
|---|---|---|---|
| W1 | The usual rule (taxable accounts first, then tax-deferred, then tax-free) is beaten by strategies that each year fill the low brackets with deferred-account withdrawals or conversions. The authors report these extend portfolio life and raise after-tax wealth. | Cook, Meyer & Reichenstein, "Tax-Efficient Withdrawal Strategies", *FAJ* 71(2) 2015 | Paper, Medium (abstract and CFA blog only) |
| W2 | Harvest income or gains at 0% when the low brackets would otherwise go unused. Bunching income into later years pushes it into higher brackets. | Kitces (F4) | Practitioner, High |

**Translation to India.** India has no IRA equivalents for most families: EPF, PPF and NPS have their own withdrawal rules. The bracket-filling idea still carries over one-to-one:
- each member's yearly allowances are the brackets to fill: ₹1.25 L LTCG exemption, the unused nil band (resident), and the new-regime ₹12 L rebate for slab income;
- avoid the ₹12 L cliff: special-rate gains count toward ₹12 L but the rebate does not cover their tax (planning note §4.2, Example 3);
- a systematic withdrawal plan (SWP) is a series of FIFO redemptions. Only the gain part of each redemption is taxed, so the early SWP years of an equity fund are mostly return of capital and taxed lightly.

### 2.4 Indian mechanics that constrain the algorithm

| # | Rule | Source | Type / confidence |
|---|---|---|---|
| I1 | FIFO per demat account for shares (old s.45(2A); CBDT Circular 768 of 1998). Units go FIFO per folio by RTA practice and CAS reporting. Specific lot choice is not available. | Planning note; Zerodha F5 | Ruling/Institution, High for demat, Medium for folios |
| I2 | Selling a holding and buying it back on the same day nets on the exchange and is treated as an **intraday (speculative) trade**, not a capital loss or gain. The shares must leave the demat through a delivery sale. Buy back on T+1 (the next trading day) or later. | Zerodha Z-Connect (Kamath) and TradingQnA | Practitioner, High (broker practice; the law follows the netting) |
| I3 | STT FY 2026-27: equity delivery 0.1% on buy and on sell; equity mutual fund redemption 0.001% (seller); intraday 0.025% on the sell side. Budget 2026 raised F&O rates only. Stamp duty 0.015% on purchases. | Groww, DSP, VRD Nation (Budget 2026 summaries) | Practitioner, Medium–High |
| I4 | Exit loads are scheme-specific (commonly 1% if redeemed within 12 months for equity funds). They come off the redemption value and so lower the sale value for gains. | Scheme SIDs (general knowledge; not re-read) | Low–Medium, read per scheme from data |
| I5 | GAAR is in ss.178–183 of the 2025 Act. It applies only when the tax benefit to all parties in the year exceeds ₹3 Cr (Rule 128(1)(a), formerly Rule 10U). CBDT amended the grandfathering rules in April 2026. | Finexo (Nov 2026); EY alert (Apr 2026); DEA Shome report (₹3 Cr origin) | Practitioner/Institution, Medium–High |
| I6 | Courts allow tax planning within the law ("tax planning may be legitimate provided it is within the framework of law. Colourable devices cannot be part of tax planning", *Azadi Bachao Andolan*, SC 2003). | SC judgment PDF (Taxsutra) | Ruling, High |
| I7 | A loss on a real sale for real consideration, with no continuing beneficial ownership, was allowed even though the sale was tax-motivated (*Michael E. Desa*, ITAT Mumbai 2021, 130 taxmann.com 314). | Cyril Amarchand blog | Ruling (via practitioner), High |
| I8 | Revenue still attacks loss creation as a "colourable device" under *McDowell*. In *Bindu Parag Mody v. ACIT* (ITAT Panaji, ITA 304/PAN/2025, 30 Jun 2026) a ₹6.16 Cr STCL on IT shares was challenged as bonus stripping. The tribunal sent the case back for fresh decision. | Indian Kanoon | Ruling, High (read) |
| I9 | Bonus and dividend stripping (old s.94(7), (8), extended to all securities in 2022). A loss is ignored if the lot was bought within 3 months before the record date and sold within 3 months (dividend) or 9 months (bonus) after it. | Old-Act knowledge; new-Act section **not confirmed** | Low–Medium |

---

## 3. Recommended algorithms

### 3.0 Shared model

```
TaxPerson   = member, or the clubbing owner for lots funded by gifts to a spouse,
              son's wife or minor (planning note §3.10). Room and tax are per TaxPerson.
Queue       = (memberId, account|folio, isin): lots in FIFO order (existing HoldingLot[]).
Breakpoint  = a quantity in a Queue where something changes:
                - each lot boundary (term or gain-per-rupee changes)
                - the quantity at which the TaxPerson's cumulative realised gain hits
                  a room edge (end of nil-band gap, end of ₹1.25 L exemption,
                  ₹12 L total-income edge, surcharge edges)
                - the exit-load-free date boundary (lots inside the load window)
Segment     = the sale between two consecutive breakpoints:
                { qty, cash = value − exitLoad − costs, stGain, ltGain, slabGain }
                (debt funds bought from 1 Apr 2023: slabGain; equity: st/ltGain)
taxOf(p, S) = the engine's exact tax for TaxPerson p, given booked + planned
              realisations S, with:
                1. slab income, then the nil-band gap applied to slab income first,
                   the rest to STCG, then LTCG (s.196(2), s.198(3))
                2. set-off: STCL against STCG first, then LTCG; LTCL against LTCG
                   only; brought-forward losses the same way (s.108, s.111)
                3. ₹1.25 L LTCG exemption after set-off
                4. ₹12 L rebate on slab tax only, with marginal relief, special-rate
                   gains counted in total income (s.156)
                5. surcharge (capped at 15% on 196/198 gains) and 4% cess
```

Make `taxOf` the single source of truth (it already exists in `tax.ts`). Every algorithm below calls it, never an approximation, and the tests check it against the planning note's worked examples 1–3.

**Cost of a step.** For a candidate segment `s` added to plan `P`:

```
Δnow(s)   = Σ_p taxOf(p, P ∪ s) − taxOf(p, P)                // tax this year, can be < 0
Δroom(s)  = room used by s that this TaxPerson would otherwise fill with a gain
            harvest this year (0 if their harvestable gains < their room)
shadow    = λ × 12.5% × 1.04                                  // value of room, default λ = 0.5
costs(s)  = STT + exit load + DP + brokerage (+ next-day rebuy costs for harvests)
eff(s)    = (Δnow + shadow × Δroom + costs) / cash(s)          // ₹ of cost per ₹ raised
```

λ discounts future, uncertain savings (it is the `laterSaving` weight). Show it as "how much we count tax saved later: half". The **room shadow price** is the key Indian refinement. If a member has more unrealised long-term gain than room, their room will be used by a gain harvest anyway. Spending it on a cash need then displaces a free step-up, so it is not free. If their room exceeds their gains (a parent with a small folio), it is truly free.

### 3.1 Algorithm A: raise ₹X with least tax ("Cheapest way to raise ₹X")

**Input:** target cash X (net of costs), date by which cash is needed, excluded holdings (`needSoon`, goal-locked, user-pinned), allowed sellers.

**Step 1: per-TaxPerson cost curve (greedy over breakpoints, recomputed).**

```
for each TaxPerson p:
  P_p = ∅; curve_p = [(0, 0)]
  frontier = first segment of each of p's Queues          // FIFO: only the head is sellable
  while frontier not empty and cash(P_p) < X:
    for each queue q: consider the head segment AND every prefix of q up to
        the next K breakpoints (K = 3 by default)          // look-ahead fixes the FIFO
                                                          // non-convexity: a cheap later lot
                                                          // is reachable only through an
                                                          // expensive older one
    pick the option with the lowest eff (average over the prefix)
    apply it (P_p ∪= option); append (cash, Σ cost) to curve_p
  make curve_p the lower convex hull plus all original points (keep both:
      the hull for the DP, the points for exact replay)
```

**Step 2: combine TaxPersons (min-plus DP on a grid).**

```
G = ₹1,000 grid; N = ceil(X / G)
F_0 = [0, ∞, ∞, …]
for each TaxPerson p: F_p[c] = min_{k ≤ c} F_{p−1}[c − k] + curve_p(k)   // O(P × N²)
answer = argmin F_P[c] for c ≥ N, then backtrack the k chosen per TaxPerson
```

With 8 taxpayers and X = ₹50 L (N = 5,000) this is 200 M ops. That is too heavy, so use G = max(₹1,000, X/1,000), which gives at most 8 M ops (under 50 ms in a browser). TaxPersons are independent in tax, so the DP is exact given the curves.

**Step 3: improvement pass.** Replay the chosen plan with exact `taxOf`. Then try 1-for-1 swaps: remove the last segment of one person, add the next segment of another. Accept any swap that lowers total `eff`. Stop when none does, or after 50 rounds.

**Step 4: guardrails before showing.**
- **₹12 L cliff:** if any person's total income crosses ₹12 L because of the plan, try shifting the excess to another person. Re-run Step 2 with that person capped at the cliff.
- **Short-term to long-term in ≤ 90 days:** if a lot turns long-term before the cash date, offer the existing `wait` move and show its saving.
- **Cash timing:** equity sales settle T+1; MF redemption payout takes about 1–3 working days by category (Medium confidence). Flag if the cash date is too close.
- **Gifts out:** cash raised from someone other than the person who needs it is a gift between relatives (exempt, s.92). Label it as in the cross-member gift decision.
- **Minimum size:** drop steps whose saving versus the next-best option is below `MIN_NET_SAVING` (₹500), so the plan does not fragment.

**Fallbacks.**
- *If the DP is too slow or the curves are odd:* plain greedy with recomputation over segments (Step 1 run across all persons at once). Typically within a few percent of the optimum; tests should measure the gap.
- *For tests:* brute-force enumeration of all breakpoint combinations on instances with ≤ 3 persons and ≤ 8 segments. Assert the DP + swap result equals the brute-force optimum within ₹1.
- *Exact alternative, not needed for beta:* a mixed-integer model with binary "segment fully taken" variables and piecewise-linear tax per person. Leave it out of the browser. Use it only as an offline check if the gap above shows up.

**Explanation template (one card per sale):**
> **Sell ₹3,00,000 of Meena's Nifty index fund (folio …123).** Gain ₹1,50,000, long term. Meena has no other income, so ₹4 L of her nil band is unused; the gain is fully covered. **Tax ₹0.** Next cheapest alternative: Ravi's debt fund, ₹9,360 tax for the same cash. Meena's money: if you use it for the family, it is a gift from her (no tax between relatives).

Every card: amount, member, account, gain type, which allowance covers it, tax in rupees, the runner-up and its cost. A summary line: "Plan tax ₹−10,400 (you get back ₹10,400 of tax already due) vs ₹34,970 if Ravi sold his own index fund."

### 3.2 Algorithm B: rebalance to target within a tax budget

**Input:** family target weights per asset class (from the risk profile, planner topic 5), bands, tax budget B (rupees of `Δnow` the user accepts; default ₹0), cash flows expected in the next 3 months.

```
1. Compute family weights w (by asset class, across all members).
2. If no class is outside its band (±5 pts absolute, or ±25% relative for classes
   with target < 20%) and today is not in the Jan–Mar window: do nothing.
3. Absorb with cash flows first: direct new money, SIP changes, dividends and
   scheduled SWPs to underweight classes. Buys go to the member who is the best
   holder for that class (placement, topic 3). Recompute w.
4. Need D_k = rupees to sell from each overweight class k to bring it to the
   band EDGE (Donohue & Yip). Buys to the underweight edge are funded from the sales.
5. Sell segments of class k in increasing eff order (Algorithm A's machinery,
   restricted to class k), in three passes:
     a. eff ≤ 0 (losses that cut tax now, room that is truly free): take them
        even past the band edge, up to the TARGET, because they cost nothing
     b. 0 < Δnow and Σ Δnow ≤ B: take until D_k is met or the budget is spent
     c. stop. Report the remaining drift and "₹Y more tax would bring you to target"
6. Buys: put the proceeds into underweight classes, in the name of the member
   where the class is best held (topic 3). Rebalancing is family-level: selling
   equity in member A and buying debt in member B is a normal outcome.
7. If B = 0 and drift remains beyond band + 5 pts, show a soft warning.
   Never force a taxable sale.
```

**The budget trade-off curve.** Run step 5 for B in {0, ₹5k, ₹10k, ₹25k, ₹50k, unlimited} and show "drift left" against "tax paid". This is the Lagrangian frontier. Let the user pick a point, with the default at the knee.

**Fallback:** if no target exists yet (beta starts from holdings), skip B. Offer only Algorithm C and "Cheapest way to raise ₹X".

### 3.3 Algorithm C: harvest while rebalancing (and on its own)

Runs after A or B, on what is left, and in the existing `computeFamily` move generator:

```
for each TaxPerson p:
  freeRoom_p = nilGapLeft_p (resident, after slab income) + 1.25 L − LTCG_used_p
  1. Gain harvest: sell-and-rebuy long-term lots in FIFO order until realised LTCG
     = freeRoom_p. Lot must be certain (HoldingLot.certain). Not `needSoon`.
     Check the ₹12 L test: stop where total income would cross ₹12 L if p has slab income.
  2. Short-term gains: harvest only inside the nil-band gap (they use the gap at 20%),
     never otherwise.
  3. Loss harvest: realise a loss only if, after mandatory set-off, it cuts tax
     THIS year at a positive rate, or the user has a clear future use
     (Kitces F4). Specifically:
       STCL: worth it if p has STCG > 0 or LTCG > ₹1.25 L this year
       LTCL: worth it only if p's LTCG this year > ₹1.25 L (otherwise the
             set-off eats exempt gains: LTCL is set off BEFORE the exemption)
     Value = Δnow at the rate it actually offsets. Carry-forward value = 0.5 ×
     12.5% × 1.04 × amount (λ-weighted), shown separately.
  4. Gift-then-sell suggestion: if member q (not clubbed with p) has free room
     and p has no room left, suggest gifting p's long-term units to q, who sells
     and rebuys. Show it as a `gift` move with the clubbing and ownership wording.
Timing for every rebuy:
  shares/ETFs: sell on day T, rebuy on T+1 or later (never the same day: I2)
  mutual funds: redeem, then repurchase on the next business day after the
                redemption NAV date; the new units join the end of the FIFO queue
Skip if: lot bought ≤ 3 months before a dividend/bonus record date (I9 risk);
         exit load applies; net saving < ₹500.
```

**Season:** run continuously, but highlight mid-January to the last trading days of March (the tax year ends 31 March). Do not leave sales to the final day, because of T+1 settlement and NAV cut-offs. Advance tax: s.425(4) waives interest on a shortfall caused by capital gains if it is paid in the remaining instalments. Remind about the 15 March instalment after any taxable sale.

### 3.4 Withdrawal / SWP sequencing (retirement and goal draw-downs)

For a recurring need (₹Y a month for a retired parent, or college fees over 4 years):
1. Run Algorithm A per year, not once: each tax year gets fresh allowances. Spread a large need over two tax years if the cash date allows (for example, sell half in March and half in April).
2. Default order *within each year* (from W1 and W2): sources with eff ≤ 0, then gains that fit inside allowances, then slab income kept under ₹12 L per member, then the lowest-rate taxable source. In practice that usually means each low-income member's equity gains up to ₹5.25 L, then debt redemptions in members far below ₹12 L, and the high earner last.
3. SWP setup suggestion: pick the fund and the member whose FIFO head has the lowest gain per rupee and who has room.

---

## 4. Worked example (raise ₹10 L on 15 Nov 2026)

All figures include 4% cess; no surcharge applies. New regime for everyone. Costs: equity MF STT 0.001% (about ₹9 here), stock STT 0.1% (₹150); ignored in the totals below.

**Family and holdings**

| Member | Other income FY 26-27 | Holding (FIFO order) | Value | Gain | Term |
|---|---|---|---|---|---|
| Ravi, 40 | Salary ₹30 L; STCG ₹60,000 already booked | Index fund A1 (Jun 2020) | 4,00,000 | 2,40,000 (60%) | LT |
| | | Index fund A2 (Mar 2024) | 3,00,000 | 90,000 (30%) | LT |
| | | Index fund A3 (Feb 2026) | 2,00,000 | 10,000 | ST |
| | | Stock XYZ (Jan 2026) | 1,50,000 | −50,000 | ST |
| | | Debt fund (bought 2024; slab) | 3,00,000 | 60,000 (20%) | slab |
| Meena (spouse), 38 | None; holding bought from **her own** pre-marriage savings (not clubbed) | Index fund B | 3,00,000 | 1,50,000 (50%) | LT |
| Asha (mother), 68 | FD interest ₹2,00,000 | Index fund C | 4,00,000 | 2,00,000 (50%) | LT |

Room: Ravi ₹1.25 L LTCG exemption (no nil-band gap). Meena ₹4 L gap + ₹1.25 L = ₹5.25 L. Asha ₹2 L gap + ₹1.25 L = ₹3.25 L.

**Naive plan: Ravi sells his own index fund, FIFO.** A1 ₹4 L + A2 ₹3 L + A3 ₹2 L, then ₹1 L of the debt fund.
- LTCG ₹3.3 L − ₹1.25 L = ₹2.05 L × 12.5% × 1.04 = **₹26,650**
- STCG ₹10,000 × 20.8% = **₹2,080**
- Debt gain ₹20,000 × 31.2% = **₹6,240**
- **Total ₹34,970.** It also uses up Ravi's whole ₹1.25 L exemption.

**Algorithm A** (λ = 0.5, shadow = 6.5% per rupee of room). Ravi has ₹3.4 L of LT gain against ₹1.25 L of room, so his room is binding. Meena's and Asha's rooms exceed their gains, so their room is free.

| Rank | Segment | Cash | Δnow | Room cost | eff |
|---|---|---|---|---|---|
| 1 | Ravi XYZ (loss ₹50,000 offsets booked STCG at 20%) | 1,50,000 | −10,400 | 0 | −6.9% |
| 2 | Meena B, all | 3,00,000 | 0 (gain ₹1.5 L inside ₹5.25 L) | 0 | 0% |
| 3 | Asha C, all | 4,00,000 | 0 (gain ₹2 L inside ₹3.25 L; total income ₹4 L ≪ ₹12 L) | 0 | 0% |
| 4 | Ravi A1, ₹1.5 L (gain ₹90,000 inside his exemption) | 1,50,000 | 0 | 90,000 × 6.5% = 5,850 | 3.9% |
| — | runner-up: Ravi debt fund, ₹1.5 L (gain ₹30,000 at 31.2%) | 1,50,000 | 9,360 | 0 | 6.2% |

**Result:** ₹10,00,000 raised. **Tax this year −₹10,400** (Ravi's bill falls). The naive plan cost ₹34,970, so the family is **₹45,370 better off now.** Ravi still has ₹35,000 of exemption left. Algorithm C then suggests harvesting it: sell and rebuy about ₹58,300 more of A1 (₹35,000 gain, tax ₹0, later saving about ₹4,550 at 13%).

**Sensitivity shown to the user.** With λ = 1 (count future savings in full), row 4 costs 7.8%, more than the debt fund's 6.2%. The app would then pick the debt fund (₹9,360 tax now). The card says so: "We chose to use Ravi's exemption rather than pay ₹9,360 on his debt fund, because the exemption's value is only realised when he sells later."

**Labels the plan must carry:** Meena's ₹3 L and Asha's ₹4 L, if spent on the family need, are gifts from them (exempt between relatives). Meena's result depends on the holding being from her own money. If Ravi had gifted it to her, the gain would be clubbed to Ravi and her room would not apply. The engine must model the TaxPerson, not only the account holder.

---

## 5. Features this enables (one line each, with evidence)

1. **Cheapest way to raise ₹X:** Algorithm A, per-member rupee cards. Evidence: worked example saves ₹45,370 on ₹10 L. Order follows W1/W2 bracket-filling.
2. **Yearly allowance tracker (₹1.25 L + nil gap per member)** with "use it before 31 March". Evidence: planning note §1 items 3 and 4; F4.
3. **Harvest inside every sale and rebalance** (Algorithm C). Evidence: F2 (harvest value persists with cash flows), R2.
4. **Smart loss harvesting that refuses useless losses** (LTCL when LTCG ≤ ₹1.25 L). Evidence: F4, s.108 set-off order.
5. **Rebalance on a tax budget, with a drift-vs-tax slider.** Evidence: R1–R3 (5% bands, trade to edge).
6. **Family-level rebalancing across members:** sell where free, buy where best held. Evidence: Algorithm B step 6; topic 3 placement.
7. **₹12 L cliff guard** on any sale plan. Evidence: planning note Example 3 (62% effective rate).
8. **"Wait N days" for short-term to long-term** inside A. Evidence: existing `wait` move; STCG 20% vs LTCG 12.5% and exemption.
9. **Two-tax-year split** for large needs near March/April. Evidence: allowances reset each year (W1 logic).
10. **SWP designer:** which member's fund to draw from, and how much a month, so the gain stays inside allowances. Evidence: §3.4, W1.
11. **Gift-then-sell suggestion** to an adult child or parent with room, labelled as a gift. Evidence: s.92, s.99; planning note Example 2.
12. **Next-day rebuy reminder and same-day block.** Evidence: I2.
13. **Advance-tax nudge after a taxable sale.** Evidence: s.425(4).

---

## 6. Legal cautions and open questions

**Cautions to show in the app**
1. **Same-day buy-back is not a harvest.** It nets to intraday and becomes speculative business income (I2). Always T+1 or later for shares and ETFs.
2. **Sham and colourable-device risk survives without GAAR.** GAAR needs over ₹3 Cr of tax benefit (I5), but courts can still disregard a transaction with no substance (*McDowell*; I8). Our harvests are real sales at market price with a real gap in ownership (overnight market risk). This is closest to *Michael E. Desa* (I7) and *Azadi Bachao* (I6), but **no Indian ruling specifically on retail sell-and-rebuy harvesting was found.** Label harvesting "legal, widely used, not specifically ruled on". Keep a record of each harvest.
3. **Gifts must be real.** A gift to a parent or adult child who sells and hands the money straight back invites a sham or "benefit of the transferor" argument (s.99(1)(d) routing). The app should not suggest a round trip. A gift should serve a real purpose (the member keeps or uses the money).
4. **Clubbing.** Spouse, son's wife and minor child: income from gifted assets goes back to the giver. Their "room" does not apply to gifted money (Algorithm A's TaxPerson).
5. **Bonus and dividend stripping** (I9): block loss harvests on lots bought within 3 months before a record date.
6. **Investment advice.** "Sell X" is a recommendation. During the soft launch, show a disclaimer. Before the public launch it needs the RIA risk profile and a record of each recommendation (PLANNER-NOTES).

**Open questions**
1. Can a taxpayer choose to set STCL against STCG (20%) before LTCG (12.5%)? Or, with no STCG, must it be set against LTCG that would have been exempt? The ITR utility's order and any CBDT guidance under the 2025 Act were not checked. Engine default: the most beneficial order, flagged.
2. New-Act section numbers for bonus and dividend stripping (old s.94(7), (8)) and for FIFO in demat (old s.45(2A)) were not confirmed.
3. MF unit transfers between family members outside demat (for gift-then-sell of SOA units): which cases RTAs allow today. Demat units can be gifted off-market.
4. Settlement and payout times for MF redemptions by category in 2026 (to plan "cash by date").
5. Whether a sell-and-rebuy of the **same** mutual fund scheme on the next day draws scrutiny differently from shares. No ruling found.
6. The right λ: survey users, or set it by horizon (λ = 1/(1+r)^h, with h the expected years to final sale).
7. Cook/Meyer/Reichenstein and Arnott/Berkin/Ye were read only as abstracts or summaries. No Indian study of harvesting value exists that I found. A backtest on NSE/AMFI data (topic 2) would size the benefit for Indian families.

---

## 7. Sources

**Papers**
- Chaudhuri, Burnham, Lo, "An Empirical Evaluation of Tax-Loss-Harvesting Alpha", *Financial Analysts Journal* 76(3), 2020. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3351382 ; https://ideas.repec.org/a/taf/ufajxx/v76y2020i3p99-108.html (Paper, High)
- Berkin, Ye, "Tax Management, Loss Harvesting, and HIFO Accounting", *FAJ* 59(4), 2003. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=489647 (Paper, High)
- Arnott, Berkin, Ye, "Loss Harvesting: What's It Worth to the Taxable Investor?", *Journal of Wealth Management*, 2001; cited in https://www.ubs.com/us/en/wealth-management/insights/market-news/article.3882280.html (Paper, Medium)
- Cook, Meyer, Reichenstein, "Tax-Efficient Withdrawal Strategies", *FAJ* 71(2), 2015. https://ideas.repec.org/a/taf/ufajxx/v71y2015i2p16-29.html ; https://rpc.cfainstitute.org/blogs/enterprising-investor/2015/exploring-tax-efficient-withdrawal-strategies (Paper, Medium)
- Donohue, Yip, "Optimal Portfolio Rebalancing with Transaction Costs", *Journal of Portfolio Management* 29(4), 2003. https://www.pm-research.com/content/iijpormgmt/29/4/49 (Paper, High)
- "Optimal rebalancing strategies reduce market variability", 2025 (summarises Holden & Holden 2013). https://www.sciencedirect.com/science/article/pii/S2405918825000030 (Paper, Medium)

**Institutions**
- Jaconetti, Kinniry, Zilbering, *Best practices for portfolio rebalancing*, Vanguard 2010/2015. https://indexacapital.com/bundles/unaiadvisor/docs/papers/2010-Vanguard-Best-practices-for-portfolio-rebalancing.pdf (Institution, High)
- Vanguard, *Putting a value on your value: Quantifying Advisor's Alpha* (2022; Europe 2020). https://www.vanguardsouthamerica.com/content/dam/intl/americas/documents/latam/en/2022/08/mx-sa-2335954-putting-a-value-on-your-value-quantifying-vanguard-advisors-alpha.pdf ; https://www.ch.vanguard/content/dam/intl/europe/documents/en/putting-a-value-on-your-value-quantifying-vanguard-adviser-alpha-eu-en-pro.pdf (Institution, Medium)
- EY India, CBDT amends Rules on GAAR grandfathering (Apr 2026). https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/technical/alerts-hub/documents/2026/04/cbdt-amends-income-tax-rules-to-clarify-gaar-grandfathering-provisions.pdf (Institution, Medium)
- DEA, Final Report on GAAR (Shome Committee), ₹3 Cr threshold. https://dea.gov.in/files/other_reports_documents/report_gaar_itact1961.pdf (Institution, High for history)

**Rulings**
- *Union of India v. Azadi Bachao Andolan*, Supreme Court, 2003. https://www.taxsutra.com/sites/default/files/taxsutra.com/source_report/RT/attachment/TS-5-SC-2003-Azadi_Bachao_Andolan.pdf (Ruling, High)
- *Michael E. Desa*, ITAT Mumbai, 2021, [2021] 130 taxmann.com 314, via https://tax.cyrilamarchandblogs.com/2021/10/tax-motivated-transaction-ipso-facto-may-not-be-regarded-as-sham/ (Ruling via Practitioner, High)
- *Bindu Parag Mody v. ACIT*, ITAT Panaji, ITA 304/PAN/2025, 30 Jun 2026. https://indiankanoon.org/doc/41386236/ (Ruling, High)

**Practitioners**
- Zerodha Support, "What is tax loss harvesting?" (2026). https://support.zerodha.com/category/console/reports/taxation/articles/what-is-tax-loss-harvesting (Practitioner, High)
- Zerodha Z-Connect, "Tax loss harvesting" (Kamath; same-day = intraday, rebuy T+1). https://zerodha.com/z-connect/taxation-for-traders/tax-loss-harvesting (Practitioner, High)
- Kitces, "Harvesting losses vs harvesting gains"; "When NOT to use tax-loss harvesting"; "Mechanics of the 0% LTCG rate". https://www.kitces.com/blog/harvesting-losses-or-harvesting-gains-planning-around-four-long-term-capital-gains-tax-rates/ ; https://www.kitces.com/blog/tax-loss-harvesting-market-downturn-capital-gains-rate-tax-bracket-arbitrage/ ; https://www.kitces.com/blog/understanding-the-mechanics-of-the-0-long-term-capital-gains-tax-rate-how-to-harvest-capital-gains-for-a-free-step-up-in-basis/ (Practitioner, High)
- Finexo, "GAAR explained: Income Tax Act 2025 (ss.178–183)", Nov 2026. https://finexo.in/blog/income-tax-act-2025/general-anti-avoidance-rule-explained-income-tax-act-2025 (Practitioner, Medium)
- Groww, "STT in India (Budget 2026)". https://groww.in/blog/what-is-stt ; VRD Nation STT 2026: https://www.vrdnation.com/stt-cash-fno-intraday/ (Practitioner, Medium–High)
- Summitward, "How often to rebalance" (5/25 rule summary). https://summitward.com/learn/how-often-to-rebalance (Practitioner, Medium)

**Internal**
- `docs/research/2026-11-15-family-financial-planning.md` §3.9–4 (rates, set-off, nil gap, ₹12 L cliff, clubbing) and `prototype/src/engine/family.ts` (FIFO lots, move kinds).
