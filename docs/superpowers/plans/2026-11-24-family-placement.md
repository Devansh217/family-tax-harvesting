# Family Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Where money should sit" section on the Plan that suggests gifting SIP money or existing fund and share units to a lower-taxed, non-clubbed relative, each with "about ₹X less tax a year".

**Architecture:**
- **New engine modules:**
  - `engine/sips.ts` guesses SIPs.
  - `engine/placementTax.ts` projects one member's 10-year tax with yearly harvesting.
  - `engine/placement.ts` runs the greedy + regret + swap placement and turns it into moves.
- **Shared move list:** placement moves join the existing `Move` union (kinds `place_sip`, `place_holding`), so `recommendations` records them like any other move.
- **Separate from the season:** they run after `computeFamily` has sized this season's moves and never change them.

**Tech Stack:** TypeScript, React + Vite, Vitest, Playwright smoke. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-24-family-placement-design.md` (decisions D1–D12). Background: `docs/research/2026-11-15-family-asset-placement.md` (the "note"), §3.3 and §4.

## Global Constraints

- **Engine boundary:** engine files import only `engine/` (`boundaries.test.ts`). No solver library.
- **One tax function:** all tax comes from `taxForYear` and `freeEquityLtRoom` (`engine/tax.ts`) with `rulesFor(date)` (`engine/rules.ts`). No rate or limit literals outside `rules.ts`.
- **Money and units:**
  - Money is integer paise; units are integer `Qty`.
  - Round once, with `Math.round`, at the division.
  - Display goes through `ui/format.ts`.
- **Who can receive:** only members where `canGift(giver, receiver, members, asOf)` is true. The HUF is never a giver (D8).
- **No two-way gifts (D11):** a member is either a giver or a receiver for the whole plan, and there are no cycles.
- **Lots:** only lots with `certain` or `approx` qualify. An `approx` lot's gain counts `× (1 + APPROX_MARGIN)` (D10). ELSS lots still locked (`lockedUntil > asOf`) and `needSoon` holdings are excluded.
- **Projection:**
  - The horizon is 10 years with base-scenario returns from `nominalReturn` (`engine/planner.ts`).
  - Yearly harvesting for equity; slab and `other_lt` funds are sold once at year 10 (D12).
  - Incomes stay at today's level.
- **Income not entered:** a member with no income entered (`normalIncomeOf` returns null) is never a receiver.
- **Thresholds:**
  - Drop any placement saving under ₹1,000 a year.
  - Round gifts to ₹1,000 and SIP amounts to ₹500 a month.
  - Gifts over ₹5 L get a confirm step.
- **Copy:**
  - Plain English; "could save", never "recommended" or "you should".
  - One line per move, with details behind "Why?".
  - The Plan's `Disclaimer` stays on screen.
  - Never name a security the family doesn't already hold.
- **Saved families:** the new state field goes through `normalizeState` with a migration test, and old families load unchanged.
- **Privacy:** fixtures are made up. No real names or amounts in tests, commits or logs.

## Review Focus

1. **Giver's own room.** The giver's other equity also uses their yearly ₹1.25 L. The projection must include every holding of every member (movable or not). Otherwise moving equity out looks free or pointless. Test: Task 3, `includes unmovable holdings in each member's yearly room`.
2. **The ₹12 L line in year 10.** A large slab-taxed fund sold in year 10 can push the receiver over ₹12 L. The saving must then shrink or the move must split. Test: Task 3, `stops before the 12 L line when the cliff costs more than it saves`.
3. **The season's room comes first.** Year 1 starts from booked gains plus this season's sized moves, so placement never uses that room. Test: Task 4, `year 1 starts after this season's moves`.
4. **Members with no income entered.** No savings may be shown for them; the section asks for their income instead. Test: Task 4, `member without income is never a receiver` and Task 5 smoke.
5. **Speed on a real family.** 4 members, 30 holdings and 8 SIPs must finish inside 500 ms in Vitest, or the Plan stutters. Test: Task 3, `finishes a 4-member, 38-asset family under 500 ms`.

---

### Task 1: Guess and store SIPs

**Files:**
- Create: `src/engine/sips.ts`, `src/engine/sips.test.ts`
- Modify: `src/engine/family.ts` (`FamilyState` gains `confirmedSips?`), `src/store.ts` (`emptyState`, `normalizeState`, `LIST_FIELDS`), `src/store.test.ts`

**Interfaces:**
- Produces:
  - `interface SipGuess { memberId: string; isin: string; name: string; account: string; monthly: Paise; day: number; months: number }`
  - `guessSips(txns: Txn[], securities: Security[], asOf: ISODate): SipGuess[]`
  - `interface ConfirmedSip { memberId: string; isin: string; monthly: Paise; confirmedAt: ISODate }`. `monthly: 0` means stopped.
  - `activeSips(guesses: SipGuess[], confirmed: ConfirmedSip[]): ConfirmedSip[]` returns only the confirmed ones, the latest per `memberId|isin`, with `monthly > 0`.

- [ ] **Step 1: Write the failing tests** in `sips.test.ts`:
  - `finds a fund bought on a steady day for a steady amount`: buys of a made-up unlisted fund `INF000TEST01` on the 1st–3rd for ₹10,000 ±5% in Aug, Sep, Oct and Nov 2026, with `asOf` 2026-11-24. Expect one guess, `monthly` = 10,000_00 (the median of the last 3), `months` = 4.
  - `needs 3 of the last 4 months`: buys only in Sep and Nov. Expect `[]`.
  - `ignores one-off top-ups and listed shares`: an equity share `INE…` bought monthly is ignored, and so is a fund buy of ₹50,000 on the 15th next to the steady SIP. The SIP stays at ₹10,000.
  - `ignores a stopped SIP`: last buy in Jul 2026, with `asOf` 2026-11-24. Expect `[]`.
  - `activeSips keeps the latest confirmation and drops stopped ones`.
- [ ] **Step 2:** Run `npx vitest run src/engine/sips.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `guessSips`.**
  - A fund is a security with an ISIN starting `INF` and `listed === false`.
  - Group buys by `memberId|isin|account` over the 4 calendar months ending `asOf`.
  - It qualifies when at least 3 distinct months have a buy within ±3 days of the median day-of-month and within ±10% of the median amount.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5: Add `confirmedSips: []` to state.** Write the failing test `store.test.ts › old family without confirmedSips loads with an empty list`. Then add the field to `emptyState`, `normalizeState` (filter to well-formed entries) and `LIST_FIELDS`. Run `npx vitest run src/store.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit:** `git commit -m "Placement: guess SIPs from fund buys and store confirmed ones"`

### Task 2: Ten-year tax for one member, with yearly harvesting

**Files:**
- Create: `src/engine/placementTax.ts`, `src/engine/placementTax.test.ts`

**Interfaces:**
- Consumes: `taxForYear`, `freeEquityLtRoom`, `GainBuckets` (`engine/tax.ts`); `rulesFor`, `normalIncomeOf` (`engine/rules.ts`); `addMonths` (`engine/dates.ts`).
- Produces:
  - `type TaxClass = 'equity' | 'other_lt' | 'slab'`
  - `interface Slice { assetId: string; taxClass: TaxClass; annualReturn: number; value: Paise; gain: Paise; yearlyAdd: Paise }`
    - `value` and `gain` are what the holder starts with.
    - `yearlyAdd` is the yearly SIP money (0 for a holding).
  - `interface ProjectionStart { normal: Paise; year1: GainBuckets }`
  - `tenYearTax(member: Member, start: ProjectionStart, slices: Slice[], asOf: ISODate, years?: number): Paise`, where `years` defaults to `PLACEMENT_YEARS = 10`, exported.

**Model (the signature doesn't settle it):** for year y = 1..years, on the date `addMonths(asOf, 12*(y-1))` (year 1 is this tax year):
1. Each slice grows by `annualReturn`, and its `yearlyAdd` goes in at the start of the year (no gain on that year's add in year 1).
2. **Equity:**
   - Harvest the total unrealised gain up to `freeEquityLtRoom(member, normal, buckets, rulesFor(date), date)`. Year 1 starts from `start.year1`; later years start from zero buckets.
   - Spread the harvest over the slices in proportion to their unrealised gain. It is tax-free and resets the harvested part's cost.
   - Gains under one year old are not harvested; treat a SIP's yearly add as long-term from the next year.
3. **In the final year:** sell everything that's left.
   - Equity's leftover gain goes to `equityLt`.
   - `other_lt` gain goes to `otherLt`.
   - `slab` gain goes to `slab`.
   - Those buckets are taxed once with `taxForYear`.
4. **The result** is the sum over the years of `taxForYear(...).tax`, minus the same sum with no slices (the tax the slices add).

- [ ] **Step 1: Write the failing tests** with hand-checked figures (work them out in a comment in the test):
  - `equity inside the yearly room adds no tax`: new regime, `normal` ₹20 L, a ₹5 L equity slice at 10%, 10 years. The yearly gain stays under ₹1.25 L. Expect 0.
  - `slab fund sold in year 10 is taxed at the member's slab`: `normal` ₹20 L, a ₹10 L slab slice at 7%, so the year-10 gain is ₹9,67,151. Expect 30% + 4% cess on it, to the rupee.
  - `low-income parent pays nil on the same slab fund`: `normal` ₹2 L, new regime, same slice. Expect 0 (under ₹12 L with the rebate).
  - `year 1 uses only the room left after start.year1`: `start.year1.equityLt` = ₹1,25,000 and a ₹2 L equity slice with ₹20,000 gain. Year 1 harvests nothing.
  - `cushioned approx gain counts in full`: a slice whose gain was passed in already multiplied by 1.1. Its year-10 tax is 10% higher than the plain one (above the exemption).
- [ ] **Step 2:** Run `npx vitest run src/engine/placementTax.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `tenYearTax`** per the model above.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Placement: ten-year tax per member with yearly harvesting"`

### Task 3: The placement solver

**Files:**
- Create: `src/engine/placement.ts`, `src/engine/placement.test.ts`

**Interfaces:**
- Consumes: `tenYearTax`, `Slice`, `ProjectionStart`, `TaxClass` (Task 2); `canGift` (`engine/relations.ts`).
- Produces:
  - `interface PlaceAsset { id: string; ownerId: string; kind: 'sip' | 'holding'; movable: boolean; taxClass: TaxClass; annualReturn: number; value: Paise; gain: Paise; yearlyAdd: Paise }`
  - `interface PlacementProblem { members: Member[]; starts: Record<string, ProjectionStart | null>; assets: PlaceAsset[]; asOf: ISODate }`. A `null` start means the income was not entered: never a receiver.
  - `interface Placement { assetId: string; fromId: string; toId: string; share: number; savingPerYear: Paise; saving10y: Paise }`. `share` is the fraction of the asset moved, between 0 and 1.
  - `interface PlacementResult { placements: Placement[]; baselineTax: Paise; planTax: Paise }`
  - `solvePlacement(p: PlacementProblem): PlacementResult`
  - `bucketCheck(p: PlacementProblem): PlacementResult`, the headroom-bucket cross-check (note §3.6), exported for tests only.

**Algorithm** (note §3.3 steps 3–5, adapted to the fixed mix of D7):
1. **Baseline:** every asset stays with its owner. The family tax is the sum of `tenYearTax` over members.
2. **Allowed receivers** for an owner g: members m ≠ g with `canGift(g, m)`, `starts[m] != null`, and `m.type !== 'huf'` as a giver. Movable assets only.
3. **Greedy with regret:**
   - The step is `max(₹10,000, asset total / 400)` of `value` (or of `yearlyAdd` for a SIP).
   - At each round, for every asset with movable value left with its owner, compute the family-tax drop of moving one step to each allowed receiver. Take best minus second-best, where "stay" counts as an option with drop 0.
   - Move one step of the asset with the highest regret to its best receiver, but only if the drop is above 0.
   - Ties are broken by asset id, then member id.
   - **Role lock (D11):** once a member has received, they can't give, and the reverse.
   - Stop when no step lowers family tax.
4. **Swap pass:**
   - Try single moves back and forth between holders of the same asset, with the step halving to ₹5,000 or ₹500 a month. Keep any that cut family tax by more than ₹100.
   - Cliff snap: for any member whose year-10 income is within ₹2 L above ₹12 L, try moving slab slices back until they're under. Keep the move if it's better.
5. **Clean-up:**
   - Round to ₹1,000 (SIPs to ₹500 a month).
   - Merge results to one placement per (asset, receiver).
   - Credit each placement with the family-tax drop of removing it alone.
   - Drop any placement with `savingPerYear < ₹1,000` (saving10y / 10, rounded). Re-run the rounding after each drop.

- [ ] **Step 1: Write the failing tests:**
  - `moves a slab fund to the low-income parent`: earner with `normal` ₹30 L owns a ₹10 L slab fund; parent with `normal` ₹3 L. Expect one placement (share 1, to the parent) with a positive saving that equals the hand-checked difference.
  - `never places with a spouse, HUF or minor`: the same family with a spouse and an HUF, both with nil income. No placement goes to them.
  - `member without income is never a receiver` (`starts[id] = null`).
  - `no two-way gifts`: earner A owns a slab fund; parent B owns an equity fund and has room issues the other way. Assert no member is both `fromId` and `toId`.
  - `includes unmovable holdings in each member's yearly room`: the parent already holds unmovable equity that fills ₹1.25 L a year. Equity moved to them saves nothing, so there's no equity placement.
  - `stops before the 12 L line when the cliff costs more than it saves`: the parent's `normal` is ₹10 L and the slab fund's year-10 gain is ₹4 L. Expect a share under 1, with the parent's year-10 slab income ≤ ₹12 L.
  - `never worse than baseline or the bucket check`: on 200 seeded random families (2–3 members, 2–3 assets), `planTax ≤ baselineTax` and `planTax ≤ bucketCheck(p).planTax`.
  - `matches brute force`: on 100 seeded random small families, enumerate shares in steps of 0.25. `planTax` is within 0.5% of the best, and equal in at least 95% of cases.
  - `is deterministic`: shuffling the asset order gives an identical result.
  - `golden: note §4 example`: reproduce the note's worked example with its overrides (5-year horizon, its returns, the ₹40 L treated as movable holdings) and assert its rupee figures.
  - `finishes a 4-member, 38-asset family under 500 ms`.
- [ ] **Step 2:** Run `npx vitest run src/engine/placement.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `solvePlacement` and `bucketCheck`.** Cache each member's `tenYearTax` keyed by their slice list, so a step re-evaluates only the two members it touches.
- [ ] **Step 4:** Run the tests again. Expected: PASS. If the speed test fails, profile `freeEquityLtRoom` calls first.
- [ ] **Step 5: Commit:** `git commit -m "Placement: greedy, regret and swap solver within the family's mix"`

### Task 4: From the family to placement moves

**Files:**
- Modify: `src/engine/family.ts` (`Move` union), `src/engine/records.ts` (`moveId`), `src/engine/detect.ts` (no auto-detect for placement), `src/engine/index.ts` (exports)
- Create: `src/engine/placementMoves.ts`, `src/engine/placementMoves.test.ts`

**Interfaces:**
- Consumes: `FamilyView`, `FamilyState` (`engine/family.ts`); `activeSips`, `guessSips` (Task 1); `solvePlacement`, `PlaceAsset` (Task 3); `classifyFund` (`engine/categories.ts`); `nominalReturn` (`engine/planner.ts`).
- Produces:
  - Two new kinds in the `Move` union:
    - `MoveBase & { kind: 'place_sip'; fromId: string; toId: string; monthly: Paise; yearlyGift: Paise; savingPerYear: Paise; saving10y: Paise }`
    - `MoveBase & { kind: 'place_holding'; fromId: string; toId: string; savingPerYear: Paise; saving10y: Paise; approx?: true }`
  - For both: `taxAvoided = saving = savingPerYear` and `costs = 0`. `value` is the gift: the yearly gift for a SIP, the units' value for a holding. `qty` is 0 for a SIP.
  - `moveId`: `${r.label}|${kind}|${fromId}>${toId}|${isin}|${account}`.
  - `interface PlacementView { moves: Move[]; sipGuesses: SipGuess[]; unconfirmed: boolean; clubbedLeftOut: string[]; missingIncome: string[] }`. `clubbedLeftOut` and `missingIncome` are member ids.
  - `computePlacement(state: FamilyState, fam: FamilyView): PlacementView`

**Building the problem:**
- **Starts:**
  - `normal` is `normalIncomeOf(member, fam.rules, fam.asOf)`. A null income gives a `null` start and puts the id in `missingIncome`, but only when that member is otherwise an allowed receiver.
  - `year1` is `view.plan.buckets` plus this season's move gains in `equityLt`: `harvest_gain.gain` (memberId), `gift.gain` (toId) and `switch_direct.taxFreeGain` (memberId).
- **Assets:**
  - Each holding's qualifying lots become one asset, movable unless it is `needSoon` or held by an HUF. Gain is the sum of lot gains, with `approx` lots × (1 + `APPROX_MARGIN`).
  - Lots that don't qualify (`estimated`, locked ELSS) go in as unmovable assets, so the room counts stay right.
  - Each active SIP becomes a movable asset with `yearlyAdd` = monthly × 12 and `value` 0.
- **Tax class and return:** `taxType` `equity` is `equity`, `other_lt` is `other_lt`, and everything else that's taxable is `slab`. Securities with `taxType === 'check'` are skipped. The return comes from `nominalReturn(classifyFund(...).returnClass, 'base', fam.rules)`, with `equity` as the fallback for listed shares.
- **Moves:** each `Placement` becomes one move.
  - **Units for `place_holding`:** take `share × qty`, rounded down to the unit step. Use the highest-gain lots first and set `approx` if any of them is approx.
  - **Reasons:** what it saves in each name; that it becomes the receiver's money, counts as their income and passes by their will or nominee; the paperwork (bank transfer from the giver's account, signed gift letter, off-market transfer for demat units). Add `Approx` wording when it applies.

- [ ] **Step 1: Write the failing tests:**
  - `year 1 starts after this season's moves`: a family whose parent receives a season `gift` filling their ₹1.25 L. The placement's year-1 bucket includes it, so no equity placement uses this year's room.
  - `SIP placement`: a confirmed ₹20,000 a month SIP in a made-up conservative hybrid fund, earner at ₹30 L, parent at ₹3 L. Expect a `place_sip` move with `monthly` 20,000_00 and `yearlyGift` 2,40,000_00.
  - `unconfirmed SIP guesses are not placed`: guesses only, so `unconfirmed` is true and there are no `place_sip` moves.
  - `clubbed members are listed, not placed`: spouse and HUF ids are in `clubbedLeftOut`.
  - `member without income is never a receiver`: the id is in `missingIncome` and there are no moves to them.
  - `placement moves are never auto-detected as done`, in `detect.test.ts`.
  - `moveId is stable across computes`.
- [ ] **Step 2:** Run `npx vitest run src/engine/placementMoves.test.ts src/engine/detect.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Extend the union and `moveId`, return `null` in `detect.ts` for the `place_*` kinds, and write `computePlacement`.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: all PASS. Fix every exhaustive `switch` on `m.kind` that `tsc` flags; placement kinds aren't datable.
- [ ] **Step 5: Commit:** `git commit -m "Placement: moves from the family, after this season's moves"`

### Task 5: Plan section "Where money should sit"

**Files:**
- Create: `src/ui/screens/Placement.tsx` (section component)
- Modify: `src/ui/screens/Plan.tsx` (render the section after the season lists; keep `place_*` out of the season groups and totals), wherever shown-records are written (`newShownRecords`) so placement moves are recorded, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `computePlacement`, `PlacementView` (Task 4); `ConfirmedSip` (Task 1); `inr`, `inrShort` (`ui/format.ts`); the existing `Disclaimer` and tooltip pattern on the Plan.

**Copy (fixed):**
- **Section title:** `Where money should sit`
- **SIP prompt** (when `unconfirmed`): `You invest about {inrShort(sum)} a month. Right?` with the buttons `Yes` and `Change`. Change opens an editable list, one row per fund: amount, plus `Stopped`.
- **SIP move:** `Gift {to} {inrShort(yearlyGift)} once a year · {to} runs the {inrShort(monthly)} SIP in {name}`
- **Holding move:** `Gift {to} {units} units of {name}`
- **Right figure:** `{inr(savingPerYear)}` with the label `less tax a year`
- **Why?:** the move's `reasons`, plus `{inr(saving10y)} over 10 years, at assumed average returns`
- **Clubbed line** (once): `Not suggested for {names}: money you give them is still taxed as yours.`
- **Missing income:** `Add {name}'s income to see what moving money to them could save.`, linking to the member page
- **Nothing to move:** `Your money is already in the lowest-tax names.`
- **Gift over ₹5 L:** "Mark as done" first asks `This is {inr(value)} that becomes {to}'s for good. Sleep on it?` with `Not yet` / `Mark as done`.

- [ ] **Step 1: Write the failing smoke test** `e2e/smoke.spec.ts › placement section shows a gift to a parent`: use the sample family fixture with a parent at low income and a confirmed SIP in a slab-taxed fund. Expect `Where money should sit`, a line starting `Gift`, `less tax a year`, and the clubbed line for the spouse.
- [ ] **Step 2:** Run `npm run test:smoke -- -g placement`. Expected: FAIL.
- [ ] **Step 3: Build `Placement.tsx`** and mount it in `Plan.tsx`. Confirming writes a `ConfirmedSip` per row with `confirmedAt = asOf`. Placement moves go through `newShownRecords`.
- [ ] **Step 4:** Run `npm run typecheck`, `npx vitest run` and `npm run test:smoke`. Expected: all PASS.
- [ ] **Step 5: Check it in the browser.** Use the dev server and the sample family. Take a screenshot of the section in light and dark at 375 px width.
- [ ] **Step 6: Commit:** `git commit -m "Plan: where money should sit"`

### Task 6: Review and PR

- [ ] **Step 1:** Run the `guardrail-reviewer` agent on branch `family-placement`. Fix any blocking findings and re-run until it passes.
- [ ] **Step 2:** Open the PR with the reviewer's findings in the body (CLAUDE.md), and note that the Compare page stays until the design pass for points 4, 7 and 8.
