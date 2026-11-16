# Secure storage: design

17 Nov 2026 · Status: **draft, for the founder's approval.**

Background: `docs/PLANNER-NOTES.md` (decisions, data tiers, security to-do), `docs/superpowers/specs/2026-11-16-architecture-design.md` (approach A: Supabase plus server functions, one engine).

## 1. Intent

Before any beta invite, the copy of a family kept on the server must be safe enough to hold other people's money details. The founder decided on 15 Nov 2026 that synced data stays **readable on the server** (so he can debug for users and server jobs can send alerts), which makes hardening mandatory: a leak of the database, a backup or a dashboard session must not expose any family.

**Who it is for:** the founder plus at least five family-and-friends beta families (2026-27 season).

**Success:** a database dump, a backup file or a look at tables in the dashboard shows no family's income, holdings, members or accounts (the account holder's own name and sign-in email stay readable, as they are account data, tier 4); every time the founder reads a family it is logged and the family can see it; data survives a lost project; a family can delete everything.

## 2. Goals, non-goals, anti-goals

**Goals (before beta invites):**
1. The whole family document is encrypted at rest with a key the database does not hold.
2. The browser never reads or writes the family table directly; only server functions do.
3. Every founder read of a family goes through one function that logs it first; the family sees the log.
4. Nightly encrypted backups, with a restore tested once before invites and monthly after.
5. The copy kept in the browser is encrypted too.
6. Account and data deletion in one step.
7. A new project in Mumbai; the founder's family moved over.
8. Smaller hardening: two-factor sign-in for the admin, the page limited to its own scripts, fonts hosted with the site, the secret key never in the repo, consent for children's data.
9. A minimal admin screen for the founder: enrol two-factor, list families (metadata only), read one with a reason.
10. Google-only sign-in for the beta: the email-and-password forms are hidden (the code stays for later).

**Non-goals (later projects):**
- Splitting the family document into tables. The engine works on the whole family in the browser, so the server needs no individual fields in the beta.
- Recommendation records in their own append-only table (they stay inside the encrypted document until the public launch).
- Alerts, the daily price function and Account Aggregator (beta and launch projects).
- End-to-end encryption (ruled out: data stays readable on the server).

**Anti-goals (a failure even if it works):**
- Anything that needs a paid plan. The founder has no budget (17 Nov 2026); everything runs on Supabase Free and GitHub's free tier.
- Any path that lets the founder read a family without a log entry, short of deliberately extracting the key.
- Statements, PDF passwords, full PAN or portal logins reaching the server (unchanged rule).
- Losing a family's data in the move to the new project.

## 3. Constraints

- **Supabase Free:** 2 projects per organisation; projects pause after about 7 days of low activity (restorable for 90 days); **no daily backups**; Edge Functions 500,000 calls a month; function secrets, Cron and TOTP MFA included; 500 MB database.
- **Email:** without custom SMTP, Supabase sends auth emails only to the organisation's team members, about 2 an hour. The beta uses **Google sign-in**; a free SMTP service (Brevo, 300 emails a day) is the fallback for anyone without Google.
- **Hosting:** the site is GitHub Pages on a **public** repo. Pages cannot set HTTP headers, so the Content Security Policy is a `<meta>` tag. GitHub Actions artifacts on a public repo can be downloaded by any signed-in GitHub user, so backups must be encrypted before upload.
- **Code shape:** family data already reaches Supabase only through `src/storage/` (`FamilyStore`), and a boundary test enforces it. This project swaps the implementation behind that interface; screens and engine don't change.

## 4. Approaches

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | Server functions encrypt and decrypt; key in function secrets; admin reads only via a logging function | All family traffic goes through functions (well within free quota); the founder can still debug; alerts can run later | **Chosen by the founder, 17 Nov 2026** |
| B | Postgres encrypts with Supabase Vault | Less code, but anyone with SQL access in the dashboard reads decrypted data with no log entry | Rejected: breaks "every admin read is logged" |
| C | The browser encrypts; only the family holds the key | Strongest privacy, but no debugging, no server alerts, lost key means lost data | Rejected: reverses "readable on the server" |

## 5. The design

### 5.1 Data on the server

```text
public.profiles          as today (first and last name; RLS: own row)
public.families          user_id pk · version int · envelope jsonb · updated_at
                         RLS on, NO policies, all privileges revoked from anon and authenticated:
                         only the service role (inside functions) touches it
public.admin_reads       id · family_user_id · admin_user_id · reason text · at
                         RLS: a signed-in user may select rows where family_user_id = auth.uid(); nothing else
public.admins            user_id pk (who may call admin-read; one row: the founder)
```

`family_data` (today's table) is not carried over to the new project.

**The envelope** (what `families.envelope` holds):

```json
{ "v": 1, "kid": "k1", "iv": "<base64, 12 bytes>", "ct": "<base64 AES-256-GCM ciphertext of the JSON AppState>" }
```

- AES-256-GCM via WebCrypto in the function, a fresh random IV per save, and additional authenticated data `user_id|version`, so a ciphertext copied onto another row or version fails to decrypt.
- The whole `AppState` is encrypted, not just "sensitive fields": names, relations and goals are personal data too, and the server needs nothing in clear. Only `user_id`, `version` and `updated_at` are plain.
- **Keys:** function secrets `FAMILY_KEYS` (JSON map of key id → base64 32-byte key) and `FAMILY_KEY_CURRENT` (the id used for new saves). Loads use the envelope's `kid`; each save re-encrypts with the current key, so rotating means adding a key and changing `FAMILY_KEY_CURRENT`. A copy of the keys is kept offline by the founder (password manager): without it, backups are unreadable to him too.

### 5.2 Server functions (Edge Functions, Deno)

| Function | Who calls it | Does |
|---|---|---|
| `family` `GET` | the signed-in user | Reads own row, decrypts, returns `{ state, version }` or `null` |
| `family` `PUT` | the signed-in user | Body `{ state, knownVersion }`. Encrypts and writes only if the stored version equals `knownVersion` (insert when `null`); returns the new version or `409 conflict`. Rejects bodies over 5 MB |
| `family` `DELETE` | the signed-in user | Deletes the family row, their `admin_reads` rows, profile and auth user (account deletion, immediate) |
| `admin-read` `POST` | an admin with two-factor sign-in (JWT `aal2`) | Body `{ familyUserId, reason }`, reason required. **Writes the `admin_reads` row first**, then returns the decrypted family. No log, no data |
| `admin-list` `GET` | an admin with `aal2` | Lists families as metadata only: user id, sign-in email, version, last updated. No family data, so not logged |

- Every function verifies the caller's JWT with Supabase Auth and uses the user id from it, never from the body.
- Functions talk to the database with the service-role key, which lives only in function secrets.
- Conflict handling is today's: the client keeps the version it last saw and reloads on `409`.

### 5.3 The app

- `src/storage/functions.ts`: `functionsFamilyStore` implements `FamilyStore` by calling `family`; `familyStore` points at it. `supabaseFamilyStore` is removed. Profile reads stay direct (RLS, non-sensitive).
- **Account page:** "Who has looked at your data" lists the family's `admin_reads` rows (date and reason). "Delete my account and data" calls `family` `DELETE` after a confirm.
- **Admin screen** (`#admin`, shown only when the signed-in user is in `admins`): enrol an authenticator app (`auth.mfa.enroll` / `challenge` / `verify`), step up to two-factor when needed, list families via `admin-list`, and read one via `admin-read` after typing a reason. The decrypted family opens read-only in the same screens the family sees.
- **Sign-in:** the Account page shows only "Continue with Google" for the beta; the email-and-password forms are hidden behind a flag, not deleted.
- **Children's data:** for a minor, the consent tick reads "I'm their parent or guardian and agree to their data being included" (stored in the same `consent` field).

### 5.4 The copy in the browser

- On first run the app creates an AES-GCM key with WebCrypto (`extractable: false`) and stores it in IndexedDB; `localStorage` holds only the envelope (same shape as 5.1, `kid: "device"`).
- On first load after the update, plain-text data found in `localStorage` is read once, re-saved encrypted, and the plain copy deleted.
- If the device key is missing or decryption fails (cleared site data, another browser profile): start empty and, when signed in, load the account copy. The sample family is not shown over a signed-in account.
- Loading becomes asynchronous: the app shows a short "Opening your family…" state until the browser copy is decrypted (today `loadState` is synchronous).
- What it protects: data read off the disk, synced browser profiles and casual inspection. It does not protect against a script running inside the page; that is what 5.7 is for.

### 5.5 New project and moving over

1. The founder creates a project on the Free plan in **Mumbai (`ap-south-1`)** in his organisation, turns on Google sign-in (adds the new callback URL in Google Cloud), and sets function secrets. A step-by-step guide is part of the build (the founder does the dashboard and Google console steps; nothing needs a password typed by Claude).
2. Schema and functions are deployed with the Supabase CLI from `prototype/supabase/`.
3. The app's project URL and publishable key point at the new project; deploy.
4. The founder signs in on the live site with Google. His browser still holds his family, the new account is empty, so the existing "keep this browser" flow uploads it, encrypted.
5. The old project's data is deleted and the project removed once the founder confirms his family is on the new project. (Before that, the guide has him check that `family_data` holds only his row; see section 9.)

### 5.6 Backups

- **Nightly** GitHub Actions workflow (`.github/workflows/backup.yml`, free on a public repo): `pg_dump` of the new project's `public` schema through the IPv4 session pooler connection string (Actions secret), compressed, encrypted with [`age`](https://age-encryption.org) to a public key committed in the repo, uploaded as an artifact kept 30 days.
- The `age` private key exists only offline with the founder. A downloaded artifact is unreadable without it, and the families inside are encrypted a second time (5.1).
- The nightly job also keeps the free project from pausing.
- **Restore test:** a local script the founder runs on his own machine (`npm run restore-test`), so the `age` private key and the family keys never go to GitHub. It downloads the latest artifact, decrypts it, restores it into a throwaway schema `restore_test` in the **new** project (so the data never leaves Mumbai and no second project is needed), checks that the families row count matches and that one envelope decrypts with the family key from the founder's password manager, then drops the schema. Run once before invites, then monthly (a calendar reminder, not code).
- **Re-linking after a total loss:** the nightly job also exports `auth.users(id, email)` into the same `age`-encrypted file, so after a lost project the founder can match restored families to people who sign in again. No plain email table is kept in the database.

### 5.7 Smaller hardening

- **Two-factor for the admin:** TOTP (authenticator app) enrolled on the founder's account; `admin-read` refuses without `aal2`. Beta families sign in with Google, which has its own two-factor.
- **Content Security Policy** as a `<meta>` tag: scripts and styles from the site only, fonts from the site only, connections to the project's API and functions only, no frames. Google Fonts are replaced by self-hosted font files (the same two families, `woff2`).
- **Secrets out of the repo:** a test fails if any tracked file contains a Supabase secret key pattern (`sb_secret_` or a service-role JWT). The publishable key stays in the code (it is meant to be public; RLS and functions do the protecting).
- **Admin access:** the founder is the only member of the Supabase organisation and the only row in `admins`.
- **Shared origin:** the site lives on `devansh217.github.io`, an origin shared with any other Pages site on that account. The old `/v0.1/` page (plain `localStorage`, Google Fonts, no CSP) is removed from the deploy, as it would sit on the same origin as the encrypted browser copy. Any other Pages site on the account shares the origin too; the setup guide lists them so the founder can confirm they are his own. A custom domain (paid) is a later option.

## 6. What changes in the security to-do

| To-do item | Result |
|---|---|
| Split the family JSON into tables | **Dropped for the beta:** the whole document is encrypted instead (5.1) |
| Encrypt tier-2 fields, key outside the database | Done by 5.1–5.2, covering all tiers |
| Log every admin read, show the family | 5.2 `admin-read`, 5.3 Account page |
| Daily backup, tested restore | 5.6 (nightly, monthly restore test) |
| Encrypt the browser copy | 5.4 |
| CSP and self-hosted fonts | 5.7 |
| Two-factor sign-in | 5.7 (admin required; Google's for families) |
| Mumbai region | 5.5 |
| Limit admin access, secret key out of repo | 5.7 |
| Delete account within a day | 5.2 `DELETE` (immediate) |
| Consent incl. children | 5.3 |

## 7. Testing

- **Functions:** unit tests of the envelope (encrypt then decrypt round-trips; tampered `ct`, wrong `user_id` or wrong `version` in the AAD fails; an old `kid` still decrypts; saves use the current key). Run with Deno's test runner in CI or locally.
- **Version conflict:** a save with a stale `knownVersion` returns `409` and leaves the row unchanged.
- **Access:** with the publishable key and a user's JWT, a direct `select` on `families` returns nothing and an `insert` fails; `admin_reads` shows only the caller's rows.
- **admin-read:** without `aal2` → 403; without a reason → 400; with both → a log row exists before the data is returned (checked by making the decrypt fail and confirming the log row is still written).
- **Browser copy:** plain `localStorage` data migrates to an envelope and the plain key is removed; a missing device key starts empty without crashing.
- **Restore test** run once for real before invites (5.6), with the result noted in `docs/PLANNER-NOTES.md`.
- Existing tests keep passing; the module-boundary test gains: only `src/storage/` calls `functions.invoke`.

## 8. Left to the builder (and Claude's calls)

*Claude's calls, for the founder to check:*
- Encrypt the whole family document rather than chosen fields (simpler, nothing in clear).
- The account holder's name (`profiles`) and sign-in email stay readable on the server; only family data is encrypted.
- Account deletion is immediate rather than "within a day".
- Backup artifacts kept 30 days (GitHub allows up to 90).
- The restore test runs on the founder's machine into a throwaway schema in the new project, so backup and family keys never go to GitHub and data never leaves Mumbai.
- A minimal admin screen with two-factor enrolment and a family list is part of this build.
- Google-only sign-in for the beta; email and password hidden, not removed.
- `/v0.1/` is taken off the live site because it shares the origin.

*Left to the builder:* exact function file layout under `prototype/supabase/functions/`; how the guide for the founder's dashboard steps is written (a short Markdown checklist or the `wizard` skill); font subsetting; CSP details needed by Vite's build output.

## 9. Open with the founder

- Does anyone besides the founder have a saved family in the old project's `family_data`? If yes, the move needs a server-side copy of their rows (decrypt-free, since they are plain today), matched by email, instead of relying on each browser.
