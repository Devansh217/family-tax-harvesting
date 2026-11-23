# Plan old-data marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moves that rest on an account whose newest data is 30 or more days old are marked on their row, flagged for possibly smaller room, listed as a Plan gap, and left out of the Plan headline.

**Architecture:** A pure engine function (`engine/freshness.ts`) gives each account's newest evidence date. `computeFamily` stamps moves with `oldData` / `roomMayBeSmaller` after they're built and returns `oldAccounts`. `ui/plan.ts` turns those into a gap line and headline totals, and `MoveRow` shows the marks.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-11-24-plan-old-data-design.md`

## Global Constraints

- "Old" means `daysBetween(newest, asOf) >= 30` (`OLD_DATA_DAYS = 30`). 29 days is not old.
- Newest evidence per `${memberId}|${normAccount(account)}` is the max of the deciding holdings file's `asOf` (`decidingFiles`), the last `isTradebook` trade, and `summary.to` of each `countingSummaries` P&L. Accounts with none of these get no entry and no mark.
- Move sizing, move ids, `reasons`, `noRoom` moves and `fam.totals` don't change.
- The engine imports only the engine (`boundaries.test.ts`).
- Copy is verbatim from the spec, with dates through `dateLabel` (e.g. "31 Mar 2026"). It's plain English and has no advice wording (GUARDRAILS §6).
- **Deviation from the spec (decided while planning):** `roomMayBeSmaller` holds the ISODate the room line names (the oldest old date among that member's accounts), not `true`, so the row can say "since <date>".

## Review Focus

- **The same account under different label spelling** ("Zerodha" in the tradebook, " zerodha " in the holdings file) has to resolve to one account. Pinned in Task 1 (`normAccount`).
- **A gift where the giver is fresh and the recipient is old**: `roomMayBeSmaller` is set and `oldData` isn't. Pinned in Task 2.
- **A switch_direct with `taxFreeGain` 0** (beyond the room) never gets `roomMayBeSmaller`. Pinned in Task 2.
- **A P&L superseded by a newer one** must not supply the date, and neither should an older holdings file that isn't deciding. Pinned in Task 1.
- **A done move that was marked** still counts in `gainDone`, because only open marked moves leave the headline. Pinned in Task 3.

---

### Task 1: Newest evidence per account

**Files:**
- Create: `prototype/src/engine/freshness.ts`
- Test: `prototype/src/engine/freshness.test.ts`

**Interfaces:**
- Consumes: `decidingFiles`, `isTradebook`, `normAccount` (`engine/openingLots.ts`); `countingSummaries` (`engine/family.ts`). If importing `family.ts` from `freshness.ts` causes a cycle, move `countingSummaries` into `freshness.ts` and re-export it from `family.ts`. `daysBetween` (`engine/dates.ts`).
- Produces:
  - `export const OLD_DATA_DAYS = 30`
  - `export const accountKey = (memberId: string, account?: string) => \`${memberId}|${normAccount(account)}\``
  - `export function newestEvidence(state: { txns: Txn[]; positions?: HeldPosition[]; brokerSummaries?: Array<{ memberId: string; account: string; summary: { from: ISODate | null; to: ISODate | null } }> }): Map<string, ISODate>`
  - `export const isOld = (date: ISODate, today: ISODate): boolean`

- [ ] **Step 1: Write the failing tests** in `freshness.test.ts`:
  - `takes the latest of holdings file, last tradebook trade and P&L end`: a tradebook buy dated 2026-03-31 (source `'Trade history (Zerodha)'`, account `'Zerodha'`), a Zerodha holdings position `asOf: '2026-04-15'` with account `' zerodha '`, and a P&L with `to: '2026-06-30'` → the map has `'a|zerodha'` → `'2026-06-30'` and has size 1.
  - `ignores undated holdings, non-tradebook txns and P&Ls with no end`: a source `'test'` buy, a holdings position with no `asOf`, and a P&L with `to: null` → the map is empty.
  - `ignores a superseded P&L and an older holdings file`: P&L A from 2026-04-01 to 2026-09-30 and P&L B from 2026-04-01 to 2026-06-30, where A covers B's period → `'2026-09-30'`. Two holdings imports dated 2026-03-01 and 2026-05-01 → the deciding one is 2026-05-01. Assert the max per account.
  - `isOld: 29 days is not old, 30 is`: `isOld('2026-10-16','2026-11-14')` is false; `isOld('2026-10-15','2026-11-14')` is true.
- [ ] **Step 2: Run** `npx vitest run src/engine/freshness.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `freshness.ts` to the interfaces above.
- [ ] **Step 4: Run** `npx vitest run src/engine/freshness.test.ts src/engine/boundaries.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** "Engine: newest evidence date per account".

### Task 2: Engine marks moves

**Files:**
- Modify: `prototype/src/engine/family.ts` (`MoveBase` ~line 147, `FamilyView` ~line 199, end of `computeFamily` before `return`, ~line 815)
- Test: `prototype/src/engine/family.test.ts` (new `describe('old data marks')`)

**Interfaces:**
- Consumes: Task 1's `newestEvidence`, `isOld`, `accountKey`.
- Produces:
  - `MoveBase.oldData?: ISODate`: the move's account's newest date when it's old. For a gift, use the giver's (`fromId`) account.
  - `MoveBase.roomMayBeSmaller?: ISODate`: set on `harvest_gain`, `gift`, and `switch_direct` with `taxFreeGain > 0`, when the room owner (the recipient `toId` for a gift, otherwise `memberId`) has any old account. Its value is the oldest such date.
  - `FamilyView.oldAccounts: Array<{ memberId: string; account: string; newest: ISODate }>`: one per old account in which that member has a holding (`holdings[].accounts`, matched by `normAccount`). `account` is the holding's label. Sorted by member order, then account.
  - Moves with `noRoom` get neither field.

- [ ] **Step 1: Write the failing tests.** Use `ASOF = '2026-11-14'` and price ₹2,000 on a ₹1,000 buy. Each tradebook txn has `source: 'Trade history (Zerodha)'` and an account.
  - `marks a harvest and a loss in an account whose newest trade is old`: a's only tradebook trades are in 'Zerodha', last dated 2026-03-31 → the harvest has `oldData: '2026-03-31'` and `roomMayBeSmaller: '2026-03-31'`. Add a loss holding (buy at ₹3,000) → the `harvest_loss` move has `oldData: '2026-03-31'` and `roomMayBeSmaller` undefined. `fam.oldAccounts` equals `[{ memberId: 'a', account: 'Zerodha', newest: '2026-03-31' }]`.
  - `does not mark when newest data is 29 days old`: last trade 2026-10-16 → no `oldData`, and `oldAccounts` is empty.
  - `flags room on a fresh account's harvest when the same member has an old account`: X is in 'Zerodha' with last trade 2026-11-10, and Y is in 'Angel One' with last trade 2026-03-31. X's harvest has no `oldData` and has `roomMayBeSmaller: '2026-03-31'`.
  - `gift: recipient's old account flags room, giver's fresh account sets no oldData`: reuse the gift test's members `a` and `p` (parent). a's X trades are in 'Zerodha', last on 2026-11-10. p holds Z in 'Angel One', last trade 2026-03-31 → the gift has `roomMayBeSmaller: '2026-03-31'` and no `oldData`.
  - `ids and sizes do not change`: compute the same state with old and fresh dates (shift only an extra later tradebook trade in another security). Harvest `id`, `qty` and `gain` are equal.
  - `accounts with no dated evidence get no marks`: source `'test'` txns → no marks, and `oldAccounts` is empty.
- [ ] **Step 2: Run** `npx vitest run src/engine/family.test.ts -t "old data"`. Expected: FAIL.
- [ ] **Step 3: Implement.** After all moves (including the `noRoom` loop) are pushed, call `newestEvidence(state)` once. Build per-member old dates, then map over `moves` and add the fields. Add `oldAccounts` to the returned view. Leave `totals` unchanged.
- [ ] **Step 4: Run** `npx vitest run src/engine` and `npm run typecheck`. Expected: PASS. Every existing family test passes unchanged.
- [ ] **Step 5: Commit** "Engine: moves on old data carry oldData and roomMayBeSmaller".

### Task 3: Plan gap and headline

**Files:**
- Modify: `prototype/src/ui/plan.ts` (`planView`, `PlanGap.key`, `planGaps`)
- Test: `prototype/src/ui/plan.test.ts`

**Interfaces:**
- Consumes: `Move.oldData`, `Move.roomMayBeSmaller`, `FamilyView.oldAccounts` (Task 2); `dateLabel` (`ui/format.ts`).
- Produces:
  - `planView(fam, records)` additionally returns `laterSaving: Paise`. `gainTotal`, `nowTotal` and `laterSaving` count open moves only when they have neither mark. `laterSaving` = the sum over unmarked open moves of `saving` for `harvest_gain` / `gift`, plus `taxAvoided` for `switch_direct`, which matches `fam.totals.laterSaving`'s formula.
  - `PlanGap.key` gains `'old_data'`. `planGaps`' `fam` param also accepts `Partial<Pick<FamilyView, 'oldAccounts'>>`.

- [ ] **Step 1: Write the failing tests:**
  - `planView leaves marked open moves out of the headline`: hand-built moves: one harvest with gain ₹10,000 and no mark, one with ₹5,000 and `oldData`, one with ₹3,000 and `roomMayBeSmaller` → `gainTotal` = ₹10,000. A marked move recorded as done still adds to `gainDone` and `gainTotal`. The `laterSaving` sum covers only the unmarked harvest.
  - `planGaps adds one old_data line per old account`: `oldAccounts: [{ memberId: 'a', account: 'Zerodha', newest: '2026-03-31' }]`, member name 'Asha' with holdings → the gap has `key 'old_data'`, `href '#import-a'`, `action 'Import'`, and text `"Asha's Zerodha: newest data from 31 Mar 2026, so its moves may be out of date. Import today's holdings file."`
- [ ] **Step 2: Run** `npx vitest run src/ui/plan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `possessive(name)` for "Asha's". Push the `old_data` gaps after the existing gaps for that member.
- [ ] **Step 4: Run** `npx vitest run src/ui/plan.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** "Plan: old accounts listed as a gap; headline leaves marked moves out".

### Task 4: Move row marks, header, guardrail, smoke

**Files:**
- Modify: `prototype/src/ui/screens/Plan.tsx` (`MoveRow` after the `noRoom` line; the header's `fam.totals.laterSaving` becomes `planView().laterSaving`)
- Modify: `docs/GUARDRAILS.md` §1 (add the spec's sentence verbatim, as a new bullet "**Old data is marked.**")
- Create: `prototype/e2e/fixtures/old-data-family.json` (a synthetic backup, modelled on `unknown-term-family.json`: one member "Olga" (id `o`), tradebook trades in account "Zerodha" dated 2025-01-10 and 2026-03-31, with a long-term gain big enough for a harvest. No real data.)
- Modify: `prototype/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–3.

- [ ] **Step 1: Write the failing smoke test** `an old account's moves are marked and listed as a gap`. Restore the fixture through Family. Open Plan. Expect visible text "Based on data from 31 Mar 2026. Check you still hold these before acting.", text containing "the tax-free room may be smaller", and text containing "Olga's Zerodha: newest data from 31 Mar 2026".
- [ ] **Step 2: Run** `npm run test:smoke -- -g "old account"`. Expected: FAIL.
- [ ] **Step 3: Implement the rows.** Unless `noRoom`, show `<p className="tiny" style={{ color: 'var(--time)' }}>`:
  - when `oldData` is set: `Based on data from ${dateLabel(oldData)}. Check you still hold these before acting.`
  - when `roomMayBeSmaller` is set: `Gains booked since ${dateLabel(roomMayBeSmaller)} aren't counted, so the tax-free room may be smaller. Import this year's tax P&L before acting.`
  
  Check that `dateLabel` renders "31 Mar 2026" (use the same call style the other rows use). Switch the header to `laterSaving` from `planView`. Add the GUARDRAILS bullet.
- [ ] **Step 4: Run** `npm run typecheck`, `npx vitest run` and `npm run test:smoke`. Expected: all PASS. Then open the Plan in the browser with the fixture restored and check that the marks show on Plan and on Home.
- [ ] **Step 5: Commit** "Plan: move rows say when they rest on old data; guardrail §1 notes the exception".
