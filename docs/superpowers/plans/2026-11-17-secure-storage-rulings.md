# Secure storage: decisions taken while building

17 Nov 2026. Copied from the git-ignored build log so they stay with the branch. Each line: what was decided, why, and what it costs if wrong.

## Rulings

- Task 1: Ruling: added _shared/base64.ts (toB64/fromB64, tested) in Task 1 so the shared folder exists for the boundary test; Tasks 2 and 6 reuse it — cost if wrong: none.
- Task 1: Ruling: the secret scan's RED was a real hit — the plan quoted an example sb_secret_ string; reworded the plan — cost if wrong: none.
- Task 1: Ruling: Supabase CLI pinned to the npm major (npx supabase@2, installed v2.122.1) rather than v3 — cost if wrong: may need an upgrade for newer features.
- Task 3: Ruling: the migration SQL and the Deno entry (family/index.ts) can't run here (no Docker, no Deno); they are checked by `db push` and the deployed access checks in Tasks 10–11. All logic they call is in _shared and tested — cost if wrong: a SQL or wiring error found at deploy time, before any family is moved.
- Task 3: Ruling: account deletion deletes admin_reads rows then the auth user; families, profiles and admins go by FK cascade (no separate deletes) — cost if wrong: none; cascade is declared in the migration.
- Task 3: Ruling: added _shared/http.ts (CORS limited to the Pages origin and localhost:5199; JWT payload reader for `aal`) with tests written after the code — the plan put CORS inside index.ts — cost if wrong: none.
- Task 3: Ruling: a PUT with knownVersion null onto an existing row returns 409 (not an overwrite), matching today's insert-conflict behaviour — cost if wrong: none.
- Task 4: Ruling: reasons are trimmed and must be 3–300 characters (matches the SQL check); the read's 500 on a failed decrypt is 'cannot_open' — cost if wrong: none.
- Task 5: Ruling: the app can't be checked end to end until the new project exists (functions not deployed); covered by unit tests here and by Task 11 against the deployed project — cost if wrong: an integration bug found in Task 11, before any family moves.
- Task 5: Ruling: a 401 from a function shows "Sign in again to save your family." — cost if wrong: none.
- Task 5: Ruling: the consent tick shows for minors with guardian wording via a tested consentLabel(); adults keep "X agreed to be included" — cost if wrong: none.
- Task 6: Ruling: base64 helpers imported from supabase/functions/_shared/base64.ts (not duplicated) — the boundary test allows storage to import it — cost if wrong: none.
- Task 6: Ruling: App split into a loader (App) and the old body (Main) so hooks always see a family; the decision of what to show first is a tested pure initialFamily(local, signedIn) — cost if wrong: none.
- Task 7: Ruling: viewedContext lives in src/ui/viewing.ts (not App.tsx) so it can be tested without rendering; the Admin tab is in the top bar only (not the phone tab bar) — cost if wrong: on a phone the founder reaches #admin by URL.
- Task 7: Ruling: the admin flow (enrol, step up, list, open) can only be exercised against the deployed project with the founder signed in; covered in Task 11. Signed-out render checked with no console errors — cost if wrong: an integration bug found in Task 11.
- Task 8: Ruling: the CSP <meta> is added to the built page by a Vite plugin (apply: 'build'), not written into index.html — the dev server's React refresh needs an inline script; tested via a pure cspFor() and checked in the built site — cost if wrong: dev runs without the policy (only the live site matters).
- Task 8: Ruling: fonts via @fontsource packages (bundled by Vite into /assets) instead of hand-copied files in public/fonts; small fonts are no longer inlined as data: (assetsInlineLimit) so font-src 'self' holds — cost if wrong: none.
- Task 8: Ruling: project URL and publishable key moved to src/cloud-config.ts so vite.config can build the CSP without loading the Supabase client; Task 10 edits that file — cost if wrong: none.
- Task 9: Ruling: the restore test reads the decrypted backup locally (pg_restore --list to check the archive, --data-only to read the families rows, count against the live project, open one envelope) instead of restoring into a restore_test schema — pg_restore can't rename the schema, and writing into the live project isn't needed to prove the backup is complete and decryptable — cost if wrong: DDL restore-ability isn't exercised; a full restore into a scratch project stays possible by hand.
- Task 9: Ruling: Postgres client 17 from the PGDG apt repo on the runner (Ubuntu's default client may be older than the server) — cost if wrong: a version mismatch error at the first run, visible in Actions.
- Task 9: Ruling: prototype/backup-recipient.txt holds a placeholder until Task 10; the nightly job fails loudly until then (it only runs from main) — cost if wrong: none if Task 10 lands before merge.
- Task 9: Ruling: copyRows() tested after it was written (test added in the same task) — cost if wrong: none.
- Task 10: guide written (docs/guides/secure-storage-setup.md). Waiting on the founder for Part A (project URL, publishable key, age public key) before the cloud-config, CSP and backup-recipient change. Ruling: the guide turns off email sign-ups in the new project's Auth settings as well as hiding the forms — cost if wrong: none.
- Final: Ruling: reviewer minor "enrol TOTP before inserting the admins row" — already satisfied for this project: the founder enrolled and verified TOTP on 17 Nov 2026 before any family but his own existed — cost if wrong: none now; matters if another admin is ever added (enrol first).
- Final: Ruling: declined-to-judge items (gateway verify_jwt with publishable keys, getUser session liveness, other Pages sites sharing the origin, hosted MFA defaults, same-version envelope replay) — the live checks in Task 11 showed functions answer from our handler and that an ended session is refused; origin sharing is guide step 9; replay needs database write access — cost if wrong: low for a 5-family beta.

## Final review

- Final review: opus reviewer, verdict "with fixes"; no Critical.
- Final: fixed I1 save loop on a dead sign-in (status 'error' re-ran the save every 1.2 s; no sign-in prompt) — syncPolicy.test "after a failed save, does not retry…" + "an ended sign-in asks…" RED→GREEN; useCloud now uses shouldSave/failureKind, signs out locally on 401 and shows "Your sign-in has ended…", suite 182/182
- Final: fixed I2 concurrent browser saves (out-of-order writes; two first-save keys) — device.test "review: saves made in quick succession…" RED→GREEN (5 puts → 1, last state wins), suite 182/182
- Final: fixed I3 a failed load followed by a 409 replaced this browser's real family without asking — syncPolicy.test "asks which copy to keep…" RED→GREEN; no save before a successful load; afterConflict → 'choose', suite 182/182
- Final: minor (deferred): rejected key-ring promise cached in functions until a cold start (clear `ring` on rejection).
- Final: minor (deferred): account deletion removes admin_reads before deleteUser; reverse the order or make it one transaction.
- Final: minor (deferred): Family page export/backup still works while viewing another family read-only; hide it when ctx.viewing is set.
- Final: minor (deferred): stale "Mumbai" wording in the migration header, schema.sql header and a cloud.ts comment.
- Final: minor (deferred): a non-UUID familyUserId gives 500 instead of 400 in the admin read.
- Final: minor (deferred): no frame-ancestors (meta CSP can't set it; Pages sends no X-Frame-Options); add a frame-buster or accept.
- Final: minor (deferred): backup hardening — pin Actions by SHA, a read-only dump role instead of postgres, restore-test passes the DB URL to psql on the command line, GitHub disables schedules after 60 days without repo activity.
- Final: minor (deferred): admin list reads only the first 1,000 sign-in accounts.
- Final: minor (deferred): local supabase/config.toml has TOTP enrol/verify off (hosted project unaffected).
