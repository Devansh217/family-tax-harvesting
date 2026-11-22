# Holdings-first engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The newest broker holdings file per account decides what each member holds. Gains with unknown dates are counted the safe way, and the user can correct them. Import order and extra files never make figures wrong.

**Architecture:** All engine repairs run on every compute inside `effectiveTxns` (`engine/openingLots.ts`) and `buildLedger` (`engine/ledger.ts`). Stored data is never rewritten. Import-time changes are limited to reading the holdings file's date and no longer saving guessed fund lots. The UI changes are in `ui/screens/Member.tsx`, `ui/screens/Plan.tsx`, `ui/plan.ts` and a new helper, `ui/warnings.ts`.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright (smoke).

**Spec:** `docs/superpowers/specs/2026-11-22-holdings-first-engine-design.md` (approved 22 Nov 2026). Research: `docs/research/2026-11-22-lot-dating-transfers.md`.

## Global Constraints

- Every rule in `docs/GUARDRAILS.md`. A broken rule blocks the merge.
- Money is integer paise and units are `QTY_SCALE` integers. Rates and dates come from `engine/rules.ts`, never as literals elsewhere.
- The engine imports only the engine (`boundaries.test.ts`).
- Families saved before the change load and compute the same or better. New state fields are optional and go through `normalizeState` with a migration test.
- Test fixtures are synthetic: ISINs like `X`/`INE000000001`, member ids like `a`, `b`, made-up rupee figures. No real names, PANs, account ids or amounts.
- Each behaviour change starts with a failing test. Tax and room changes carry hand-checked rupee figures.
- Copy is plain English, has no advice wording, and uses Indian rupee grouping through `ui/format.ts`.
- Done means `npm run typecheck`, `npx vitest run` and `npm run test:smoke` pass, the change is checked in a browser, and the `guardrail-reviewer` agent has run on the PR with its findings in the PR text.

## Review Focus

1. **Two holdings files for one account with the same `asOf`** (a re-download the same day). Expected: one deciding file (the latest import of that date), no double fill-in. Test goes in Task 2.
2. **A holdings file listing a share the history never saw, and with no cost** (`cost` undefined). Expected: a guessed lot, no trim, no crash. Test goes in Task 3.
3. **A trimmed share that is bought again after the file date.** Expected: the new buy is held normally, and the trim doesn't remove it. Test goes in Task 2.
4. **An unknown-term sale in an account the Tax P&L covers.** Expected: no "Long-term / Short-term" prompt, because the broker figure wins. Test goes in Task 6.
5. **Account labels that differ only by case or spaces, or are blank.** Expected: case and spaces are ignored, and a blank label never trims. Test goes in Task 2.

---

### Task 1: Holdings file date and whether a file can trim

**Files:**
- Modify: `src/parsers/zerodhaTaxPnl.ts` (`parseZerodhaHoldings`)
- Modify: `src/engine/openingLots.ts` (`HeldPosition`)
- Modify: `src/store.ts` (`applyImport`, position push around line 224)
- Test: `src/parsers/parsers.test.ts`, `src/store.test.ts`

**Interfaces:**
- Produces: `HeldPosition.canTrim?: boolean`, which is true only when the file had a readable date, `skipped === 0` and no `SYM:` rows. Also produces `HeldPosition.asOf`, filled from the file's "as on" date.

- [ ] **Step 1: Write failing tests**
  - `parseZerodhaHoldings reads the statement date`: a sheet with the row `["Equity Holdings Statement as on 2026-11-22"]` above the header gives `priceDate === '2026-11-22'` on every price.
  - `parseZerodhaHoldings without a date leaves priceDate undefined`.
  - `applyImport marks holdings positions canTrim only when dated, complete and ISIN-matched`. Three imports: dated and clean → `true`; no date → `false`; one row without a close (`skipped 1`) → `false` on every position from that file.
- [ ] **Step 2: Run them.** Run `npx vitest run src/parsers/parsers.test.ts src/store.test.ts -t "statement date|canTrim"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In the parser, find the first cell matching `/as on (\d{4}-\d{2}-\d{2})/i` in each sheet and set `priceDate` on that sheet's prices.
  - In `applyImport`, for `r.format === 'Zerodha holdings'`, set `canTrim = !!p.priceDate && r.skipped === 0 && !r.prices.some((x) => x.isin.startsWith('SYM:'))` on each pushed position.
  - Keep the list of trimming formats in one exported constant, `TRIMMING_HOLDINGS_SOURCES = ['Zerodha holdings']`, in `engine/openingLots.ts`.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Holdings file: read its date; mark whether it may trim".

### Task 2: The deciding file trims units that left the account

**Files:**
- Modify: `src/engine/types.ts` (`Txn`)
- Modify: `src/engine/openingLots.ts`
- Modify: `src/engine/ledger.ts` (`buildLedger`, `splitIntraday`)
- Test: `src/engine/openingLots.test.ts`, `src/engine/engine.test.ts`

**Interfaces:**
- Consumes: `HeldPosition.canTrim` and `asOf` (Task 1).
- Produces:
  - `Txn.left?: true` on a `side: 'sell'` txn. It means the units left the account: no realised row, no warning, never intraday.
  - `decidingFiles(positions: HeldPosition[]): Map<string, { importId: string; asOf: ISODate; canTrim: boolean; positions: HeldPosition[] }>`, keyed by `` `${memberId}|${normAccount(account)}` ``.
  - `normAccount(a?: string): string`, which trims and lower-cases.
  - `TrimNote { memberId; account; asOf; isins: string[] }` returned through a new `effectiveTxnsWithNotes(txns, positions, asOf): { txns: Txn[]; trimmed: TrimNote[]; staleFiles: Array<{ memberId; account; asOf }> }`. `effectiveTxns` keeps its signature and returns `.txns`.

- [ ] **Step 1: Write failing tests** in `openingLots.test.ts` (use the existing `trade`/`pos` helpers; add `canTrim: true` and `importId`):
  - `trims units the newest file doesn't list`: buy 10 X on 2025-01-10; a file dated 2026-11-22 lists X at 0 → a `left` sell of 10 dated 2026-11-22. `buildLedger` has 0 lots for X, no realised row and no warning.
  - `an ISIN missing from the newest file is held at 0, even if an older file listed it`: an older import lists X at 10; a newer import lists only Y.
  - `never trims from a file older than the last trade in that account` → the result is in `staleFiles`, with no `left` txn.
  - `never trims when canTrim is false or the account label is blank`.
  - `" Zerodha "` and `"zerodha"` match.
  - `same asOf twice: the later importId decides, with no double fill-in`.
  - `a buy after the file date is not trimmed`.
- [ ] **Step 2: Run them.** Run `npx vitest run src/engine/openingLots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Deciding file:** it is the max `asOf`, and on a tie the last `importId` in input order. Only that file's positions count for the account. Positions without `asOf` never decide trimming.
  - **Trim:** after the existing fill-in, for each held ISIN in the account with `canTrim` and file `asOf` ≥ the account's last non-Tax-P&L trade date, compute `held = buys − sells` dated ≤ `asOf`, counting the fill-in lots. If `held > fileQty`, emit `{ id: `${member}|${isin}|${acct}|left|${asOf}`, side: 'sell', left: true, qty: held − fileQty, amount: 0, date: asOf, source: 'Left the account' }`.
  - **Ledger:** a `left` sell consumes the queue oldest first and pushes nothing to `realised` or `warnings`. `splitIntraday` passes `left` txns straight to `delivery`.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Engine: newest holdings file trims units that left the account".

### Task 3: Fund fill-in on every compute, and cost never stacks

**Files:**
- Modify: `src/engine/openingLots.ts`
- Modify: `src/store.ts` (guessed-lot push in `applyImport`)
- Test: `src/engine/openingLots.test.ts`, `src/store.test.ts`

**Interfaces:**
- Consumes: `decidingFiles` (Task 2).
- Produces: fill-in lots with ids `` `${member}|${isin}|${acct}|opening-est` `` (no long-term count) or `|opening-lt` / `|opening-st` (as today), and `` `|opening-ca` `` for zero-cost corporate-action units. Also `CorporateActionNote { memberId; isin; account }`, added to the `effectiveTxnsWithNotes` result as `corporateActions`.

- [ ] **Step 1: Write failing tests**
  - `fund holdings: order doesn't matter`. Positions (12,000 units, no `ltQty`, cost ₹3,50,000) plus tradebook buys of 6,500 units. Expected: total held is 12,000 whether the saved `|opening|imp1` lot exists or not. One `opening-est` lot of 5,500 units, `estimated: true`.
  - `the guessed lot saved at import by a holdings file is dropped at compute`.
  - `applyImport no longer saves a guessed lot for 'Zerodha holdings'`. Other formats keep doing so.
  - `1:1 bonus`: buy 10 at ₹1,000; the file has 20 units, cost ₹10,000, `ltQty` 10. Expected: held cost ₹10,000; the 10 extra units cost 0 and are `estimated`; a corporate-action note.
  - `1:5 split`: buy 10 at ₹1,000; the file has 50 units, cost ₹10,000. Expected: one lot of 50 units, cost ₹10,000, original date; no fill-in.
  - `units bought before the history (no corporate action)`: today's behaviour stays (existing tests pass).
  - **Review Focus 2:** `a share the history never saw, with no cost`. Expected: an `estimated` lot priced at file price × units, and no trim.
  - `invariant`: for every fixture above, the held lot cost is ≤ the file's total cost.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Fill-in cost = `max(0, fileCost − heldHistoryCost)`.
  - **Split:** if the history's held qty > 0, `fileQty / heldQty` or `heldQty / fileQty` is a whole number, and `|fileCost − heldHistoryCost| ≤ 1%`, scale the queue's units (emit a synthetic adjustment, or rescale in the ledger by a `split` txn; builder's call, with no realised row). Otherwise, if the leftover cost is ≤ 0, add an `opening-ca` lot at cost 0, `estimated`.
  - Funds (no `ltQty`) get `opening-est`, sized `fileQty − explained`.
  - In `store.ts`, skip the guessed-lot push when `TRIMMING_HOLDINGS_SOURCES.includes(r.format)`.
- [ ] **Step 4: Run the tests.** Then run `npx vitest run`. Expected: PASS. Update the old test "leaves the history alone when the holdings file has no cost or no long-term units", because it now expects an `opening-est` lot.
- [ ] **Step 5: Commit.** Message: "Engine: fund fill-in per compute; held cost never exceeds the file".

### Task 4: Units sold from the opening lot, and unknown-term sales

**Files:**
- Modify: `src/engine/types.ts` (`Realised`, `FamilyState` via `engine/family.ts`)
- Modify: `src/engine/openingLots.ts`
- Modify: `src/engine/ledger.ts` (`lotTerms` call site)
- Modify: `src/store.ts` (`normalizeState`)
- Test: `src/engine/engine.test.ts`, `src/engine/tax.test.ts`, `src/store.test.ts`

**Interfaces:**
- Produces:
  - `Realised.termUnknown?: true`.
  - `TermAnswer { memberId: string; account: string; isin: string; sellDate: ISODate; term?: Term; buyDate?: ISODate }`.
  - `FamilyState.termAnswers?: TermAnswer[]`.
  - `buildLedger(txns, securities, rules, answers?: TermAnswer[])`.

- [ ] **Step 1: Write failing tests**
  - `units sold from the opening lot are term unknown`: history starts 2025-08-01; the file says 30 long-term; a sale of 8 opening units on 2026-04-10 at a gain → a realised row with `termUnknown: true` and `term: 'lt'`.
  - `an unknown-term loss counts short-term`. Rupee test: a member with ₹20,000 booked short-term gain and a ₹5,000 unknown-term loss. Long-term room is unchanged, and short-term after set-off is ₹15,000.
  - `ELSS unknown-term is long-term`; `a debt fund keeps slab rate` (taxType from `lotTaxType`).
  - `answer term 'st' makes the gain short-term`, and room rises by the gain (rupee test). `answer buyDate` → the term comes from `lotTerms`.
  - `normalizeState keeps termAnswers and defaults to none` (migration test).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `effectiveTxns`, split today's long-term opening lot into the held part (`opening-lt`, as today) and the sold-before-`asOf` part (`opening-sold`, `estimated: true`, `approx: true`).
  - In `buildLedger`, a row from an `estimated` lot gets `termUnknown: true`. It becomes `taxType` from `lotTaxType`; then if the security is ELSS (`isElss`) → `lt`; else if `taxType !== 'equity'`, use `lotTerms`; else `term = gain >= 0 ? 'lt' : 'st'`.
  - A matching `TermAnswer` (same member, account, ISIN and sell date) overrides it: use `term`, or `lotTerms(sec, buyDate, sellDate)`. Clear `termUnknown`.
  - `computeFamily` passes `state.termAnswers`.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Engine: unknown-term sales counted the safe way; user answers override".

### Task 5: FY 2026-27 buybacks booked from the Tax P&L

**Files:**
- Modify: `src/engine/rules.ts` (`TaxRules`, every `FY_*`)
- Modify: `src/parsers/zerodhaTaxPnl.ts`
- Test: `src/parsers/parsers.test.ts`

**Interfaces:**
- Produces: `TaxRules.buybackIsCapitalGain: boolean`. It is `true` for `FY_2026_27` and `false` for earlier years.

- [ ] **Step 1: Write failing tests**
  - A Tax P&L with an "Equity - Buyback" exit dated 2026-06-10 gives a buy/sell pair like other long-term exits.
  - An exit dated 2025-06-10 is left out, with the warning naming "1 Oct 2024 to 31 Mar 2026".
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In the buyback branch, `if (rulesFor(exitDate).buybackIsCapitalGain)`, parse the exit as its own row type (equity; the term comes from the dates). Otherwise count it as skipped, as today. The warning text is: "N buyback exits from 1 Oct 2024 to 31 Mar 2026 were left out: in that period buyback money was taxed as dividend income."
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Tax P&L: count buybacks from 1 Apr 2026 as capital gains".

### Task 6: Member page shows only what matters, and lets the user answer

**Files:**
- Create: `src/ui/warnings.ts`
- Modify: `src/ui/screens/Member.tsx` (warning banner ~line 230, "Booked this year" ~line 173, "Turning long-term soon" ~line 316, capital-gains rows)
- Modify: `src/ui/plan.ts` (`planGaps`)
- Modify: `src/store.ts` (setter for `termAnswers`)
- Test: `src/ui/warnings.test.ts`, `src/ui/plan.test.ts`, smoke spec in `tests/` (existing Playwright folder)

**Interfaces:**
- Consumes: `effectiveTxnsWithNotes` (`trimmed`, `staleFiles`, `corporateActions`), exposed on `FamilyView` as `holdingsNotes`; `Realised.termUnknown`; `TermAnswer`; `brokerAdjustments`.
- Produces:
  - `visibleOversells(warnings: LedgerWarning[], fy: TaxRules, covered: (memberId: string, account: string, date: ISODate) => boolean): { now: Array<{ isin: string; units: Qty; from: ISODate; to: ISODate }>; older: LedgerWarning[] }`.
  - `setTermAnswer(state, answer: TermAnswer): AppState` in `store.ts`.

- [ ] **Step 1: Write failing tests**
  - `visibleOversells hides earlier-year and P&L-covered sales, and groups the rest per share`. Eleven AFFLE rows on one day become one row with the summed units.
  - **Review Focus 4:** `an unknown-term sale covered by a Tax P&L gets no prompt`.
  - `planGaps asks to re-import holdings when positions have no asOf`. Text: "Import <name>'s holdings file again so sold or moved shares drop out."
  - `planGaps adds the buyback gap when an account has trimmed units and no current-year Tax P&L`.
  - Smoke: a fixture family shows one amber note, not a red list. Clicking "Short-term" on an unknown-term sale asks for confirmation, then changes "Free".
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use the spec's copy exactly:
  - Trim note: "N shares in your trade history aren't in <broker>'s holdings on <date>, so they're left out." If the account has no current-year P&L, add: " If any of these left in a buyback this year, that gain counts: import <broker>'s tax P&L."
  - Stale file: "Your <broker> holdings file is from <date>, before your latest trades. Import a newer one."
  - Corporate action: "<share>: units changed without a trade (bonus, split or demerger?). Import Zerodha's tax P&L or external tradebook for exact figures."
  - Oversell group: "<share>: sold N more units than the history shows (<month range>). Their gain is left out until you import <broker>'s tax P&L." Older ones go under a closed `<details>` titled "Older history gaps (no effect on this year's tax)".
  - The banner uses the calm note class, not `banner warn`.
  - Unknown-term row: "buy date unknown, so we assumed long-term. Room left assumes this. Was it [Long-term] [Short-term]? Not sure? [Add buy date]". The Short-term confirm reads: "Only choose this if your contract note or broker P&L shows the shares were held under a year. If it's wrong, a move can create tax." Once answered, the row reads "Term set by you" or "Buy date entered by you", with [Change].
  - Broker correction: show "Adjusted to <broker>'s figure: ±₹X <term>" as its own line. "Losses set off" excludes negative `brokerAdjustments`. Tax is unchanged.
  - "Turning long-term soon" groups rows with the same ISIN and date.
- [ ] **Step 4: Run the tests and the smoke suite.** Run `npx vitest run` and `npm run test:smoke`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Member page: quiet notes, grouped gaps, unknown-term answers".

### Task 7: Nudge to recover the cushion, and "nothing new" on import

**Files:**
- Modify: `src/ui/screens/Plan.tsx` (line ~118, the approx note)
- Modify: `src/ui/screens/Import.tsx` (the card after Add)
- Test: `src/ui/plan.test.ts`, smoke

**Interfaces:**
- Produces: `cushionNudge(move: Move, fam: FamilyView): { fy: string | null; rupees: Paise } | null` in `src/ui/plan.ts`.

- [ ] **Step 1: Write failing tests**
  - `cushionNudge`: an approx move with gain ₹56,400 gives `rupees` ₹5,600 (gain × `APPROX_MARGIN`, rounded to ₹100) and `fy` = the year before the oldest tradebook in that account. An exact move gives `null`. Under ₹1,000 gives `null`.
  - Smoke: importing the same tradebook twice shows "Nothing new: these trades are already in".
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Approx move line: "Import the <FY> tradebook from <broker> to use the ₹X of room left spare." Use "older tradebooks" when `fy` is null.
  - Import card: when the import added 0 transactions and 0 positions changed, show the "Nothing new" line.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Plan: nudge to recover the cushion; import card says when nothing is new".

### Task 8: Proof on the real files, review, PR

**Files:**
- Modify: `scripts/check-private.ts` (counts only, no names or amounts)

- [ ] **Step 1: Extend `check-private.ts`** to replay the private family (`data/private/`) and print counts only:
  - trimmed shares per member (expected 6 for the member with gifts out);
  - funds whose held units ≠ the file (expected 0);
  - unknown-term sales;
  - `visibleOversells.now` per member (expected ≤ 2 each).
- [ ] **Step 2: Run** `npx vite-node scripts/check-private.ts`. Expected: the counts above.
- [ ] **Step 3: Run the full suite.** Run `npm run typecheck && npx vitest run && npm run test:smoke`. Expected: all pass.
- [ ] **Step 4: Check in a browser.** Run the dev server via `preview_start`, import synthetic fixtures, and screenshot the Member page and the Plan.
- [ ] **Step 5: Run the `guardrail-reviewer` agent on the branch.** Fix blocking findings. Open the PR with its findings and the browser check in the description, ending with the attribution line.
