# Stage 5: Initial Zoom Out Review

**Target:** `docs/superpowers/plans/2026-11-28-generic-tax-pnl.md`, all 136 lines.
**Context the reviewers had:** the spec `docs/superpowers/specs/2026-11-28-generic-tax-pnl-design.md`, issue #28 (`issue-28.md` in this folder), `docs/GUARDRAILS.md`, and the parser and engine code at commit `86a4958`. They skipped `pdfTable.ts` and its test, which the implementation session is still writing.
**Reviewers:** egm-zoom-out (zoom-out-standard) and egm-inventive-catalyst (REVIEW mode), run in parallel. Each started with no memory of this conversation.
**Checked by hand:** I opened every code line the findings cite to make sure it exists and does what the reviewer says. The checked lines are `soldLots.ts:125-127`, `soldLots.ts:205-235` and `openingLots.ts:28-29,124`.

## Verdict

The scope is right. The plan reuses the header dictionary, the CSV and Excel readers, pdf.js and the Zerodha Tax P&L handling. It adds no dependency and nothing speculative. Three things are wrong with it:
- It can lose fund gains.
- In several places it no longer matches the code that has already been committed.
- It never writes down two decisions that affect tax: where charges go, and what happens to fund rows.

## Part A: Zoom out (egm-zoom-out)

### A1. Blocker: fund gains disappear beside a tradebook (plan lines 77 and 114)
- **What breaks:**
  - Line 77 leaves `mfShortTerm` and `mfLongTerm` empty for fund rows.
  - Line 114 makes `isTaxPnl` match every format starting `Tax P&L · `. So beside a tradebook, every exit in the file is dropped, fund exits included (`openingLots.ts:124`).
  - A share tradebook has no fund sales, and `brokerAdjustments` has no fund totals to add back. The fund gains are lost and the room is overstated, which breaks GUARDRAILS §1. The spec (§7) has the same gap.
- **The code already differs:** `soldLots.ts` handles this in two ways that neither the plan nor the spec mentions:
  - A fund-only report gets its own format, `Fund capital gains · `, with no summary. Its exits are never dropped.
  - A mixed report fills the fund totals using the listed-share term.
- **Fix:** Write both rules into line 77 and spec §7. Add a Review Focus item and a Task 5 test: "fund exits from a generic Tax P&L are not lost beside a share tradebook". See B1 for the problem left in the mixed-report rule.

### A2. Major: the signature on line 71 no longer matches the committed Task 3
- **What is wrong:** The `source: 'excel' | 'csv' | 'pdf'` parameter is never used, and the committed code leaves it out. The code also returns a tagged union of high, medium and low results, not optional `result` and `preview` fields. A fund-only report carries no `brokerSummary`.
- **Fix:** Change line 71 to `readSoldLots(sheets: CellSheet[]): SoldLotsRead` with the three-way union. Remove `source` from line 123 too.

### A3. Major: the plan never says whether charges are part of the cost (line 75)
- **What is missing:** The plan checks and sums gains as sell − buy − charges, but never says what goes into the buy transaction's amount.
- **Why it matters:** If charges are left out, every lot's gain comes out too high by its charges whenever the file is used without a tradebook.
- **What the code does:** It adds charges to the cost (`soldLots.ts:126`). It never adds STT, except that intraday rows may subtract STT.
- **Fix:** State this in line 75 and spec §5. Add a test with rupee figures worked out by hand, as GUARDRAILS §1 "Worked numbers" requires.

### A4. Major: the PDF branch contradicts the confidence definition (line 123 against line 78)
- **What is wrong:** Line 123 has a case for "low with a sold-lots table", but line 78 defines low as having no sold-lots table. That case can never happen.
- **Fix:** "medium → the rejection text; low → today's 'Unrecognised PDF' message."

### A5. Major: "Closes #28" while some of the issue's Build items go nowhere (lines 135-136)
- **What is wrong:** Three items in the issue's Build list are not built and get no follow-up issue: the open-holdings and long-term/short-term snapshot, remembered layouts, and per-broker hints. Line 135 opens follow-up issues for dividends and carried-forward losses only.
- **Fix:** Open issues for these items or list them in the PR. Tell #29 (B3) that the Open Holdings and Qty Breakup sections this reader skips are a holdings source, so B3 does not rebuild the section finding.

### A6. Nit: Task 4 fixes pixel constants as if they were requirements (lines 100-106)
- **What is wrong:** The 2pt baseline, `x < first start − 5` and `≤ x + 4` are tuned to one Angel layout.
- **Fix:** Describe the behaviour in the plan and leave the constants to the tests.

### A7. Nit: two PDF read functions (line 123)
- **What is wrong:** `extractLines` is already `linesOf(extractItems(...))`, so returning both lines and words repeats work.
- **Fix:** Have `readPdf` return only the words. Import.tsx calls `linesOf(words)` itself, and `readPdfLines` is removed.

### A8. Nit: duplicated helpers
- **What is wrong:** The code has three copies of logic that already exists:
  - `SoldLotsPreview` has the same fields as `TablePreview`.
  - `cellText` repeats `previewRows` and Zerodha's `text()`.
  - `readMeta` repeats Zerodha's `labelled()` and its period regex.
- **Fix:** Move `TablePreview` into `table.ts` and put a single cell-to-text helper in `common.ts`.

### A9. Nit: hardcoded broker list (line 77)
- **What is wrong:** The broker name only appears in labels, so a long list buys little. The code already has 12 names.
- **Fix:** Keep Angel One and Zerodha. Every other broker gets "Broker".

### A10. Nit: task order (line 61)
- **What is wrong:** Task 2's `pnl` path uses the row code from Task 3, so Task 2 cannot be finished first.
- **Fix:** Move that bullet into Task 3 or Task 6.

## Part B: False compromises (egm-inventive-catalyst)

The core structure removes the "one reader per broker" trade-off: one reader works over rows of cells, and Excel, CSV and PDF all feed it the same grid. The reviewer found five costs that the plan accepts but a different structure would remove.

### B1. Major: a mixed report gives fund gains the wrong term, or loses them
- **The compromise:** Dropping exits beside a tradebook applies to the whole file, but a fund's term cannot be told from its ISIN. The plan's version loses fund gains (A1).
- **The code's version keeps them but puts them in the wrong bucket:** it fills the fund totals using the listed-share term (`soldLots.ts:212-215`, whose comment says the term "may differ ... but none is lost"). A debt fund held 13 months then counts as long-term, so tax rates are misapplied. That still conflicts with GUARDRAILS §1.
- **Proposed fix (split by asset class):** Share lots go under `Tax P&L · <broker>` with a summary that covers shares only. Fund lots go under `Fund capital gains · <broker>` as plain trades, and the engine works out each fund's term from its tax type.
- **New costs:**
  - One file becomes two imports. Re-importing the file and changing the import order must still give the same result (GUARDRAILS §3).
  - A rule is needed so fund exits are not counted twice when a fund statement also covers the account.
  - One more test is needed.

### B2. Major: the column screen sees one table, but its result still "wins"
- **The compromise:** At medium confidence, only the biggest table goes to the column screen (`biggest`, `soldLots.ts:256`). The intraday and buyback sections are silently dropped, yet the result still carries a `BrokerSummary` and its exits are still dropped beside a tradebook. On the path meant to be the safe fallback, an incomplete summary replaces the history.
- **Proposed fix:** Feed the mapping the person confirms back into `readSoldLots` as an override for every table with the same header, so section detection and skip rules keep running.
- **Cheaper alternative:** When a medium result has more than one table, give it no `BrokerSummary` and no `Tax P&L · ` prefix, so it imports as plain trades.

### B3. Nit: the stated reason for rejecting medium PDFs no longer holds
- **The compromise:** The spec gives "a PDF has no column screen" as the reason, but Task 4 turns a PDF into the same grid the column screen uses. The real reason is a founder policy: accept only high confidence for PDF.
- **Proposed fix:** Split medium results by cause: bad word positions are rejected, while a mapping or tax-year failure goes to the column screen.
- **Caveat:** This needs the founder's agreement. If the policy stays, give the policy as the reason in the plan.

### B4. Nit: the one-tax-year check blocks reports that have no totals
- **The compromise:** The check exists because one summary covers one period, but fund-only reports carry no summary. A fund statement covering several years drops to medium for no safety gain.
- **Fix:** Apply the one-year check only to results that carry a `BrokerSummary`.

### B5. Nit: a tax-safety rule matches the start of a display label
- **The compromise:** The parser writes `Tax P&L · ` at `soldLots.ts:232`, and the engine tests for the same literal at `openingLots.ts:29`. If someone rewords the label, nothing fails, exits stop being dropped, and gains are counted twice.
- **Fix:** Put the prefix constant, or a format builder, in `engine/` and use it in both places. Add a test that pins it to today's literal so saved families still match.

## Overlaps
- A1 and B1 are the same root problem: fund exits in a generic Tax P&L. A1 says the plan text loses the gains. B1 says the committed fix keeps them but in the wrong bucket. Resolve both together.
- A4 and B3 both concern the PDF confidence branch in Task 6.

## For the implementation session
A1/B1, A3 and B2 affect tax results in the code that has already been committed, not only the wording of the plan. Read them before Task 5 and Task 6 land.
