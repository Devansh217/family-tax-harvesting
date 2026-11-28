# Stage 7: Critic Review (round 1)

**Target:** `docs/superpowers/plans/2026-11-28-generic-tax-pnl.md`, FeatureRange lines 1-37.

**Reviewers:**
- egm-design, checked against feature-spec-standard
- egm-structural, checked against feature-spec-standard
- egm-style, with no standard

All three completed. None failed.

**Context:** the spec, issue #28, `docs/GUARDRAILS.md`, and the parser and engine code at `86a4958`. The reviewers ignored `pdfTable.ts`.

**Checked by hand:** I opened every code line that a Blocker cites, at `soldLots.ts:196-292`, `parsers/index.ts:42` and `family.ts:474-498`. The verification notes below record two places where the committed code is safer than a reviewer assumed.

## Summary

| Severity | Count |
| :--- | :--- |
| Blocker | 4 |
| Major | 12 |
| Nit | about 15 |

The main message from egm-design: Review Focus checks that the right rows are read, but never checks that the broker totals stay complete and honest. Those totals feed `brokerAdjustments`, which overrides the engine's own figures (GUARDRAILS §1). If they are too low, the room looks bigger than it is, and a move can create tax.

## Blockers

### design-1-B1. Fund exits are dropped beside a tradebook while fund totals stay empty (lines 12, 35, ref 77)
- This is the same problem as Stage 5 A1 and B1.
- The committed code works around it: a fund-only report gets the format `Fund capital gains · `, and a mixed report fills the fund totals using the share term.
- The plan text still describes the version that loses the gains. A mixed report still gets the wrong term (see M1).
- **Fix:** In lines 12 and 35, say which exits are dropped and when: only categories whose total the summary actually carries. Add a Review Focus item and a test with a fund report beside a share tradebook.

### design-1-B2. Rows lost without notice still produce a high-confidence summary that wins (lines 5, 29-36)
- High confidence lets up to 10% of rows fail (line 78).
- Some rows are never counted at all: rows after a one-cell line, because a one-cell line ends the table, and rows with no qty.
- The summary that results overrides the engine (`family.ts:476-491`). It also marks the account as covered, which hides the Plan's warnings (`ui/warnings.ts:14`).
- The issue asks for the file's own summary totals to be a cross-check. Only the offline `check-private` script does that.
- **Fix:** At high confidence, the reader must reconcile its totals with the file's Summary totals when those exist. Otherwise, any skipped row in a sales section caps confidence at medium. Add a Review Focus test.

### design-1-B3. The column-screen (medium) path can import totals that span years or cover only part of the file (line 5)
- **Verification note:** the committed code is safer than the reviewer assumed. `soldLotsFromTable` (`soldLots.ts:280-284`) removes the `brokerSummary` and adds a warning when sales span more than one tax year, or when the preview came from one table out of several (`partial`).
- **What is still open:**
  - None of this is in the plan.
  - The result keeps the `Tax P&L · ` prefix, so its exits are still dropped beside a tradebook even though it has no totals. For shares this is safe, because the tradebook holds those sales. For fund rows it loses gains, as in B1.
  - When there is one year and one table, a mapping the person made by hand becomes authoritative totals.
- **Fix:** Write the code's rule into Global Constraints. Decide whether a mapping made by hand may ever produce winning totals, and whether a `Tax P&L · ` result without totals should still drop fund exits.

### design-1-B4. The transfer and F&O tests skip the PDF path, where the section guard is weakest (lines 31-32)
- A PDF has no sheet name, so the section title is the only guard.
- Task 4's wrapped-cell rule (line 105) can merge "Transfer Transactions" or "Futures" into the row above it.
- A Transfer header does not score as a header, so no new table starts. The transfer rows are then read under the previous table's columns as sales.
- An Excel title row with two filled cells has the same effect.
- **Fix:**
  - Run the Review Focus 1 and 2 tests end to end through `pdfRows`.
  - Add a constraint: any line that looks like a header, such as one with "Transfer Date" or "Expiry", ends the current table. Rows after it are discarded until a sold-lots header starts a new table.

## Majors

### design-1-M1. The Terms rule is the flat 12-month test the issue forbids (line 22)
- `isLongTerm` with `rulesFor(sell).longTermMonths` applies the listed-share period to every row.
- The engine's own rule depends on the tax type (`tax.ts:65-75`).
- `adjRealised` always uses `taxType: 'equity'` (`family.ts:495`, checked). So when the two rules disagree, slab-taxed gain can turn into long-term equity gain and receive the exemption. This affects debt funds, unlisted bonds, and bonds and SGBs in Angel's "Equity+Bonds+SGB" sheet.
- **Fix:** The summary term must use the same rule as `brokerAdjustments` for that category. Either limit the summary to INE equity rows, or leave the category empty when the tax type is unknown.

### design-1-M2. "Any broker" rests on a block-list built from one broker (lines 5, 24)
- Any section title that is not on the list is read as sales. Other brokers' sections, such as Off-market, Gift, SLB, Corporate action, IPO or Short sell, would be read as sales at high confidence.
- **Fix:** Narrow the Goal to Angel One plus recognised layouts. Cap confidence at medium when the broker is unknown or a section title is not on the known list.

### design-1-M3. The period fallback can set a date in the future (lines 5, 29-36)
- When the From/To dates are not read, the period falls back to the whole tax year (`soldLots.ts:201-203`, checked). A report taken mid-year then gets `to` = 31 March next year.
- That causes three problems:
  - `over()` counts later tradebook sales against totals that do not include them, which produces a negative adjustment.
  - `pnlCoverage` hides the "import again" gap.
  - The freshness check suppresses the `oldData` warnings.
- **Fix:** When the period is not read, `to` is the latest sell date and never later than today. Alternatively, cap confidence at medium. Add a test.

### design-1-M4 / structural-1-2. No Non-goals, and the cut from the issue's scope is not recorded (lines 5-16)
- This is the same as Stage 5 A5.
- **Fix:** Add a Non-goals block linking the spec: carried-forward losses, the holdings snapshot (B3 #29), remembered layouts, dividends and engine rule changes. Record the founder's decision that low confidence goes to the column screen.

### design-1-M5. The header no longer matches the committed design (lines 7-27)
- The committed code differs from the header in five ways:
  - `readSoldLots` has no `source` parameter.
  - It has a `Fund capital gains · ` format.
  - It fills the fund totals.
  - Intraday gains may deduct STT, but line 33 says "STT is not deducted" with no exception.
  - It has a "nothing sold" case at high confidence.
- **Fix:** Update Architecture, Constraints and Review Focus 3 before code review, so findings are argued against the right baseline.

### structural-1-1. No Risks and Mitigations section, here or in the spec (lines 5-16)
- Accepted risks that are not written down: the 90% bar, a misread file removing tradebook exits, PDF columns drifting, and header aliases clashing.
- **Fix:** Add an H2 Risks and Mitigations section giving each risk, how it shows up and how it is mitigated. Alternatively, add the section to the spec and link it.

### structural-1-3. Architecture is missing modules and the data flow (lines 7-12)
- `buyback.ts`, the `extractItems` split, `importGuide.ts` and the column screen are not listed.
- There is no flow from file, to cells, to `readSoldLots`, to the three confidence outcomes, to `isTaxPnl`.
- **Fix:** Add the missing modules and a short numbered flow.

### structural-1-4. The text contradicts itself about which module uses pdf.js (lines 10, 20)
- Line 20 says `pdfTable.ts` takes pdf.js through `PdfJsLike`. In fact `pdfText.ts` owns `PdfJsLike` and `getDocument`, and `pdfRows` takes only `PdfWord[][]`.
- **Fix:** Reword line 20.

### structural-1-5 / style-1-1. The Goal promises more than the design delivers (line 5)
- Broker totals drive booked gains for share sales only, because fund totals are designed to stay empty.
- A low-confidence PDF gets "Unrecognised PDF", not the "use Excel or CSV" message.
- **Fix:** Split the Goal into short sentences: what share sales do, what fund rows do, what Excel and CSV do when unclear, and what PDF does when unclear (medium versus low).

### structural-1-6. Heading levels are wrong (lines 29-40)
- Goal, Architecture, Tech Stack and Spec are bold labels, while Constraints and Review Focus are H2 headings.
- The H3 tasks have no H2 parent, so they appear inside Review Focus.
- **Fix:** Add `## Overview` and `## Tasks` headings, or make the labels H2.

### style-1-2. Review Focus 2 names the risk but not the required behaviour (line 32)
- **Fix:** Add "The reader must skip it by sheet name, section title, or Expiry/Strike/Option Type columns."

## Nits

- **design-1-N1 (line 33):** The STT rule is only enforced for Angel's headers. A charges column that includes STT would pass the row check with an understated gain. Add a constraint or record it as a risk.
- **design-1-N2:** No Review Focus item covers importing the same year twice (Excel and PDF, as Task 7 does). Both sets of txns stay. Add a test that importing twice gives the same result (GUARDRAILS §3).
- **design-1-N3 (line 21):** State the file-size and page limits for the PDF word pass (GUARDRAILS §5).
- **structural-1-7 (line 16):** Point to the spec's "Approaches considered" and "Libraries" sections. Link issue #28 next to the founder's reasoning in the spec.
- **structural-1-8:** Add a one-line Problem statement and a "Done when" pointer.
- **structural-1-9:** Review Focus 6 has no test reference. Item 3 could mention Transfer Expenses as charges for funds.
- **structural-1-10 (line 16):** Make the spec path a relative link.
- **style-1-3 to style-1-12:**
  - Line 8, "learns": change to "adds".
  - Line 12: vague; state the drop rule.
  - Line 14: "are already in" is informal.
  - Line 22: "picks which gain column is filled" reads as if the reader writes to the column.
  - Line 23: the `Math.round` sentence is a fragment and is ambiguous (also raised by structural-1-11 and Stage 6 finding 16).
  - Line 24: the list mixes two kinds of rule.
  - Line 25: "stored shape change" packs three nouns together.
  - Line 31: mixed tenses.
  - Line 34: the "13 months / the reverse" wording, and the hardcoded 13.
  - Line 5: "real" adds nothing.

## Cross-stage overlaps

| This report | Earlier finding |
| :--- | :--- |
| design-1-B1 | Stage 5 A1 / B1 |
| design-1-B3 | Stage 5 B2 (the code partly covers it, see the verification note) |
| design-1-M1 | Stage 5 B1 (term of fund rows) |
| design-1-M4, structural-1-2 | Stage 5 A5 |
| design-1-M5 | Stage 5 A2 and A3 |
| structural-1-5, style-1-1 | Stage 6 finding 17 |

## New since Stage 5 and 6, ranked

1. **design-1-B2:** confidence does not reconcile against the file's own Summary.
2. **design-1-B4:** PDF section titles can be merged into the row above, so transfers and F&O are read as sales.
3. **design-1-M1:** the share term is applied to non-equity rows, and `adjRealised` books every adjustment as equity.
4. **design-1-M3:** the period fallback runs into the future.
5. **design-1-M2:** unknown section titles are read as sales.
6. **structural-1-1:** no Risks section.

Several of these concern the committed code (`soldLots.ts`, `family.ts`), not only the plan text. Pass them to the implementation session whatever happens to the plan.
