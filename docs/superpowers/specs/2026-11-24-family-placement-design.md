# Family placement: whose name the money should sit in

Design, 24 Nov 2026. Covers points 5 and 6 of the founder's 24 Nov feedback. Research behind it: `docs/research/2026-11-15-family-asset-placement.md` (the "placement note"). Read `docs/GUARDRAILS.md` first.

## 1. Intent

Today the Plan only uses other members to fill this season's tax-free room. It never says where family money should sit over the years. The founder noticed two things missing:

- **Point 5:** the app never said "put the next investment in this person's name".
- **Point 6:** the app never said "move this from the earner to a member who pays less tax on it".

The app should answer both with moves that show how much tax they save. It should not show a calculator the user has to drive. The founder said "What it brings home" (the Compare page) doesn't help for exactly that reason.

## 2. Decisions so far

| # | Decision | Who |
|---|---|---|
| D1 | Monthly investing is **guessed from tradebooks** (a fund bought in the same account on a steady day for a steady amount, in at least 3 of the last 4 months) and **confirmed by the user**, e.g. "You invest about ₹50k a month. Right?" The user can correct the amount and add SIPs the files don't show. | Founder agreed |
| D2 | New money for a non-clubbed relative goes as **one yearly gift**. The receiver runs the SIP from their own bank account. The move reads "Gift Mum ₹1.2 L once a year; she runs the ₹10k SIP in fund X." | Founder agreed |
| D3 | Existing holdings move by **gifting the units**, never "sell and buy again". A gift books nothing in the giver's name, and the receiver takes the giver's cost and holding period (old s.49 and s.2(42A); where this sits in the new Act is **unconfirmed**, NEXT-WORK F2, so the move says "check with your CA" until it is). | Founder agreed |
| D4 | **No ceiling** on how much goes to one member. Show the savings. | Founder |
| D5 | Approach **B, full family placement** (§4), not the simpler rule-by-rule version. | Founder |
| D6 | Spouse, own HUF, minor child and son's wife (the clubbed pairs, `clubbing()` in `engine/relations.ts`) are **never** suggested for the giver's money. One short line says they were considered and why they're left out. | Claude, from the tax rule |
| D7 | **The family's mix stays as it is.** Placement decides only whose name each fund or SIP sits in. It never changes what is bought. This replaces the placement note's "target split" (constraint C1), which the beta doesn't ask for, and keeps GUARDRAILS §6: the app never names a new security. | Claude's call |
| D8 | Givers are **individuals only** in this version. HUF money stays in the HUF: moving HUF property out raises partition questions for a CA. | Claude's call |
| D9 | Savings show as **"about ₹X less tax a year"**: the yearly average over a 10-year horizon in the base scenario. Tapping it shows the 10-year total and the assumptions. | Claude's call |
| D10 | Holdings known only from a holdings file (`approx` lots: long-term for sure, cost is the broker's average) **can** be placed. Their gain counts `1 + APPROX_MARGIN` times in the receiver's projection, as for harvest moves (GUARDRAILS §1). The move says the figure is an estimate. Without this, `place_holding` would rarely appear, since real imports now start from holdings. `estimated` lots stay out. | Claude's call (builder check) |
| D12 | The 10-year model assumes **yearly harvesting** of equity: each year every member takes long-term equity gains up to their free room (₹1.25 L plus any unused basic exemption), and the rest is sold at year 10. This matches what the Plan already tells families to do. Slab-taxed funds are sold once at year 10. | Founder (builder check) |
| D11 | **No two-way gifts.** For the whole plan each member is either a giver or a receiver, never both, and there are no cycles. Gifts both ways at once can be read as an exchange, which is a sale for both sides, and courts look through cross gifts (placement note §6). The swap pass and the brute-force oracle keep this constraint. | Claude's call (builder check) |

## 3. Goals, non-goals, anti-goals

**Goals**
- On the Plan, a section "Holding in another name" lists placement moves (an estimate, not advice: GUARDRAILS §6), biggest saving first, each with a one-line saving.
- It covers new money (SIPs, D1–D2) and existing holdings (gifts of units, D3).
- Every number comes from the one tax function (`taxForYear`) with each member's own income, regime, age and residency.
- It answers what the Compare page tried to. That page is removed on its own (NEXT-WORK E2); `nominalReturn` is reused here.

**Non-goals (this version)**
- No target family mix, emergency fund or goals. Those belong to the full planner.
- No PPF, SSY, SCSS or FD suggestions. Those would name a new product (GUARDRAILS §6).
- No loans to a spouse. Undecided in law; "ask your CA" only (PLANNER-NOTES, 15 Nov).
- No HUF as a giver (D8).
- No change to this season's harvesting moves.

**Anti-goals (a failure even if it works)**
- A move that **raises tax this year** for anyone. Gifts of units book nothing; a placement must never push a receiver over the ₹12 L line in a way the saving figure hides.
- A move into a **clubbed** name.
- A wall of text. Each move is one line plus a "Why?" tooltip (founder point 8).
- Placement silently **taking a receiver's tax-free room** that this season's harvest moves already use.
- Savings that only show because a member's **income was never entered**. Unknown income is treated as "no room" (as `UNKNOWN_INCOME` does today). The section then asks for the income instead of guessing.

## 4. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | Rule-by-rule: list each member's room (slab room under ₹12 L, ₹1.25 L long-term room, clubbing), then place SIPs and holdings one at a time, highest tax first | Small, easy to explain; can miss the best split near the ₹12 L line or when two funds compete for one member's room | Not picked |
| **B** | **Full family placement** (placement note §3.3): step-by-step greedy placement with the exact tax function, "regret" ordering and a swap pass, inside the family's current mix | Close to the best answer, handles the ₹12 L line and competing funds; about three times A's work | **Picked by the founder** |
| C | Reuse "What it brings home": run the 10-year projection per fund in each allowed name | Reuses code; every saving is a 10-year guess, which is what made the Compare page feel useless | Not picked |

The headroom-bucket method (placement note §3.6, close to A) is kept as a **test cross-check**: B must never do worse than it.

## 5. How it works

### 5.1 Inputs

- **Members:** income, regime, age, residency, links (existing `Member`). A member with no income entered gets no room (anti-goal above).
- **Monthly investing per giver** (D1): a new stored list of confirmed SIPs: `{ giverId, isin, monthly: Paise, confirmedAt }`. It is guessed on every compute from transactions and stored only when the user confirms or edits it.
- **Existing holdings:** each member's holdings from the engine, only **known lots** (known date and cost). Estimated lots and fund tax types still "check" are left out, as for harvest moves (GUARDRAILS §1).
- **Assumed returns:** `nominalReturn` by the fund's return class (`engine/planner.ts`, `engine/marketAssumptions.ts`), base scenario.
- **Rules:** `rulesFor(date)` per year. Future years use today's rules and today's incomes.

### 5.2 The problem

- **Choices:** for each confirmed SIP and each eligible existing holding, how much of it sits with each allowed holder.
- **Allowed holders** for a giver g are g plus every member m where `canGift(g, m)` holds.
- **Constraint:** the family's mix is fixed (D7). Each SIP's monthly total and each holding's unit total stay the same; only the split between names changes.
- **Objective:** the family's total tax over 10 years is as low as possible, evaluated per **effective owner** (the holder, or the giver if clubbed; clubbed holders are already excluded by `canGift`).
- **Sale rule (D12):**
  - **Equity:** harvested every year up to each holder's free room. The harvested gain is tax-free, and the units are bought back at the new cost. Whatever gain is left is sold at year 10 as long-term gains.
  - **Slab-taxed funds** (debt, conservative hybrid): sold once at year 10, taxed as slab income in that year.
  - **`other_lt` funds:** sold once at year 10 at 12.5%, using only any unused basic exemption.
  - **Year 1 is this tax year:** it starts from each member's booked gains and this season's sized moves.
  - **This replaces the placement note's `lump_at_end` default** (a 15 Nov Claude's call in PLANNER-NOTES).

### 5.3 Steps (placement note §3.3, adapted)

1. **Baseline:** everything stays where it is today. Record each member's 10-year tax.
2. **Greedy fill with regret:** move money in steps of `max(₹10,000, total / 400)`. At each step, compute for every fund with money still with the giver the tax saved by moving one step to its best allowed holder, and the "regret" (best minus second-best). Move the fund with the highest regret. Ties are broken by fixed order (fund ISIN, member id), so the result is deterministic.
3. **Swap pass:** try pairwise swaps and single moves between holders, step halving down to ₹5,000, keeping any that cut family tax by more than ₹100. Include the "cliff snap" for any member within ₹2 L above ₹12 L in any year.
4. **Clean-up:** drop any placement saving less than ₹1,000 a year. Round amounts to ₹1,000 (SIPs to ₹500 a month).
5. **This season first:** placement runs **after** this season's harvest and gift moves are sized. Their gains count in the receiver's current-year buckets, so placement never takes room the season's moves use.
6. **Moves out:** one move per (giver, receiver, fund):
   - `place_sip`: "Gift Mum ₹1.2 L once a year · she runs the ₹10k SIP in a conservative hybrid fund · about ₹X less tax a year".
   - `place_holding`: "Gift Mum 1,200 units of a conservative hybrid fund · about ₹X less tax a year".

   Moves get stable ids and go into `recommendations` as other moves do (GUARDRAILS §3).

### 5.4 What a move says

- **Headline:** one line, the saving in bold.
- **"Why?" tooltip:** whose name now and whose after, the tax in each name, and that the money becomes the receiver's for good, counts as their income and passes by their will or nominee. Gifts over ₹5 L get the 15 Nov cooling-off step.
- **Gift paperwork checklist:** bank transfer from the giver's account, signed gift letter, and for units the off-market or AMC transmission route.
- **Clubbed members, once per section:** "Not suggested for your spouse or the HUF: money you give them is still taxed as yours."
- **Nothing to suggest:** "Nothing to move to another name this season." (It also shows when holdings could not be placed: estimated lots, a season move still to do, an unknown fund type, so it claims no more than that.)
- **Income missing:** "Add Mum's income to see what moving money to her saves."
- **Wording:** "could save", never "recommended" or "you should" (GUARDRAILS §6). The Plan's disclaimer covers the section.

## 6. Constraints

- **Engine only** for the maths (`engine/`), pure TypeScript, no solver library (GUARDRAILS §7). Placement note estimate: under 50 ms for 5 members.
- **One tax function:** `taxForYear` and `rules.ts`, no literals.
- **Saved families:** the new confirmed-SIP list goes through `normalizeState` with a migration test. Old families load with an empty list.
- **Privacy:** tests use made-up families. Scripts over private data print counts only.
- **Worked numbers:** a hand-checked golden case, and the placement note §4 example reproduced.

## 7. Tests (from placement note §3.3)

- Golden case: the placement note's 5-member example.
- Brute force on small random families (2–3 members, 2–3 funds, ₹50k steps): within 0.5% of the best, equal in at least 95% of cases.
- Never worse than the baseline, nor than the headroom-bucket cross-check.
- Never a clubbed receiver; never an estimated lot; never pushes a member over ₹12 L unless the saving still beats the cliff cost.
- Placement never uses room a season move already used.
- Deterministic; independent of import order.
- SIP guessing: steady-day steady-amount funds found; one-off top-ups and stock buys ignored.

## 8. Left to the builder

- Exact SIP-detection thresholds beyond D1, tuned on a made-up tradebook.
- Where the "Confirm your monthly investing" prompt sits (Plan section head is the default).
- Step sizes and the swap-pass stop rule within the note's ranges.
- How the 10-year figure is shown in the tooltip.
