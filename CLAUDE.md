# Family Tax Harvesting

The app lives in `prototype/` (React + Vite, tax engine in `prototype/src/engine/`). Product, architecture and design specs are in `docs/`.

## Guardrails

`docs/GUARDRAILS.md` holds the rules every change keeps: tax safety, saved families, privacy, security, wording. Read it before changing the engine, imports, storage, Supabase or user-facing copy.

## Pull requests

Before asking to merge any PR, run the `guardrail-reviewer` agent on it and put its verified findings in the PR (or say it found none). Fix blocking findings first.
