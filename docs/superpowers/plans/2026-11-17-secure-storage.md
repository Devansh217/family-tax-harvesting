# Secure Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every family on the server is encrypted with a key the database doesn't hold, reached only through server functions that log admin reads; backups run nightly and encrypted; the browser copy is encrypted; the app moves to a new Mumbai project, all on free tiers.

**Architecture:** Two Supabase Edge Functions (`family`, `admin`) hold all family access. Their logic lives in pure TypeScript under `prototype/supabase/functions/_shared/` with injected database and auth dependencies, so Vitest tests it without Deno or a database; the Deno entry files only wire Supabase clients and secrets. The app swaps `familyStore` to call the functions (the `FamilyStore` interface from the foundation stays), encrypts its `localStorage` copy with a non-extractable WebCrypto key, and gains an admin screen. A GitHub Actions job backs up nightly with `age`.

**Tech Stack:** TypeScript 5.8, React 18, Vite 6, Vitest 3, Node 22 WebCrypto; Supabase Edge Functions (Deno), `npm:@supabase/supabase-js@2.118.0` in functions; Supabase CLI via `npx supabase@2`; `age` (apt on the runner) and `age-encryption` (npm, dev) for backups. Run app checks from `prototype/`: `npm test`, `npm run typecheck`, `npm run build`.

**Spec:** `docs/superpowers/specs/2026-11-17-secure-storage-design.md` (read it first). Architecture: `docs/superpowers/specs/2026-11-16-architecture-design.md`.

## Global Constraints

- Free tiers only: Supabase Free (no paid add-ons), GitHub Actions on the public repo. Nothing that needs a paid plan.
- The whole `AppState` is encrypted on the server and in the browser; only `user_id`, `version` and `updated_at` are plain in `families`.
- Envelope: `{ "v": 1, "kid": string, "iv": base64 (12 bytes), "ct": base64 }`, AES-256-GCM, fresh random IV per save, additional authenticated data `${userId}|${version}` on the server and `device` in the browser.
- Keys: function secrets `FAMILY_KEYS` (JSON `{ [kid]: base64 32-byte key }`) and `FAMILY_KEY_CURRENT`; `SUPABASE_SERVICE_ROLE_KEY` only in function secrets. No secret key in any tracked file.
- `families` has RLS on, no policies, and all privileges revoked from `anon` and `authenticated`.
- Every admin read writes its `admin_reads` row **before** any decryption; no row, no data. Admin calls need JWT `aal: "aal2"` and a row in `admins`.
- Family save bodies over 5 MB are rejected (413).
- Statements, PDF passwords, full PAN and portal logins never reach the server (unchanged).
- Beta sign-in is Google only; email and password forms are hidden behind `SHOW_EMAIL_SIGNIN = false`, not deleted.
- UI copy: plain English, short sentences, Indian number format.
- Every existing test keeps passing.

## Review Focus

1. **A save from a second device after the first** (stale `knownVersion`) must return `409` and leave the stored row unchanged, and the app must load the newer copy rather than overwrite it. Test in Task 3.
2. **A family envelope copied to another user's row or version** must fail to decrypt, never return someone else's data. Test in Task 2.
3. **The browser copy can't be decrypted** (site data cleared, another profile): the app starts empty without a crash, and a signed-in user gets the account copy, never the sample family over it. Test in Task 6.
4. **The founder views a family read-only:** no edit can save into his own account, and leaving the view restores his own family untouched. Test in Task 7.
5. **The admin function is called without two-factor, without a reason, by a non-admin, or with an unknown family id:** 403 / 400 / 403 / 404, and no data returned. Test in Task 4.

---

### Task 1: Tooling, shared-code compile and a secret scan

**Files:**
- Modify: `prototype/tsconfig.json` (include `supabase/functions/_shared`, `"allowImportingTsExtensions": true`), `prototype/vite.config.ts` (test include adds `supabase/functions/_shared/**/*.test.ts`), `prototype/package.json` (devDependency `age-encryption`; scripts `supabase` = `npx supabase@2`)
- Create: `prototype/supabase/config.toml` (from `npx supabase@2 init`, `project_id` placeholder `family-tax-harvesting`), `prototype/src/secrets.test.ts`
- Modify: `prototype/src/boundaries.test.ts`

**Interfaces:** Produces the folder `prototype/supabase/functions/_shared/` compiled by `tsc` and tested by Vitest. Files there import each other with explicit `.ts` extensions (Deno needs them) and use only Web APIs (`crypto.subtle`, `TextEncoder`, `atob`/`btoa`), no Deno or Node globals.

- [ ] **Step 1: Write the failing tests.** `secrets.test.ts`: list tracked files with `git ls-files` (run from the repo root), skip `node_modules`, `*.lock`, images; fail if any matches `/sb_secret_[A-Za-z0-9_-]{10,}/` or a JWT whose payload decodes to `"role":"service_role"`. In `boundaries.test.ts` add: no file outside `src/storage/` contains `functions.invoke(`; nothing under `supabase/functions/_shared/` mentions `Deno.` or `process.`.
- [ ] **Step 2:** `npm test` → the secret test passes on today's repo (it's a guard); add a temporary tracked fixture line `sb_secret_aaaaaaaaaaaaaaa` in a test-only file, confirm it FAILS, remove it.
- [ ] **Step 3:** Make the config changes; `npx supabase@2 init` inside `prototype/` (accept defaults, no VS Code settings).
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Tooling for server functions; secret scan"`

### Task 2: The envelope

**Files:**
- Create: `prototype/supabase/functions/_shared/envelope.ts`, `prototype/supabase/functions/_shared/envelope.test.ts`

**Interfaces:**
- Produces:
  - `interface Envelope { v: 1; kid: string; iv: string; ct: string }`
  - `type KeyRing = { current: string; keys: Record<string, CryptoKey> }`
  - `importKeyRing(keysJson: string, current: string): Promise<KeyRing>` (base64 32-byte raw keys → AES-GCM `CryptoKey`s, non-extractable; throws `Error('FAMILY_KEY_CURRENT not in FAMILY_KEYS')` when missing)
  - `sealJson(value: unknown, ring: KeyRing, aad: string): Promise<Envelope>` (always the current key)
  - `openJson<T>(env: Envelope, ring: KeyRing, aad: string): Promise<T>` (uses `env.kid`; throws `Error('unknown key ' + kid)` or the WebCrypto error on tampering)
  - `familyAad(userId: string, version: number): string` = `` `${userId}|${version}` ``

- [ ] **Step 1: Write the failing tests:** seal then open returns the same object; two seals of the same value give different `iv` and `ct`; changing one character of `ct` throws; opening with `familyAad('u2', 1)` an envelope sealed for `('u1', 1)` throws, and for `('u1', 2)` throws (Review Focus #2); a ring with keys `k1`, `k2` and current `k2` opens a `k1` envelope and seals new ones with `kid: 'k2'`; `importKeyRing` with a current id not in the map throws. Generate test keys with `crypto.getRandomValues(new Uint8Array(32))`.
- [ ] **Step 2:** `npm test -- envelope` → FAIL (module missing).
- [ ] **Step 3:** Implement with `crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData })`; base64 helpers in the same file.
- [ ] **Step 4:** `npm test -- envelope` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Encrypted family envelope"`

### Task 3: Schema and the `family` function

**Files:**
- Create: `prototype/supabase/migrations/20261117000000_secure_storage.sql`, `prototype/supabase/functions/_shared/family.ts`, `prototype/supabase/functions/_shared/family.test.ts`, `prototype/supabase/functions/family/index.ts`
- Modify: `prototype/supabase/schema.sql` (header comment: superseded by `migrations/`; kept for the old project only)

**Interfaces:**
- Consumes: `sealJson`, `openJson`, `familyAad`, `KeyRing` (Task 2).
- Produces:
  - SQL: `public.profiles` and its trigger exactly as in today's `schema.sql`; `public.families (user_id uuid pk references auth.users on delete cascade, version int not null, envelope jsonb not null, updated_at timestamptz default now())` with RLS on, no policies, `revoke all … from anon, authenticated`; `public.admin_reads (id bigint identity pk, family_user_id uuid not null, admin_user_id uuid not null, reason text not null check (char_length(reason) between 3 and 300), at timestamptz default now())` with RLS on and one policy `for select to authenticated using (family_user_id = (select auth.uid()))`, `grant select` to `authenticated`; `public.admins (user_id uuid pk references auth.users)` with RLS on, no policies, revoked from `anon`/`authenticated`; `public.is_admin()` returns `exists (select 1 from public.admins where user_id = auth.uid())`, `security definer`, `set search_path = ''`, granted to `authenticated` (for the app to show the admin tab).
  - `interface FamilyDb { get(userId): Promise<{ version: number; envelope: Envelope } | null>; insert(userId, envelope): Promise<boolean /* false on duplicate */>; updateIf(userId, knownVersion, newVersion, envelope): Promise<boolean /* false if version moved */>; removeAll(userId): Promise<void> /* family, admin_reads rows, profile, auth user */ }`
  - `handleFamily(req: { method: string; userId: string; body?: string }, deps: { db: FamilyDb; ring: KeyRing }): Promise<{ status: number; json?: unknown }>`
    - `GET` → `200 { state, version }` or `200 null`.
    - `PUT` with body `{ state, knownVersion }` → `200 { version }` or `409 { conflict: true }`; `413` when `body.length > 5 * 1024 * 1024`; `400` when `state` is not an object with `version === 1`. New version = `knownVersion + 1` (`1` on insert); the envelope's AAD uses the new version.
    - `DELETE` → `204` after `db.removeAll`.
  - `family/index.ts`: reads `Authorization`, gets the user with `supabase.auth.getUser(token)` (401 if none), builds `FamilyDb` with a service-role client (`updateIf` is `update … where user_id = $1 and version = $2 returning version`; `removeAll` deletes rows then `auth.admin.deleteUser`), imports the ring from `Deno.env` once per cold start, answers CORS for the Pages origin and `http://localhost:5199`.

- [ ] **Step 1: Write the failing tests** with an in-memory `FamilyDb`: GET with nothing saved → `null`; PUT `knownVersion: null` → `{ version: 1 }` and the stored envelope opens to the state; PUT with `knownVersion: 1` → `{ version: 2 }`; a second PUT with stale `knownVersion: 1` → `409` and the stored version stays `2` (Review Focus #1); body over 5 MB → `413`; `state: { version: 2 }` → `400`; DELETE → `204` and GET → `null`.
- [ ] **Step 2:** `npm test -- family` → FAIL.
- [ ] **Step 3:** Implement `handleFamily`, the migration and `family/index.ts`.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Families table and the family function"`

### Task 4: The `admin` function (list and logged read)

**Files:**
- Create: `prototype/supabase/functions/_shared/admin.ts`, `prototype/supabase/functions/_shared/admin.test.ts`, `prototype/supabase/functions/admin/index.ts`

**Interfaces:**
- Consumes: `openJson`, `familyAad`, `KeyRing` (Task 2); `FamilyDb.get` (Task 3).
- Produces:
  - `interface AdminDb { isAdmin(userId): Promise<boolean>; list(): Promise<Array<{ userId: string; email: string; version: number; updatedAt: string }>>; logRead(row: { familyUserId: string; adminUserId: string; reason: string }): Promise<void>; family: Pick<FamilyDb, 'get'> }`
  - `handleAdmin(req: { method: string; path: 'list' | 'read'; userId: string; aal: string; body?: string }, deps: { db: AdminDb; ring: KeyRing }): Promise<{ status: number; json?: unknown }>`
    - Not `aal2` → `403 { error: 'two_factor_required' }`; not admin → `403 { error: 'not_admin' }`.
    - `list` → `200 [...]` (metadata only, not logged).
    - `read` with body `{ familyUserId, reason }`: reason shorter than 3 characters after trim → `400`; no family → `404`; else `logRead` **then** `openJson` → `200 { state, version }`.
  - `admin/index.ts`: route from the URL's last segment; `aal` from the verified JWT's payload; `list` joins `families` with `auth.admin.listUsers()` for emails.

- [ ] **Step 1: Write the failing tests:** `aal1` → 403 two_factor_required; non-admin `aal2` → 403 not_admin; reason `'  '` → 400; unknown family → 404; good read → 200 and exactly one log row with the reason; a read whose decryption fails (ring without the envelope's key) still leaves the log row and returns 500 (Review Focus #5 and the spec's "log first" rule); `list` returns no `envelope` or `state` field.
- [ ] **Step 2:** `npm test -- admin` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Admin list and logged admin read"`

### Task 5: The app talks to the functions; Account page

**Files:**
- Create: `prototype/src/storage/functions.ts`, `prototype/src/storage/functions.test.ts`
- Modify: `prototype/src/storage/index.ts` (`familyStore = functionsFamilyStore`; add `listMyAdminReads`, `deleteAccount`), `prototype/src/storage/supabase.ts` (remove `supabaseFamilyStore`), `prototype/src/ui/screens/Account.tsx`, `prototype/src/cloud.ts` (`export const SHOW_EMAIL_SIGNIN = false`)

**Interfaces:**
- Produces:
  - `functionsFamilyStore: FamilyStore` built on `makeFunctionsStore(invoke: (name: string, opts: { method: 'GET' | 'PUT' | 'DELETE'; body?: unknown }) => Promise<{ data: unknown; error: { status?: number; message: string } | null }>): FamilyStore` — `save` maps a `409` to `'conflict'`; other errors throw `friendly(message)`.
  - `listMyAdminReads(): Promise<Array<{ at: string; reason: string }>>` (direct select on `admin_reads`, RLS limits to own rows).
  - `deleteAccount(): Promise<void>` (`family` DELETE, then `signOut`).
  - Account page: Google button only while `SHOW_EMAIL_SIGNIN` is false; section "Who has looked at your data" (date and reason, or "Nobody has opened your family"); "Delete my account and data" with a confirm step replaces today's "delete saved family".
  - Children's consent (spec 5.3): in `src/ui/screens/memberFields.tsx`, for a member under 18 the consent tick reads "I'm their parent or guardian and agree to their data being included" and stores the same `consent` field; the tick is shown for minors too (today only adults other than the manager). Modify `memberFields.tsx` and add `isMinor(m, asOf)` beside `isAdult`.

- [ ] **Step 1: Write the failing tests** in `functions.test.ts` with a fake `invoke`: load returns `{ state, version }`; save sends `{ state, knownVersion }` with method PUT and returns the new version; a `409` gives `'conflict'`; a 500 throws.
- [ ] **Step 2:** `npm test -- storage` → FAIL.
- [ ] **Step 3:** Implement; `invoke` wraps `supabase.functions.invoke`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Save families through the family function"`

### Task 6: Encrypted browser copy

**Files:**
- Create: `prototype/src/storage/device.ts`, `prototype/src/storage/device.test.ts`
- Modify: `prototype/src/store.ts` (`loadState` / `saveState` move to `device.ts` as async), `prototype/src/ui/App.tsx` (async first load with an "Opening your family…" state), `prototype/package.json` (devDependency `fake-indexeddb` for tests)

**Interfaces:**
- Produces:
  - `interface KeyStore { get(): Promise<CryptoKey | null>; put(k: CryptoKey): Promise<void> }`; `indexedDbKeyStore: KeyStore` (database `harvesting`, store `keys`, key `device`).
  - `loadLocal(ks?: KeyStore): Promise<{ state: AppState | null; status: 'ok' | 'empty' | 'unreadable' }>`: reads `localStorage['fasal-prototype-v1']`; plain JSON (old copy) → `normalizeState`, re-saves encrypted, returns `ok`; envelope → decrypts with AAD `device`; no key or decrypt failure → `{ state: null, status: 'unreadable' }`.
  - `saveLocal(s: AppState, ks?: KeyStore): Promise<boolean>`: creates the key on first use (`generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt'])`), writes an envelope, `false` when storage is blocked.
  - App: until `loadLocal` resolves, render only the top bar and "Opening your family…". `unreadable` or `empty` → sample family when signed out; when a session exists, an empty state (not the sample) until the account copy loads (Review Focus #3).

- [ ] **Step 1: Write the failing tests** (Vitest with `fake-indexeddb/auto` and a stubbed `localStorage`): a plain old copy is migrated (the stored value parses as an envelope, `loadLocal` again returns the same family); save then load round-trips; a fresh `KeyStore` (key lost) gives `unreadable` without throwing; corrupted `ct` gives `unreadable`.
- [ ] **Step 2:** `npm test -- device` → FAIL.
- [ ] **Step 3:** Implement; reuse the base64 helpers by importing `../../supabase/functions/_shared/envelope.ts`'s pure helpers (export `toB64`, `fromB64`), or duplicate them in `device.ts` if the import breaks the boundary test (record the choice).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → pass; in the running app (`fasal-prototype`, port 5199) the stored value in `localStorage` is an envelope, and the family loads after a reload.
- [ ] **Step 5:** Commit: `git commit -am "Encrypt the family saved in the browser"`

### Task 7: Admin screen

**Files:**
- Create: `prototype/src/ui/screens/Admin.tsx`, `prototype/src/storage/admin.ts`, `prototype/src/ui/viewing.test.ts`
- Modify: `prototype/src/ui/App.tsx` (route `admin`, tab shown only when `is_admin()` is true; read-only viewing), `prototype/src/ui/app-context.ts` (`viewing: { name: string } | null`)

**Interfaces:**
- Produces:
  - `src/storage/admin.ts`: `isAdmin(): Promise<boolean>` (rpc `is_admin`), `adminList()`, `adminRead(familyUserId: string, reason: string): Promise<AppState>` (calls `admin`, then `normalizeState`), `mfaStatus(): Promise<'none' | 'enrolled' | 'verified'>`, `mfaEnroll(): Promise<{ qr: string; factorId: string }>`, `mfaVerify(factorId: string, code: string): Promise<void>` (challenge + verify; afterwards the session is `aal2`).
  - Admin screen: (1) two-factor: enrol with a QR code, or enter a 6-digit code to step up; (2) family list (email, last updated); (3) "Open" asks for a reason, then shows that family read-only.
  - `viewedContext(base: Ctx, viewed: AppState, name: string): Ctx` in `App.tsx` (exported for the test): `state` and `fam` from the viewed family, `update` is a no-op that toasts "Read-only: you are viewing another family", `viewing: { name }`. `useCloud` keeps receiving the founder's own state, so nothing viewed is ever saved. A banner "Viewing <email>'s family, read-only · Close" sits above every screen while viewing.

- [ ] **Step 1: Write the failing test** `viewing.test.ts`: `viewedContext(...).update(fn)` leaves both the viewed state and the base state unchanged and calls `toast`; `viewing.name` is set (Review Focus #4).
- [ ] **Step 2:** `npm test -- viewing` → FAIL.
- [ ] **Step 3:** Implement the screen and context.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Admin screen with two-factor and read-only viewing"`

### Task 8: Content Security Policy, self-hosted fonts, v0.1 off the site

**Files:**
- Create: `prototype/public/fonts/` (Bricolage Grotesque 600, 700; Hanken Grotesk 400, 500, 600, 700; latin `woff2`, from the Google Fonts download or `@fontsource`), `prototype/src/fonts.css`
- Modify: `prototype/index.html` (remove the Google Fonts links; add the CSP `<meta>`), `prototype/src/main.tsx` (import `fonts.css`), `.github/workflows/pages.yml` (stop copying `../index.html` to `_site/v0.1/`)

**Interfaces:** CSP value: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://<NEW_PROJECT_REF>.supabase.co; frame-src 'none'; base-uri 'self'; form-action 'self'` (`'unsafe-inline'` for styles because React sets `style` attributes; replace `<NEW_PROJECT_REF>` in Task 10).

- [ ] **Step 1:** Add to `boundaries.test.ts`: `index.html` contains a `Content-Security-Policy` meta and no `fonts.googleapis.com` or `fonts.gstatic.com`. Run → FAIL.
- [ ] **Step 2:** Make the changes.
- [ ] **Step 3:** `npm test && npm run build`; open the built site with `npm run preview` and the dev server: no CSP violations in the console, fonts render.
- [ ] **Step 4:** Commit: `git commit -am "Content Security Policy and self-hosted fonts; retire /v0.1/"`

### Task 9: Nightly encrypted backup and the restore test

**Files:**
- Create: `.github/workflows/backup.yml`, `prototype/scripts/restore-test.ts`, `prototype/backup-recipient.txt` (the founder's `age` public key, added in Task 10)
- Modify: `prototype/package.json` (script `restore-test` = `vite-node scripts/restore-test.ts`)

**Interfaces:**
- `backup.yml`: `schedule: cron '30 21 * * *'` (03:00 IST) and `workflow_dispatch`; `ubuntu-latest`; `sudo apt-get install -y postgresql-client age`; `pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -Fc -f public.dump`; `psql "$SUPABASE_DB_URL" -c "\copy (select id, email from auth.users) to users.csv csv header"`; `tar czf backup.tgz public.dump users.csv`; `age -r "$(cat prototype/backup-recipient.txt)" -o backup-$(date -u +%F).tgz.age backup.tgz`; `actions/upload-artifact@v4` with `retention-days: 30`; the job never prints the dump. Secret: `SUPABASE_DB_URL` (session pooler, IPv4). The run counts as project activity, so the free project doesn't pause.
- `restore-test.ts` (run on the founder's machine; needs `gh`, `pg_restore`/`psql`): asks for the `age` private key and `FAMILY_KEYS` JSON from stdin (never from flags or files in the repo); downloads the latest `backup` artifact with `gh run download`; decrypts with `age-encryption`; restores `public.dump` into schema `restore_test` of the project at `SUPABASE_DB_URL` (env); checks the `families` row count equals today's and that one envelope opens with `openJson` (Task 2) and `familyAad`; drops `restore_test`; prints `RESTORE TEST PASSED <date> families=<n>` or the failing check.

- [ ] **Step 1:** Write `restore-test.ts` with its checks as a pure function `checkRestore(restoredCount: number, liveCount: number, opened: boolean): { ok: boolean; message: string }` and a test for it (counts differ → not ok; envelope not opened → not ok). Run → FAIL, implement, pass.
- [ ] **Step 2:** Write `backup.yml`; validate with `npx --yes @action-validator/cli .github/workflows/backup.yml` (or `actionlint` if available).
- [ ] **Step 3:** Commit: `git commit -am "Nightly encrypted backup and restore test"`

### Task 10: The founder's setup guide and the switch to the new project

**Files:**
- Create: `docs/guides/secure-storage-setup.md`
- Modify: `prototype/src/cloud.ts` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` of the new project), `prototype/index.html` (CSP `connect-src` project ref), `prototype/backup-recipient.txt`, `docs/PLANNER-NOTES.md` (security to-do ticked per the spec's section 6)

**Guide steps (the founder does each; Claude never types a password, key or code):**
1. Create a Free-plan project in **Mumbai (ap-south-1)**; note its ref, URL and publishable key.
2. Google sign-in: add the new callback `https://<ref>.supabase.co/auth/v1/callback` to the Google OAuth client; enable Google in Authentication → Providers; set Site URL and redirect URLs to the Pages URL and `http://localhost:5199`.
3. Generate keys on his machine: `openssl rand -base64 32` (family key `k1`) and `age-keygen` (backup key); save both in his password manager; paste the `age` public key into `prototype/backup-recipient.txt`.
4. `npx supabase@2 login`, `npx supabase@2 link --project-ref <ref>`, `npx supabase@2 db push`, `npx supabase@2 secrets set FAMILY_KEYS='{"k1":"…"}' FAMILY_KEY_CURRENT=k1`, `npx supabase@2 functions deploy family admin`.
5. Add the GitHub Actions secret `SUPABASE_DB_URL` (session pooler string); run the backup workflow once by hand.
6. Give Claude the project URL and publishable key (both public) for `cloud.ts` and the CSP; merge and deploy.
7. Sign in on the live site with Google; when asked, keep this browser's family; check it loads after a reload.
8. Insert his user id into `admins` (SQL editor: `insert into public.admins values ('<his id>')`), open `#admin`, enrol the authenticator app.
9. Run `npm run restore-test` once; note the result line in `docs/PLANNER-NOTES.md`.
10. On the old project: run `select count(*) from public.family_data` (expect 1), then delete the project.
11. Confirm the list of other GitHub Pages sites on the account (Settings → Pages on each repo) are his own.

- [ ] **Step 1:** Write the guide (each step: where to click or what to run, and how to tell it worked).
- [ ] **Step 2:** After the founder completes steps 1–5, update `cloud.ts`, the CSP and `backup-recipient.txt`; `npm test && npm run build`.
- [ ] **Step 3:** Commit: `git commit -am "Point the app at the new Mumbai project; setup guide"`

### Task 11: Whole-branch check

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` → all pass; `npm run check:private` → no private files.
- [ ] **Step 2:** Against the deployed project, with the publishable key only (no session): `select` on `families` and `admins` returns an error or no rows; calling `family` without a token → 401. Record the commands and outputs in the PR.
- [ ] **Step 3:** In the running app signed in as the founder: save, reload, version moves; `#admin` without two-factor shows the enrol/step-up panel; after stepping up, opening his own family with a reason adds a row he then sees on the Account page.
- [ ] **Step 4:** Update `docs/superpowers/specs/2026-11-17-secure-storage-design.md` with a status section (as the foundation spec has). Commit: `git commit -am "Document secure storage"`
