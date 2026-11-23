# Next work

The one list of work that is planned, designed or found but not yet built. It's grouped into epics, and each item is sized to be **one session**.

Last updated 24 Nov 2026, after the founder's feedback round on the live site.

**For a fresh session:**
- Read this file first, then `CLAUDE.md` and `docs/GUARDRAILS.md`.
- No personal data belongs here. Real statements stay in the git-ignored `data/private/`.

> **Before you start, and again before you call any piece done:** read `docs/fresh-run-notes.md`, the anonymised findings from the 22 Nov real run.
> - Use it to **fill gaps**: when this file, a design or a plan is silent or unclear, the notes give the original observation, its cause and what the founder asked for.
> - Use it to **validate**: check that what you built fixes the matching finding.
> - If a finding is handled nowhere, or your change doesn't match what the notes describe, say so in your hand-back or PR. Don't silently skip it.

## How to use this file

- **Pick one item.** Start a session with its ID and title, e.g. "B2 Angel One Tax P&L reader".
  - Items marked **Ready to build** have an approved design and plan: run the plan with `superpowers:subagent-driven-development`.
  - Every other item starts with `superpowers:brainstorming` (or the `research` skill where it says research).
- **Keep this file current.** When an item's status changes (designed, planned, built, merged), update its row here in the same PR. When an item is merged, move it to "Done" at the bottom with its PR number.
- **New work found along the way:** add it as a new item under the right epic. Don't keep it only in a chat.
- Before merging any PR, run the `guardrail-reviewer` agent and put its findings in the PR. `main` requires CI.

**Status words:**
- **Ready to build:** design and plan approved.
- **Designed:** design approved, no plan yet.
- **Cause known:** diagnosed, needs a short design.
- **Needs brainstorm**
- **Needs research**
- **Blocked:** says on what.

## Summary

| ID | Item | Status | Branch | Depends on |
|---|---|---|---|---|
| **A** | **Family placement** | | | |
| A1 | Holding in another name: SIPs and units to a lower-taxed relative | Ready to build | `family-placement` | C1 |
| **B** | **Import and readers** | | | |
| B1 | Guided import | Ready to build | `guided-import` | C1 |
| B2 | Angel One Tax P&L reader (Excel and PDF) | Cause known | — | — |
| B3 | Angel One holdings reader: shares and gold bonds | Needs brainstorm | — | — |
| B4 | Direct vs regular from the ISIN | Cause known | — | — |
| B5 | Recognise gifts within the family | Needs brainstorm | — | B3 helps |
| B6 | Fund statement and Coin gaps | Needs brainstorm | — | — |
| **C** | **Plan you can trust** | | | |
| C1 | Mark moves that rest on old data | Ready to build | `plan-old-data` | — |
| C2 | Why a long-term holding with room wasn't suggested | Needs brainstorm (debug) | — | — |
| C3 | Wording fixes | Needs brainstorm (small) | — | — |
| **D** | **Fund tax types** | | | |
| D1 | Fund tax types from AMC documents, not user picks | Needs research | — | — |
| **E** | **Cleaner app** | | | |
| E1 | Less text everywhere: tooltips and a notification panel | Needs brainstorm | — | — |
| E2 | Drop the Compare page | Needs brainstorm (small) | — | A1 |
| E3 | Rework Simulate | Needs brainstorm | — | E1 |
| E4 | Animations: how a transfer between members changes tax | Needs brainstorm | — | A1, E1 |
| **F** | **Safety, compliance, testing** | | | |
| F1 | Open security review items | Needs brainstorm | — | — |
| F2 | Questions for a CA and the brokers | Needs research (write-up) | — | — |
| F3 | Beta manual test plan | Written, not merged | `docs/beta-test-plan` (now in this file's PR) | — |
| F4 | Minors in the family | Blocked: deferred until after the beta | — | — |
| F5 | Scrub real figures from the public fresh-run notes | Needs a short review | — | — |

**Suggested order:**
1. **B4** (small, saves real money).
2. **C1** first. It adds the one "newest data" function (`engine/freshness.ts`) that B1 and A1 both use.
3. **A1 and B1** after C1, one at a time or in separate worktrees. They overlap in `ui/plan.ts`, `e2e/smoke.spec.ts` and this file, so rebase the second on the first. (A1 and C1 also share `engine/family.ts` and `ui/screens/Plan.tsx`.)
4. **B2**, then **B3**.
5. **E1**, which sets the pattern for E2–E4.
6. **D1** research.
7. The rest.

## Branches and PRs (24 Nov 2026)

| Branch | PR | Holds | State |
|---|---|---|---|
| `docs/next-work` | #19 | This file, the three ready designs and plans, the beta test plan | Open, for merge after the guardrail review |
| `plan-old-data` | #20 (draft) | C1 design and plan | Build first. The draft becomes the build PR |
| `guided-import` | #21 (draft) | B1 design and plan | On hold until C1 merges |
| `family-placement` | #22 (draft) | A1 design and plan | After C1 |

- The design and plan files are identical on each feature branch and on `docs/next-work`, so they merge cleanly. Change them on both, or take them from `main` once #19 merges.
- `holdings-first-design` merged as PR #18. Older local branches with nothing left to merge can be deleted.

## Notes from the 24 Nov feedback round

Things found or decided in that round that sit outside a single design:
- **SIPs are visible in tradebooks.** A throwaway check on the test family's files showed Zerodha MF tradebooks show SIPs clearly: the same funds bought on the 1st–2nd of each month for a steady amount. Stock buys repeat too, but as top-ups, not SIPs.
- **Angel fund buys are not in Angel's trade history.** Angel trade-history files hold shares only, so a member's Angel fund SIPs can't be guessed from them. Check whether Angel's fund statement ("Statement <dates>.xlsx") has them before A1's SIP guess ships, or ask the user.
- **Clubbing shapes every cross-member move.** Money given to a spouse, a minor child, a son's wife or one's own HUF is still taxed as the giver's (`clubbing()` in `engine/relations.ts`). Only non-clubbed relatives, such as a parent, save tax. A1 builds on this.
- **Gift, don't sell and buy again.** Moving existing holdings between members means gifting the units, never selling and buying again. Founder agreed; see the A1 design D3.
- **Founder calls on placement:** a yearly cash gift to the parent, who runs the SIP from their own account; no ceiling on what goes to one member, just show the savings; the full family method (approach B); yearly harvesting in the 10-year model.
- **Regular plans in Angel accounts:** the test family's Angel holdings likely include regular plans (B4). Check the switch-to-direct moves on the real files once B4 ships.
- **Process:** every PR gets the `guardrail-reviewer`; its findings go in the PR. Feature PRs stay drafts until their feature is built.

---

## Epic A: Family placement

The app tells the family where money should sit to pay less tax over the years, not only this season (founder feedback, 24 Nov, points 5 and 6).

### A1. Holding in another name: Ready to build
- **Design:** `docs/superpowers/specs/2026-11-24-family-placement-design.md` (D1–D12).
- **Plan:** `docs/superpowers/plans/2026-11-24-family-placement.md` (6 tasks).
- **Research:** `docs/research/2026-11-15-family-asset-placement.md`.
- **Branch:** `family-placement`.
- **In short:**
  - SIPs are guessed from tradebooks and confirmed by the user.
  - Gifts go only to non-clubbed relatives: yearly cash for SIPs, units for existing holdings.
  - Placement is full family greedy + regret + swap inside the family's current mix, over 10 years with yearly harvesting.
  - It shows as a "Holding in another name" section on the Plan.
- **Recommended way to run:** subagent-driven. The engine tasks build on each other, and a mistake shows wrong tax.

## Epic B: Import and readers

### B1. Guided import: Ready to build
- **Design:** `docs/superpowers/specs/2026-11-24-guided-import-design.md`.
- **Plan:** `docs/superpowers/plans/2026-11-24-guided-import.md` (6 tasks). **Branch:** `guided-import`.
- **What it does:**
  - A family table, then a checklist per member: holdings → this year's Tax P&L → tradebooks newest first, only while gaps remain.
  - It always offers "Stop here, show my plan", with a completeness line.
  - Wrong files are caught.
  - A clear success card after each import (fresh-run finding 1).
  - Results never depend on upload order.
- **Needs from others:** B2 and B3 join by flipping a capability flag.
- **Shared with C1:** the "Newest data from <date>" line calls C1's engine function.

### B2. Angel One Tax P&L reader: Cause known
- **Today:** the app turns away every PDF that isn't a CAS ("Unrecognised PDF", `parsers/index.ts`), and there is no Angel Tax P&L reader in any format (founder feedback point 1).
- **What we know:**
  - An Angel "Tax PNL" PDF (FY 2025-26, from the test family's HUF) has a real text layer that pdf.js reads.
  - It's 9 pages, read row by row with no OCR:
    - **p.1, P&L summary:** LTCG and STCG excluding buyback, buyback lines, intraday, F&O, total charges.
    - **p.3–4, delivery P&L:** each sale with ISIN, quantity, buy date, sell date, cost and charges, with long-term or short-term already worked out. Same shape as the Zerodha Tax P&L the app reads.
    - **p.4, open holdings at 31 March:** quantity, average cost and closing price. A dated snapshot of what was held at the start of the year.
    - **p.5, quantity breakup:** long-term and short-term units per holding. This dates opening lots without old tradebooks, the same split Angel's holdings file gives (B3).
    - **p.8, charges:** not needed.
    - **p.9, dividends:** income the member must declare. Angel warns its dividend figures may be incomplete.
  - The test files also have the Excel version for FY 2026-27. Compare its layout before building; one reader may handle both.
  - In the test file, last year ends in a net short-term loss after set-off: a real carried-forward case.
- **Build:**
  - A reader for both formats.
  - "Broker totals win" for Angel accounts (`brokerAdjustments`), as Zerodha has.
  - The p.4–5 holdings and long-term/short-term split feed the holdings-first engine as a dated snapshot, as B3 will.
  - **Last year's Tax P&L feeds carried-forward losses** (`Member.carriedLoss`): the user confirms the figure, and it applies only if that year's return was filed on time.
- **Done when:** both files read, and the Plan's booked gains match the broker for an Angel account.

### B3. Angel One holdings reader: shares and gold bonds: Needs brainstorm
- **Today:** the unlocked "Your Holding Details" workbook is read for its fund sheet only. Its Equity (ISIN, quantity, average price, LTP, **LTCG and STCG quantity and value**), SGB and Bonds sheets are dropped silently (fresh-run findings 14, 17a).
- **Build:**
  - Find the sheets by header. A copy saved from Numbers adds an "Export Summary" sheet first.
  - Join the holdings-first trimming list (`TRIMMING_HOLDINGS_SOURCES`).
  - Warn when the holdings show more units than the trade history.

### B4. Direct vs regular from the ISIN: Cause known
- **Today:** a fund is "regular" only when a CAS says so (`parsers/cas.ts`). Angel's files list bare fund names, so funds held through Angel never get a switch-to-direct move (founder feedback point 2). The nightly `funds.json` also strips "Direct Plan" / "Regular Plan" from every name, so the ISIN can't tell them apart either.
- **Build:**
  - Keep the plan (and option) per ISIN in `funds.json` (`scripts/build-prices.ts`, `src/prices/parse.ts`).
  - Set `Security.plan` from it for every reader.
  - Make `directTwin` match on the kept plan instead of the stripped name.
- **Done when:** a regular-plan ISIN from an Angel holdings file gets a `switch_direct` move with its direct twin.

### B5. Recognise gifts within the family: Needs brainstorm
- **The case:** units leave one member's account, and the same ISIN appears in another member's holdings. Ask "Did <giver> gift these to <receiver>?" On yes, the receiver's lots take the giver's cost and dates (research `docs/research/2026-11-22-lot-dating-transfers.md` G3, G4).
- **Zerodha Console gifts** show as an exit at the day's close in the giver's Tax P&L (research B4).
- Never assume: it could be a sale and a purchase (fresh-run finding 7).

### B6. Fund statement and Coin gaps: Needs brainstorm
- **Coin copy:** the Import guide and the Plan send Zerodha Coin users to the fund CAS. Coin funds need MF tradebooks for every year. Fold this into B1 if it isn't there already.
- **CAS password hint:** it says "usually your PAN", but MF Central and CAMS use a password the user chooses.
- **Untested reader:** the CAMS / KFintech fund CAS reader has never seen a real statement.

## Epic C: A Plan you can trust

### C1. Mark moves that rest on old data: Ready to build
- **Design:** `docs/superpowers/specs/2026-11-24-plan-old-data-design.md`.
- **Plan:** `docs/superpowers/plans/2026-11-24-plan-old-data.md`. **Branch:** `plan-old-data`.
- **What it does:**
  - Each move resting on months-old files says so, with the date.
  - Moves that use room say the room may be smaller.
  - The headline counts only moves on fresh data.
  - Moves are marked, not held back (founder, 24 Nov).
- Fresh-run finding 2.

### C2. Why a long-term holding with room wasn't suggested: Needs brainstorm (debug)
- A small long-term holding with spare room wasn't suggested for a parent. Is it the minimum size, or the cushion counted differently? (fresh-run finding 13)
- Start with `superpowers:systematic-debugging` on the case.

### C3. Wording fixes: Needs brainstorm (small)
- "1 lot have" should be "has".
- The intraday label differs in two places: "from tradebooks" vs "from your broker's report".
- The holdings card should say "N fund lots with guessed dates", not "N transactions".
- Simulate should say "₹X loss (all long-term)", not "−₹X gain".
- Simulate should explain a set-off that raises a section, e.g. a short-term "after set-off" higher than its total (finding 17b).
- A sold fund's tax type can't be picked (finding 17c; D1 removes most picks).
- IPO allotments where the Tax P&L doesn't cover the sale should say "possibly an IPO allotment or transfer in" (finding 12).
- Check each against E1 first: some lines may go away instead of being reworded.

## Epic D: Fund tax types

### D1. Fund tax types from AMC documents, not user picks: Needs research (highest research item)
- **Today:**
  - The member page's "Funds to check" asks users to pick Equity / Long-term 12.5% / Slab for hybrid funds and funds of funds. Users can't be expected to know this.
  - Until they pick, gains are taxed at slab and get no moves.
  - `engine/categories.ts` maps AMFI categories; `engine/fund-overrides.json` is empty.
- **Rule already known** (`docs/research/2026-11-15-product-universe.md` §4.3):
  - ≥65% Indian equity, including hedged, is equity.
  - 35–65% is "other": 12.5% long-term, no exemption.
  - The unlisted FoF holding period of 24 months is **unconfirmed**.
- **Research:**
  - the Income-tax Act 2025 rules;
  - SEBI's Feb 2026 hybrid categorisation circular;
  - what AMCs publish (the SID/KIM taxation section, the monthly factsheet equity share);
  - any machine-readable source.
- **Write to:** `docs/research/YYYY-MM-DD-fund-tax-types.md`, then design.
- **Design goals:**
  - defaults by category where the rule is clear;
  - a curated `fund-overrides.json` with a source and month for each entry;
  - a refresh through `scripts/build-prices.ts` if a source allows;
  - a confirm-only prompt with a suggested answer for funds still unknown.

## Epic E: A cleaner app

Founder feedback, 24 Nov: "a lot of text … I would like a much cleaner website; things we want to highlight should be in a notification window or a tooltip".

### E1. Less text everywhere: Needs brainstorm
- **The pattern:** one headline per card; reasons behind "Why?" tooltips; alerts and nudges in a notification panel instead of inline paragraphs.
- **Pages:** Home, Plan, Member, Import, Simulate.
- Use the `impeccable` skill. Keep the disclaimer and the guardrail wording (GUARDRAILS §6).
- **Order:** do it before E2–E4 and C3, which follow its pattern.

### E2. Drop the Compare page: Needs brainstorm (small)
- **Founder:** "What it brings home" doesn't help; it's a calculator the user has to drive.
- **Remove:** the screen (`ui/screens/Compare.tsx`) and its nav item.
- **Keep:** `bringsHome` and `nominalReturn` in `engine/planner.ts`, which A1 reuses.
- Do it after A1 lands, so the useful part has a home.

### E3. Rework Simulate: Needs brainstorm
- **Founder:** still interesting, but hard to understand and not usable today.
- Brainstorm what question it answers ("what if I sell X?") and the simplest screen for it.

### E4. Animations: how a transfer between members changes tax: Needs brainstorm
- The founder asked for this after the fresh run.
- It fits naturally on A1's "Why?" for a placement move.

## Epic F: Safety, compliance and testing

### F1. Open security review items: Needs brainstorm
From `docs/security/2026-11-21-security-review.md`:
- **H2:** the app shares the `devansh217.github.io` origin, and nothing stops it being framed.
- **M1:** `npm audit fix` for the dev tools.
- **M2:** the backup secret is repo-wide. (`main` is now protected: required checks, no force pushes; checked 24 Nov.)
- **M3:** the Pages build job holds deploy permissions.
- **M4:** sign-out wipes unsaved changes.
- **M5(b):** admin two-factor is not tested end to end.

Start from the report's founder to-do list.

### F2. Questions for a CA and the brokers: Needs research (write-up)
- **Source:** `docs/research/2026-11-22-lot-dating-transfers.md` §5 has 9 questions for a CA and 2 support tickets (Zerodha, Angel One).
- **Write-up:** add the CA ones to `docs/research/2026-11-15-questions-for-ca-and-lawyer.md`, Sheet A.
- **New from A1, to add:**
  - holding period and cost carry-over for gifted units under the new Act;
  - whether a yearly cash gift to a parent who then runs a SIP is safe from "substance" challenges;
  - whether HUF money can be placed with members at all.

### F3. Beta manual test plan: Written, not merged
- `docs/testing/beta-manual-test-plan.md` was written on 20 Nov on branch `docs/beta-test-plan` and never merged. It's carried in this file's PR.
- Update it once A1, B1 and C1 land.

### F5. Scrub real figures from the public fresh-run notes: Needs a short review
- `docs/fresh-run-notes.md` is called anonymised, but it still holds rounded real figures from the 22 Nov run, and the old `NEXT-WORK.md` on `main` repeats one (guardrail review of PR #19).
- The repo is public. Replace the figures with made-up or relative ones in their own PR.
- Old commits keep the figures. Rewriting history is a separate decision for the founder.

### F4. Minors in the family: Blocked
- Deferred until after the beta (memory, 17 Nov).
- Clubbing to the higher-income parent is already in `engine/relations.ts`.

---

## Fresh-run findings and where they're handled

From the founder's import run on the live site, 22 Nov 2026. Full detail, anonymised: `docs/fresh-run-notes.md`.

| # | Finding | Handled in |
|---|---|---|
| 1 | No clear success feedback after an import | B1 |
| 2 | Old holdings file and a duplicate tradebook year gave moves on shares sold months ago, with no warning | Engine (PR #18), B1 (files), C1 (Plan marks) |
| 3 | Shares that left an account stayed "held" | Done (PR #18) |
| 4 | Dozens of "Sold N more units than the history shows" lines | Done (PR #18) |
| 5 | Holdings card says "11 transactions" for guessed fund lots | C3 |
| 6 | "1 lot have"; intraday label differs | C3 |
| 7 | Family gifts not recognised | B5 |
| 8 | Simulate shows "−₹X gain" for a loss | C3, E3 |
| 9 | Holdings decide what's held, Tax P&L what's booked | Done (PR #18) |
| 10 | Long-term units booked as short-term | Done (PR #18) |
| 11 | Broker correction shown as "Losses set off" | Done (PR #18) |
| 12 | IPO allotments get "Import older statements" advice | Partly done (PR #18); wording in C3 |
| 13 | Long-term holding with spare room not suggested | C2 |
| 14 | Angel holdings read as fund-only | B3 |
| 15 | Funds counted twice (holdings before MF tradebooks) | Done (PR #18) |
| 16 | ELSS redemption booked as short-term | Done (PR #18) |
| 17a | Angel holdings show more units than the trade history | B3 |
| 17b | Short-term "after set-off" higher than its total | C3 |
| 17c | A sold fund's tax type can't be picked | C3, D1 |

## Founder feedback, 24 Nov 2026, and where it's handled

| # | Feedback | Handled in |
|---|---|---|
| 1 | An Angel Tax P&L PDF not recognised | B2 |
| 2 | No direct vs regular advice for Angel accounts | B4 |
| 3 | No import guide or upload feedback | B1 |
| 4 | "What it brings home" doesn't help | E2 (its useful part moves into A1) |
| 5 | Never suggested whose name the next investment should go in | A1 |
| 6 | Never suggested moving holdings to a lower-taxed member | A1 |
| 7 | Simulate is hard to understand | E3 |
| 8 | Too much text; use tooltips and notifications | E1 |

## Done

| Item | PR |
|---|---|
| Holdings-first engine | #18 |
