# Beta features (season build) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make harvesting safe and dated for the Feb–Mar 2027 season, fold regular-to-direct switching into it, confirm moves from imports, gate the beta by invite, send opt-in season emails with beta totals, and produce each member's capital gains schedule.

**Architecture:** New pure engine modules (`season.ts`, `switch.ts`, `directTwin.ts`, `detect.ts`, `seasonSummary.ts`, `cgSchedule.ts`) feed the existing `computeFamily` move generator and screens. Server work follows the secure-storage pattern: logic in `supabase/functions/_shared/*.ts` (Vitest), thin Deno entries, a new `alerts` function run daily by Supabase Cron, using the engine bundle.

**Tech Stack:** React 18, Vite 6, TypeScript 5.8, Vitest 3, Supabase (Postgres, Edge Functions on Deno, Cron with `pg_net`), Brevo HTTP email API (free plan).

**Spec:** `docs/superpowers/specs/2026-11-17-beta-features-design.md`. Section 10 (new money, April 2027) is **not** in this plan; it gets its own plan in March 2027.

**Milestones:** M1 season-ready (Tasks 1–7) by **10 Jan 2027**; M2 emails and totals (Tasks 8–12) by **25 Jan 2027**; M3 gains schedule (Task 13) by **15 Mar 2027**. A fresh reviewer checks the branch at the end of each milestone. All commands run in `prototype/`.

## Global Constraints

- Engine (`src/engine/**`) stays pure: no DOM, `localStorage`, `fetch`, Node built-ins, randomness or clock; `src/boundaries.test.ts` must stay green. Dates are India dates (`todayISO` in `dates.ts`).
- Money is integer paise (`Paise`), units are `Qty` (scaled by `QTY_SCALE`); never floats for rupees.
- Free tiers only. No new paid service. Email only through an HTTP API (Edge Functions block SMTP ports 25 and 587).
- Every move shown is recorded (`newShownRecords`); records are append-only.
- Emails contain one rupee figure (family room left), counts and dates only: **no member names, fund names or income.** At most one email per family per day. Footer: "Turn these off on the Account page".
- Calendar events contain member, action and fund, **no units or rupee figures.**
- Move floor: moves saving under **₹1,000** are not shown.
- Families with `alerts.seasonHelp` off are never decrypted by `alerts`. Every decrypt by `alerts` writes a `season_log` row.
- Plain English, short sentences, Indian number format (`toLocaleString('en-IN')`) in all copy.
- Each task ends with `npm test` and `npm run typecheck` green.

## Review Focus

1. **ELSS lots partly locked:** a holding with 3-year-old and 1-year-old ELSS lots must offer only the old units; a holding with only locked lots offers nothing (Task 1 test `elss partly locked`).
2. **31 March near a holiday:** with 30 Mar 2027 a holiday, the last safe day moves back to the previous trading day; with an unpublished holiday list, no last safe day is shown (Task 2 tests).
3. **Dated move whose room is gone:** an ordinary sale imported after dating uses the room; the dated move shows `noRoom: true` and zero units, never negative (Task 4 test `dated move loses room`).
4. **Alerts re-run on the same day:** a second run sends nothing and writes no second log row (Task 11 test `idempotent re-run`).
5. **Ambiguous direct twin:** two direct candidates (or none) → `toIsin` undefined and the "find the direct plan" reason (Task 3 test `ambiguous twin`).

---

## Milestone 1: season-ready

### Task 1: ELSS lock-in and the ₹1,000 floor

**Files:**
- Modify: `src/engine/family.ts` (`harvestableQty` ~L205, constants L128–129, gift step ~L360)
- Modify: `src/engine/categories.ts` (export `isElss(category?: string): boolean`)
- Modify: `src/ui/screens/Member.tsx` (locked-until line per holding)
- Test: `src/engine/family.test.ts`, `src/engine/categories.test.ts`

**Interfaces:**
- Produces: `isElss(category?: string): boolean`; `lockedUntil(lot: { date: ISODate }, sec: Security): ISODate | null` in `family.ts` (date + 3 years for ELSS, else null); `HoldingLot.lockedUntil?: ISODate`; `MIN_NET_SAVING = 1_000_00`.

- [ ] **Step 1: Write failing tests**
  - `isElss` true for each ELSS heading in `categories.ts` (L58, L81, L93), false for "Equity Scheme - Large Cap Fund" and `undefined`.
  - `elss partly locked`: member with ELSS lots bought 2023-06-01 (gain ₹40,000) and 2025-06-01 (gain ₹30,000), asOf 2027-02-10, room ₹1.25 L → one `harvest_gain` move whose qty equals the first lot's qty only.
  - `elss all locked`: only the 2025 lot → no harvest, loss or gift move for that ISIN; `HoldingLot.lockedUntil === '2028-06-01'`.
  - `floor`: a harvest whose saving is ₹800 is not shown.
- [ ] **Step 2: Run** `npx vitest run src/engine` → the new tests FAIL.
- [ ] **Step 3: Implement.** In `harvestableQty` and the loss loop, stop at the first lot with `lockedUntil > asOf` (FIFO puts locked lots last, so stopping is enough). Skip ELSS in the gift step. Raise `MIN_NET_SAVING` to `1_000_00`. Member page: "Locked until <date> (tax-saver fund)" under a holding with locked lots.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS (update any existing test that relied on the ₹500 floor and say so in the commit).
- [ ] **Step 5: Commit** `git commit -m "Harvesting skips ELSS units still in lock-in; ₹1,000 move floor"`

### Task 2: Season dates

**Files:**
- Create: `src/engine/data/holidays-2027.ts`, `src/engine/season.ts`, `src/engine/season.test.ts`
- Modify: `src/engine/index.ts` (export), `src/ui/screens/Home.tsx` and `src/ui/screens/Plan.tsx` (last safe day line from 1 Feb)

**Interfaces:**
- Produces:
  - `export const NSE_HOLIDAYS_2027: { published: boolean; dates: ISODate[] }`
  - `isTradingDay(d: ISODate, holidays: ISODate[]): boolean` (Mon–Fri, not a holiday)
  - `nextTradingDay(d: ISODate, holidays: ISODate[]): ISODate` (strictly after `d`)
  - `lastSafeDay(yearEnd: ISODate, h: { published: boolean; dates: ISODate[] }): ISODate | null` — null when unpublished; else the second-to-last trading day on or before `yearEnd`.
  - `buybackDate(saleDate: ISODate, listed: boolean, holidays: ISODate[]): ISODate` — next trading day for both shares and funds (funds: the next business day after the redemption date, which uses the same calendar).

- [ ] **Step 1: Write failing tests:** `lastSafeDay('2027-03-31', {published:true, dates:[]})` → `'2027-03-30'`; with `dates:['2027-03-30']` → `'2027-03-29'`; with `published:false` → `null`. `nextTradingDay('2027-03-26', [])` (Friday) → `'2027-03-29'`. `buybackDate('2027-03-30', true, [])` → `'2027-03-31'`.
- [ ] **Step 2: Run** `npx vitest run src/engine/season.test.ts` → FAIL.
- [ ] **Step 3: Implement** with `addDays` from `dates.ts`; weekday from the ISO date (UTC arithmetic, no clock). Data file ships `published: false, dates: []` with a comment: "Fill from NSE's 2027 holiday circular (published mid-December 2026), then set published: true." Home and Plan show "Last safe day to sell this year: <date>" from 1 Feb when non-null.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Fill the list** from NSE's circular once published (before M1 review); add a test that `lastSafeDay('2027-03-31', NSE_HOLIDAYS_2027)` equals the date worked out by hand from the circular.
- [ ] **Step 6: Commit** `git commit -m "Season dates: trading days, buyback date, last safe day"`

### Task 3: Switch regular plans to direct

**Files:**
- Create: `src/engine/data/ter-gap.ts`, `src/engine/directTwin.ts`, `src/engine/switch.ts`, tests beside each
- Modify: `src/engine/family.ts` (`Move` union, step 1 ordering), `src/engine/records.ts` (`moveId` unchanged shape works; add test), `src/ui/screens/Plan.tsx` (`KIND_ORDER` entry and `describe` case)
- Test: `src/engine/family.test.ts`, `src/parsers/parsers.test.ts`

**Interfaces:**
- Consumes: `FundsFile['funds']` (`src/prices/parse.ts`), `Security.plan/option/category`, `buybackDate` (Task 2).
- Produces:
  - `terGapFor(category?: string, name?: string): number` in `ter-gap.ts` — points a year: index or ETF-like name `0.3`; equity (incl. ELSS) `1.0`; hybrid `0.5`; debt `0.4`; unknown `0.5`. Exported `TER_GAP_IS_ESTIMATE = true`.
  - `directTwin(sec: Security, funds: FundsFile['funds']): string | undefined` — ISIN of the single fund whose normalised name equals `sec.name` with "Regular" → "Direct" and same option; undefined if zero or several.
  - `switchDecision(input: { value: Paise; gain: Paise; term: Term; monthsToLongTerm: number; equityUnitsUnder12m: boolean; taxType: TaxType; freeRoom: Paise; slabRate: number; gap: number }): { when: 'now' | 'wait' | 'next_year'; until?: 'long_term' | 'load_free'; taxNow: Paise; edge10y: Paise }`
  - Move variant `{ kind: 'switch_direct'; memberId: string; toIsin?: string; gain: Paise; tax: Paise; feeSavedPerYear: Paise; when: 'now' | 'wait' | 'next_year'; until?: ISODate; buyOn?: ISODate }` (plus `MoveBase`).
  - `FamilyState.funds?: FundsFile['funds']` — passed in by the UI from the loaded `funds.json`.

- [ ] **Step 1: Write failing tests**
  - `directTwin`: "Axis Bluechip Fund - Regular Plan - Growth" finds "Axis Bluechip Fund - Direct Plan - Growth"; `ambiguous twin`: two direct growth matches → undefined; no match → undefined.
  - `switchDecision` cases from UNIVERSE §2.4: (a) `gap 0` → `next_year` never `now` with `edge10y <= 0`; (b) long-term gain fully inside `freeRoom` → `now`, `taxNow 0`; (c) short-term, 3 months to long-term → `wait`, `until 'long_term'`; (d) slab fund, `slabRate 0.312`, `gap 0.3`, gain ₹2 L → `next_year`; (e) slab fund, `slabRate 0` (nil-tax parent), `gap 0.4` → `now`; (f) equity units under 12 months → `wait`, `until 'load_free'`; (g) `edge10y` rises with `gap`.
  - In `family.test.ts`, `switch takes room first`: member with ₹1.25 L room, a regular fund with ₹80,000 LT gain and a direct fund with ₹90,000 LT gain → a `switch_direct` (`when 'now'`, gain ₹80,000) and a `harvest_gain` capped at ₹45,000.
  - In `parsers.test.ts`, `switch lines`: CAS lines "Switch Out - To Direct Plan" (negative units) and "Switch In - From Regular Plan" parse as a sell and a buy on the same date.
- [ ] **Step 2: Run** `npx vitest run src/engine src/parsers` → FAIL.
- [ ] **Step 3: Implement.** `switchDecision` follows UNIVERSE §2.4's pseudocode with: 11% pre-cost return, 10-year horizon, break-even within 7 years and edge ≥ max(₹5,000, 0.5% of value) for `now` with tax; LT tax 12.5% × 1.04; ST 20% × 1.04; exit load 1% assumed when `equityUnitsUnder12m`. In `computeFamily` step 1, put a member's regular-plan lots before direct ones when filling room; regular funds beyond the room get one `switch_direct` per holding with the decision. Reasons (copy): "Moves to the direct plan of the same fund: saves about ₹<fee> a year in fees (estimate)", "Uses ₹<gain> of <name>'s tax-free room" or "Tax now: ₹<tax>", and always "Check the exit load in your fund statement before selling". No twin → "Find the direct plan of this fund at the fund house". Plan screen: new group "Switch to direct" after "Sell and buy back".
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Switch regular plans to direct inside each member's room"`

### Task 4: Dated moves that hold their room

**Files:**
- Modify: `src/store.ts` (`AppState.datedMoves`, default `[]`, migration in the loader at ~L107), `src/engine/family.ts` (`FamilyState.datedMoves`, sizing order, `Move.noRoom?`, `Move.date?`, `Move.buyOn?`), `src/engine/records.ts` (`RecordEvent` adds `'detected_done'`; `RecommendationRecord.date?: ISODate`)
- Modify: `src/ui/screens/Plan.tsx` (date picker, linked second step, "Units for today's prices; check again on the day")
- Test: `src/engine/family.test.ts`, `src/engine/records.test.ts`

**Interfaces:**
- Consumes: `buybackDate` (Task 2), `switch_direct` (Task 3).
- Produces: `DatedMove = { moveId: string; date: ISODate }`; `FamilyState.datedMoves?: DatedMove[]`; moves carry `date?: ISODate`, `buyOn?: ISODate`, `noRoom?: boolean`; `datedRecord(move: Move, date: ISODate, at: string): RecommendationRecord` (event `in_plan`, `date`, snapshot `move`).

- [ ] **Step 1: Write failing tests:** `dated moves sized first`: two members' room contested by a gift and a dated harvest → the dated harvest gets its full gain first. `re-sized at today's price`: price up 10% → same `moveId`, fewer units, gain still ≤ room. `dated move loses room`: an imported ordinary sale uses all room → the dated move has `noRoom: true`, `qty 0`. `buyOn` equals `buybackDate(date, listed, holidays)`. `datedRecord` writes `in_plan` with `date`.
- [ ] **Step 2: Run** `npx vitest run src/engine` → FAIL.
- [ ] **Step 3: Implement.** Before step 1 in `computeFamily`, size each dated move (by `moveId` → kind, member, ISIN, account) in date order against current room; mark its lots used; then run steps 1–4 for the rest, skipping ids already produced. Plan screen: a date input per move (default today, max = last safe day when known); saving writes `datedMoves` and a `datedRecord`; the second step line reads "Buy back on <buyOn>" or "Buy the direct plan on <buyOn>".
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Dated moves: picked by the family, re-sized at today's prices, hold their room"`

### Task 5: Add to my calendar

**Files:**
- Create: `src/ui/calendar.ts`, `src/ui/calendar.test.ts`
- Modify: `src/ui/screens/Plan.tsx` (button "Add to my calendar")

**Interfaces:**
- Consumes: moves with `date`/`buyOn` (Task 4), `lastSafeDay` (Task 2).
- Produces: `buildIcs(input: { moves: Move[]; nameOf: (id: string) => string; lastSafeDay: ISODate | null; yearEnd: ISODate }): string`

- [ ] **Step 1: Write failing tests:** output starts `BEGIN:VCALENDAR` and ends `END:VCALENDAR\r\n`, lines joined by CRLF; one `VEVENT` per dated step plus last safe day and year end; `UID` = `<moveId>-sell@harvesting` / `-buy@harvesting` (stable across calls); `DTSTART;TZID=Asia/Kolkata:20270215T093000`; a `VALARM` with `TRIGGER:PT0M`; **no** `₹`, digits of units or the word "units" in any `SUMMARY`; summary like "Asha: sell and buy back Nifty 50 Index Fund. Open Harvesting for today's units."; commas and semicolons escaped.
- [ ] **Step 2: Run** `npx vitest run src/ui/calendar.test.ts` → FAIL.
- [ ] **Step 3: Implement** and wire the button to download `harvesting-2026-27.ics` via a Blob URL.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add dated moves to the family's calendar"`

### Task 6: Marked done from the next import

**Files:**
- Create: `src/engine/detect.ts`, `src/engine/detect.test.ts`
- Modify: `src/ui/screens/Import.tsx` (after a successful import, append detected records), `src/ui/screens/Plan.tsx` ("Done, seen in your statement"), `src/ui/screens/Import.tsx` copy: "For shares, import your broker's tradebook."

**Interfaces:**
- Consumes: `RecommendationRecord` with `date` and `detected_done` (Task 4).
- Produces: `detectDone(input: { moves: Move[]; records: RecommendationRecord[]; datedMoves: DatedMove[]; newTxns: Txn[]; seasonStart: ISODate }): RecommendationRecord[]` (only new `detected_done` records).

- [ ] **Step 1: Write failing tests:** sell of same member+ISIN, units within ±5% of the latest sizing, 4 days after the date → detected; units 10% off both the latest sizing and the `in_plan` snapshot → not; 12 days after → not; no date picked and sale on 2027-02-03 with `seasonStart '2027-02-01'` → detected; switch needs a buy of `toIsin` too, else not; a move already `detected_done` is not recorded twice.
- [ ] **Step 2: Run** `npx vitest run src/engine/detect.test.ts` → FAIL.
- [ ] **Step 3: Implement**; Import screen calls it with the import's new txns and `seasonStart = '2027-02-01'` (from `rules` year: 1 Feb of the year the tax year ends).
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Mark moves done when the next statement shows them"`

### Task 7: Invite-only beta

**Files:**
- Create: `supabase/migrations/20261201000000_beta_invites.sql`
- Modify: `supabase/functions/_shared/family.ts` (+ test), `supabase/functions/family/index.ts`, `supabase/functions/_shared/admin.ts` (+ test), `supabase/functions/admin/index.ts`, `src/storage/admin.ts`, `src/storage/functions.ts`, `src/ui/screens/Admin.tsx`, `src/ui/App.tsx` (invite-only screen)

**Interfaces:**
- Produces: table `beta_invites (email text primary key check (email = lower(email)), invited_at timestamptz not null default now(), note text)`, RLS on, all revoked from `anon, authenticated`, seeded with nothing (the founder adds his own email in setup, step 5). `FamilyDb.isInvited(email: string): Promise<boolean>`; `handleFamily` request gains `email: string`; non-invited → `{ status: 403, json: { error: 'not_invited' } }`. Admin routes `GET …/admin/invites`, `POST …/admin/invites {email, note}`, `DELETE …/admin/invites {email}`; each change writes an `admin_reads`-style log row with reason `invite: <email>` / `uninvite: <email>` against the admin's own user id. Storage: `FamilyLoadError` kind `'not_invited'`.

- [ ] **Step 1: Write failing tests:** `handleFamily` GET/PUT/DELETE with `isInvited → false` → 403 `not_invited`, and the db is never read; email compared lower-cased. Admin handler: invite add/list/remove require admin; email normalised to lower case; bad email → 400.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared` → FAIL.
- [ ] **Step 3: Implement**; App shows "This beta is invite-only. Ask the person who invited you." with a sign-out button on `not_invited`. Admin screen: invite form and list.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 5: Founder step (recorded, not run by Claude):** push the migration, deploy `family` and `admin`, add his own email as the first invite, sign in on the live site to confirm. Add these to a new section of `docs/guides/beta-setup.md`.
- [ ] **Step 6: Commit** `git commit -m "Invite-only beta: invite list checked by the family function"`

**M1 review:** fresh reviewer on the whole branch against spec sections 5–6; fix important findings test-first.

---

## Milestone 2: season emails and beta totals

### Task 8: "Harvest season help" switch and the automatic-read log

**Files:**
- Create: `supabase/migrations/20261215000000_season.sql`
- Modify: `src/store.ts` (`AppState.alerts?: { seasonHelp: boolean }`), `src/ui/screens/Account.tsx`, `src/storage/supabase.ts` (read own `season_log`), `src/ui/screens/Home.tsx` (onboarding checklist item)

**Interfaces:**
- Produces: tables `season_log (id bigint identity pk, family_user_id uuid not null references auth.users on delete cascade, kind text not null check (kind in ('season_check','email_start','email_weekly','email_deadline')), on_date date not null, at timestamptz default now(), unique (family_user_id, kind, on_date))` with RLS "read own" like `admin_reads`; `season_stats (week date primary key, families int, room_usable bigint, room_used bigint, used_share_by_family numeric[], moves_shown int, moves_dated int, moves_done int, moves_detected int, families_with_detected int)` with RLS on and all revoked; column `families.season_help boolean not null default false`, written by the `family` function on every PUT from `state.alerts?.seasonHelp === true` (`FamilyDb.insert/updateIf` gain a `seasonHelp: boolean` parameter), so `alerts` can skip families with it off **without decrypting them**. `loadSeasonLog(): Promise<{ on_date: string; kind: string }[]>` in storage.
- Also modify: `supabase/functions/_shared/family.ts` (+ test), `supabase/functions/family/index.ts`.

- [ ] **Step 1: Write failing tests:** `handleFamily` PUT with `alerts.seasonHelp true` passes `seasonHelp true` to the db, and `false` when absent; `consent.test.ts`-style test that `seasonHelp` defaults to off in a fresh and a migrated `AppState`; the Account copy contains the spec's consent text verbatim: "From 1 Feb to 31 Mar, our server reads your family once a week to email you what's left to do, and adds your numbers, without names, to the beta's totals. Each read is listed below."
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (switch, "Automatic season checks" list beside "Who has looked at your data"). **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Harvest season help switch and automatic-read log"`

### Task 9: Season summary (pure)

**Files:**
- Create: `src/engine/seasonSummary.ts`, `src/engine/seasonSummary.test.ts`; export from `src/engine/index.ts`

**Interfaces:**
- Consumes: `FamilyView`, `RecommendationRecord[]`, `DatedMove[]`.
- Produces: `seasonSummary(view: FamilyView, state: { recommendations: RecommendationRecord[]; datedMoves: DatedMove[]; imports: { date: ISODate }[] }, asOf: ISODate, seasonStart: ISODate): { roomLeft: Paise; usable: Paise; used: Paise; movesWaiting: number; nextDate: ISODate | null; doneSinceWeek: number; shown: number; dated: number; done: number; detected: number; lastImport: ISODate | null; taxableGainsBooked: boolean }`

- [ ] **Step 1: Write failing tests** for the spec's usable-room definition: member with ₹1.25 L room and ₹50,000 harvestable gain, nothing used → `usable 50,000`, `used 0`; after a ₹30,000 LT sale on 2027-02-10 → `used 30,000`, `usable 50,000`; a member with no equity adds 0 to both; a sale on 2027-01-20 (before season start) is not `used`; `movesWaiting` excludes `noRoom` and done moves; `taxableGainsBooked` true when any member's tax on gains this year > 0.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS; `npm run build:engine` and `src/engine/bundle.test.ts` still PASS.
- [ ] **Step 5: Commit** `git commit -m "Season summary: usable room, room used, move counts"`

### Task 10: Email schedule and wording (pure)

**Files:**
- Create: `supabase/functions/_shared/seasonEmail.ts`, `supabase/functions/_shared/seasonEmail.test.ts`

**Interfaces:**
- Consumes: the `seasonSummary` result (Task 9), `lastSafeDay` (Task 2).
- Produces: `emailKindFor(date: ISODate, lastSafe: ISODate | null): 'email_start' | 'email_weekly' | 'email_deadline' | null` (start 1 Feb; deadline 1 Mar, 15 Mar, last safe day; weekly each Sunday 7 Feb–28 Mar; deadline wins over weekly; else null) and `renderEmail(kind, s: SeasonSummary, savedOn: ISODate, today: ISODate, appUrl: string): { subject: string; text: string } | null` (null when `roomLeft < 2_000_00` and `movesWaiting === 0`).

- [ ] **Step 1: Write failing tests:** `emailKindFor('2027-02-01')` → start; `'2027-02-07'` (Sunday) → weekly; `'2027-03-01'` → deadline; `'2027-03-15'` → deadline; last safe day → deadline; `'2027-02-08'` → null; `'2027-04-04'` → null. `renderEmail`: text contains "Based on what you last saved on"; contains exactly one `₹` figure; contains "Turn these off on the Account page"; 15 Mar text contains "check the 15 March advance tax instalment" only when `taxableGainsBooked`; `savedOn` 31+ days before today → text has the fresh-statement line ("Import this month's statements so the app can mark what's done. For shares, import your broker's tradebook.") and **no** `₹`; a fixture summary built from a family with members "Asha" and fund "Nifty 50 Index Fund" → text contains neither name.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Season email schedule and wording"`

### Task 11: The `alerts` function, email sender and cron

**Files:**
- Create: `supabase/functions/_shared/alerts.ts`, `supabase/functions/_shared/alerts.test.ts`, `supabase/functions/_shared/email.ts`, `supabase/functions/_shared/email.test.ts`, `supabase/functions/alerts/index.ts`, `supabase/migrations/20261215000100_season_cron.sql`, `docs/guides/beta-setup.md` (season email section)

**Interfaces:**
- Consumes: `openJson`/`familyAad` (`_shared/envelope.ts`), engine bundle (`computeFamily`, `seasonSummary`, `lastSafeDay`, `NSE_HOLIDAYS_2027`), `emailKindFor`, `renderEmail`.
- Produces:
  - `sendEmail(to: string, subject: string, text: string, deps: { apiKey: string; sender: string; fetch: typeof fetch }): Promise<void>` — `POST https://api.brevo.com/v3/smtp/email`, header `api-key`, body `{ sender: { email: sender, name: 'Harvesting' }, to: [{ email: to }], subject, textContent: text }`; throws on non-2xx.
  - `AlertsDb { optedIn(): Promise<{ userId: string; email: string; version: number; envelope: Envelope; updatedAt: string }[]>; logged(userId: string, kind: string, onDate: ISODate): Promise<boolean>; log(userId: string, kind: string, onDate: ISODate): Promise<boolean /* false on unique clash */>; saveStats(row: SeasonStatsRow): Promise<void> }`
  - `runAlerts(today: ISODate, deps: { db: AlertsDb; ring: KeyRing; prices: PriceFile; send: (to, subject, text) => Promise<void>; appUrl: string }): Promise<{ sent: number; checked: number; stats: boolean }>`
  - `optedIn()` reads `families` rows `where season_help` (Task 8) joined to `auth.users.email`; after decrypting, `runAlerts` also skips a family whose state says `alerts.seasonHelp !== true` (belt and braces).

- [ ] **Step 1: Write failing tests** (in-memory db, fake send):
  - Family with `season_help false` → never decrypted (ring spy count 0), no log row.
  - `'2027-02-07'` (Sunday): opted-in family → one send, one `email_weekly` log row (an email row is the read's log entry; no extra `season_check` row that day), and one `season_stats` row containing no user id.
  - `idempotent re-run`: second run the same day → 0 sends, 0 new rows.
  - Non-send weekday → 0 decrypts. Sunday 4 Apr 2027 (first Sunday of April) → one `season_check` row per opted-in family + stats, no email.
  - Send throws for one family → others still processed; no log row left for the failed one.
  - `sendEmail` posts the exact URL, header and body shape; non-2xx throws.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared` → FAIL.
- [ ] **Step 3: Implement.** `alerts/index.ts` refuses requests without header `x-alerts-secret` equal to env `ALERTS_SECRET`; fetches `<site>/prices/latest.json`; `today = todayISO()`. Log the row **before** sending (unique key prevents a double send if a run is retried); on send failure delete that row. Cron migration: `select cron.schedule('season-alerts', '30 5 * * *', $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_url'), headers := jsonb_build_object('x-alerts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_secret'))) $$);`
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Write founder setup** in `docs/guides/beta-setup.md`: create a Brevo free account, verify a sender address, check the free plan's daily limit (record it in the guide), set secrets `BREVO_API_KEY`, `ALERTS_SENDER`, `ALERTS_SECRET`, `APP_URL`; add `alerts_url` and `alerts_secret` to Vault; push migrations; `npm run build:engine`; deploy `alerts`; trigger once by hand with the secret and confirm an email to his own address.
- [ ] **Step 6: Commit** `git commit -m "Season alerts function: opt-in emails, logged reads, beta totals, daily cron"`

### Task 12: Season numbers on the admin screen

**Files:**
- Modify: `supabase/functions/_shared/admin.ts` (+ test), `supabase/functions/admin/index.ts`, `src/storage/admin.ts`, `src/ui/screens/Admin.tsx`

**Interfaces:**
- Produces: `GET …/admin/season` → `SeasonStatsRow[]` newest first (admin only, no per-family log needed: no family data). Admin screen table: week, families, usable room, used, share used (%), moves shown / dated / done / detected, families with a detected move; header line "Target: 60% of usable room used by 31 Mar".

- [ ] **Step 1: Write failing test:** non-admin → 403; admin → rows sorted by week desc.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Admin: weekly beta season numbers"`

**M2 review:** fresh reviewer on the branch against spec sections 1, 7 and 8, with Review Focus items 4 and the anti-goals (no names in email, never decrypted when off).

---

## Milestone 3: capital gains schedule

### Task 13: Capital gains schedule per member

**Files:**
- Create: `src/engine/cgSchedule.ts`, `src/engine/cgSchedule.test.ts`, `src/ui/csv.ts` (if no CSV helper exists)
- Modify: `src/engine/index.ts`, `src/ui/screens/Member.tsx` (section and "Download CSV")

**Interfaces:**
- Consumes: the realised gains `computeFamily` already builds per member (`Realised[]`, broker summaries, carried-forward losses).
- Produces: `cgSchedule(view: FamilyView, memberId: string): { sections: Array<{ key: 'equity_lt' | 'equity_st' | 'other_lt' | 'slab' | 'set_off' | 'business'; title: string; rows: CgRow[]; total: Paise }>; totalGain: Paise }`, where `CgRow = { isin: string; name: string; units: Qty; saleDate: ISODate; saleValue: Paise; cost: Paise; fmv2018?: Paise; gain: Paise }`; titles: "Equity long-term (112A)", "Equity short-term (111A)", "Other long-term", "Slab-taxed gains (debt and specified funds)", "Losses set off and carried forward", "Intraday and F&O (from your broker's report)". `scheduleCsv(s): string`.

- [ ] **Step 1: Write failing tests:** for each golden tax case in `tax.test.ts`/`engine.test.ts` and each of the 7 test families with sales, `Σ section totals` (excluding `set_off`, `business`) equals the member's computed gains for the year; a grandfathered lot row carries `fmv2018`; equity long-term rows are one per sale; CSV has a header row and Indian-format-free plain numbers (rupees with 2 decimals) so spreadsheets read them.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; Member page note verbatim: "The new Act's return forms for 2026-27 are not out yet (expected April–June 2027). Check the sections against the form, or give this to your CA."
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Capital gains schedule per member, with CSV download"`

**M3 review:** fresh whole-branch reviewer (Opus) before the PR; the founder checks one member's schedule against his CA's or broker's figures (spec success measure).
