# Holdings-first engine: design

Date: 22 Nov 2026. Status: approach approved (option 1, reconcile on every compute); research folded in; design awaiting approval.
Source: the fresh import run on the live site, `notes/fresh-run-notes.md` (points 3, 4, 10, 11, 15, 16 and the "more data never spoils" rule).

Paths are under `prototype/src/` unless they say otherwise.

## Why

A family's plan must rest on what each member holds **today**. Today the engine replays every trade it has been given and treats the result as the truth, only *adding* units a holdings file shows that the history cannot explain. On a real run this went wrong in four ways:

- **Shares that left an account stay "held".** Off-market gifts, transfers, buyback tenders and the like never appear in a tradebook, so the buys stay in the history forever. They show in Holdings, in totals, in Simulate ("held by 2") and can get moves.
- **Funds are counted twice when the holdings file goes in before the fund tradebooks.** The holdings import saves a guessed lot for the full quantity (because no history existed yet), and later tradebooks add their buys on top. Results depend on import order.
- **Sales of units filled in from the holdings file get the wrong holding period.** The filled-in lot is dated "the day before the oldest trade", which can be under a year before a sale it feeds, so long-term units are booked short-term. Sales from a guessed-date lot are booked short-term even when they can only be long-term (ELSS, 3-year lock-in).
- **Pages are full of warnings that don't matter.** "Sold N more units than the history shows" appears once per lot, for every year, even for sales years ago that affect nothing today. One member had about 60 red lines.

The founder's direction: **the holdings file decides what is held; this year's Tax P&L decides what is booked; tradebooks are optional extras** that make costs and dates exact. Fewer files is worth leaving 10% of the room spare on average-cost units.

## Goals

1. **The newest holdings file for an account caps and fills what is held** in that account, on every compute.
2. **Import order and extra files never make figures wrong** ("more data never spoils"). Re-importing, duplicates, overlapping years and older files change nothing they shouldn't.
3. **Units filled in from a holdings file never make a sale look safer than it is.** Their cost never stacks above the broker's own figure. A sale whose holding period can't be proved is marked "term unknown" and counted the safe way.
4. **A sale from a guessed-date lot is never booked as short-term by guesswork.**
5. **Warnings show only what affects this year**, grouped by share, in a calm style.
6. **The broker correction shows as a correction**, not as a loss.
7. **A nudge on average-cost moves** says which tradebook would recover the 10% of room left spare.

## Non-goals (separate work)

- The guided import screen (holdings → Tax P&L → tradebooks newest first, "stop here, show my plan"). It's the next design and builds on goal 1's gap information.
- An Angel One holdings-file reader (shares, long-term units, SGBs). Until it exists, Angel accounts have no share holdings file and are not trimmed.
- An Angel One Tax P&L reader.
- Recognising gifts within the family and carrying the giver's cost (notes point 7).
- Stale-file warnings beyond what this design needs (notes point 2), wording fixes (points 5, 6, 8, 12) and Simulate copy.

## Anti-goals (failure even if it "works")

- **Booking a gain or loss for units that left an account.** The app cannot tell a transfer from a sale. A trimmed unit simply stops being held.
- **An older or stale holdings file removing units.** It must never trim when trades exist after its date.
- **Rewriting stored family data.** Repairs are worked out on every compute (GUARDRAILS §3). Families saved before the change compute the same or better with no migration.
- **Moves on guessed-date lots.** GUARDRAILS §1, "Known lots only", is unchanged.
- **More room shown than the truth, ever.** Less room than the truth by more than the existing cushion is also a failure. The one exception is sales of unknown term with no broker Tax P&L (section 5), which may show less room until the P&L is imported.

## Constraints

- All of `docs/GUARDRAILS.md`. In particular: room is the ceiling; `approx` lots keep `APPROX_MARGIN`; broker totals win; integer paise and `QTY_SCALE` units; the engine imports only the engine; behaviour changes ship with tests that failed first; tax and sizing changes carry hand-checked rupee tests; no personal data in fixtures (synthetic ISINs, names and amounts only).
- Free tier, no new dependencies.

## Approaches considered

1. **Reconcile on every compute (chosen).** Keep the first-in-first-out replay. In `effectiveTxns` (`engine/openingLots.ts`), compare the replay with the newest holdings file per account: remove the oldest extra units as "left the account" (no gain), and fill missing units from the file as today. Funds' fill-in moves from import time to compute time. Because first-in-first-out removes the oldest units first, the units left over are the newest purchases, the same result as building held units backwards from the file. Small, local change; saved families need no migration.
2. **Build held units from the holdings file, separately from realised gains.** Two calculations: walk back from the file through the newest purchases for today's holdings, and replay trades only for this year's sales. Cleaner on paper, but a large ledger change, and the two halves can disagree (a sale this year using units the walk-back counts as held), needing reconciliation rules anyway. Rejected: same holdings as option 1 at much higher risk.
3. **Held units from the holdings file only, ignoring tradebooks.** Rejected: throws away exact costs and dates the user already gave, so every move pays the 10% cushion.

## Design

### 1. Which holdings file decides

- A **holdings file** here means an account-level broker holdings export: today `source === 'Zerodha holdings'` (`parsers/zerodhaTaxPnl.ts`, `parseZerodhaHoldings`). The design should take a list of such sources so the future Angel reader joins by adding its source name. Snapshots that span accounts (demat CAS, Angel fund holdings, combined CAS) keep their own path (`withSnapshots`) and are **not** used to trim.
- **The file's date.** `parseZerodhaHoldings` doesn't read a date today, so positions are saved with no `asOf` and the engine falls back to today. The parser must read the statement date from the workbook. Zerodha's sheets carry a line like "Equity Holdings Statement as on YYYY-MM-DD" just above the summary. That date becomes `priceDate`, and so `asOf`, on every position from the file. **A file with no readable date never trims.** It only fills in, as today. Families saved before the change have no stored date, so they get no trimming until the holdings file is imported again. The Plan says so through `planGaps`: "Import <member>'s holdings file again so sold or moved shares drop out." (Builder check Q1.)
- **What counts as the same account.** Account labels are free text (`opts.account`, prefilled by `guessAccount`). A file trims only the history whose label matches its own after trimming spaces and ignoring case. **A blank label never trims.** Two real accounts at one broker sharing a label are the user's labelling error, and the stale-date rule limits the damage. (Builder check Q3.)
- **Rows the file couldn't read.** The parser counts rows with no previous close as `skipped`, and saves rows without an ISIN as `SYM:<symbol>`. Neither may cause a removal. The parser keeps a held row even when it has no price: it carries `qty` and is marked unpriced, so the file still "lists" it. A history ISIN whose symbol matches one of the file's `SYM:` rows is never trimmed. If `skipped > 0` after that, the file doesn't trim at all and says why on its card. (Builder check Q4.)
- For each (member, account), the **deciding file** is the import with the latest `asOf` among holdings-file positions. Upload time is irrelevant: an older file uploaded later decides nothing.
- `store.ts` replaces a position only per (member, ISIN, source), so positions from an older file for ISINs the newer file doesn't list are still stored. At compute, **only positions from the deciding file's import count**; older imports' positions for that account are ignored. A share absent from the deciding file is held at 0.
- The deciding file **trims only when its `asOf` is on or after the last trade in that account** (any security, any source except the Tax P&L, whose exits are dropped there anyway). Otherwise it only fills in (as today) and the member page shows one line: "Your <broker> holdings file is from <date>, before your latest trades. Import a newer one." No trimming happens.

### 2. Trim: units that left the account

- After the fill-in step, for each (member, ISIN, account) with a deciding file that may trim: replay what the history holds on the file's `asOf` (buys and sells dated on or before it). If that exceeds the file's quantity, emit a synthetic **"left the account"** transaction for the difference, dated the file's `asOf`.
- The ledger removes those units **oldest first** (same queue) and creates **no `Realised` row**, no warning and nothing for `reconcile`. Implementation is the builder's call (a new `side: 'out'`, or a sell flag), as long as every consumer of `Txn` (intraday split, unit checks, CSV, Simulate, `planGaps`) treats it as neither a sale nor a buy.
- ids are derived (`<member>|<isin>|<account>|left|<asOf>`), so the same inputs always give the same transaction.
- One quiet line per member when anything was trimmed: "N shares in your trade history aren't in <broker>'s holdings on <date>, so they're left out." No per-share warning. It's a neutral note, not a warning.
- Effect: the held units match the file; Holdings, totals, Plan, Simulate and Compare all stop showing them.
- **Buybacks (research C6).** From 1 Apr 2026 a buyback tender is a taxable capital gain again. A tender may show only in the Tax P&L or the external tradebook, so trimming could drop a real gain. If an account has trimmed units and **no Tax P&L for the current year**, the quiet line adds: "If any of these left in a buyback this year, that gain counts: import <broker>'s tax P&L." The Plan lists it in "Make this plan complete" until the P&L is in. The law treats gifts and moves between your own accounts as no sale (research G2, G5), so trimming books nothing for them, which is right.

### 3. Fill-in: units the history can't explain

- **Shares (file has long-term units and cost):** unchanged from today, except the date (section 4).
- **Funds and anything without a long-term count:** the guessed lot is **computed on every compute** as `file units − units the history explains on asOf`, marked `estimated`, dated the day before the account's first trade (or `asOf − 1 day` with no history). It gets no moves (unchanged rule).
- The guessed lots that imports **saved** for holdings-file positions (ids `<member>|<isin>|opening|<importId>`, source `Opening balance (estimated date)`, created in `store.ts` when the import had no history) are **dropped at compute** whenever their import is a holdings file. This is the repair for families saved before the change. `store.ts` stops saving them for holdings files going forward. Other formats that save guessed lots keep their current behaviour.
- Result: any import order gives the same units. Fund units can no longer exceed the file.
- **Cost never stacks (research C3–C5, F2).** Bonus issues, splits, demergers and IPO allotments don't appear in the regular tradebook. The broker restates units and average cost without telling the history. Filling the extra units at the file's average, on top of history lots still at their pre-event cost, overstates cost. Example: 10 shares bought at ₹1,000, then a 1:1 bonus. The file shows 20 at ₹500 (₹10,000). History plus fill-in would be 10 × ₹1,000 + 10 × ₹500 = ₹15,000, so the gain is understated by ₹5,000 and the room overstated, far past the cushion. Rules:
  - **Invariant:** for each (member, account, ISIN) with a dated holdings file, the cost of the held lots is **never more than the file's total cost** (units × average). Fill-in cost = file total cost − cost of the history lots still held on `asOf`, floored at 0.
  - **Split or consolidation:** when the file's units are a whole-number multiple (or fraction) of the history's held units and its total cost matches the history's held cost within 1%, scale the history lots' units. Dates and cost stay the same, and nothing is filled in.
  - **Anything else unexplained with leftover cost 0 or less** (a bonus, a demerger credit): fill-in units take cost 0 and are marked "term unknown" (`estimated`, so no moves). A bonus lot is short-term for 12 months from an allotment date the app doesn't know. The file's long-term count still decides how many held units are long-term.
  - The member page shows one line per such share: "<share>: units changed without a trade (bonus, split or demerger?). Import Zerodha's tax P&L or external tradebook for exact figures."
  - Rupee tests for bonus, split and demerger (research §3).

### 4. Holding period of filled-in units

- **Units still held:** the file's long-term count is the evidence. The long-term part keeps today's date rule (the earlier of `asOf − 13 months` and the day before the account's first trade). The short-term rest stays a guessed lot.
- **Units sold before the file's date (sold from the opening lot):** the file only proves what is long-term *now*, not what was long-term at an earlier sale. So these units are split into their own lot marked **"term unknown"** (`estimated`), dated the day before the first trade. Their sales follow section 5. Today the engine assumes they were long-term but dates them too late, which books them short-term. (Builder check Q2.)
- Where the broker's Tax P&L covers the sale, its totals win, as today (`brokerAdjustments`).

### 5. Sales from guessed-date lots

- A `Realised` row whose lot is `estimated` carries `estimated: true` (new optional field).
- **ELSS** (`isElss`, `engine/categories.ts`): always long-term. Units can only be sold after the 3-year lock-in.
- **Non-equity units** (slab-rate funds, debt funds bought after Mar 2023, and so on) keep their real tax type from `lotTaxType` / `longTermMonthsFor`. They are never forced long-term.
- **Everything else** whose term can't be known:
  - a **gain** counts as **long-term**: it uses tax-free room, so no move is sized into room that isn't there;
  - a **loss** counts as **short-term**: it's set off against short-term gains first, so it frees less long-term room than counting it as long-term would.

  Both are listed under "Needs checking" with: "Buy date unknown: counted the safe way for your tax-free room. Import <broker>'s tax P&L for the exact figure."
- **The user can correct it (founder, 22 Nov).** Each such sale shows in "Capital gains this year" and in "Needs checking" as: "<share>, sold <date>: buy date unknown, so we assumed long-term. Room left assumes this. Was it [Long-term] [Short-term]? Not sure? [Add buy date]". (Founder, 22 Nov: a one-tap answer is simpler. The date is the fallback.)
  - **Long-term:** confirms the assumption, so nothing changes. The note goes away.
  - **Short-term:** this *frees* room, so it asks first: "Only choose this if your contract note or broker P&L shows the shares were held under a year. If it's wrong, a move can create tax." On confirm, the sale is short-term and room, tax and moves recompute.
  - **Add buy date:** the engine works out the term, using the 12/24/36-month rules and ELSS.
  - Stored as a user answer (`term` or `buyDate`) in a new optional state field, keyed by member, account, ISIN and sale date. It's added through `normalizeState` with a migration test (GUARDRAILS §3). The sale row then reads "Term set by you" or "Buy date entered by you", with [Change].
  - Moves never use these units as held lots. The answer only sets the term of the past sale.
  - A broker Tax P&L covering the sale still wins over the user's answer.
- **Cost of this choice:** without a Tax P&L, a gain that was really short-term hides room. The room shown can be lower than the truth by more than the 10% cushion. The anti-goal below is relaxed for this case only. Showing less room is safe; showing more is never allowed. The nudge for a Tax P&L recovers it (section 8).
- When a broker Tax P&L covers the account and period, its totals win as today.

### 6. Warnings that matter

- Ledger warnings ("Sold N more units than the history shows") are **shown** only when the sale is **in the current tax year** and **no broker Tax P&L covers that account and date**. They are grouped per share: "<share>: sold N more units than the history shows (<month range>). Their gain is left out until you import <broker>'s tax P&L."
- All others go behind a collapsed "Older history gaps (no effect on this year's tax)" toggle, closed by default.
- The banner uses the amber note style (`banner` without `warn`, or an equivalent calm class) and leads with one sentence of what it means.
- The ledger keeps producing every warning; this is presentation only (`ui/screens/Member.tsx`, helper in `ui/`).
- "Turning long-term soon" groups lots of the same share and date into one row.

### 7. The broker correction shows as a correction

- `brokerAdjustments` keeps its role and arithmetic. In "Booked this year", the adjustment is shown on its own line ("Adjusted to <broker>'s figure: +₹X short-term") and is **not** included in "Losses set off". In "Capital gains this year", the row reads "Adjusted to <broker>'s tax P&L" with no units or dates.
- If `summariseYear` folds adjustment rows into set-off, the display separates them; the tax figure itself must not change (rupee test).

### 8. Nudge to recover the cushion

- On a move using an `approx` lot, add one line: "Import the <FY> tradebook from <broker> to use the ₹X of room left spare." ₹X = the move's gain × `APPROX_MARGIN`, rounded to ₹100. FY = the tax year before the oldest tradebook in that account, or "older tradebooks" when there's none.
- Only shown when ₹X ≥ ₹1,000 (builder may tune), never as a blocking step.

### 9. "More data never spoils": what it means here

- Newest-by-date deciding file (section 1); stale files never trim.
- Duplicate trades already add nothing (id-based dedupe in `store.ts`); the import card says "Nothing new: these trades are already in" when a file adds 0 (small copy change in `ui/screens/Import.tsx`).
- A new file can still **change** moves when it reveals a fact (a sale, a transfer). That's more accurate, not spoiled.

### 10. Buybacks in the Tax P&L (bug found by the research)

- `parseZerodhaTaxPnl` drops every "Equity - Buyback" exit, with the warning "since Oct 2024 buyback money is taxed as dividend income". That's right for exits from 1 Oct 2024 to 31 Mar 2026 only. **Exits dated from 1 Apr 2026 are capital gains (Finance Act 2026) and must be imported like other exits.** Use the per-tax-year rules in `engine/rules.ts` (a flag such as `buybackIsCapitalGain`), not a date literal. The warning names the period it applies to.
- Exits before 1 Oct 2024 (company paid the tax) stay left out.

### 11. Research findings deliberately left for later

- **Console gifts in the giver's Tax P&L (research B4).** Zerodha books a gift made through Console as an exit at the day's close, so "broker totals win" can count a gain the law doesn't tax. That shows *less* room than the truth, which is safe for moves. Detecting it ("P&L exit with no tradebook sale: was this a gift?") belongs with recognising family gifts, the next engine project. That project should also rebuild the receiver's cost and dates from the giver's lots (research §4, idea 2).
- **External tradebook (IPO, OFS, corporate actions; research C2)** as an import: belongs with the guided import.
- **A second demat for lot choice (research §4, idea 1):** needs a CA view (research open question 4) and a wording check against GUARDRAILS §6.
- Open questions for a CA and the brokers: research note §5. None of them blocks this design. Each answer only refines a "Needs checking" line.

## Tests (each fails first)

Synthetic fixtures only. Hand-checked rupee figures where tax or room changes.

1. **Trim:** history buys 10, file (newer than last trade) lists 0 → held 0, no realised row, no warning, quiet line present. Gift case: same ISIN appears in another member's file → only that member holds it; Simulate shows "held by 1".
2. **No trim from a stale file:** trade after the file's date → nothing removed, the stale-file line appears.
3. **Older file uploaded last:** import Nov file, then Mar file → same result as Nov only.
4. **Absent ISIN in newer file:** old file lists X, newer file doesn't → X held at 0 (old position ignored).
5. **Fund order independence:** holdings-then-tradebooks equals tradebooks-then-holdings; units equal the file; saved `|opening|<importId>` lot from a holdings import is ignored.
6. **Units sold from the opening lot:** history starts mid-year, the file shows long-term units, and a sale of opening units happens 8 months after the history starts. The sale's term is unknown: a gain counts as long-term at average cost (rupee test), and the sale appears with Long-term / Short-term / Add buy date.
7. **ELSS from guessed lot:** long-term. Non-ELSS from guessed lot: long-term, `estimated`, listed in Needs checking, uses room.
8. **Broker correction display:** "Losses set off" excludes the adjustment; tax unchanged (rupee test).
9. **Warnings filter:** earlier-year oversell hidden; this-year oversell with P&L covering it hidden; this-year without P&L shown once per share.
10. **Nudge:** approx move shows ₹X = gain × margin; exact move shows none.
11. **Saved family:** a fixture saved in today's shape computes the same or better (GUARDRAILS §3).

Plus the private check (`scripts/check-private.ts`, counts only) over the real files from the run: trimmed shares = 6 for the account with gifts; fund units equal the file for every fund; the April sale is long-term.

## What's left to the builder

- How "left the account" is represented in `Txn` and the ledger (section 2), and making every consumer ignore it.
- Exact component and class names for the calmer banner and the collapsed toggle.
- The nudge threshold and rounding.
- Whether the deciding-file logic lives in `openingLots.ts` or a sibling engine module (engine-only imports either way).

## Calls made in this design (founder to check)

- Trimmed units are dated at the holdings file's date (the real transfer date is unknown).
- Unknown-term sales: gains count as long-term, losses as short-term, and non-equity keeps its real type. Without a Tax P&L, room may read low (section 5). **Founder agreed (22 Nov), provided the user can correct it by adding the buy date.**
- Units sold from the opening lot are "term unknown" rather than forced long-term.
- A file with no readable date, a blank account label or unread rows doesn't trim. Saved families need one re-import of the holdings file to get trimming, and the Plan asks for it.
- Only account-level holdings exports trim; demat CAS and fund-only statements never do.
- Older history gaps are hidden behind a closed toggle rather than removed.
- Research (`docs/research/2026-11-22-lot-dating-transfers.md`) is folded in:
  - it confirms per-account FIFO, gifts, own-account moves, ELSS and the long-term-gain / short-term-loss rule;
  - it adds the cost-never-stacks rule for corporate actions (section 3), the buyback caveat (section 2) and the buyback parser fix (section 10);
  - brokers' long-term counts err towards *fewer* long-term units after gifts and transfers, which is safe, so the design trusts them.

## Tests added after the builder check

12. A holdings file with no readable date fills in but never trims. A saved family whose positions have no date gets the "import again" gap.
13. Labels "Zerodha" and " zerodha " match. A blank label never trims.
14. A `SYM:` row protects the history ISIN with the same symbol. `skipped > 0` turns off trimming for that file.
15. Unknown term: a gain is long-term and uses room, a loss is short-term, a debt fund keeps slab rate (rupee test). A member with booked short-term gains and an unknown-term loss doesn't gain long-term room.
16. Corporate actions (rupee tests):
    - **1:1 bonus:** held cost stays ₹10,000, not ₹15,000.
    - **1:5 split:** history lots scaled, dates kept, no fill-in.
    - **Demerger credit:** cost 0 and term unknown.
    - The cost of held lots never exceeds the file's total.
17. Buyback: an FY 2026-27 buyback exit in a Tax P&L is booked as a capital gain, while an FY 2025-26 one is left out. An account with trimmed units and no current-year P&L shows the buyback line and the Plan gap.
