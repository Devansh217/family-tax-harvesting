# Harvesting prototype v0.2

A working prototype of the family tax harvesting app. It reads your statements in the browser, works out each member's tax-free room lot by lot, and suggests moves. Nothing is uploaded: files are read on your device and data is kept in the browser's local storage.

## Run it

```bash
cd prototype
npm install
npm run dev
```

Open http://localhost:5199. It starts with a sample family; choose **Start my own family** to clear it.

## Test with your own statements

1. **Family**: add each person. Enter *other income* (salary, pension, interest) if you know it; blank means no bonus room is assumed.
2. **Import**: pick the member, then drop their files:

| What | Where to get it | Gives |
|---|---|---|
| Mutual fund CAS (PDF) | CAMS or KFintech website → CAS → **Detailed**, from the first purchase date | All MF transactions (any platform: ET Money, Groww, Zerodha Coin) and latest NAV |
| Zerodha tradebook (CSV) | Console → Reports → Tradebook, one file per year, equity segment | Share buys and sells |
| Groww / Angel One trade history (CSV or .xlsx) | Reports → order or trade history | Share buys and sells |
| Holdings (CSV or .xlsx) | Broker holdings page → download | Current prices and units |
| NSDL / CDSL CAS (PDF) | Monthly email from the depository | Current prices and units (no buy dates) |

CAS PDFs are usually locked with the PAN in capitals; the app asks for the password and does not store it.

If a table's columns are guessed wrong, open **Columns · check or change** on the file card and pick the right ones. For a PDF with missing transactions, **Show text read from the PDF** shows how the statement was read.

3. **Check**: open each member. Compare **Booked this year** with the broker's tax P&L for FY 2026-27. Warnings appear when a sale has no matching purchase (older statements missing) or units don't match a holdings statement.

### Checking files from the command line (privacy-safe)

Put files in `data/private/` at the repo root (git-ignored), then:

```bash
npm run check:private
```

```bash
PDF_PASSWORD=ABCDE1234F SHOW_SHAPES=1 npm run check:private
```

It prints only formats, counts, date ranges and warnings, never names, PANs or amounts. `SHOW_SHAPES=1` adds the layout of unread lines with digits and letters masked (`99-aa-99  aa  9,99.99`), which is enough to fix a parser without sharing the statement.

## What the engine does

- First-in-first-out lots per member and security; sells on a date are matched before that day's buys.
- Long-term after 12 months; LTCG 12.5% above ₹1.25 L per person, STCG 20%, 4% cess (no surcharge).
- 31 Jan 2018 grandfathering when the FMV is entered on the member page.
- Set-off: short-term losses against any gain, long-term losses only against long-term; carried-forward losses from the member form.
- Bonus room: unused basic exemption (₹4 L new regime) against gains, short-term first.
- Moves: harvest gains, gift to non-clubbed members (shares only), book losses against tax already due, wait for lots turning long-term within 90 days.
- Simulator: tax a sale would add, per member who holds the security.

Rules live in `src/engine/rules.ts` as data. Tests: `npm test` (37 tests across engine, parsers and import).

## Known gaps

- Bonus, split, merger and demerger lots are not adjusted yet; import corrected history or expect warnings.
- Intraday and F&O are ignored; only delivery equity and mutual funds count.
- Surcharge, NRI rules and the old-regime 87A interplay are not modelled.
- Prices come from imported statements; there is no live price feed yet.
- Parsers are built from published formats and synthetic samples; real statements may need small fixes.
