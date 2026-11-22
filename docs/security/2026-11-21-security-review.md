# Security review, 21 Nov 2026

Scope: `main` at `ca6d45a` (PR #6 merged), plus the security-relevant parts of open PR #7 (`beta-test-fixes`, which
changes no server, storage or CSP code). Read-and-report, with a handful of low-risk fixes on branch
`security/review-2026-11-21` (listed at the end).

How it was checked:
- `npm audit`, `npm outdated` and a lockfile read in `prototype/`.
- A grep of every commit on every branch for keys, tokens, PAN-shaped strings, emails, phone numbers and data files.
- A line-by-line read of the migrations, the three edge functions, the crypto, storage, sync, import and admin code, and both workflows.
- Read-only checks of the live system: anonymous `GET`s to the REST API with the public key, the live site's response
  headers, and the repo's settings through `gh`.

Live project checks (added 22 Nov 2026, read-only through the Supabase MCP on `iaesqhisslztykbglcck`):
- the security and performance advisors;
- `list_tables`, `list_migrations` and `list_edge_functions`;
- the deployed source of `family` and `admin`;
- one catalog query covering grants, policies, function ACLs, views, cron jobs, Vault secret *names*, extensions, the
  count of verified admin TOTP factors, and storage buckets.

No family data was read and nothing was changed. The results are folded into the findings below and summarised in
"Live project check" at the end.

Not checked: settings only the dashboards show, namely the Google OAuth redirect allow-list and function secrets.

The short version: nobody outside can reach family data today. Every table and view refuses anonymous reads. The
functions check the sign-in, the invite and, for admin, two-factor. The production bundle has no known-vulnerable
dependency. No secret has ever been committed. The real risks are:
- a leftover plain-text table on the live project;
- a shared `github.io` origin that would hand the whole app to any other Pages site;
- CI secrets reachable by anyone who can push;
- privacy wording that promises more than the design gives.

## Summary

| # | Severity | Finding | Status |
|---|---|---|---|
| H1 | High | Old plain-text `family_data` table still exists on the live project | Open: founder (guide Part B) |
| H2 | High | App shares the `devansh217.github.io` origin, and nothing stops it being framed | Open |
| H3 | High | Privacy copy says only the family can read its account copy; the server holds the keys | Open |
| M1 | Medium | Dev toolchain advisories: vite 6.3.5, vitest 3.1.4, tinypool (2 critical, 1 high) | Open (lockfile; see note) |
| M2 | Medium | Backup workflow: DB superuser URL as a repo-wide secret, recipient key read from the repo, unprotected `main` | Open |
| M3 | Medium | Pages build job holds the deploy token while it runs `npm ci` and third-party downloads | Open (workflow file; not edited) |
| M4 | Medium | Sign-out wipes the browser copy even when the last save failed | Open |
| M5 | Medium | Admin two-factor: whoever enrols first wins; enforcement not yet tested end to end | Open |
| M6 | Medium | A malformed backup file restores, crashes the screens and is saved over the family | **Fixed** |
| M7 | Medium | Live project is one migration behind; season cron runs daily with no `alerts` function or Vault secrets | Open |
| L1 | Low | `profiles`: `authenticated` keeps Supabase's default INSERT/DELETE/TRUNCATE grants; `handle_new_user` executable by `anon` | Open |
| L2 | Low | `season_alert_families` view (emails and envelopes) lives in the API-exposed `public` schema | Open |
| L3 | Low | No rate limits on the functions; sign-ups are open | Open |
| L4 | Low | Account delete needs only a current access token, with no recent sign-in | Open |
| L5 | Low | Browser copy key sits next to the ciphertext; session tokens are in `localStorage` | Accepted / document |
| L6 | Low | "Download backup" writes the whole family as plain JSON | Open |
| L7 | Low | Season emails carry rupee figures through a third-party email provider | Open (disclosure) |
| L8 | Low | CSV export: formula guard missed tab/CR starts and the ISIN and date columns | **Fixed** |
| L9 | Low | pdf.js left `isEvalSupported` on; no size cap on imported files | **Partly fixed** |
| L10 | Low | Secret guard covered only Supabase keys; `.gitignore` missed spreadsheets, backups, `.idea/` | **Fixed** |
| L11 | Low | Actions not SHA-pinned, all actions allowed, `localhost` in production CORS | Open |
| L12 | Low | Personal email address in public commit history | Open (founder's call) |
| L13 | Info | Root `index.html` (v0.1) loads Google Fonts and inline script with no CSP; no longer deployed | Info |

---

## High

### H1. The plain-text `family_data` table is still on the live project

**Where:** `prototype/supabase/schema.sql:1-2` (the old setup), `docs/guides/secure-storage-setup.md:85` (the drop step).

**Evidence:** an anonymous `GET /rest/v1/family_data` on `iaesqhisslztykbglcck` returns `42501 permission denied`,
not "relation does not exist". The live check confirms it: `family_data` has **1 row**. `authenticated` still holds
every privilege on it, under the old "read / insert / update / delete own" policies. The secure-storage spec (§5.5) says it is dropped once
the founder's family is in `families`, and the project memory notes guide Part B is still owed.

**Scenario:** the founder's whole family sits in the database unencrypted: members, trades, holdings and plan ticks.
Three things can read it:
- the `SUPABASE_DB_URL` secret, which is in GitHub Actions;
- anyone with dashboard or SQL access;
- the nightly `pg_dump --schema=public`, so every backup carries a plain copy inside the age layer.

The old row-level-security policy also still lets the founder's own session read and write it.

**Fix:** finish guide Part B now:
1. Confirm the family loads from `families`.
2. Run `select count(*) from public.family_data;`.
3. Run `drop table public.family_data;`.
4. Delete `schema.sql`.

Older backup artifacts that hold the plain table expire within 30 days. Delete them by hand if you want them gone
sooner.

### H2. The app shares the `devansh217.github.io` origin, and nothing stops it being framed

**Where:** `.github/workflows/pages.yml` (deploys to `https://devansh217.github.io/family-tax-harvesting/`),
`prototype/src/csp.ts:7-19`, `prototype/src/storage/device.ts:17-34`, `prototype/src/cloud.ts:26-31`.

**Evidence:** every GitHub Pages site of the account is served from the one origin `https://devansh217.github.io`.
Only this repo has Pages on today (checked with `gh`), but all ten of the account's repos are public. Turning on Pages
in any of them, or creating a `devansh217.github.io` repo, puts that site on the same origin.

**Scenario:** a page on that origin (a demo, a stale experiment, or a compromised dependency in another repo's build)
can do all of this:
- read `localStorage`, which holds the Supabase refresh token (`sb-iaesqhisslztykbglcck-auth-token`) and the
  encrypted browser copy;
- open IndexedDB `harvesting` and use the non-extractable device key to decrypt that copy;
- call the `family` function as the user, since CORS is no barrier from the allowed origin.

That is a full takeover of every family that used the app in that browser.

Separately, a `<meta>` CSP cannot carry `frame-ancestors`, and Pages sends no `X-Frame-Options`. Any site can frame
the app, for example to trick a signed-in user into "Delete account" or into switching season help on.

**Fix (free):** move hosting to Cloudflare Pages, Netlify or Vercel (all have free tiers). That gives the app its own
origin, and a `_headers` file can send real headers:
- `Content-Security-Policy` with `frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin`

After a move, people's browser copies stay on the old origin. Plan a "download backup, restore on the new address"
step, or keep the old site for a while showing only a notice. Until then, the cheap guard is a written rule: never
turn on Pages in another repo of this account. A frame guard in `main.tsx` (refuse to render when
`window.top !== window.self`) also blunts the clickjacking. It is left out here because the in-app preview panes may
frame the app; check that first.

### H3. Privacy copy says only the family can read its account copy; the server holds the keys

**Where:**
- `prototype/src/ui/screens/About.tsx:90`: "in your account if you sign in, where only you can read it".
- `prototype/index.html:7`: "your statements never leave this device".
- `prototype/supabase/functions/_shared/family.ts:51`, `envelope.ts:13-31`: families are sealed **on the server**
  with `FAMILY_KEYS`.

**Evidence:** syncing sends the whole decrypted family to the `family` function over TLS, and the function encrypts it
with a key held in the function secrets. That is encryption at rest with a server-held key, not encryption on the
device. Two parts of the server open it:
- the `admin` function, after logging a read (`_shared/admin.ts:44-48`);
- the `alerts` function, on season days for families that opted in (`_shared/alerts.ts`).

The Account page says this correctly ("If the app's maker ever opens it… you see when and why"). The About page and
the page description do not. The admin-read log is written by the same code that decrypts, so it is a policy control,
not a technical one. A redeployed function could skip it.

(The task brief for this review also described families as "encrypted on the device first". They are not.)

**Scenario:** a beta family, or later a regulator under the DPDP Act or SEBI's RIA rules, relies on "only you can read
it", and that is not true. For a product whose whole pitch is trust, this is the highest-impact wording issue.

**Fix:** change About:90 to say what Account:100 says:

> Encrypted before it is stored. The app's maker can open it only to fix a problem, and every look is shown to you;
> if you switch on season help, the server reads it on email days.

Change the meta description to "Statement files are read in your browser and never uploaded." If true end-to-end
encryption is wanted later, it means a passphrase-derived key on the device. That breaks admin support and server-side
season emails, so it is a product decision, not a patch.

---

## Medium

### M1. Dev toolchain advisories

**Where:** `prototype/package.json:28-37`, `prototype/package-lock.json` (vite 6.3.5, vitest 3.1.4, tinypool 1.1.1,
@vitest/mocker).

**Evidence:**
- `npm audit`: 4 advisories (2 critical, 1 high, 1 moderate).
- The worst: vitest UI-server arbitrary file read and execute (critical, fixed in 3.2.6); tinypool
  prototype-pollution RCE (critical); vite dev-server arbitrary file read over WebSocket (high, fixed in 6.4.2+), plus
  several Windows `server.fs.deny` bypasses.
- `npm audit --omit=dev`: **0**. The shipped bundle is clean.

**Scenario:** while `npm run dev` is running, a malicious page in the same browser, or anything on the network if the
server is ever started with `--host`, can read files off the founder's machine through the dev server, including
`data/private/` statements. The vitest issues need the UI server or crafted test input.

**Fix:** `npm audit fix` in `prototype/` (stays within the existing `^` ranges: vite 6.4.x, vitest 3.2.x), then
`npm test && npm run build`. It was not run on this branch because the parallel Playwright session is also changing
`package.json` and the lockfile; do it after that lands.

Other dependency notes:
- Runtime dependencies are pinned exactly (`@supabase/*` 2.118.0, `pdfjs-dist` 4.10.38, `read-excel-file` 9.3.14).
  React and the font packages float on `^`, and the lockfile holds them.
- pdfjs 4.10.38 is past the CVE-2024-4367 fix (4.2.67). Version 6.x exists; no known advisory affects 4.10.
- No abandoned packages.
- The edge functions import `npm:@supabase/supabase-js@2.118.0` exactly, with no Deno lockfile. Pinned is good, but
  integrity rests on npm.

### M2. Backup workflow: superuser DB URL as a repo-wide secret, recipient key read from the repo, unprotected `main`

**Where:** `.github/workflows/backup.yml:26-29`, `:39`, `:44-47`; repo settings.

**Evidence:**
- `SUPABASE_DB_URL` is a repository secret, not an environment secret, so any workflow on any branch can read it.
- `main` has no branch protection (`gh api …/branches/main/protection` returns 404).
- The age recipient is read from `prototype/backup-recipient.txt` in the checkout at run time.
- Artifacts of a public repo can be downloaded by any signed-in GitHub user.

**Scenarios:**
- *(a)* Anyone who gets push access can push a workflow on a side branch that prints or exfiltrates the DB URL.
  That includes a leaked token, a compromised IDE extension, or a merged PR from a future collaborator. That URL is
  full database access: every envelope, every email, and the plain `family_data` table (H1).
- *(b)* The same push can quietly swap `backup-recipient.txt`. Each nightly backup is then encrypted to the
  attacker's key and published as a downloadable artifact. Envelopes still need `FAMILY_KEYS`, but `users.csv` emails
  and H1's plain table do not.

**Fix (all free):**
1. Add branch protection on `main`: require a PR, block force pushes.
2. Move `SUPABASE_DB_URL` into an environment `backup`, limited to the `main` branch, and add `environment: backup`
   to the job.
3. Put the recipient in an Actions **variable** (or hard-code its fingerprint in the workflow) and fail the run if the
   file differs.
4. Have `pg_dump` connect as a dedicated read-only role, not `postgres`.
5. Under Settings → Actions, allow only GitHub-owned and verified actions.

Not changed here: `.github/workflows/` is being edited by the CI session.

### M3. The Pages build job holds the deploy token while it runs `npm ci` and third-party downloads

**Where:** `.github/workflows/pages.yml:9-12` (workflow-level `pages: write`, `id-token: write`), `:28`
(`npm ci`), `:33-38` (curl from NSE, BSE and AMFI, and from the live site).

**Scenario:** a compromised dev dependency's `postinstall` script runs in the `build` job, which can mint the Pages
OIDC token. It can deploy an arbitrary site to the app's origin, and through H2 that reaches every user's session and
browser copy.

**Fix:**
- Set `permissions: contents: read` at the workflow level, and grant `pages: write` and `id-token: write` only on the
  `deploy` job, which runs no third-party code.
- Consider `npm ci --ignore-scripts` (check that esbuild still resolves its binary).

The price files are parsed as data by `scripts/build-prices.ts` and rendered as text by React, so a spoofed price file
can give wrong numbers but cannot inject script.

### M4. Sign-out wipes the browser copy even when the last save failed

**Where:** `prototype/src/ui/syncPolicy.ts:38-41`, `prototype/src/ui/useCloud.ts:189-196`.

**Evidence:** `signOutPlan` clears the browser copy for every status except `not_invited`, including `error` (last
save failed), `saving` and `loading`. It then shows "it is safe in your account".

**Scenario:** the family edits offline, or the save hits a 500 or 409. They tap Sign out. Those changes are replaced
by the sample and are gone, and the message says they are safe.

**Fix:** clear only when `status === 'saved'`. Otherwise sign out locally and keep the family, with a message such as
"Your latest changes are not in your account yet; they are still in this browser." Add a `syncPolicy.test.ts` case.
Not done here: it changes sync behaviour, so it should get the founder's eye.

### M5. Admin two-factor: whoever enrols first wins, and enforcement is not yet tested end to end

**Where:** `prototype/supabase/functions/_shared/admin.ts:30-31`, `admin/index.ts:63-71`,
`prototype/src/ui/screens/Admin.tsx:50-66`.

**What is right:**
- The server requires `aal2` (read from a JWT that `auth.getUser` has just verified) and a row in `admins`.
- Every read is logged before decryption.
- Anonymous calls to `is_admin` are refused.

**Gaps:**
- *(a)* The first factor is Google. Until the founder has a **verified** TOTP factor, anyone who takes over the
  founder's Google account can enrol their own authenticator from the Admin screen and reach `aal2`.
- *(b)* PR #6's notes say admin 2FA was never exercised against the live project.

**Live check (22 Nov):** the one admin has **1 verified TOTP factor**, so gap (a) is closed. Gap (b) remains.

**Fix:**
1. ~~Enrol and verify TOTP on the live project now~~ (done). Delete any unverified factors.
2. Run the manual checks: list and read without 2FA return 403; with 2FA they work, and the read shows on that
   family's Account page.
3. Optionally, in `handleAdmin`, also require `amr` to include `totp` and the session to be younger than about
   12 hours.

### M6. A malformed backup restores, crashes the screens, and is saved over the family (fixed)

**Where:** `prototype/src/store.ts:117-125` (before), `prototype/src/ui/screens/Family.tsx:88-98`.

**Evidence:** `parseBackup` checked only `version === 1` and `members` being an array.
`{"version":1,"members":[{"id":"a","name":"x"}]}` loaded with `txns` undefined, and `hasRealData` then threw
`Cannot read properties of undefined (reading 'length')`. There is no error boundary. A restored family is saved to
the browser and, when signed in, to the account, so the crash came back on every load.

**Scenario:** someone is sent a "backup" file (social engineering, or a damaged file), restores it, and the app is
bricked in that browser and on the account until they clear site data. No script runs, because React escapes all
text, and `JSON.parse` with `__proto__` keys does not pollute prototypes here (spreads define own properties).

**Fixed:** `parseBackup` now checks the shape before anything is replaced:
- every list field is an array of objects;
- every map field is an object;
- every member has a text `id` and `name`.

Missing `txns` and `imports` default to empty. Tests are in `store.test.ts`.

**Still open:** add a top-level React error boundary with a "download your data / start over" screen, so any future
shape bug cannot brick the app.

### M7. The live project is one migration behind, and the season cron runs with nothing to call

**Where:** `prototype/supabase/migrations/20261215000400_season_alerts_invited.sql`,
`prototype/supabase/migrations/20261215000100_season_cron.sql:15`; live project.

**Evidence (live):**
- `list_migrations` stops at `20261215000300`. The invite-only view `20261215000400` (merged in PR #6) is **not
  applied**, so `season_alert_families` is still the older version that ignores `beta_invites`.
- `list_edge_functions` shows only `family` and `admin`. `alerts` is not deployed.
- The `season-alerts` cron job is **active** (daily at 05:30 UTC).
- `vault.secrets` is empty, so each run posts to a null URL and fails quietly.

**Scenario:** the day `alerts` is deployed with its Vault secrets but without `000400`, a family whose invite was
removed keeps getting season reads and emails, and cannot switch them off, because its saves are refused. That is the
exact bug PR #6 fixed. Until then, a failing cron job runs every day and fills the `cron.job_run_details` and `net`
logs.

**Fix:**
1. Apply `20261215000400` now, with `npx supabase@2 db push` from `prototype/`, and confirm `list_migrations` shows it.
2. Either deploy `alerts` and set the Vault secrets per `docs/guides/beta-setup.md`, or run
   `select cron.unschedule('season-alerts');` until the season work goes live.

The beta-setup guide's deploy order should say "migrations before functions".

---

## Low

### L1. `profiles`: `authenticated` keeps Supabase's default INSERT, DELETE and TRUNCATE grants

**Where:** `prototype/supabase/migrations/20261117000000_secure_storage.sql:74-75`.

The migration revokes everything from `anon` but only *adds* `select, update` for `authenticated`. Supabase's default
privileges on `public` already gave `authenticated` every privilege on new tables. Row-level security blocks
insert and delete (there are no policies for them), and PostgREST has no TRUNCATE. So this is not reachable today, but
it is one policy mistake from being reachable. The update policy also lets a user rewrite `created_at` and
`updated_at` on their own row.

**Live check:** confirmed. `authenticated` has
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` on `profiles`.

The Security Advisor also flags the trigger function `public.handle_new_user()` (`security definer`): it is
executable by `anon` and `authenticated` through `/rest/v1/rpc/handle_new_user`, from the default `PUBLIC` grant.
Postgres refuses to run a trigger function outside a trigger, so it can't be abused today, but it should not be on the
API surface. `touch_updated_at()` has the same grant; it is `security invoker`, so that is harmless.

**Fix (new migration, not applied):**

```sql
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
```

### L2. `season_alert_families` sits in the API-exposed `public` schema

**Where:** `prototype/supabase/migrations/20261215000400_season_alerts_invited.sql:5-13`.

The view joins `auth.users` (emails) to every opted-in envelope. It runs with its owner's rights (no
`security_invoker`). It is safe today, because the grants are revoked and an anonymous probe gets `42501`. But
Supabase's advisor flags this pattern ("auth.users exposed", "security definer view"), and a single
`grant select … to authenticated` would leak every beta email.

**Fix:** move the view to a non-exposed schema (`create schema private; create view private.season_alert_families …`)
and have the `alerts` function read it through an RPC or `.schema('private')`.

### L3. No rate limits on the functions; sign-ups are open

**Where:** `prototype/supabase/functions/*/index.ts`; live `auth/v1/settings` shows `disable_signup: false` with only
Google enabled.

Any Google account can sign up and call `family`. It gets 403 `not_invited`, but each call still counts against the
free tier's monthly function invocations. Invited users can `PUT` 5 MB as often as they like, against a 500 MB free
database. `families_envelope_size` (7 MB) caps one row, not the rate.

**Fix:**
- Keep sign-ups open, since the invite list is the gate, but add a per-user minimum interval on `PUT` (for example,
  refuse a second save within 2 seconds).
- Watch the usage page.
- Supabase Auth rate limits already cover sign-in.

### L4. Account delete needs only a current access token

**Where:** `prototype/supabase/functions/_shared/family.ts:55-58`.

A stolen access token, which lasts up to an hour, deletes the account and its family. The only copy left is in
backups, for 30 days.

**Fix:** for `DELETE`, require a recent sign-in. Check the token's `iat` against the session's `auth_time`, or
re-prompt Google first.

### L5. The browser-copy key sits next to the ciphertext; session tokens are in `localStorage`

**Where:** `prototype/src/storage/device.ts:30-34, 85-95`; `cloud.ts:26-31`.

The AES-GCM handling is sound: a fresh random 96-bit IV per save, fixed AAD, and a non-extractable key. But the key is
in IndexedDB on the same origin. This stops someone browsing the profile folder from reading the family. It does not
stop any script on the origin (see H2) or malware with the browser profile. The Supabase session, including the
refresh token, is in `localStorage`, which is the supabase-js default. The CSP (`script-src 'self'`, no
`unsafe-eval`) is the real defence, and no code uses `dangerouslySetInnerHTML`, `innerHTML` or `eval`.

**Fix:** none needed. Describe it as "stored scrambled in this browser" rather than implying strong protection.

### L6. "Download backup" writes the whole family as plain JSON

**Where:** `prototype/src/ui/screens/Family.tsx:79-86`.

The file sits in Downloads, synced folders and email attachments with every holding and trade.

**Fix:** offer an optional passphrase. Use PBKDF2-SHA-256 with at least 600k iterations, or Argon2 via WebCrypto,
then AES-GCM. Keep plain JSON as a clearly labelled option.

### L7. Season emails carry rupee figures through a third-party provider

**Where:** `prototype/supabase/functions/_shared/seasonEmail.ts:58-90`, `_shared/email.ts:5-9`.

Each email states the family's remaining tax-free room in rupees, moves waiting and chosen dates. It goes through
Brevo and lands in an inbox. The consent text exists, but the privacy page should name Brevo as a processor (DPDP)
and say what figures an email contains.

**Fix:** name the processor. Or drop the rupee figure and say "you have room left; open Harvesting".

### L8. CSV export: formula guard gaps (fixed)

**Where:** `prototype/src/ui/csv.ts:20, 30`.

`textCell` caught `= + - @` but not a leading tab or carriage return, which Excel and Sheets also treat as a formula
start (OWASP's list). It was also not applied to the ISIN or sale-date columns, which come from imported files.
A crafted statement with an ISIN like `=HYPERLINK(…)` would have run when the CA opened the schedule.

**Fixed:** the guard now covers `\t` and `\r` and wraps the ISIN and date columns. The test is in
`cgSchedule.test.ts`.

### L9. pdf.js eval left on; no size cap on imported files (partly fixed)

**Where:** `prototype/src/parsers/pdfText.ts:21`, `prototype/src/ui/readers.ts:14-35`.

pdf.js defaults `isEvalSupported: true`, which is the code path behind CVE-2024-4367. The CSP already blocks `eval`
and 4.10.38 is patched, so this is defence in depth. **Fixed:** `isEvalSupported: false`.

**Still open:**
- No file-size cap. A huge PDF, or a zip-bomb `.xlsx` (read-excel-file unzips in memory), freezes the tab. Refuse
  files over about 25 MB before reading.
- `read-excel-file` 9.3.14 has a newer 9.3.20.

### L10. Secret guard and `.gitignore` gaps (fixed)

**Where:** `prototype/src/secrets.test.ts`, `.gitignore`.

The history sweep was clean:
- no Supabase secret keys, service-role JWTs, age secret keys, GitHub, Brevo or AWS tokens;
- no `.env` file, statement or spreadsheet ever committed;
- the only PAN-shaped string is the test value `ABCDE1234F`;
- the only emails are test fixtures;
- `backup-recipient.txt` holds the age **public** key, which is meant to be public;
- `sb_publishable_…` is public by design.

But the guard test looked only for Supabase keys. And `npm run check:private` is a parser diagnostic for files in
`data/private/`: it does not check what is committed. The `.gitignore` left out `*.xlsx` outside `data/private/`
(the real Zerodha files are `.xlsx`), app backups, age and dump files, and `.idea/`, which is untracked in the main
checkout right now.

**Fixed:**
- The guard now also flags age private keys, database URLs with a password, Brevo keys, GitHub tokens and PEM private
  keys.
- A new test fails if any `.csv`, `.pdf`, `.xls(x)`, `.age`, `.dump`, `data/private/…` or `harvesting-backup-*.json`
  file is tracked.
- `.gitignore` now covers those, plus `.env.*`, `.idea/` and `.vscode/`.

### L11. Workflow hygiene and production CORS

**Where:** `.github/workflows/*.yml`; repo Actions settings; `prototype/supabase/functions/_shared/http.ts:4`.

**Workflows:**
- Actions are referenced by tag (`actions/checkout@v4` and similar), all first-party.
- `allowed_actions: all` and `sha_pinning_required: false`.
- No `pull_request_target`, no `${{ github.event.* }}` interpolated into `run:` steps, and default workflow
  permissions are `read`. Those are all good.
- The Postgres apt key is fetched over HTTPS without a fingerprint check.

**Fix:** pin actions by SHA (Dependabot can keep them current, free), restrict allowed actions, and check the apt key
fingerprint.

**CORS:** `ALLOWED_ORIGINS` includes `http://localhost:5199` in production. That is harmless, because calls need a
bearer token, but env-gate it.

**Reminder for the CI session:** any new workflow should keep `permissions: contents: read` and no
`pull_request_target`.

### L12. Personal email address in public commit history

All 123 commits carry the founder's personal Gmail address in a public repo (115 with a typo'd domain). That is
harvestable for phishing aimed at the account that owns the admin role.

**Fix:** set `user.email` to the GitHub `…@users.noreply.github.com` address and turn on "Block command line pushes
that expose my email". Rewriting history is possible but disruptive, and not recommended.

### L13. Root `index.html` (v0.1), info only

**Where:** `index.html:8-9, 153`.

It loads Google Fonts CSS and an inline script with no CSP, and Google Fonts CSS cannot carry SRI. It is **no longer
deployed**: `pages.yml` publishes only `prototype/dist`. Delete it, or move it under `docs/archive/`, so it is never
served from the app's origin again.

---

## Checked and fine

**Row-level security:**
- RLS is on for all seven tables (`profiles`, `families`, `admin_reads`, `admins`, `beta_invites`, `season_log`,
  `season_stats`).
- The only policies are "read own" on `profiles`, `admin_reads` and `season_log`, plus "update own" on `profiles`.
- Anonymous `GET`s on every table and the view return `42501`.

**Functions:**
- `handle_new_user` and `is_admin` are `security definer` with `search_path = ''`.
- `touch_updated_at` is invoker, with a fixed `search_path`.
- No `security definer` function lacks a fixed search path.

**Storage and edge functions:**
- No storage buckets are used.
- `family` and `admin` verify the token with `auth.getUser`, take the user id only from it, and check the invite with
  the **confirmed** email.
- `alerts` is `--no-verify-jwt` but needs `x-alerts-secret`, compared in constant time.
- Errors log codes, not data.

**Envelope crypto:**
- AES-256-GCM, a random 96-bit IV per seal, and a key id for rotation.
- The AAD binds `user_id|version`, so copying an envelope to another row or version fails.
- Optimistic versioning stops lost updates.

**Web app:**
- No HTML sinks.
- Hash routes map only to internal screens, so there are no open redirects.
- OAuth uses PKCE.
- `returnUrl` is built from `location.origin`, with no user-supplied redirect.
- The CSP on the live page is `default-src 'self'`, `script-src 'self'`, `connect-src` limited to the project,
  `object-src 'none'` and `base-uri 'self'`.
- HSTS is on (GitHub Pages).

**Loose ends:**
- No TODO, FIXME or HACK markers, no `debugger`, and no debug flags in the app.
- `SHOW_EMAIL_SIGNIN = false` is a deliberate beta switch.
- No test credentials.
- The admin routes (`list`, `read`, `invites`, `season`) are all live and all gated.

## Live project check (22 Nov 2026)

| Check | Result |
|---|---|
| Tables (public) | 8, all with RLS on: `profiles` (2 rows), `family_data` (**1**), `families` (2), `admin_reads` (2), `admins` (1), `beta_invites` (1), `season_log` (0), `season_stats` (0) |
| Advisor: RLS enabled, no policy (INFO) | `admins`, `beta_invites`, `families`, `season_stats`. Intended: server-only tables, no grants |
| Advisor: SECURITY DEFINER executable (WARN) | `handle_new_user` (anon, authenticated) → L1; `is_admin` (authenticated). Intended: returns only "am I an admin" |
| Advisor: extension in public (WARN) | `pg_net` is in `public`. Low: move it to `extensions` when convenient (needs the cron job recreated) |
| Advisor: leaked password protection off (WARN) | Not applicable: email/password sign-in is off (Google only), and the check is a paid-plan feature |
| Performance advisor | No findings |
| Migrations | Up to `20261215000300`; **`000400` missing** → M7 |
| Edge functions | `family` v3, `admin` v3, both `verify_jwt: true`; deployed source matches `main`. `alerts` not deployed → M7 |
| Cron / Vault | `season-alerts` active daily; Vault has no secrets → M7 |
| Admin 2FA | 1 verified TOTP factor for the 1 admin → M5(a) closed |
| Storage | No buckets |
| Grants | `anon` has no table grants. `authenticated`: `admin_reads` and `season_log` SELECT; `profiles` and `family_data` all → L1, H1 |

## Fixes made on this branch

All are covered by tests. `npm test` passes (392 tests), and so does `tsc --noEmit`.

1. `prototype/src/store.ts`: `parseBackup` checks the backup's shape before restoring (M6).
2. `prototype/src/ui/csv.ts`: the formula guard covers a leading tab or CR, and the ISIN and date columns (L8).
3. `prototype/src/parsers/pdfText.ts`: `isEvalSupported: false` (L9).
4. `prototype/src/secrets.test.ts`: more secret patterns, and a "no data files tracked" test (L10).
5. `.gitignore`: spreadsheets, backups, `.env.*` and editor folders (L10).

## Founder to-do, in order

1. **H1:** drop `family_data` (5 minutes, SQL editor).
2. **M7:** apply migration `000400`, and unschedule `season-alerts` until `alerts` is deployed.
3. **M5:** run the 2FA checks (TOTP is already enrolled).
4. **M2:** turn on branch protection for `main`, and move `SUPABASE_DB_URL` into a `backup` environment.
5. **H3:** fix the About and meta wording (a small copy change; can ride on PR #7).
6. **M1:** run `npm audit fix` once the Playwright PR has merged.
7. **M3:** move the Pages permissions onto the deploy job (coordinate with the CI session).
8. **H2:** decide on hosting (Cloudflare Pages free tier) before inviting more beta families.
9. **M4**, then the L items, as time allows.
