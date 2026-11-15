# Architecture: one engine, Supabase plus server functions

16 Nov 2026 · Short design · Decided by the founder: approach A.

## Why

Later features need code that runs on a server: encryption with a key kept outside the database, logged admin reads, scheduled alerts and the daily price job (beta), and Account Aggregator and phone apps (public launch). The question was whether that means a rewrite or a dedicated backend. It does not: the engine is already pure TypeScript and the prototype is about 4,300 lines. What is needed is clear module boundaries now and a thin server layer added project by project.

## Goals, non-goals, anti-goals

- **Goal:** the same engine code runs in the browser, in server functions (alerts) and later in the Expo apps, with no copy and no second implementation.
- **Goal:** moving from "browser talks to the database" to "browser talks to server functions" (secure storage) changes one module, not screens or engine.
- **Non-goal now:** a dedicated always-on backend (Node API, own servers). Revisit at the public launch, when Account Aggregator needs a registered server.
- **Anti-goal:** statements or PDF passwords ever reaching a server. Parsing stays in the browser.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | Supabase database and auth, plus a few Supabase Edge Functions; engine shared | Cheapest for one founder; no servers to run; enough for every beta need | **Chosen** |
| B | Dedicated backend now (e.g. Node API in Mumbai owning all data access) | Most control; likely needed at public launch; weeks of hosting, deployment and security work that does not help the beta | Later, if needed; A is built so the switch is local |
| C | Browser plus database only | Cannot hold an encryption key outside the database, log admin reads, or send scheduled alerts | Ruled out by earlier decisions |

## The design

### Modules and their rules

All inside `prototype/` for now (no workspace or package split yet: it would rename every path in the foundation plan for no gain until the Expo project).

| Module | Holds | May import |
|---|---|---|
| `src/engine/` | Types, tax rules by year, tax function, ledger, family planner, relations, records, events, "brings home", market assumptions | Only `src/engine/` (already true today) |
| `src/parsers/`, `src/prices/` | Statement and price-file reading, browser only | `src/engine/` types |
| `src/storage/` (new) | The one place that loads and saves family data and appends recommendation records | `src/engine/` types, `src/cloud.ts` |
| `src/cloud.ts` | Supabase client and sign-in only | Supabase |
| `src/ui/`, `src/store.ts` | Screens and app state | Anything above **except** `src/cloud.ts` for data (sign-in calls stay allowed) and the Supabase client |
| `supabase/functions/` (new, later projects) | Server functions | The engine via a bundle (below) |

A test enforces the import rules, so a boundary can't erode quietly.

### Storage behind one interface

```ts
// src/storage/index.ts: the account copy of a family
export interface FamilyStore {
  load(userId: string): Promise<CloudFamily | null>;                       // { state, version }
  save(userId: string, state: AppState, knownVersion: number | null): Promise<number | 'conflict'>;
  remove(userId: string): Promise<void>;
}
export const familyStore: FamilyStore;  // today: supabaseFamilyStore
```

The signatures are today's `loadFamily`, `saveFamily` and `deleteFamily` from `cloud.ts`, moved behind the interface unchanged, so `useCloud` keeps its conflict handling. Profiles (`loadProfile`, `saveProfile`) move with them. The browser copy stays in `store.ts` (`loadState`, `saveState`); encrypting it is a secure-storage item. The secure storage project adds `functionsFamilyStore`, which calls server functions, plus a records method when recommendation records move out of the family document into their own append-only table; nothing outside `src/storage/` changes.

### The engine on a server

The engine must run in a server function (Deno) without changes. Rule: engine code uses no DOM, `localStorage`, `fetch`, Node built-ins or randomness (ids are already stable by design). **Dates are India dates:** today `todayISO` uses the machine's local time, which on a UTC server would be yesterday until 5:30 am IST and misdate a 31 March alert; Task 0 fixes it to UTC+5:30. A build script bundles `src/engine/index.ts` into one ESM file; a test imports that bundle in plain Node and runs one golden tax case, proving it runs outside the browser. Server functions import the bundle (copied to `supabase/functions/_shared/engine.js` at deploy). *Claude's call:* bundling rather than importing source avoids Deno's file-extension rules in engine imports.

### Server functions, by project (designed in those projects, listed here so nothing surprises)

| Function | Does | Project |
|---|---|---|
| `family` (read, write) | Encrypts tier-2 fields on write and decrypts on read with a key held in function secrets, not in the database | Secure storage |
| `admin-read` | The only way the founder reads a family; writes an access log the family can see | Secure storage |
| `prices-daily` (scheduled) | Fetches AMFI NAVs and category headings; replaces `scripts/fetch-prices.sh` | Beta |
| `alerts` (scheduled) | Runs the engine on each family; sends the dated alerts and monthly digest per the notification policy | Beta |
| Account Aggregator | Consent and data fetch; may need a dedicated server (approach B) | Public launch |

Scheduling uses Supabase Cron calling functions. Email and push providers are chosen in the beta design.

### Region

*Claude's call, for the secure storage project:* a Supabase project's region is fixed when it is created. Rather than moving real families' data later, create the Mumbai (`ap-south-1`) project as part of secure storage, before any beta invite, and move only the founder's test data.

## Effect on the foundation plan

One new first task (Task 0): create `src/storage/` and move data access behind `FamilyStore`; add the import-boundary test; add the engine bundle and its Node smoke test. Tasks 1–13 are unchanged: Task 7 keeps records inside the family document (`AppState.recommendations`), which `FamilyStore` saves like everything else.

## Left to the builder

- Exact bundler for the engine (Vite library mode or esbuild); whichever needs no new heavy dependency.
- How the boundary test finds imports (a simple regex over source files is enough).
