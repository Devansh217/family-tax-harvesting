# B2: a generic Tax P&L reader for Excel, CSV and PDF (design)

28 Nov 2026. Issue [#28](https://github.com/Devansh217/family-tax-harvesting/issues/28). Source: founder feedback point 1 (an Angel Tax P&L was not recognised). Decided with the founder in this session.

**Status: approved and built** (branch `b2-generic-tax-pnl`). The layouts were checked against the real Angel files (three years of Tax P&L in Excel and PDF, two years of the fund capital gains report).

## As built: where it differs from the design below

- **Fund-only reports have no broker totals.** A report with only fund sales (Angel's fund capital gains statement) is read as "Fund capital gains · <broker> …": plain trades with no `BrokerSummary`, so it is not a Tax P&L and is kept beside a share tradebook in the same account.
- **Funds in a mixed report do get totals.** When a Tax P&L also has shares, its fund sales are dropped beside a tradebook like the rest, so their gains go into the mutual fund totals, with the listed-equity term. A debt fund's term may differ; that moves gain between short-term and long-term, but none is lost.
- **The column screen imports a sold-lots table only when it is the whole report.** It sees only the biggest sales table. When the report had more tables (intraday, buyback), a lot didn't read, or share sales span more than one tax year, the file is turned away with the advice to download one tax year as Excel or CSV. A partial Tax P&L would either carry totals that miss sales, or have its exits dropped beside a tradebook that doesn't hold them; a guardrail review showed both raise room. A row with a name and a sale date but no readable quantity counts as a lot that didn't read. A fund-only report spanning years still reads, since it has no totals. The engine and the parser share the prefix as `TAX_PNL_PREFIX`.
- **Only a P&L for the current tax year corrects booked gains.** The engine ignores broker totals whose period falls outside this tax year; before, last year's report was booked into this year.
- **An empty report still reads** (no sales that year): high confidence with zero lots, so the guide can mark the year as in.
- **Charges are part of the cost.** Each lot's buy amount is buy value plus charges, so the engine's gain is sell − buy − charges, as the law allows. STT is never added. The gain check also accepts sell − buy − charges − STT for an intraday row, where STT is deductible from business income.
- **Angel's Tax P&L is a guide step like Zerodha's.** A member with an Angel account is done only once that year's Tax P&L is in. The import guide's "unreadable" step status is gone.
- **Real-file check (`npm run check:private`):** Excel and PDF give the same lots for all three years. With the engine rebuilding gains, long-term matches Angel and all sales together match. Two split lines differ, both by design: ETFs sold in the shares section stay "check" until the fund list classifies them (the script has no fund list), and a same-day sell and rebuy of one share is intraday in the engine (`splitIntraday`) where Angel keeps it as delivery.
- **Follow-ups opened:** dividend income ([#57](https://github.com/Devansh217/family-tax-harvesting/issues/57)) and carried-forward losses from last year's Tax P&L ([#58](https://github.com/Devansh217/family-tax-harvesting/issues/58)).

## Why

The app reads one Tax P&L: Zerodha's workbook, by its sheet names. Any other broker's report is turned away (PDF), or lands on the column screen as a trade or holdings file, which it is not. So for an Angel account the Plan's booked gains come only from tradebooks, and units bought before the history have no cost.

## Founder's decisions (28 Nov)

- **Keep it simple.** One generic reader for sold lots: Excel and CSV first, PDF through the same reader.
- **Prefer established open-source code** over our own wherever it does the job (see "Libraries").
- **Known layouts only.** Nothing about a confirmed layout is stored, so saved families are untouched.
- **The import guide recommends Excel or CSV.** PDF is accepted, but it is the second choice.
- **Dividends are skipped**, and a new issue covers declaring dividend income.
- **Out of B2:** carried-forward losses from last year's Tax P&L, the opening-holdings snapshot and its long-term/short-term split (B3 #29 reads holdings), remembered layouts. Each one that is still wanted becomes its own issue.

## Libraries

Reading files is done by established open-source code. Understanding what a column means is ours, because no library does it.

| Job | Library | Status |
|---|---|---|
| Excel cells | `read-excel-file` (MIT) | Already a dependency. Gives every sheet as rows, dates as dates. |
| CSV cells | parser in `parsers/common.ts` | Already in. Handles quotes, BOM, tab and semicolon files. PapaParse would do the same, so it isn't added. |
| PDF words and their positions | `pdfjs-dist` (Mozilla pdf.js, Apache-2.0) | Already a dependency, used for the CAS. Run with `isEvalSupported: false`. |
| Column meaning | header dictionary in `parsers/table.ts` | Ours, extended here. |

**PDF table libraries tried and ruled out (28 Nov):**

- **`pdf-parse` 2.4.5** (the most used JS PDF library, has `getTable()`): found **no tables** in any of the three Angel PDFs. It detects tables drawn with ruled lines; Angel's tables are aligned text. It would also bring a second pdf.js (5.x) beside ours (4.x).
- **`pdfplumber-wasm`, `pdfni`, EdgeParse** (Rust compiled to WebAssembly): all months old with few users, and WebAssembly needs a CSP change (`wasm-unsafe-eval`), which GUARDRAILS §5 doesn't allow for this.
- **Tabula, Camelot, pdfplumber (Java and Python):** need a server, and statements stay in the browser (GUARDRAILS §4).
- **SheetJS (`xlsx`)** for Excel: its npm package is frozen at an old version with known advisories; newer builds come only from its own CDN, which breaks pinned dependencies and the CSP.

So the PDF path is pdf.js plus about a hundred lines of ours that turn positioned words into rows and columns. On the real files this gave the same rows and the same long-term and short-term totals as Angel's own summary, for all three years.

## What the real files look like

**Angel Tax P&L, Excel** (same layout in all three years):

- Sheet "Summary": label and value pairs, including "Financial Year", "From Date", "To Date", and taxable delivery P&L (LTCG and STCG) with and without buyback.
- Sheet "Equity+Bonds+SGB Trade Details": a section title row, then its own header row, then rows and a "Sub total". Sections in order: Intraday (Speculation), **Delivery P&L**, Buyback Transactions, Transfer Transactions, Open Sell, Open Holdings as of a date, Qty Breakup.
- Delivery P&L headers: ISIN, Scrip Name, Qty, Buy Date, Sell Date, Avg Buy Price, Buy Value, Avg Sell Price, Sell Value, Cost Of Acquisition, Charges and Statutory Levies, STT, Net Profit/Loss, Long term taxable income, Short term taxable income, Purchase Type, Type of instrument.
- Sheet "Derivatives Trade Details": Futures and Options with Buy Date, Sell date, Buy Value and Sell Value too. It must not be read as share sales.
- Sheets "Non Trade Charges" and "Dividend Report": not read.

**Angel Tax P&L, PDF:** the same sections and headers, one table row per line, each cell placed under its header. Header cells and long cells wrap onto a second line.

**Angel fund capital gains report** ("Statement", Excel): one sheet, a summary row, then headers: Type of Mutual Fund, ISIN, Description of Mutual Fund sold, Number of Units, Date of Purchase (DD/MM/YYYY), Purchase NAV, Purchase Value, Date of Sale (DD/MM/YYYY), Sale Price per Unit, Sale Value, FMV as on 31 Jan. 2018, Transfer Expenses, Realized short term Capital gains, Realized long term Capital gains.

**Findings that shape the design:**

- **Taxable gain = sell value − buy value − charges** on every Angel delivery row (STT is not deducted, as the law says). "Net Profit/Loss" also takes off STT, so it is not the taxable figure. "Cost Of Acquisition" is not the buy value and is not used.
- The rows' taxable figures add up to Angel's summary totals, long-term and short-term, in all three years.
- The term the engine gets from the dates (12 months for a listed share) agreed with Angel's long-term or short-term column on every row.
- "Transfer Transactions" have Buy Date, Transfer Date, Buy Value and Transfer Value. They are shares moved out, not sold, so they must never be read as sales.
- "Open Sell" rows have a sell date but no buy: skipped.
- The fund report's gain matches sale value − purchase value − transfer expenses on every row.

## Goals

- An Excel, CSV or PDF report of sold lots from any broker reads on its own when its headers are clear, and lands on the column screen when they are not (PDF: rejected with "download the Excel or CSV version").
- Its share sales feed the broker totals (`brokerSummaries`), so the Plan's booked gains match the broker for that account (GUARDRAILS §1, "broker totals win").
- The Zerodha Tax P&L and every other reader keep working exactly as today.

## Non-goals

- Carried-forward losses, the holdings snapshot, dividends, remembered layouts.
- Changing the engine's tax rules, move sizing or `brokerAdjustments`.

## Anti-goals

- The broker's long-term or short-term label deciding a term. The engine decides it from the dates (`engine/rules.ts`).
- A transfer, open sell, F&O or holdings row read as a sale.
- A file read wrongly with no sign. Unclear files go to the column screen; rows that fail checks are counted on the card.
- Statement content leaving the browser (GUARDRAILS §4).

## Approaches considered

1. **One sold-lots reader over rows of cells, fed by Excel, CSV or PDF (chosen).** Excel and CSV already give rows. PDF words become rows by their positions. The same header dictionary, section rules, row checks and confidence apply to all three.
2. **A reader per broker** (like `zerodhaTaxPnl.ts`). Precise, but the founder asked for one generic reader, and every new broker would need code.
3. **An established PDF table library.** Tried: none finds Angel's tables, or none is safe to ship (see "Libraries").

## Design

### 1. Fields

`FIELDS` in `parsers/table.ts` gains:

| Field | Label | Headers it matches (from the real files, plus common names) |
|---|---|---|
| `buyDate` | Buy date | Buy Date, Date of Purchase, Purchase Date, Entry Date, Date of Acquisition |
| `sellDate` | Sell date | Sell Date, Date of Sale, Sale Date, Exit Date, Buyback Date |
| `buyValue` | Buy value | Buy Value, Purchase Value, Cost of Acquisition (only when no buy value column exists) |
| `sellValue` | Sell value | Sell Value, Sale Value, Full Value of Consideration, Buyback Value |
| `charges` | Charges (optional) | Charges and Statutory Levies, Transfer Expenses, Brokerage |
| `gain` | Taxable gain (optional) | Taxable Profit, Taxable P&L, Long term taxable income, Short term taxable income, Realized short/long term Capital gains, Profit |
| `fmv2018` | 31 Jan 2018 value (optional) | FMV as on 31 Jan. 2018, Fair Market Value |

Headers may carry a suffix in brackets, such as "(DD/MM/YYYY)"; matching ignores it. "Transfer Date" and "Transfer Value" match nothing. A broker's term column is never a field. Where a file splits the gain into a long-term and a short-term column, the row's gain is whichever one is filled.

### 2. Kind

`detectKind` returns `pnl` when the mapping has `buyDate`, `sellDate`, `qty` and both values. It is checked before `trades`, because a P&L also has a date and a quantity.

### 3. Rows from each format

- **Excel:** every sheet, as `read-excel-file` gives it.
- **CSV:** the existing parser.
- **PDF** (new, `parsers/pdfTable.ts`): pdf.js words with their x and y. Words on the same baseline make a line (as `extractLines` does today). A line that scores as a header sets the columns at its words' x positions; header words on the next lines with no numbers join the header above them. Each later line puts each word under the column that starts nearest to its left. A line with no number and no ISIN after a row is a wrapped cell and joins that row. A single word at the left margin is a section title. The output is plain rows of cells, as from Excel.

### 4. Finding the tables

A report has a summary, several sections and a header row per section. The reader:

- looks at **every sheet** (and every PDF page), and at **every row that scores as a sold-lots header**, not only the first 30 rows;
- treats a row with one filled cell as a **section title**, and decides what to do with the rows under it:

| Section title or sheet | What happens |
|---|---|
| Delivery, Short Term, Long Term, Equity, Mutual Fund, or none | Read as sales |
| Intraday, Speculation | Read as same-day sales (needs only a date, not buy and sell dates) |
| Buyback | The Zerodha rule: booked only when it is a capital gain under that year's rules, else counted in a note. The rule moves into a shared helper both readers call. |
| Transfer, Open Sell, Open Holdings, Holdings, Qty Breakup, Dividend, Charges | Skipped |
| F&O, Futures, Options, Derivatives, Currency, Commodity (title or sheet name), or a table with Expiry, Strike or Option Type columns | Skipped |

- skips "Sub total" and "Total" rows, and blank rows.

### 5. Each row

A row becomes a buy at its buy date and a sell at its sell date, for the same units and values, as the Zerodha reader does. The engine works out the gain and the term. A row is read only when:

- both dates parse, and the sale is on or after the buy;
- the quantity is above zero, and both values are numbers;
- when the file has a gain column: sell − buy − charges, or sell − buy, equals the gain within ₹1. For a buy before 1 Feb 2018, the 31 Jan 2018 value may stand in for the cost. A row that fails is still read but counted as a mismatch on the card.

### 6. Confidence

| Confidence | When | What happens |
|---|---|---|
| High | Every required field matched by its header, at least one row read, 9 in 10 rows or more pass the checks, and all sales fall in one tax year | Read on its own, like the Zerodha report |
| Medium | A sold-lots table, but any of the above fails | Excel or CSV: the column screen, opened, with the guess filled in. PDF: rejected with "download the Excel or CSV version" (a PDF has no column screen) |
| Low | No sold-lots table | As today: the column screen for Excel and CSV, "Unrecognised PDF" for a PDF |

The card shows rows read, rows skipped and mismatches.

### 7. Broker totals

The reader builds a `BrokerSummary` from the rows, so `brokerAdjustments` has totals to match:

- **Broker:** the name in the title rows (Angel One, Zerodha, Groww, Upstox and others), else "Broker".
- **Period:** "From Date" and "To Date", a "from … to …" line, or a "Financial Year" line; else the tax year of the sales.
- **Shares, short-term and long-term:** each row's taxable gain (the gain column, else sell − buy − charges), summed by the engine's own term for a listed share (`isLongTerm` with that year's `longTermMonths`). An ISIN starting INE, or a symbol-only row, is a share.
- **Funds** (ISIN starting INF): left empty. A fund's term depends on its tax type, which the ISIN alone doesn't give (D1 #40). Fund rows still import as trades where the account has no tradebook.
- **Intraday:** the same-day rows' gains. **F&O:** not read.

The format name is "Tax P&L · <broker>". `isTaxPnl` (`engine/openingLots.ts`) learns it, so these exits are dropped beside a tradebook exactly like Zerodha's, and the totals do the work. The Zerodha format name doesn't change, so saved families compute the same.

### 8. Where it plugs in

- `ui/readers.ts`: the Zerodha, Angel trades and Angel fund holdings checks stay first. Then each sheet is previewed; a high-confidence `pnl` returns a statement, a medium one the table screen. CSV the same.
- The PDF path: `parseStatementLines` keeps the CAS first. A PDF that isn't a CAS goes through `pdfTable.ts` and the sold-lots reader; high confidence imports, anything less gets: "This PDF could not be read reliably. Download the Excel or CSV version of the report and import that."
- The column screen shows the new fields when the kind is `pnl`. "Also import its exits" works as for Zerodha.
- The import guide says Excel or CSV is the best format for a Tax P&L, with PDF accepted.
- Module boundaries hold: `parsers/pdfTable.ts` takes the pdf.js text items through the existing `PdfJsLike` interface, so parsers still import only the engine and packages.

### 9. Saved families

No stored shape changes. Only new imports produce the new format.

## Testing

- Fixtures with made-up figures that copy the real headers and sections (no real names or amounts): Angel Excel rows, Angel PDF text items (words with x and y), the fund report, and a CSV.
- Unit tests: header aliases and bracket suffixes; `pnl` kind; every section rule in the table above; Transfer and Open Sell never read as sales; derivatives skipped; each row check; grandfathered rows; confidence levels; PDF line building with wrapped header and cells; the summary with hand-checked rupee figures and engine terms (a 13-month share sale is long-term even if labelled short-term, and the reverse).
- The Zerodha Tax P&L tests pass unchanged.
- `scripts/check-private.ts` prints, for the real files: format, rows read, skipped, mismatches, and whether the totals match the file's own summary. Counts and match/no-match only.
- Browser check: import the Angel Excel and PDF for a test member and see booked gains match Angel's totals.

## Done when

- The Angel Tax P&L reads on its own in Excel and in PDF, for all three years, and the fund capital gains report reads on its own.
- For an Angel account with tradebooks, the Plan's booked share gains match Angel's totals.
- The Zerodha Tax P&L reads as before.
- New issues are open for dividend income and carried-forward losses from last year's Tax P&L.
