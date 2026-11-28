# Stage 6: Comprehension Test

**Target:** `docs/superpowers/plans/2026-11-28-generic-tax-pnl.md`. FeatureRange is lines 1-37 and DetailedRange is lines 38-136.
**Reviewer:** egm-comprehension, working from the plan alone, with no spec, code or document standard.

## Paraphrase: FeatureRange (lines 1-37)

**What this proposes.** The app should accept a broker's capital gains report (a "Tax P&L": a list of sold lots, each with buy and sell dates, quantity, buy and sell values) from any broker, as Excel, CSV or PDF. If the column headers are recognisable, the file imports with no user input. Its totals then become the broker's summary, so the gains the app's "Plan" shows as booked match the broker's figures. If the headers are not recognisable, the user gets the manual column-mapping screen. For a PDF, the user is told to download the Excel or CSV version instead. The first target is Angel One: its Tax P&L (Excel and PDF) and its mutual-fund capital gains report. The work adds a generic sold-lots reader that takes rows of cells from any source, a PDF module that rebuilds table rows from word positions, a new `pnl` table kind, hooks so the import UI tries the new reader after the existing broker-specific ones, and an engine change so the new format gets the same handling as Zerodha's Tax P&L when a tradebook is also present.

**How the existing system works, per this document.** There is a Zerodha-specific Tax P&L reader, plus other "known broker readers". There is a generic table parser with field aliases and table kinds (`trades`, `holdings`). There is a column screen where users map columns by hand. There is a PDF text path built on pdf.js that already reads "CAS" statements. The engine decides whether a gain is long-term or short-term from the buy and sell dates and tax rules (`isLongTerm`, `rulesFor`). Money is held as integer paise. When a Zerodha Tax P&L and a tradebook are both imported for an account, the engine drops the Tax P&L's exits, except buyback sells. Saved data ("families") has a fixed shape that must not change.

Constraints: parsers may import only engine code and packages. pdf.js is reached only through an existing interface, with eval disabled. Broker term columns never decide the term. Transfers, open positions, holdings, dividends, charges and derivatives are never treated as sales. Test fixtures are made up. A fixed message is shown when a PDF is rejected. The six review-focus items list the riskiest behaviours and the test that covers each.

## Paraphrase: DetailedRange (lines 38-136)

- **Task 1:** Move the buyback decision out of the Zerodha reader into a shared module. A buyback exit is booked as a capital gain, treated as a dividend, or treated as company-paid, depending on its date. Shared helpers merge buybacks into totals and word the warnings the same way.
- **Task 2:** Add sold-lots fields (buy/sell date, buy/sell value, charges, gain, 31 Jan 2018 value) with aliases. Allow two gain columns (`gain`, `gainLt`). Normalise headers by removing bracketed suffixes and trailing dots. Block some misleading headers. Make sold-lots fields win over generic date/amount/price aliases. Detect kind `pnl` when the five core fields are mapped. Let the column-screen path parse `pnl` rows into buy and sell transactions.
- **Task 3:** `readSoldLots` walks every sheet and row. It finds header rows, treats one-cell rows as section titles, and skips totals, blank rows, excluded sections, derivative sheets and option columns. It validates each row and turns it into buy and sell transactions. It checks the gain column against sell minus buy minus charges, within 1 rupee. It builds a summary: broker name from title rows, period, short- and long-term totals using the engine's term (not the broker's), buybacks merged, fund totals left empty. It also assigns a confidence: high means auto-import, medium means a preview for the column screen, low means no sold-lots table found.
- **Task 4:** Split PDF extraction so one document open yields both text lines and positioned words. Group words into lines by baseline. Set column starts from a header line, merge wrapped headers and wrapped cells, recognise section titles at the margin, and output rows in the same shape as Excel.
- **Task 5:** The engine's Tax P&L check recognises the new `Tax P&L · ` format prefix as well as Zerodha's, so the new reports get the same "drop exits beside a tradebook" treatment.
- **Task 6:** Wire the reader into spreadsheet, CSV and PDF import with confidence-based outcomes. Show sold-lots fields on the column screen only for `pnl`. Make the Angel Tax P&L a normal import-guide step. Use the broker's own name in the success message.
- **Task 7:** Extend a private real-file check script that prints only counts and match/no-match. Run it on the real Angel files. Run typecheck, tests and smoke tests. Do a browser check. Open follow-up issues. Run reviews and open the PR.

I could paraphrase both sections, but with gaps. The main ones: what "beside a tradebook" means and why exits are dropped, what the outcomes "statement", "table with its preview" and "today's preview" are, and what the alias and section tables contain.

## Findings

1. **Major. Contradiction about "Cost Of Acquisition" (lines 33 and 58).** Line 33 says "Cost Of Acquisition" is never the gain or the cost. Line 58 maps it to `buyValue` when no other header did. Fix: state the rule once, and make Review Focus 3 match.
2. **Major. Low confidence cannot have a sold-lots table (lines 78 and 123).** Line 123 has a case for "low with a sold-lots table", which line 78 rules out. Fix: drop "or low", or redefine low. Also say what happens when a table is found but no rows parse.
3. **Major. Signature mismatch (lines 71 and 123).** The PDF call passes `{ rows }` with no `sheet`. Fix: pass a sheet name, or make `sheet` optional and say how the sheet-name skip behaves for PDF and CSV.
4. **Major. The alias table and the section table are not in this document (lines 56 and 74).** Fix: copy both tables into the plan, or at least list each field's aliases and each section's action.
5. **Major. "Beside a tradebook" is never explained (lines 12, 35 and 114-115).** The plan does not say why exits are dropped (counting the same sale twice), why buyback sells are the exception, or how the broker totals still carry the gains. Fix: add two sentences to Architecture.
6. **Major. Import outcomes are undefined (lines 5, 78 and 122-123).** The terms "statement", "table with its preview" and "today's preview" are never defined. Line 5 says low lands on the column screen, but line 122 gives low its own outcome. Fix: define each outcome by what the user sees.
7. **Major. Task 2 depends on Task 3 (line 61).** Fix: move the row code into Task 2 or reorder the tasks.
8. **Major. Buyback periods are not mapped to outcomes (lines 46 and 49).** Fix: give the dates behind `rules.start` and `BUYBACK_DIVIDEND_FROM`, and the expected outcome for each period.
9. **Major. The order of PDF row rules is ambiguous (lines 102-105).** A section title that appears after a data row would be merged into that row. Header-joining has no stopping condition. "Single word" is unclear for multi-word titles. Fix: give the rules as an ordered list, define "word" as one pdf.js text item, say when header-joining stops, and say where "Sub total" lines are dropped.
10. **Major. "Required field" is not defined (line 78).** Intraday tables have no buy or sell date, so they may never reach high. Fix: list the required fields for delivery, intraday and fund tables.
11. **Major. What happens when both gain columns are filled (line 56).** Fix: state which header becomes `gain` and which `gainLt`, give a tie rule, and say whether `gainLt` goes into `FIELDS`.
12. **Major. Gain formula and STT (lines 33 and 75).** STT is never defined. The plan does not say whether a broker's charges column includes STT, or when sell − buy is used instead of sell − buy − charges. Fix: state both.
13. **Major. The grandfathering rule is vague (lines 75 and 87).** Fix: state the formula. The cost is the higher of the actual cost and the lower of the 31 Jan 2018 value and the sale value. Say when the check accepts it.
14. **Nit/Major. Unclear wording in the summary item (line 77).** "Share short-term and long-term" reads as a verb. Intraday's total is not named. The `BrokerSummary` fields are not described. Fix: list the fields and what fills each one.
15. **Major. Project-specific terms used without definition.** Each of these needs a one-line gloss or a pointer:
    - "Plan" and "booked gains"
    - column screen
    - kind
    - `BrokerSummary`
    - saved families and format string
    - `TaxPnlResult` and `TablePreview`
    - CAS
    - `parseStatementLines`
    - `guessMapping`
    - the "four known readers"
    - `brokerSummaries` and the `open`/`done` steps
    - "the room"
    - `successDiff`
    - `readLine`
    - `isTaxPnl`
    - `PdfJsLike`
    - `rules.start` and `BUYBACK_DIVIDEND_FROM`
    - `toPaise` and `toQty`
    - "Open Sell" and "Qty Breakup"
16. **Nit. Rounding rule is vague (line 23).** Fix: say which division is rounded.
17. **Nit. Goal sentence is hard to parse (line 5).** Fix: split it into three sentences and tie "clear" to high confidence.
18. **Nit. Undefined tools and assumed setup (lines 132 and 136).** The thermo-nuclear review, the guardrail-reviewer agent, `/code-review` and `data/private/AngleOne` (spelled "Angle") are not explained. Fix: describe each briefly.
19. **Nit. "The tax year of the sales" (line 77).** Fix: say that Indian tax years run April to March.
20. **Nit. CSV sheet name (line 122).** The sheet-name skip depends on the name, so say what name a CSV gets. This ties to finding 3.

## Orchestrator triage (not from the reviewer)

- **Overlaps with Stage 5:** finding 2 is Stage 5 A4, finding 3 is Stage 5 A2 (the signature), finding 7 is Stage 5 A10, and finding 12 is close to Stage 5 A3 (charges in the cost).
- **New and worth fixing in the plan:**
  - finding 1 (the Cost Of Acquisition contradiction)
  - finding 5 (why exits are dropped)
  - finding 6 (outcome names)
  - finding 8 (buyback period outcomes)
  - finding 9 (PDF rule precedence)
  - finding 10 (required fields per table type)
  - finding 11 (the gain/gainLt tie rule)
- **Lower value for this repo:**
  - Findings 4 and 15 ask the plan to copy the spec and gloss repo terms. The plan points at the spec on purpose, and its readers are agents with the codebase open.
  - A short glossary line for "beside a tradebook", "column screen" and "format string" would still help.
