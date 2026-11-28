# Generic Tax P&L Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any broker's report of sold lots (Excel, CSV or PDF) reads on its own when its headers are clear, feeds the broker totals so the Plan's booked gains match the broker, and lands on the column screen (or a clear "use Excel or CSV" message for PDF) when it is not clear. First real target: Angel One's Tax P&L in Excel and PDF, and Angel's fund capital gains report.

**Architecture:**
- `parsers/table.ts` learns the sold-lots fields and a `pnl` kind.
- A new `parsers/soldLots.ts` reads rows of cells from any source: finds every header, follows section titles, checks each row, scores confidence and builds a `BrokerSummary`.
- A new `parsers/pdfTable.ts` turns pdf.js words with positions into the same rows of cells.
- `ui/readers.ts` and the PDF path in `ui/screens/Import.tsx` try the new reader after the known broker readers.
- `engine/openingLots.ts` treats the new format like Zerodha's Tax P&L beside a tradebook.

**Tech Stack:** TypeScript, React + Vite, Vitest, Playwright smoke. No new dependency (`pdfjs-dist` and `read-excel-file` are already in).

**Spec:** `docs/superpowers/specs/2026-11-28-generic-tax-pnl-design.md`. Issue [#28](https://github.com/Devansh217/family-tax-harvesting/issues/28).

## Global Constraints

- **Module boundaries:** parsers import only `engine/` and packages (`boundaries.test.ts`). `pdfTable.ts` takes pdf.js through the existing `PdfJsLike` interface, never imports `pdfjs-dist`.
- **pdf.js safety:** every `getDocument` call passes `isEvalSupported: false` (CVE-2024-4367).
- **Terms:** the engine decides long-term or short-term from the dates (`isLongTerm` with `rulesFor(sell).longTermMonths`). A broker's term column only picks which gain column is filled; it never sets a term.
- **Money and units:** integer paise via `toPaise`, units via `toQty`. One `Math.round` at a division.
- **Never a sale:** Transfer, Open Sell, Open Holdings, Holdings, Qty Breakup, Dividend, Charges sections; F&O, Futures, Options, Derivatives, Currency and Commodity by section title, sheet name, or Expiry/Strike/Option Type columns.
- **Saved families:** no stored shape change. The Zerodha format string is unchanged.
- **Privacy:** fixtures are made up and copy only headers and section titles from the real files. No real names, client codes or amounts in tests, commits, issues or logs. `check-private.ts` prints counts and match/no-match only.
- **Copy:** plain English, no emojis. PDF rejection text: "This PDF could not be read reliably. Download the Excel or CSV version of the report and import that."

## Review Focus

1. **Transfers are not sales.** "Transfer Date" and "Transfer Value" must map to nothing, and the Transfer section is skipped even if a mapping were found. Test: Task 3, `never reads a transfer as a sale`.
2. **Derivatives sheet.** It has Buy Date, Sell date, Buy Value, Sell Value and Qty, so it would score as `pnl`. Test: Task 3, `skips options rows by sheet, section and expiry columns`.
3. **Taxable gain.** Gain = sell − buy − charges; STT is not deducted; "Net Profit/Loss" and "Cost Of Acquisition" are never the gain or the cost. Test: Task 3, `uses the taxable column, not net profit`.
4. **Term from dates.** A row in Angel's short-term column held 13 months counts as long-term in the summary, and the reverse. Test: Task 3, `summary terms come from the engine`.
5. **Beside a tradebook.** The new format's exits are dropped beside a tradebook (except buyback sells), as Zerodha's are. Test: Task 5, `generic Tax P&L exits are dropped beside a tradebook`.
6. **Zerodha unchanged.** All existing Zerodha Tax P&L tests pass with no edits.

---

### Task 1: Shared buyback rule

**Files:**
- Create: `src/parsers/buyback.ts`, `src/parsers/buyback.test.ts`
- Modify: `src/parsers/zerodhaTaxPnl.ts`

- [ ] Move the buyback check out of `parseZerodhaTaxPnl` into `buybackOutcome(exit: ISODate): 'book' | 'dividend' | 'companyPaid'` (book when `rulesFor(exit).buybackIsCapitalGain && exit >= rules.start`; else `dividend` from `BUYBACK_DIVIDEND_FROM`, `companyPaid` before it).
- [ ] Move `withBuybacks` and the two buyback warning sentences into the same file, exported, so both readers word them the same.
- [ ] Zerodha reader calls them; its tests pass unchanged.
- [ ] Tests: one exit per period (before 1 Oct 2024, 1 Oct 2024 to 31 Mar 2026, from 1 Apr 2026); `withBuybacks` keeps, adds, or adds only a gain, as today.

### Task 2: Fields, aliases and the `pnl` kind

**Files:**
- Modify: `src/parsers/table.ts`, `src/parsers/index.ts`, `src/parsers/parsers.test.ts`

- [ ] Add `buyDate`, `sellDate`, `buyValue`, `sellValue`, `charges`, `gain`, `fmv2018` to `FIELDS`, with labels and aliases from the spec table. Add a second gain alias set so a file with both "Long term taxable income" and "Short term taxable income" (or "Realized long/short term Capital gains") maps both: store them as `gain` and `gainLt` (`gainLt` optional, label "Long-term gain"). The row's gain is whichever is filled.
- [ ] Header matching strips a bracketed suffix and trailing dots before testing ("Date of Purchase (DD/MM/YYYY)" → "Date of Purchase").
- [ ] "Transfer Date", "Transfer Value", "Net Profit/Loss" match nothing. "Cost Of Acquisition" maps to `buyValue` only when no other header did.
- [ ] Make sure the existing `date` alias does not grab "Buy Date"/"Sell Date" and `amount`/`price` don't grab "Buy Value"/"Sell Value"/"Purchase NAV" when the sold-lots fields claim them: guessMapping tries the sold-lots fields first.
- [ ] `detectKind` returns `'pnl'` when `buyDate`, `sellDate`, `qty`, `buyValue` and `sellValue` are all mapped; checked before `trades`.
- [ ] `parseTable` with kind `pnl` (the column-screen path) produces buy and sell txns per row, sharing the row code from Task 3.
- [ ] `parseTablePreview` labels it "Tax P&L · <file name>".
- [ ] Tests: Angel delivery header, Angel intraday header (has "Transaction Date", no buy/sell dates: kind stays non-pnl on its own, handled by sections in Task 3), Angel fund report header, a Zerodha tradebook header still `trades`, a holdings header still `holdings`.

### Task 3: The sold-lots reader

**Files:**
- Create: `src/parsers/soldLots.ts`, `src/parsers/soldLots.test.ts`, `src/parsers/fixtures/soldLots.ts` (made-up rows)
- Modify: `src/parsers/index.ts`

Signature: `readSoldLots(sheets: { sheet: string; rows: string[][] }[], source: 'excel' | 'csv' | 'pdf'): { confidence: 'high' | 'medium' | 'low'; result?: TaxPnlResult; preview?: TablePreview }`.

- [ ] **Tables:** walk every sheet and every row. A row scoring as a sold-lots header (or an intraday header: ISIN or symbol, qty, a date, buy value, sell value) starts a table with its own mapping. A row with one filled cell is a section title. "Sub total", "Total", "Grand total" and blank rows are skipped.
- [ ] **Sections:** apply the spec's section table. Skip by section title, by sheet name (`/derivative|f&o|futures|options|currency|commodity/i`), and by a header holding Expiry, Strike or Option Type. Intraday sections read the one date as both buy and sell date. Buyback sections use Task 1.
- [ ] **Rows:** both dates parse, sell ≥ buy date, qty > 0, values numeric. Each row gives a buy and a sell txn (units `toQty`, amounts `toPaise`, buyback rows marked `buyback: true`). When a gain column exists, check sell − buy − charges (or sell − buy) equals the gain within ₹1; for a buy on or before 31 Jan 2018 the 31 Jan 2018 value may stand in for the cost. A failing row still imports and counts as a mismatch.
- [ ] **fmv2018:** per ISIN per unit, as the Zerodha reader does.
- [ ] **Summary:** broker from title rows (`/angel|zerodha|groww|upstox|icici|hdfc|kotak|dhan|5paisa/i`, else "Broker"); period from "From Date"/"To Date" label pairs, a "from … to …" line or "Financial Year", else the tax year of the sales. Share short-term and long-term: each delivery row's gain (gain column, else sell − buy − charges) by the engine's term; buyback rows folded in with `withBuybacks`. Intraday: same-day rows. Funds (ISIN `INF…`): `mfShortTerm`/`mfLongTerm` left null. F&O null.
- [ ] **Confidence:** high when every required field matched by header, at least one row read, ≥ 90% rows pass checks, and all sales fall in one tax year. Medium when a sold-lots table exists but any of that fails (returns a `preview` for the column screen). Low when none.
- [ ] **Format:** `Tax P&L · <broker>` plus ` · <from> to <to>` when known. Warnings: rows read, skipped and mismatches; buyback lines from Task 1; "This report covers sales only. Import holdings or the tradebooks as well to see what is still held."
- [ ] Tests (made-up figures, real headers):
  - `reads an Angel-shaped workbook on its own` (Summary sheet, intraday, delivery, buyback, transfer, open sell, open holdings, qty breakup, derivatives, dividend sheets)
  - `never reads a transfer as a sale`
  - `skips options rows by sheet, section and expiry columns`
  - `uses the taxable column, not net profit`
  - `summary terms come from the engine`
  - `fund rows import but leave fund totals empty`
  - `reads the fund capital gains report` (grandfathered row included)
  - `a row failing the check counts as a mismatch`
  - `sales in two tax years drop to medium`
  - `unclear headers give a preview, not a statement`
  - `CSV with the same columns reads the same`

### Task 4: PDF words to rows

**Files:**
- Create: `src/parsers/pdfTable.ts`, `src/parsers/pdfTable.test.ts`
- Modify: `src/parsers/pdfText.ts`, `src/parsers/index.ts`

- [ ] In `pdfText.ts`, split the open-and-iterate part of `extractLines` into `extractItems(pdfjs, data, password): Promise<PdfWord[][]>` (per page: `{ str, x, y, width }`); `extractLines` builds on it unchanged. One document open serves both CAS lines and table rows.
- [ ] `pdfRows(pages: PdfWord[][]): string[][]`:
  - words on one baseline (within 2pt) make a line, pages in order;
  - a line scoring as a header sets column starts at its words' x; following lines with no number join the header text column by column (wrapped headers);
  - a single word left of the first column (x < first start − 5), or any single word before a header, is a section title row `[title]`;
  - each word goes under the column with the largest start ≤ x + 4;
  - a line with no ISIN and no number after a row joins that row's cells (wrapped cells);
  - output rows keep section titles and headers, so `readSoldLots` sees the same shape as Excel.
- [ ] Tests with synthetic words: wrapped header ("Avg Buy" / "Price"), wrapped cell ("Equity/Corporate" / "Bonds"), section title at the margin, two pages with a header repeated, sub total line.

### Task 5: Engine treats the new format as a Tax P&L

**Files:**
- Modify: `src/engine/openingLots.ts`, its test file

- [ ] `isTaxPnl` matches `Zerodha Tax P&L` or `Tax P&L · `.
- [ ] Tests: `generic Tax P&L exits are dropped beside a tradebook`, `buyback sells are kept`, `kept when the account has no tradebook`, and a Zerodha case unchanged.

### Task 6: Wire it into import

**Files:**
- Modify: `src/ui/readers.ts`, `src/ui/screens/Import.tsx`, the column screen (where `FIELDS` render), `src/ui/importGuide.ts`, related tests

- [ ] `readSpreadsheet` (xlsx): after the four known readers, `readSoldLots(sheets, 'excel')`: high → statement, medium → table with its preview; low → today's preview. CSV the same with one sheet.
- [ ] PDF: add `readPdf(file, password)` returning lines and words from one open. `Import.tsx` runs `parseStatementLines` first; when it gives "Unrecognised PDF", run `readSoldLots([{ rows: pdfRows(words) }], 'pdf')`: high → statement; medium or low with a sold-lots table → the rejection text; otherwise today's message.
- [ ] Column screen shows the sold-lots fields only when the kind is `pnl` (trade and holdings files keep today's dropdowns).
- [ ] Import guide, Angel account: the Tax P&L step becomes a normal step (`open`/`done` from `brokerSummaries` like Zerodha's), with where text "Reports → Tax P&L → choose the year → download Excel (PDF also works)" and unlocks "Exact gains booked this year, so the room matches Angel One's figures." Generic import help says Excel or CSV is best for a Tax P&L.
- [ ] `successDiff`: "now matching <broker>'s figures" uses the summary's broker, not "Zerodha".
- [ ] Tests: importGuide Angel steps; readLine for a generic summary; existing Zerodha guide tests unchanged.

### Task 7: Real-file check, browser check, issues

- [ ] `scripts/check-private.ts`: run the new paths for xlsx, csv and pdf; print format, confidence, rows read, skipped, mismatches, and whether long-term and short-term totals equal the file's own Summary (match/no-match only).
- [ ] Run it on `data/private/AngleOne`: all three Tax P&L years match in Excel and PDF; the fund report reads; trade histories still read as trades.
- [ ] `npm run typecheck && npm test && npm run test:smoke`.
- [ ] Browser check on the dev server with a test member: import an Angel Tax P&L Excel and its PDF beside a tradebook; booked gains equal Angel's totals; the Zerodha Tax P&L still imports.
- [ ] Open issues: dividend income from a Tax P&L; carried-forward losses from last year's Tax P&L.
- [ ] Run the `guardrail-reviewer` agent, `/code-review` and the thermo-nuclear review; fix blocking findings; put them in the PR, which says `Closes #28`.
