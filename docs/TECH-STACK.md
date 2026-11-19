# Tech stack

What the app is actually built with today (20 Nov 2026). For *why* it is shaped this way see `docs/superpowers/specs/2026-11-16-architecture-design.md`; `docs/ARCHITECTURE.md` is the earlier 50,000-family target design, not what runs now. Update this sheet when a dependency, service or command changes.

## At a glance

| Layer | Choice | Version |
|---|---|---|
| Language | TypeScript (app, engine, server functions, scripts); some Bash and SQL | 5.8.3 |
| Front end | React, built with Vite; plain CSS | React 18.3.1 · Vite 6.3.5 · `@vitejs/plugin-react` 4.5.0 |
| Fonts | Self-hosted via Fontsource: Hanken Grotesk (body), Bricolage Grotesque (headings) | 5.3.0 |
| Tax engine | Pure TypeScript, no libraries, money in integer paise | `prototype/src/engine/` |
| Statement reading | In the browser only: `pdfjs-dist` (PDF CAS), `read-excel-file` (broker Excel) | 4.10.38 · 9.3.14 |
| Back end | Supabase, **Free plan**, project `iaesqhisslztykbglcck`, region Singapore (`ap-southeast-1`) | App: `@supabase/auth-js`, `postgrest-js`, `functions-js` 2.118.0 (only the parts used, wired in `src/cloud.ts`) · Edge Functions: `@supabase/supabase-js` 2.118.0 |
| Database | Postgres with row-level security; schema in `prototype/supabase/migrations/` | |
| Sign-in | Supabase Auth: Google only for the beta; TOTP two-factor for the admin | |
| Server functions | Supabase Edge Functions on Deno: `family`, `admin`, `alerts` (beta branch); logic in `_shared/` | |
| Scheduled jobs | Supabase Cron (daily alerts); GitHub Actions (nightly prices, nightly backup) | |
| Encryption | Web Crypto AES-256-GCM (server envelope and browser copy); browser key in IndexedDB; backups with `age` | `age-encryption` 0.3.1 |
| Email | Brevo free plan, transactional email API (beta branch) | |
| Hosting | GitHub Pages (`devansh217.github.io/family-tax-harvesting/`), public repo | |
| CI / deploy | GitHub Actions: `pages.yml` (test, build, prices, deploy on push to `main` and nightly), `backup.yml` (nightly encrypted dump) | Node 22 |
| Tests | Vitest; `fake-indexeddb` for browser-storage tests | 3.1.4 · 6.2.8 |
| Script runner | `vite-node` | 3.1.4 |
| CLIs | Supabase CLI (`npx supabase@2`), GitHub CLI (`gh`), `age`, Postgres client (`pg_dump`, `pg_restore`, `psql`) | |

**Planned, not built:** Expo (React Native) phone apps on the same engine; Account Aggregator for live bank data (public launch).

## Repo layout

```text
prototype/
├── src/
│   ├── engine/         # pure tax engine: types, rules by year, tax, ledger, family, relations, planner, events…
│   ├── parsers/        # CAS, broker and table readers (browser only)
│   ├── prices/         # AMFI NAV and NSE/BSE bhavcopy parsing
│   ├── storage/        # the only code that talks to Supabase data: functions store, encrypted browser copy, admin
│   ├── ui/             # React screens, app context, sync hook, read-only viewing
│   ├── cloud.ts        # Supabase client and sign-in; cloud-config.ts holds the project URL and publishable key
│   └── csp.ts          # Content Security Policy added to the built page
├── supabase/
│   ├── migrations/     # database schema (apply with db push)
│   ├── functions/      # Edge Functions; _shared/ is pure TS tested by Vitest, the rest is thin Deno wiring
│   └── config.toml
├── scripts/            # build-prices, build-engine, restore-test, private-data check
└── backup-recipient.txt  # public age key the nightly backup encrypts to
.github/workflows/      # pages.yml, backup.yml
docs/                   # product, research, specs, plans, guides, this sheet
```

## Rules the code enforces

- **The engine is pure**: no browser, network, randomness or clock outside `todayISO` (India time). `src/boundaries.test.ts` fails otherwise. It is bundled for server use with `npm run build:engine`.
- **Only `src/storage/` touches Supabase data or calls functions.** Sign-in stays in `cloud.ts`.
- **No secrets in the repo**: `src/secrets.test.ts` fails on a Supabase secret key or service-role token in any tracked file. The publishable key is public by design.
- **Families are encrypted** in the `families` table and only the server functions hold the key (function secrets `FAMILY_KEYS`, `FAMILY_KEY_CURRENT`).
- **Statements never leave the device**; only `panLast4` is stored, never a full PAN.

## Commands (run in `prototype/`)

| Task | Command |
|---|---|
| Local app | `npm run dev` → http://localhost:5199 |
| Built site locally | `npm run build && npm run preview -- --port 4173` |
| Tests | `npm test` (also run with `TZ=UTC npm test`) |
| Types | `npm run typecheck` |
| Production build | `npm run build` |
| Private-data check | `npm run check:private` |
| Engine bundle | `npm run build:engine` |
| Database changes | `npx supabase@2 db push` (after `login` and `link --project-ref iaesqhisslztykbglcck`) |
| Deploy functions | `npx supabase@2 functions deploy <name>` |
| Restore test | `SUPABASE_DB_URL='…' npm run restore-test` (on your own machine) |

## Services and where their settings live

| Service | Used for | Settings |
|---|---|---|
| Supabase | Database, auth, functions, cron | Dashboard; secrets via `supabase secrets set`; never in the repo |
| GitHub | Code, Pages, Actions | Actions secret `SUPABASE_DB_URL` (session pooler string) |
| Brevo | Season emails (beta) | API key as a Supabase function secret; see `docs/guides/beta-setup.md` |
| Google Cloud | OAuth client for Google sign-in | Client ID and secret entered in Supabase Auth |
| AMFI, NSE, BSE | Daily prices and fund categories | Public downloads in `scripts/fetch-prices.sh` |

Keys (family key, backup private key, database password, Brevo key) live only in the founder's password manager and in the services above.

## Cost

Everything runs on free tiers (Supabase Free, GitHub Free, Brevo Free). Limits that matter: Supabase Edge Functions 500,000 calls a month, 500 MB database, projects pause after about 7 days of low activity (the nightly backup keeps it awake), no Supabase backups (hence `backup.yml`); GitHub disables scheduled workflows after 60 days without repo activity.
