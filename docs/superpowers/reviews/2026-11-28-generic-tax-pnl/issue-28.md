# B2: Generic Tax P&L reader (Excel and CSV first, PDF best-effort)

> [!TIP]
> **Not blocked.** Can be picked up now.

**Epic:** Import and readers · **Status:** `status: cause known`
**Blocks:** #29 (B3)
**Shares files with:** #29 (B3): `parsers/table.ts` field dictionary. Don't build both at once; rebase on whichever merges first.

## The work

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
- **Founder's direction (25 Nov):** one generic reader, not a reader per broker. It looks for the fields it needs in any uploaded file.
- **Approach (no new library or service):** extend the field dictionary in `parsers/table.ts`, which already reads trades and holdings by matching header words.
  - **Fields per sold lot.** Needed: name or ISIN, quantity, buy date, sell date, buy value, sell value. Optional: gain, term, charges. Optional summary totals are a cross-check.
  - **The reader passes dates and values; the engine decides the term** with its per-class rules in `engine/rules.ts` (12 months for listed equity, 24 for other assets, the 1 Apr 2023 cut-off for debt funds). The reader never applies a flat 12-month test, and the broker's per-lot labels never decide it.
  - **Broker totals still win** for booked gains when the history is incomplete (`brokerAdjustments`, GUARDRAILS §1). The lot detail is a cross-check, not a replacement.
  - **Search every sheet and section,** for each block (equity, funds, buybacks).
  - **Check every row:** dates parse, the sale is after the buy, quantity is above zero, and the values add up to the gain. Apply the 31 Jan 2018 value first for lots bought before then, or grandfathered rows fail the sum.
  - **Confidence decides what happens:** high imports on its own, medium shows the existing column-check screen, low is rejected with a reason.
  - **Remember confirmed layouts** by header pattern; ship the known ones (Zerodha, Angel).
  - **Small per-broker hints** only for quirks: buyback lines, 31 Jan 2018 values, Angel's long-term/short-term split. The existing Zerodha reader stays.
  - **PDF is best-effort:** rebuild columns from pdf.js word positions and accept only high confidence. Otherwise ask for the Excel version.
  - **Ruled out:** server-side PDF tools (Tabula, Camelot, pdfplumber), cloud document AI and LLM APIs, because statements must stay in the browser (GUARDRAILS §4) and the app is free tier only. An in-browser model is too heavy for phones.
  - **B3 uses the same reader** (founder, 25 Nov).
- **Build:**
  - The generic reader, tested on the Zerodha and Angel files in both formats.
  - "Broker totals win" for Angel accounts (`brokerAdjustments`), as Zerodha has.
  - The p.4–5 holdings and long-term/short-term split feed the holdings-first engine as a dated snapshot, as B3 will.
  - **Last year's Tax P&L feeds carried-forward losses** (`Member.carriedLoss`): the user confirms the figure, and it applies only if that year's return was filed on time.
- **Done when:** both files read, and the Plan's booked gains match the broker for an Angel account.

## Picking this up (any session or agent)
1. **Check blockers.** If "Blocked by" above lists an open issue, stop and pick another. The open, unblocked list: issues without the `blocked` label.
2. **Claim it.** Comment "Taking this" with your session or agent name, set the label to `status: building`, and move its card to **In progress** on the [backlog board](https://github.com/users/Devansh217/projects/1). If someone already claimed it, pick another.
3. **Read first:** `CLAUDE.md`, `docs/GUARDRAILS.md` (tax safety, privacy, wording), and `docs/fresh-run-notes.md` for the original findings. Use the notes to fill gaps where this issue is silent, and before calling it done check the matching finding is fixed; if not, or if a finding is handled nowhere, say so in the PR. Don't silently skip it. Other items are named by ID in this text (for example "B2"); find them by the ID at the start of an issue title.
4. **Start with:** The cause is known. Write a short design with `superpowers:brainstorming`, then a plan with `superpowers:writing-plans`, then build.
5. **Branch:** `b2-<short-name>`. Code lives in `prototype/`.
6. **Check:** `cd prototype && npm run typecheck && npm test && npm run test:smoke`.
7. **PR:** put `Closes #28` in the body. Before asking to merge, run the `guardrail-reviewer` agent and put its findings in the PR. `main` requires CI.
8. **After it merges,** check the issues it blocks: if one has no other open blocker, remove its `blocked` label and move its board card from Blocked to Can start.
9. **Found new work?** Open a new issue with an `epic …` and `status: …` label, and add a "Blocked by" line if it is.
10. **No personal data** in issues, PRs or commits: this repo is public. Real statements stay in the git-ignored `data/private/`.

## Comments
Taking this (Claude Code session, design first). Design will land as docs/superpowers/specs/2026-11-28-generic-tax-pnl-design.md on branch b2-generic-tax-pnl.
