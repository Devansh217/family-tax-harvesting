# Next work

**The backlog lives in GitHub issues:** https://github.com/Devansh217/family-tax-harvesting/issues

Moved there on 25 Nov 2026. Each item from this file became one issue. The issue holds the full detail and a "Picking this up" guide, so any session or agent can take it up without reading this file. This file keeps only the conventions and the map from the old item IDs (B2, F3 and so on, still used in designs and plans) to issue numbers.

## How the issues work

- **One issue = one session of work.** The title starts with the item ID, e.g. "B2: Generic Tax P&L reader".
- **Labels:**
  - `epic A: …` to `epic G: …`: the area.
  - `status: …`: `building`, `ready` (design and plan approved), `cause known` (needs a short design), `needs brainstorm`, `needs research`.
  - `blocked`: can't start yet. The issue opens with a red **Blocked by** box naming the issues that must close first, and GitHub's own "blocked by" link is set, so the issue shows as blocked in lists and boards.
- **Not blocked** issues open with a green **Not blocked** box.
- **Shares files with:** issues that change the same files say so. Don't build them at the same time; rebase on whichever merges first.
- **Picking one up:** follow the "Picking this up" steps in the issue: check blockers, comment "Taking this", set `status: building`, read `CLAUDE.md`, `docs/GUARDRAILS.md` and `docs/fresh-run-notes.md`, then start with the skill the issue names.
- **Closing:** the PR says `Closes #N`. Before merge, run the `guardrail-reviewer` agent and put its findings in the PR. After merge, remove the `blocked` label from any issue it blocked that has no other open blocker.
- **New work:** open an issue with an epic and status label (and a Blocked by box if it needs one). Don't keep it only in a chat or in this file.
- **Public repo:** no personal data in issues, PRs or commits. Real statements stay in the git-ignored `data/private/`.

## Founder's priority (25 Nov 2026)

1. [#24](https://github.com/Devansh217/family-tax-harvesting/issues/24) B1 guided import (building)
2. [#25](https://github.com/Devansh217/family-tax-harvesting/issues/25) C1 old-data marks (blocked by B1)
3. [#26](https://github.com/Devansh217/family-tax-harvesting/issues/26) A1 holding in another name (blocked by C1)
4. [#27](https://github.com/Devansh217/family-tax-harvesting/issues/27) E2 remove the Compare page
5. [#28](https://github.com/Devansh217/family-tax-harvesting/issues/28) B2 generic Tax P&L reader
6. [#29](https://github.com/Devansh217/family-tax-harvesting/issues/29) B3 Angel holdings (blocked by B2)
7. [#30](https://github.com/Devansh217/family-tax-harvesting/issues/30) B4 direct vs regular
8. [#31](https://github.com/Devansh217/family-tax-harvesting/issues/31) B5 gifts within the family
9. [#32](https://github.com/Devansh217/family-tax-harvesting/issues/32) C2 missed long-term holding
10. [#33](https://github.com/Devansh217/family-tax-harvesting/issues/33) C3 wording fixes
11. [#34](https://github.com/Devansh217/family-tax-harvesting/issues/34) E1 less text everywhere
12. [#35](https://github.com/Devansh217/family-tax-harvesting/issues/35) E3 rework Simulate (blocked by E1)
13. [#36](https://github.com/Devansh217/family-tax-harvesting/issues/36) E4 transfer animations (blocked by A1, E1)
14. [#37](https://github.com/Devansh217/family-tax-harvesting/issues/37) F5 scrub public figures

Not yet placed by the founder: [#38](https://github.com/Devansh217/family-tax-harvesting/issues/38) G1 split `engine/family.ts` (blocked by A1), [#39](https://github.com/Devansh217/family-tax-harvesting/issues/39) B6, [#40](https://github.com/Devansh217/family-tax-harvesting/issues/40) D1, [#41](https://github.com/Devansh217/family-tax-harvesting/issues/41) F1, [#42](https://github.com/Devansh217/family-tax-harvesting/issues/42) F2, [#43](https://github.com/Devansh217/family-tax-harvesting/issues/43) F3 (blocked by A1, B1, C1), [#44](https://github.com/Devansh217/family-tax-harvesting/issues/44) F4 (blocked: after the beta).

## Old item IDs → issues

| ID | Issue | ID | Issue | ID | Issue |
|---|---|---|---|---|---|
| A1 | #26 | C1 | #25 | E3 | #35 |
| B1 | #24 | C2 | #32 | E4 | #36 |
| B2 | #28 | C3 | #33 | F1 | #41 |
| B3 | #29 | D1 | #40 | F2 | #42 |
| B4 | #30 | E1 | #34 | F3 | #43 |
| B5 | #31 | E2 | #27 | F4 | #44 |
| B6 | #39 | G1 | #38 | F5 | #37 |

## Fresh-run findings (22 Nov 2026) and where they're handled

Full detail, anonymised: `docs/fresh-run-notes.md`.

| # | Finding | Handled in |
|---|---|---|
| 1 | No clear success feedback after an import | #24 B1 |
| 2 | Old holdings file and a duplicate tradebook year gave moves on shares sold months ago, with no warning | Engine (PR #18), #24 B1 (files), #25 C1 (Plan marks) |
| 3 | Shares that left an account stayed "held" | Done (PR #18) |
| 4 | Dozens of "Sold N more units than the history shows" lines | Done (PR #18) |
| 5 | Holdings card says "11 transactions" for guessed fund lots | #33 C3 |
| 6 | "1 lot have"; intraday label differs | #33 C3 |
| 7 | Family gifts not recognised | #31 B5 |
| 8 | Simulate shows "−₹X gain" for a loss | #33 C3, #35 E3 |
| 9 | Holdings decide what's held, Tax P&L what's booked | Done (PR #18) |
| 10 | Long-term units booked as short-term | Done (PR #18) |
| 11 | Broker correction shown as "Losses set off" | Done (PR #18) |
| 12 | IPO allotments get "Import older statements" advice | Partly done (PR #18); wording in #33 C3 |
| 13 | Long-term holding with spare room not suggested | #32 C2 |
| 14 | Angel holdings read as fund-only | #29 B3 |
| 15 | Funds counted twice (holdings before MF tradebooks) | Done (PR #18) |
| 16 | ELSS redemption booked as short-term | Done (PR #18) |
| 17a | Angel holdings show more units than the trade history | #29 B3 |
| 17b | Short-term "after set-off" higher than its total | #33 C3 |
| 17c | A sold fund's tax type can't be picked | #33 C3, #40 D1 |

## Founder feedback (24 Nov 2026) and where it's handled

| # | Feedback | Handled in |
|---|---|---|
| 1 | An Angel Tax P&L PDF not recognised | #28 B2 |
| 2 | No direct vs regular advice for Angel accounts | #30 B4 |
| 3 | No import guide or upload feedback | #24 B1 |
| 4 | "What it brings home" doesn't help | #27 E2 (its useful part moves into #26 A1) |
| 5 | Never suggested whose name the next investment should go in | #26 A1 |
| 6 | Never suggested moving holdings to a lower-taxed member | #26 A1 |
| 7 | Simulate is hard to understand | #35 E3 |
| 8 | Too much text; use tooltips and notifications | #34 E1 |

## Done before the move to issues

| Item | PR |
|---|---|
| Holdings-first engine | #18 |
| This backlog, the three ready designs and plans, the beta test plan | #19, #23 |
