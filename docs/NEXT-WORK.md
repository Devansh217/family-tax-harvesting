# Next work: pending research and requirements

Written 22 Nov 2026 at the end of the fresh import run and the holdings-first design. For a fresh session (any account): read this first, then `CLAUDE.md` and `docs/GUARDRAILS.md`. No personal data belongs in this file. Real statements stay in the git-ignored `data/private/`.

> **Before you start, and again before you call any piece done:** read `docs/fresh-run-notes.md`, the anonymised findings from the real run.
> - Use it to **fill gaps**: when this file, a design or a plan is silent or unclear, the notes give the original observation, its cause and what the founder asked for.
> - Use it to **validate**: check that what you built fixes the matching finding. For example, a fund's held units equal its holdings file, and shares gifted to a parent no longer show for the giver.
> - If a finding is handled nowhere, or your change doesn't match what the notes describe, say so in your hand-back or PR. Don't silently skip it.

## 1. Ready to build: holdings-first engine

- Design (approved): `docs/superpowers/specs/2026-11-22-holdings-first-engine-design.md`
- Research behind it: `docs/research/2026-11-22-lot-dating-transfers.md`
- Plan, 8 tasks, test-first: `docs/superpowers/plans/2026-11-22-holdings-first-engine.md`
- Branch: `holdings-first-design`. Run it with `superpowers:subagent-driven-development` (recommended: the engine tasks build on each other and mistakes change tax figures).
- Before merging, run the `guardrail-reviewer` agent and put its findings in the PR. `main` requires CI.

## 2. Research to do (each is its own session)

Use the `research` skill. Write the result to `docs/research/YYYY-MM-DD-<topic>.md`, then design with `superpowers:brainstorming`.

### 2.1 Fund tax types from AMC documents, not user picks (highest)
The member page's "Funds to check" asks users to choose Equity / Long-term 12.5% / Slab for hybrid funds and funds of funds (e.g. balanced advantage, multi-asset allocation, gold and silver FoF). Users can't be expected to know this. Until they pick, gains are taxed at slab and get no moves.
- Today: `engine/categories.ts` maps AMFI categories; `engine/fund-overrides.json` is empty. Existing research only states the rule (`docs/research/2026-11-15-product-universe.md` §4.3: ≥65% Indian equity including hedged = equity; 35–65% = "other", 12.5% long-term with no exemption; unlisted FoF holding period 24 months, **unconfirmed**).
- Research: the Income-tax Act 2025 rules; SEBI's Feb 2026 hybrid categorisation circular; what AMCs publish (SID/KIM taxation section, monthly factsheet equity share); any machine-readable source (AMFI, AMC portfolio disclosures).
- Design goals:
  - defaults by category where the rule is clear;
  - a curated `fund-overrides.json` with source and month for each entry;
  - a refresh through `scripts/build-prices.ts` if a source allows;
  - for funds still unknown, a confirm-only prompt with a suggested answer and its source.

### 2.2 Questions for a CA and the brokers
Listed in `docs/research/2026-11-22-lot-dating-transfers.md` §5: 9 for a CA, 2 support tickets (Zerodha, Angel One). Add the CA ones to `docs/research/2026-11-15-questions-for-ca-and-lawyer.md`, Sheet A. None of them blocks the engine plan; each answer refines a "Needs checking" line.

## 3. Requirements found in the fresh run, not yet designed

In rough priority order. Each needs a brainstorm before code.

1. **Guided import.** Order: holdings (today) → this year's Tax P&L → tradebooks newest first, only while gaps remain. Each ask says what it would unlock ("this tradebook dates 3 shares"). Always offer "Stop here, show my plan", with a completeness line ("Moves use 92% of holdings by value"). Steps differ per broker and per member. Catch wrong files: two copies of the same year, an old holdings file, a missing current year. Results must never depend on upload order. It builds on the holdings-first engine's gap information.
2. **Angel One holdings reader.** The unlocked "Your Holding Details" workbook has Equity (ISIN, total quantity, average price, LTP, **LTCG and STCG quantity and value**), SGB, Mutual Funds and Bonds sheets. Today the app reads only the fund sheet and silently drops the shares and SGBs. Saving from Numbers adds an "Export Summary" first sheet, so find sheets by header. Join it to the holdings-first trimming list (`TRIMMING_HOLDINGS_SOURCES`).
3. **Angel One Tax P&L reader**, so "broker totals win" works for Angel accounts.
4. **Recognise gifts within the family.** When units leave one member's account and the same ISIN appears in another member's holdings, ask "Did <giver> gift these to <receiver>?" On yes, the receiver's lots take the giver's cost and dates (research G3, G4). Also detect Zerodha Console gifts, which show as an exit at the day's close in the giver's Tax P&L (research B4). Never assume: it could be a sale and a purchase.
5. **Import success feedback.** Today there's only a brief toast. Make it clear the file worked. This ties in with item 7.
6. **Wording fixes:** "1 lot have" should be "has"; intraday "from tradebooks" vs "from your broker's report"; the holdings card should say "N fund lots with guessed dates" instead of "N transactions"; Simulate should say "₹X loss (all long-term)" instead of "−₹X gain"; Simulate should explain a set-off that raises a section; and a sold fund's tax type can't be picked today.
7. **Animations brainstorm:** show how a transfer between members changes tax.
8. **Check:** why a long-term holding with room to spare (13 units, about ₹7.8k gain) wasn't suggested for a parent. Is it a minimum size, or the cushion counted differently?

## 4. Every fresh-run finding and where it's handled

From the founder's import run on the live site, 22 Nov 2026: 3 members on Zerodha (shares and Coin funds) and Angel One. Full detail, anonymised: `docs/fresh-run-notes.md`. The original notes, with real data, stay off git.

| # | Finding | Handled in |
|---|---|---|
| 1 | No clear success feedback after an import, only a brief toast | §3 item 5 |
| 2 | An old holdings file and the same tradebook year imported twice gave moves on shares sold months ago, with no warning | Engine: stale files never trim (design §1). Engine plan Task 7: the "Nothing new" card. Guided import (§3 item 1): flag old files and missing years, and **show the holdings file's date on its card** |
| 3 | Shares that left an account (off-market gifts to a parent) stayed "held" and showed in Holdings, totals and Simulate ("held by 2") | Engine design §2; plan Task 2 |
| 4 | About 45–60 "Sold N more units than the history shows" lines per member, one per lot and mostly from earlier years | Engine design §6; plan Task 6 |
| 5 | The holdings card says "11 transactions"; they are guessed fund lots | §3 item 6 |
| 6 | "1 lot have"; the intraday label differs in two places | §3 item 6 |
| 7 | Family gifts aren't recognised, so the receiver's cost and dates are wrong | §3 item 4 |
| 8 | Simulate shows "−₹X gain" for a loss | §3 item 6 |
| 9 | Founder direction: holdings file decides what's held, Tax P&L decides what's booked, tradebooks optional; fewer files is worth the 10% cushion | The engine design as a whole |
| 10 | Long-term units sold from the holdings-file lot were booked as short-term | Engine design §4; plan Task 4 |
| 11 | The broker correction showed as "Losses set off" | Engine design §7; plan Task 6 |
| 12 | IPO allotments get "Import older statements" advice. No such statement exists | Engine plan Task 6 hides them when the Tax P&L covers the sale. **Still open:** where it doesn't, the wording should say "possibly an IPO allotment or transfer in" (add to Task 6 or §3 item 6) |
| 13 | A long-term holding with spare room wasn't suggested | §3 item 8 |
| 14 | The Angel One holdings file is read as fund-only, and its shares and SGBs are dropped silently | §3 item 2 |
| 15 | Funds counted twice when the holdings file went in before the MF tradebooks | Engine design §3; plan Task 3 |
| 16 | An ELSS redemption was booked as short-term | Engine design §5; plan Task 4 |
| 17a | Angel holdings show more units of one share than the trade history (missing older purchases) with no warning | §3 item 2 (needs the reader) |
| 17b | The short-term section's "after set-off" is higher than its total, with no explanation | §3 item 6 |
| 17c | A sold fund's tax type "needs checking" but there's no way to pick it | §3 item 6, and §2.1 removes most picks |
| — | Founder rule: more data never spoils | Engine design §9 |
| — | Founder rule: unknown-term sales assume long-term, and the user can answer Long-term / Short-term / add a buy date | Engine design §5; plan Task 4 and Task 6 |
| — | Founder: guided import with "stop here" | §3 item 1 |
| — | Founder: users can't be expected to pick fund tax types | §2.1 |
| — | Founder: nudge for a tradebook instead of demanding files | Engine design §8; plan Task 7 |

## 5. Known gaps carried over

- The Import guide and the Plan send Zerodha Coin users to the fund CAS. Coin funds need MF tradebooks for every year.
- The CAS password hint says "usually your PAN". MF Central and CAMS use a password the user chooses.
- The CAMS / KFintech fund CAS reader has never seen a real statement.
