# Handoff between sessions

Many sessions work on this repo, often at the same time and with no shared memory. This page says how they hand work to each other. The live state is in the pinned issue **[#50 Handoff board](https://github.com/Devansh217/family-tax-harvesting/issues/50)**.

## What lives where

| What | Where |
|---|---|
| Planned and unbuilt work, one item per session | GitHub issues (see `docs/NEXT-WORK.md`) |
| What is in flight right now, its next step, and what waits on the founder | The board, issue #50 |
| The rules for handing off (this page) | `docs/HANDOFF.md` |
| Rules every change keeps | `docs/GUARDRAILS.md` |

The board never replaces an issue. Detail about one item goes in that item's issue or PR, and the board links to it.

We keep the board in an issue, not a file, for two reasons. `main` is protected, so a file would need a PR for every update. And two sessions editing one file at once would clash.

## Starting a session

1. Read the board (`gh issue view 50`).
2. If you are carrying on work that is **In flight**, start from its row and its PR. Don't start that work over.
3. If you are starting something new, take an item from **Free to start**, or the first "Can start" issue in the founder's order. Then follow that issue's "Picking this up" steps.
4. Add or update your row under **In flight**: the issue, the branch and PR, the state, the next step and today's date.

## Ending a session (or stopping part-way)

Update the board before you stop, so a cold session can carry on from it alone.

- **Your row:** what is done (commits or PR), what is left, and the exact next step. Note anything easy to miss, such as a branch that needs main merged in or a review round still open.
- **Finished:** move the row to **Recently finished**, with the PR and the date. Keep about the last five.
- **Questions for the founder:** add a row to **Waiting on the founder**. When he answers, remove the row and record the answer in the issue it belongs to.
- **New work you found:** open an issue for it (`docs/NEXT-WORK.md`). If it is ready to start, add it to **Free to start**.

## Editing the board safely

- Edit the issue **body**. Don't use comments: they pile up and go stale.
- Re-read the body just before you save, and change only your own rows:

  ```bash
  gh issue view 50 --json body --jq .body > /tmp/board.md
  # edit your rows in /tmp/board.md
  gh issue edit 50 --body-file /tmp/board.md
  ```

- Update the "Last updated" line.
- Keep it short: one line per item. Put the detail in the issue or PR.

## Privacy

The repo and its issues are **public**. No names, PANs, folio or account numbers, emails or real amounts on the board (GUARDRAILS §4).
