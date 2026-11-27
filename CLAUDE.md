# Family Tax Harvesting

The app lives in `prototype/` (React + Vite, tax engine in `prototype/src/engine/`). Product, architecture and design specs are in `docs/`.

## Next work

GitHub issues are the one list of planned and unbuilt work: one issue per one-session item, labelled by epic and status. Each issue says whether it is blocked (and by which issues) and how to pick it up. A PR closes its issue with `Closes #N`; new work found along the way becomes a new issue, never only a note in chat. `docs/NEXT-WORK.md` holds the conventions, the founder's priority order and the map from old item IDs (B2, F3…) to issue numbers.

## Handoff

At the start of a session, read the pinned [Handoff board, issue #50](https://github.com/Devansh217/family-tax-harvesting/issues/50) to see what is in flight and what waits on the founder. Update your row there before you stop. The rules are in `docs/HANDOFF.md`.

## Guardrails

`docs/GUARDRAILS.md` holds the rules every change keeps: tax safety, saved families, privacy, security, wording. Read it before changing the engine, imports, storage, Supabase or user-facing copy.

## Pull requests

Before asking to merge any PR, run the `guardrail-reviewer` agent on it and put its verified findings in the PR (or say it found none). Fix blocking findings first.
