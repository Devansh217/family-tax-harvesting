# Handoff: beta-features build — FINISHED (20 Nov 2026)

All 13 tasks are built and reviewed; final review clean; 385 tests pass. Nothing is merged, pushed or deployed. Next steps are in `docs/PLANNER-NOTES.md` item 5 and `docs/guides/beta-setup.md`. Decisions: `docs/superpowers/plans/2026-11-17-beta-features-rulings.md`. The working ledger below was deleted after the build.

---

# Handoff: Harvesting beta-features build (17 Nov 2026)

Repo `/Users/devansh/Documents/family-tax-harvesting`, branch **`beta-features`** (not pushed, no PR). App in `prototype/`.

## Read these, in this order (nothing else first)
1. **Ledger (source of truth for progress and every decision):** `.superpowers/sdd/2026-11-17-beta-features/progress.md` (git-ignored, local only). Trust it and `git log` over memory.
2. Plan: `docs/superpowers/plans/2026-11-17-beta-features.md` (Tasks 1–13, 3 milestones).
3. Spec: `docs/superpowers/specs/2026-11-17-beta-features-design.md` (binding; §12 = Claude's design calls, founder delegated them).

## How the work runs
- Founder chose **subagent-driven**. Use skill `superpowers:subagent-driven-development`; on resume read its `references/resuming.md`.
- Per task: `bash <skill>/scripts/task-brief PLAN N` → implementer (sonnet) with rulings in the dispatch → `scripts/review-package PLAN BASE HEAD` → task reviewer (sonnet; opus for money/security) → fix loop by resuming the implementer → ledger line `Task N: complete (...)`.
- Skill dir: `/Users/devansh/Library/Application Support/Claude/local-agent-mode-sessions/fd03a6d3-5004-43e3-a1bf-2cf8cc26a5c7/2af39baf-97b2-411e-8d6b-419b5f01b25a/rpm/plugin_01JETPTMWTgidsotmEhVkQTG/skills/subagent-driven-development`
- Every decision goes in the ledger as `Ruling: <what> — <why> — <cost if wrong>`. At the end, list every ruling for the founder.

## Where it stands
- **M1 (Tasks 1–7) complete and reviewed**, commits `0fe95c0..e01ff81`. Milestone review found 2 critical + 5 important cross-task bugs; all fixed and re-reviewed.
- **M2:** Task 8 complete (`421b416`), Task 9 complete (`4ffae23`).
- **Task 10 (email schedule and wording) is implemented at `a1db832` but NOT yet reviewed.** On resume: base `4ffae23`, head `a1db832`; read `.superpowers/sdd/2026-11-17-beta-features/task-10-report.md`, package with `review-package PLAN 4ffae23 a1db832`, and run the task review. Note for Task 11: `renderEmail` takes a 6th argument `lastSafe` that the alerts caller must pass.
- **Remaining:** Task 11 (alerts function + Brevo email + cron), Task 12 (admin season numbers), M2 milestone review (opus, whole range `e01ff81..HEAD`; triage deferred minors, including the Task 8 privacy one), then M3 Task 13 (capital gains schedule) and the final whole-branch review (opus), then `superpowers:finishing-a-development-branch`.
- Tests: 303 passing at `a1db832`; typecheck and build clean.

## Owed by the founder (don't nag; mention once at the end)
- Fill `prototype/src/engine/data/holidays-2027.ts` from NSE's 2027 holiday circular (mid-Dec 2026) and set `published: true`, plus the Task 2 Step 5 test. Gate for "season-ready" by 10 Jan.
- Steps in `docs/guides/beta-setup.md` (confirm email sign-up is off, push migrations, deploy `family`/`admin`, invite emails). Later, Task 11 adds Brevo and cron setup there.
- Earlier: secure storage guide Part B; CA/lawyer question sheets.

## Founder preferences
Plain English, short sentences, Indian number format; tables with a recommendation, then one question. Usage-conscious. Push or PR only when he asks. When he says "take the call", decide and list the decisions at the end.
