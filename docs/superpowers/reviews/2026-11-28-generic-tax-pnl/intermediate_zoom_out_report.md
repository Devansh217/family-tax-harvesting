# Stage 8: Intermediate Zoom Out

**Target:** `docs/superpowers/plans/2026-11-28-generic-tax-pnl.md`, all 136 lines.
**Reviewer:** egm-zoom-out (zoom-out-standard). It audited what Stages 5, 6 and 7 found and asked for.
**Checked by hand:**
- `git log`: while this review ran, the implementation session committed Tasks 1 to 6 and the review fixes (`7aac8ab` to `c42c47a`).
- The spec now has an "As built" section that records most of the differences between the plan and the code.
- The drop rule at `openingLots.ts:129` and the Cost Of Acquisition fallback in `table.ts` exist as the reviewer describes.

## Headline

1. **Don't rewrite the plan. It has already been built.**
   - Add one line under "Spec:" (line 16): "As built differs; see the spec's 'As built' section."
   - Add "except intraday" to Review Focus 3 (line 33).
   - Add one clause to the Goal (line 5): a low-confidence PDF still gets "Unrecognised PDF".
   - Leave the rest of the plan alone. Spend the remaining effort on the open tax-safety problems in the code, listed under "Priority for the implementation session" below.
2. **One drop rule causes most of the fund workarounds (N2, Major).**
   - The rule: `openingLots.ts:129` drops every exit of a `Tax P&L ·` import whenever the account has a tradebook.
   - Each of these workarounds exists only because of that rule:
     - the `Fund capital gains ·` format;
     - fund totals in mixed reports, built with the listed-share term (a term the spec admits is wrong for some funds);
     - totals the column screen leaves out while still dropping the exits;
     - fund rows inside a share table, which end up booked as listed equity through `adjRealised`.
   - **Simpler shape:** beside a tradebook, drop only the exits a tradebook can actually contain. That means ISINs that appear in that account's tradebook, or at least only INE share ISINs.
     - Fund, bond and SGB lots then always stay, and the engine works out each one's term from its tax type.
     - `mfShortTerm`/`mfLongTerm` stay null, which is what plan line 77 says.
     - The workarounds can be deleted.
   - **Cost:** one predicate in an engine file. It touches the Zerodha path, so the existing Zerodha tests must confirm it changes nothing for Zerodha. It needs the owner's sign-off.

## Audit of what Stages 6 and 7 asked for

KEEP = a real gap. TRIM = keep it, but with a smaller fix. DROP = bloat, already fixed in the code, or a repeat of the spec.

### Stage 6 (Comprehension)

| # | Verdict | Reason |
| :--- | :--- | :--- |
| 1 Cost Of Acquisition contradiction | KEEP, change the fix | Remove the code fallback instead of rewording the plan (see N1). |
| 2 Low confidence with a table | DROP | Already fixed in the code (`parsers/index.ts:67-69`). |
| 3 Sheet name for PDF and CSV | DROP | The code passes `'pdf'` and `''`. |
| 4 Copy the alias and section tables | DROP | Repeats the spec. |
| 5 "Beside a tradebook" | TRIM | One sentence: the dropped exits would count each sale twice, and buyback sells never show up in a tradebook. |
| 6 Outcome names | TRIM | One line defining "statement" and "table". |
| 7 Task order | DROP | Moot now that it is built. |
| 8 Buyback period dates | DROP | Code constants that existing tests already cover. |
| 9 PDF rule precedence | TRIM | Belongs in tests. The safety part is design-1-B4. |
| 10 Required fields | TRIM | One line: delivery and fund tables need both dates; intraday needs one date plus ISIN or symbol. |
| 11 gain/gainLt tie rule | DROP | "Whichever is filled" matches the code. |
| 12 STT | TRIM | Only Review Focus 3 needs "except intraday". |
| 13 Grandfathering formula | DROP | The engine owns the tax law. |
| 14-20 | DROP | Glossary requests, wording nits, repo conventions, or already fixed in the code. |

### Stage 7 (Critic)

| Item | Verdict | Reason |
| :--- | :--- | :--- |
| design-1-B1 fund exits | KEEP, lower to Major | N2 solves it more simply. |
| design-1-B2 totals not reconciled | KEEP, lower to Major, TRIM | See below. |
| design-1-B3 column-screen totals | Mostly DROP | See below. |
| design-1-B4 section guard | KEEP as Blocker, wider scope | See below. |
| design-1-M1 equity term for every row | KEEP, Major | N2 removes it for funds. Bonds and SGBs in the shares section are what remain. |
| design-1-M2 unknown sections read as sales | TRIM to Nit | An allow-list goes against the founder's "one generic reader". Record it as a known risk in the PR. |
| design-1-M3 future end date | KEEP, Major | When no period is read, end it at the latest sell date. Add one test. |
| design-1-M4 / structural-1-2 non-goals | TRIM | The spec already has Non-goals, and follow-ups #57 and #58 exist. Keep Stage 5 A5's note to #29 that the skipped holdings sections are a source for B3. |
| design-1-M5 header out of date | TRIM | The one-line "As built" pointer replaces it. |
| structural-1-1 Risks section | DROP | A new section in a finished plan is bloat. |
| structural-1-3 data flow | DROP | Not needed with the code open. |
| structural-1-4 pdf.js module | KEEP, Nit | A one-clause fix on line 20. |
| structural-1-5 / style-1-1 Goal | KEEP, Nit | One clause on line 5. |
| structural-1-6 headings, style-1-2 | DROP | Cosmetic. |
| design-1-N1 STT inside charges | DROP | Guesses at how unknown brokers lay out charges. |
| design-1-N2 same year imported twice | TRIM | The store merges identical txns. Check it in the Task 7 browser test. |
| design-1-N3 PDF limits | TRIM | Only confirm that the Tax P&L PDF path goes through the same size and page limits as the CAS path. |
| Remaining structural and style nits | DROP | Polish on a plan that is already built. |

Details for the items marked "See below":

- **design-1-B2 (Major, trimmed fix).**
  - The code already requires zero skipped rows for high confidence.
  - Rows that are never counted are still a gap: rows with no ISIN or no qty, and rows after a one-cell line that ends the table.
  - Reconciling against the file's own Summary would mean parsing summary labels for unknown brokers, which is guesswork.
  - **Smaller fix:** inside a sales table, any non-blank, non-total row that is neither read nor skipped counts as skipped, which caps confidence at medium.

- **design-1-B3 (mostly DROP).**
  - The code already leaves out the totals when sales span more than one tax year or only one of several tables was read, and the spec records this.
  - The part about fund exits is covered by N2.
  - A single table the person has confirmed producing totals is how the issue designed medium confidence.

- **design-1-B4 (Blocker, wider scope).**
  - The hole is not limited to PDF. In Excel, `findTables` has it too:
    - A title row with two filled cells does not start a new section.
    - The Transfer header does not score as a sold-lots header, so the Delivery table stays open.
    - The transfer rows are then read under the delivery columns as sales.
  - **Fix:** any row that looks like a header but is not a sold-lots header ends the current table. Test it through both the Excel and PDF paths.

## Disagreements with Stage 5

- **A5:** lower to Nit. The spec records the scope cuts.
- **B3:** still a valid Nit. The comment at `parsers/index.ts:62` still gives "a PDF has no column screen" as the reason, but the real reason is the founder's policy.
- **A2, A4, A7, B2, B4, B5:** resolved in the code (`TAX_PNL_PREFIX`, the one-year bypass for fund-only reports, the path that leaves out totals). The plan only needs the "As built" pointer.

## New findings

### N1. Major: the Cost Of Acquisition fallback is speculative and can understate gains
- **Where:** plan line 58 against line 33; `table.ts` (checked); spec line 67.
- **The problem:**
  - The spec says Angel's "Cost Of Acquisition" "is not the buy value and is not used", and no file in scope needs the fallback.
  - When the fallback fires, an indexed or grandfathered cost becomes the buy amount. The gain is then understated and the room overstated (GUARDRAILS §1).
  - The row check does not catch it, because the broker's gain was worked out from the same cost.
- **Fix:** delete the fallback, so the header maps to nothing, as "Net Profit/Loss" does. This also settles Stage 6 finding 1.

### N2. Major: one drop rule causes most of the workarounds
See the headline above.

### N3. Nit: the row check is loose enough to weaken the 90% bar
- **Where:** plan line 75; `soldLots.ts:121-123`.
- **The problem:** the check accepts any of three costs combined with any of three deductions.
- **Fix:** accept only the grandfathered cost (not the 31 Jan 2018 value on its own), and accept zero charges only when the file has no charges column.

### N4. Nit: the plan's fund test does not match the code
- **The problem:** the plan identifies funds by ISIN `INF…`, but the code identifies them by header or section text.
- **Fix:** under N2 the difference no longer matters. Without N2, classify fund rows by ISIN, one row at a time.

## Priority for the implementation session

1. **design-1-B4 (Blocker):** any header that is not a sold-lots header closes the current table. Test through Excel and PDF.
2. **N1:** remove the Cost Of Acquisition fallback.
3. **design-1-M3:** when no period is read, end it at the latest sale.
4. **N2:** decide whether to narrow the drop rule (owner's sign-off). If not, record the fund-term compromise as a known risk in the PR.
5. **design-1-B2 (trimmed):** count rows that were passed over as skipped.

**Plan edits needed:** the "As built" pointer on line 16, "except intraday" on line 33, and one clause on line 5. Nothing else.
