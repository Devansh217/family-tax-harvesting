# Guided import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Import screen into a family table plus a per-member checklist that says which file to get next, what it unlocks, when to stop, what each added file did, and which files are wrong.

**Architecture:** A pure module `ui/importGuide.ts` derives everything (accounts, steps, completeness, stale lines, cushion line, wrong-file notes, success diff) from `AppState` + `FamilyView` on every render. Nothing new is stored. `ui/screens/Import.tsx` only draws what it returns; the file card moves to `ui/screens/ImportCard.tsx`.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest, Playwright (smoke). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-24-guided-import-design.md` (approved 24 Nov 2026). Read it with this plan; section numbers below (§n) refer to it.

## Global Constraints

- All of `docs/GUARDRAILS.md`. No engine change: `ui/importGuide.ts` imports from `engine/` and `store.ts` types only; nothing in `engine/` imports it (`boundaries.test.ts` must still pass).
- No new field in `AppState`, no `normalizeState` change, no migration.
- Money is integer paise; display only through `ui/format.ts` (`inr`, `inrShort`, `dateLabel`, `possessive`). Rupee thresholds: cushion line at total ≥ `4_000_00` paise; old-file line at ≥ 30 days.
- Synthetic fixtures only: names like Asha/Ravi, ISINs `INE000A01011`-style or `INE1`/`INF1`, made-up amounts.
- Copy: plain English, short sentences, estimates not advice; exact strings below where the spec fixes them.
- `today` is passed in (the app's `asOf`); never `new Date()` inside `importGuide.ts`.
- Each behaviour test fails first. Finish with `npm run typecheck`, `npx vitest run`, `npm run test:smoke` all passing (run from `prototype/`).

## Review Focus

1. **Removing an import** must un-tick its step and drop its success card; nothing may stay "done" from a removed file → Task 3 test "removing the P&L reopens its step".
2. **A member whose only file is a fund CAS or a demat CAS** (no broker account) must still get a sensible checklist, not an empty one or a crash → Task 3 test "MF CAS only".
3. **Account labels typed differently** ("Zerodha", " zerodha ", blank) must not split one account into two sections or merge a blank label with Zerodha → Task 1 test "labels".
4. **The success card after a file the engine ignores** (e.g. a Tax P&L added with "check only", or a stale holdings file) must say "unchanged", not show a fake improvement → Task 4 test "unchanged".
5. **Phone width:** the family table must not scroll sideways at 375 px → Task 5 smoke uses the existing `expectNoSideScroll`.

---

## File structure

- Create `prototype/src/ui/importGuide.ts`: types, broker step table, `memberAccounts`, `evidenceDate`, `usableShare`, `memberGuide`, `familyGuide`, `familyRow`, `guideSummary`, `successDiff`, `fileNotes`.
- Create `prototype/src/ui/importGuide.test.ts`: all unit tests, with a small local fixture builder that goes through `applyImport` so ids and sources are real.
- Create `prototype/src/ui/screens/ImportCard.tsx`: today's `ItemCard`, moved unchanged except the "Nothing new" line now comes from `fileNotes`.
- Modify `prototype/src/ui/screens/Import.tsx`: family table, member checklist, success card, file lists, "More options".
- Modify `prototype/src/styles.css` (or the stylesheet `Import.tsx` already uses; check `docs/DESIGN.md`): family table → stacked cards under 600 px, success card, progress bar with `prefers-reduced-motion`.
- Modify `prototype/e2e/smoke.spec.ts`: the import tests.
- Modify `docs/NEXT-WORK.md`: mark B1 built; note the B6 Coin and CAS-password items it fixes.

---

### Task 1: Accounts, evidence dates and completeness

**Files:**
- Create: `prototype/src/ui/importGuide.ts`
- Test: `prototype/src/ui/importGuide.test.ts`

**Interfaces:**
- Consumes: `AppState` (`store.ts`), `FamilyView`, `Holding` (`engine/family.ts`), `normAccount`, `TRIMMING_HOLDINGS_SOURCES` (`engine/openingLots.ts`), `countingSummaries` (`engine/family.ts`), `ISODate`, `Paise`, `QTY_SCALE` (`engine/types.ts`).
- Produces:
  ```ts
  export type GuideState = Pick<AppState, 'members' | 'txns' | 'positions' | 'imports' | 'brokerSummaries'>;
  export type Broker = 'Zerodha' | 'Angel One' | 'Other' | 'Mutual funds';
  export interface AccountRef { label: string; key: string /* normAccount(label) */; broker: Broker }
  export function brokerOf(label: string, formats: string[]): Broker;
  export function memberAccounts(state: GuideState, memberId: string): AccountRef[];   // sorted: Zerodha, Angel One, Other, Mutual funds; then label
  export function evidenceDate(state: GuideState, memberId: string, accountKey: string): ISODate | null;
  export function usableShare(fam: Pick<FamilyView, 'members' | 'positions' | 'securities'>, memberId: string): { usable: Paise; total: Paise } ;
  export const pct = (s: { usable: Paise; total: Paise }): number | null; // Math.round(usable*100/total), null when total 0
  ```

Rules to implement:
- `brokerOf`: test `label + ' ' + formats.join(' ')` lowercased: `/zerodha|console|kite/` → Zerodha; `/angel/` → Angel One; label `MF folios` or format starting `Mutual fund CAS` → Mutual funds; else Other. (`guessAccount` in `store.ts` produces the labels.)
- `memberAccounts`: one entry per distinct `normAccount(account)` over the member's `txns`, `positions` and `brokerSummaries`. Blank label (`''`) is its own account with broker from formats (usually Other). Formats come from the `imports` whose ids appear on that account's rows.
- `evidenceDate` (spec §7 "Old data overall"): returns `newestEvidence(state).get(accountKey(memberId, account)) ?? null` from `engine/freshness.ts` (old-data plan C1, Task 1). Don't define the date a second time. If `freshness.ts` doesn't exist yet, build it here exactly as the old-data plan's Task 1 specifies (`docs/superpowers/plans/2026-11-24-plan-old-data.md`), with all of that task's tests. Don't restate or narrow its definition here.
- `usableShare` (spec §5): over `fam.members.find(memberId).holdings`, sum `lot.value` where `lot.value != null`; usable when `lot.certain && holding.taxType !== 'check'`. Add to `total` only (not usable) the unexplained units: for each of the member's `fam.positions` whose source is **not** in `TRIMMING_HOLDINGS_SOURCES` and has `qty`, `max(0, qty − holding.qty)` × price (`fam.securities.get(isin)?.price ?? holding.price ?? 0`) ÷ `QTY_SCALE`, rounded. Same logic as `unexplained` in `ui/plan.ts:73`; extract it there into an exported `unexplainedValue(fam, memberId, isin, positionQty)` and use it in both places (no behaviour change to `planGaps`).

- [ ] **Step 1: Write the failing tests**

Fixture builder at the top of the test file (used by every task):
```ts
const ASOF = '2026-11-24';
const zHoldings = (asOf: string, rows: Array<[isin: string, qty: number, lt: number, avg: number, close: number]>): ParseResult => ({
  format: 'Zerodha holdings', txns: [], skipped: 0, warnings: [],
  prices: rows.map(([isin, qty, lt, avg, close]) => ({ isin, name: isin, price: close * 100, priceDate: asOf, qty: qty * QTY_SCALE, ltQty: lt * QTY_SCALE, cost: avg * qty * 100 })),
});
const tradebook = (rows: Array<[isin: string, date: string, side: 'buy' | 'sell', qty: number, price: number]>): ParseResult => ({
  format: 'Trade history', skipped: 0, warnings: [], prices: [],
  txns: rows.map(([isin, date, side, qty, price]) => ({ isin, name: isin, date, side, qty: qty * QTY_SCALE, amount: qty * price * 100 })),
});
const zPnl = (from: string, to: string): ParseResult => ({ format: `Zerodha Tax P&L · ${from} to ${to}`, txns: [], prices: [], skipped: 0, warnings: [],
  brokerSummary: { from, to, /* other BrokerSummary fields null/0 as the type needs */ } as BrokerSummary });
const family = (...steps: Array<(s: AppState) => AppState>) => steps.reduce((s, f) => f(s), { ...emptyState(), members: [asha, ravi] });
const add = (m: string, file: string, r: ParseResult, account: string) => (s: AppState) => applyImport(s, m, file, r, { account });
const fam = (s: AppState) => computeFamily(s, ASOF, FY_2026_27);
```

Tests (`describe('accounts and completeness')`):
- `labels`: Asha has txns labelled `'Zerodha'` and positions labelled `' zerodha '`, Ravi has a blank-label tradebook → `memberAccounts(s,'a')` is one account `{ broker: 'Zerodha' }`; `memberAccounts(s,'r')` is one account with `label: ''`, `broker: 'Other'`.
- `two brokers`: Asha with a Zerodha holdings file and an Angel trade history (`format: 'Trade history · Angel One · …'`, account `'Angel One'`) → brokers `['Zerodha', 'Angel One']`.
- `evidence date`: holdings `asOf` 2026-10-01, last tradebook trade 2026-10-20, P&L to 2026-11-02 → `'2026-11-02'`; with no files → `null`.
- `completeness`: hand-checked — Asha holds INE1: 100 units, holdings file 100 long-term @ avg ₹100, close ₹150 (value ₹15,000, approx → usable); INE2: tradebook buy 10 on 2026-06-01 @ ₹100 plus holdings 30 units, 0 long-term, close ₹100 (10 certain = ₹1,000 usable; 20 guessed = ₹2,000 not usable) → `usableShare` = `{ usable: 16_000_00, total: 18_000_00 }`, `pct` = 89.
- `unexplained counts against`: Ravi with an Angel fund holdings position (source `'Angel One fund holdings'`) of 50 units INF9 at ₹100 and a CAS-less history of 20 units → total includes ₹3,000 unexplained, usable excludes it.
- `check funds and unpriced lots`: a `taxType: 'check'` fund lot is in total, not usable; a lot with `value: null` is in neither.

- [ ] **Step 2: Run to verify they fail**

Run (from `prototype/`): `npx vitest run src/ui/importGuide.test.ts`
Expected: FAIL, module `./importGuide` not found.

- [ ] **Step 3: Implement the five exports above and extract `unexplainedValue` in `ui/plan.ts`**

- [ ] **Step 4: Run to verify they pass, and the plan tests still pass**

Run: `npx vitest run src/ui/importGuide.test.ts src/ui/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prototype/src/ui/importGuide.ts prototype/src/ui/importGuide.test.ts prototype/src/ui/plan.ts
git commit -m "Guided import: accounts, evidence dates and completeness"
```

---

### Task 2: Steps for a Zerodha account

**Files:**
- Modify: `prototype/src/ui/importGuide.ts`
- Test: `prototype/src/ui/importGuide.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `decidingFiles` (`engine/openingLots.ts`); `fam.holdingsNotes.corporateActions`; `fam.rules` (`start`, `end`, `label`).
- Produces:
  ```ts
  export type StepKind = 'holdings' | 'pnl' | 'tradebook' | 'fund_tradebook' | 'cas';
  export type StepStatus = 'done' | 'next' | 'later' | 'unreadable' | 'suggestion';
  export interface GuideStep {
    kind: StepKind; status: StepStatus;
    title: string;            // e.g. 'Holdings file', 'Tax P&L, FY 2026-27', 'Tradebook, FY 2025-26'
    where: string;            // download path, per broker
    unlocks: string;          // shown when next/later
    doneLine?: string;        // shown when done
    fy?: string;              // 'FY 2025-26' for tradebook steps
  }
  export interface AccountGuide extends AccountRef { steps: GuideStep[]; newest: ISODate | null; stale: boolean; notes: string[] }
  export function accountGuide(state: GuideState, fam: FamilyView, memberId: string, acct: AccountRef, today: ISODate): AccountGuide;
  export const fyOf: (d: ISODate) => string; // '2025-06-01' → 'FY 2025-26'
  ```

Status rule for every account: steps are built in order; each is `done`, `unreadable` or `suggestion` by its own test; the **first** remaining one is `next`, the rest `later`.

Zerodha steps (spec §3):
1. `holdings` — done when `decidingFiles(fam.positions)` has `${memberId}|${acct.key}`. `doneLine`: `Zerodha holdings · as on ${dateLabel(asOf)} · ${n} shares and ${m} funds, ${inrShort(value)}` (omit a zero part). `where`: `Console → Portfolio → Holdings → Download (.xlsx)`. `unlocks`: `What's held today, long-term units and average cost: enough for a first plan.`
2. `pnl` — done when a `countingSummaries` row for this member+account overlaps `[rules.start, rules.end]`. Title `Tax P&L, ${rules.label}`. `where`: `Console → Reports → Tax P&L → ${rules.label} → Download (.xlsx)`. `unlocks`: `Exact gains booked this year, so the room matches Zerodha's figures.` `doneLine`: `Tax P&L · ${dateLabel(from)} – ${dateLabel(to)}`.
3. `tradebook` — window = tax years of `asOf − 12 months` and of `asOf` (the deciding file's `asOf`; `today` when none), newest first. A year is **in** when the account has a `Trade history` txn dated in it, or a txn in an older year. Fixable gap = this account's share holdings (`!isin.startsWith('INF')`) with lots `!certain && !approx`, ISIN not in `corporateActions` for this account, lot date ≥ `2018-02-01`. One tradebook step for the newest window year not in, only while a fixable gap exists; `unlocks`: `Could date up to ${n} shares (${inr(v)}) bought in the last year.` Otherwise no tradebook step; `doneLine` for the tradebook row (shown as a done step when any tradebook is in): `Tradebooks · ${years.join(', ')}`.
   - If the window years are all in and undated share lots remain (same filter minus the window condition), add to `notes`: `${n} shares (${inr(v)}) aren't in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves.`
4. `fund_tradebook` — only while fund holdings (`INF`) in the account have `!certain` lots. Year = year before the oldest MF tradebook trade in the account (`INF` txns from `Trade history`), or `fyOf(today)` when none; never older than `FY 2017-18` (then no step). Title `Fund tradebook (Coin), ${fy}`. `where`: `Console → Reports → Tradebook → segment MF → ${fy}`. `unlocks`: `Dates ${n} funds (${inr(v)}) so they can get moves.`

Stale (spec §7): `newest = evidenceDate(...)`; `stale = newest != null && daysBetween(newest, today) >= 30`. When stale, the holdings step's status becomes `next` (all others shift to `later` if they were next), `title` `Holdings file: refresh`, `unlocks` `Download today's: your newest data is from ${dateLabel(newest)}.`, and `notes` gets `Newest data from ${dateLabel(newest)}.` The done line of the old file stays in `doneLine`.

- [ ] **Step 1: Write the failing tests** (`describe('Zerodha steps')`)
- `holdings in → P&L next`: Asha, Zerodha holdings as on 2026-11-20 (2 shares, both fully long-term) → steps `[holdings done, pnl next]`; `doneLine` matches `/as on 20 Nov 2026 · 2 shares/`; no tradebook step (no fixable gap).
- `P&L in → tradebook only while gaps remain`: add holdings row with 30 units, 0 long-term → after P&L, steps kinds `['holdings','pnl','tradebook']`, tradebook `status: 'next'`, `fy: 'FY 2026-27'`, unlocks `/Could date up to 1 share \(₹2,000\)/` (singular for 1, plural otherwise).
- `tradebook years walk back once`: with a Trade history txn in 2026-07 → next tradebook step `fy: 'FY 2025-26'`; with one also in 2025-09 → no tradebook step, `notes` contains the "possibly a bonus, IPO allotment or transfer in" line when undated lots remain.
- `corporate-action credit is not a gap`: a bonus-shaped file (history 10 @ ₹1,000; file 20 @ avg ₹500) → no tradebook step from that ISIN.
- `Coin funds`: Zerodha holdings with INF1 1,000 units (no long-term column) → `fund_tradebook` step `fy: 'FY 2026-27'`; with an MF trade in 2018-05 → `FY 2017-18`; with one in 2017-06 → no step.
- `stale at 30 days, not 29`: newest evidence 2026-10-25 (30 days before ASOF) → `stale: true`, holdings `next`, notes include `Newest data from 25 Oct 2026.`; 2026-10-26 → `stale: false`.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/ui/importGuide.test.ts` → FAIL (`accountGuide` not exported).
- [ ] **Step 3: Implement `accountGuide` for Zerodha and `fyOf`** (keep the per-broker step builders in one `STEPS: Record<Broker, (ctx) => GuideStep[]>` table so Task 3 adds entries).
- [ ] **Step 4: Run to verify they pass** — same command → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Guided import: Zerodha steps, tradebook window, stale line"`

---

### Task 3: Angel One, Other, Mutual funds; member and family guide

**Files:**
- Modify: `prototype/src/ui/importGuide.ts`
- Test: `prototype/src/ui/importGuide.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `planGaps`, `PlanGap` (`ui/plan.ts`); `APPROX_MARGIN` (`engine/openingLots.ts`); `cushionNudge` (`ui/plan.ts`) for the year only.
- Produces:
  ```ts
  export interface MemberGuide {
    memberId: string; name: string;
    first: boolean;                 // nothing imported: show the first-step card (Zerodha + Angel + other instructions)
    accounts: AccountGuide[];
    usable: { usable: Paise; total: Paise }; pct: number | null;
    done: boolean;
    cushion: Array<{ account: string; broker: Broker; fy: string | null; rupees: Paise }>;  // only when member total ≥ 4_000_00
    otherGaps: PlanGap[];           // planGaps for this member, minus keys the steps already cover: no_holdings, shares_no_dates, funds_no_dates
  }
  export interface FamilyGuide { members: MemberGuide[]; pct: number | null }
  export function memberGuide(state: GuideState, fam: FamilyView, memberId: string, today: ISODate): MemberGuide;
  export function familyGuide(state: GuideState, fam: FamilyView, today: ISODate): FamilyGuide;
  export interface FamilyRow { holdings: string; pnl: string; tradebooks: string; usable: string }
  export function familyRow(g: MemberGuide): FamilyRow;
  ```

Steps:
- **Angel One:** `holdings` — done when the account has an `Angel One fund holdings` position; `doneLine` `Funds read. Shares and SGBs in this file aren't read yet: they come from your tradebooks for now.`; `where` `Open "Your Holding Details" with its password, save a copy as .xlsx, import the copy.` · `pnl` — always `unreadable`, `unlocks` `Angel One's tax P&L can't be read yet. Sales with unknown buy dates are counted the safe way.` · `tradebook` — `suggestion`, title `Trade history, every year`, `where` `Reports → Trade history (Excel), one per tax year`, `unlocks` `Back to the year of your first purchase. In: ${years}.`. Plus `notes` `Angel shares are counted from your tradebooks only until Angel's holdings file can be read.` when the account has share txns.
- **Other:** `holdings` done when the account has any position; `where` `Your broker's holdings export, or the NSDL / CDSL CAS.` · `tradebook` `suggestion` as Angel's.
- **Mutual funds:** one `cas` step, done when a `Mutual fund CAS` / `Combined CAS` import exists for the member; `where` `MF Central, CAMS or KFintech: the detailed statement from your first purchase to today. It comes by email as a PDF.`; password hint for the card: `Use the password you chose when you asked for the statement.`
- `done` = every account has no `next` step (only `done`, `unreadable`, `suggestion`), and no stale account.
- `cushion`: over open `fam.moves` of this member (`move.kind === 'gift' ? move.fromId : move.memberId`) with `move.approx && !move.noRoom`: per account sum `|gain| × APPROX_MARGIN` (`loss` for `harvest_loss`); member total rounded to ₹100; if ≥ `4_000_00`, one entry per account with its own sum rounded to ₹100 and `fy` = `cushionNudge`'s year for that account (compute via `fam.tradebookFrom`, the same as `cushionNudge`), else `[]`. Shown only when `done`.
- `familyRow` words (spec §1): holdings `Start` (first) / `✓ ${dateLabel(asOf,false)}` / `Funds only` (Angel) / `Next` / `Refresh`; pnl `✓` / `Next` / `Can't read yet` / `—`; tradebooks `✓ ${n} years` / `Next` / `Optional` / `—`; usable `${pct}%` or `—`. With several accounts, show the account that needs the most (next > refresh > unreadable > done).

- [ ] **Step 1: Write the failing tests** (`describe('member and family guide')`)
- `first step`: Ravi with nothing → `first: true`, `accounts: []`, `pct: null`, `familyRow` `{ holdings: 'Start', usable: '—' }`.
- `Angel never blocks done`: Ravi with Angel fund holdings + one Angel trade history → statuses `['done','unreadable','suggestion']`, `done: true`, notes include the Angel shares line.
- `two brokers, two sections`.
- `MF CAS only`: Asha with only a `Mutual fund CAS (CAMS / KFintech)` import → one `Mutual funds` account, `cas` done, `done: true`.
- `removing the P&L reopens its step`: build with P&L, `removeImport` it → pnl `next` again.
- `cushion at ₹4,000, not ₹3,900`: synthetic family whose approx harvest gain is ₹40,000 → `cushion[0].rupees === 4_000_00`; gain ₹39,000 → `cushion` empty. (Margin is 0.1; check `fam.moves` holds the expected approx move first.)
- `order independence`: files `[holdings, pnl, tradebook 2026, tradebook 2025, Angel fund holdings]` applied in all 120 permutations give `JSON.stringify(familyGuide(...))` equal to the first (strip nothing: no ids or timestamps are in the guide — if any are, that's a bug).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/ui/importGuide.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three broker entries, `memberGuide`, `familyGuide`, `familyRow`.
- [ ] **Step 4: Run to verify they pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Guided import: Angel One, other brokers, fund CAS, member and family guide"`

---

### Task 4: Wrong-file notes and the success diff

**Files:**
- Modify: `prototype/src/ui/importGuide.ts`
- Test: `prototype/src/ui/importGuide.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `importAddedNothing` (`store.ts`); `fam.members[].plan` / `roomAfterPlan` for room (use the same figure the member page shows as "tax-free room left": `MemberView.roomAfterPlan`); `fam.holdingsNotes.staleFiles`.
- Produces:
  ```ts
  export interface GuideSummary { pct: number | null; room: Paise; bookedLt: Paise; bookedSt: Paise; undatedShares: number; undatedFunds: number; stepsDone: string[] /* `${accountKey}:${kind}` */ }
  export function guideSummary(state: GuideState, fam: FamilyView, memberId: string, today: ISODate): GuideSummary;
  export interface Success { read: string; changes: string[]; pctFrom: number | null; pctTo: number | null; unchanged: boolean }
  export function successDiff(before: GuideSummary, after: GuideSummary, read: string): Success;
  export function readLine(r: ParseResult): string;    // spec §6 "what was read", one line by kind
  export function fileNotes(before: GuideState, after: GuideState, importId: string, famAfter: FamilyView, today: ISODate): string[];
  ```

`fileNotes` checks (spec §7), in this order, each producing the exact text:
- same file: `importAddedNothing(before, after)` and no `brokerSummary` added → `Same as ${earlier.fileName} you added on ${dateLabel(earlier.at.slice(0,10))}. Nothing new was added.` where `earlier` = the import that owns the matching txn ids or positions in `before` (first match); if none can be named, `Nothing new: these trades are already in.`
- older holdings file: new import's holdings positions have `asOf` < the account's deciding file `asOf` → `This holdings file is from ${d}. You already have one from ${d2}, so this one changes nothing. Shares sold since ${d} won't come back.`
- old sole file: the new import is the deciding file and (`today − asOf ≥ 30` days or it is in `staleFiles`) → `This holdings file is from ${d} and ${stale ? "you've traded since" : `it's ${months} months old`}. Download today's from ${where}.` (months = whole months, min 1).
- last year's P&L: new summary `to < rules.start` → `This is the ${fyOf(to)} tax P&L. It's kept, but this year's room needs ${rules.label}, from 1 Apr ${startYear} to today.`
- gap year: after a tradebook import, the account's tradebook years (by trade date) have a missing year between oldest and newest → `No trades from ${fy} are in. If you traded that year, add its tradebook.` (one per missing year)
- missing current year: account has tradebook years but none is `rules.label`, and has a P&L or holdings file dated in this year → `This year's tradebook isn't in, so trades since 1 Apr come only from ${hasPnl ? 'the tax P&L' : 'the holdings file'}.`

`successDiff`: `changes` in this order, only when different: `Moves use ${a}% → ${b}%`; `Tax-free room left ${inrShort(a)} → ${inrShort(b)}` (+ `, now matching ${broker}'s figures` when the P&L step turned done); `${n} undated shares now dated` / funds. `unchanged` when `changes` is empty; then the card says `Read. Your plan is unchanged by this file.`

- [ ] **Step 1: Write the failing tests** (`describe('wrong files')` and `describe('success')`): one test per `fileNotes` case above with its exact string, plus: duplicate names the earlier file; a fresh file today gives `[]`; `unchanged` for a Tax P&L added check-only when the room doesn't move; `Moves use 67% → 100%` after a tradebook dates the guessed lots (hand-check the two percentages in a comment); `readLine` for each of holdings, P&L, tradebook, CAS.
- [ ] **Step 2: Run to verify they fail** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Guided import: wrong-file notes and success diff"`

---

### Task 5: The Import screen

**Files:**
- Create: `prototype/src/ui/screens/ImportCard.tsx` (move `ItemCard`, `Item`, `resultOf` out of `Import.tsx`)
- Modify: `prototype/src/ui/screens/Import.tsx`
- Modify: the app stylesheet
- Modify: `prototype/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `familyGuide`, `memberGuide`, `familyRow`, `guideSummary`, `successDiff`, `readLine`, `fileNotes` (Tasks 1–4); `useApp()` (`state`, `update`, `toast`, `go`, `asOf`, `fam`); `importHref`.
- Produces: the screen. Routes unchanged: `#import` → family table, `#import-<id>` → checklist (`Import({ memberId })`).

Behaviour (spec §1, §6, §7):
- No `memberId`: `<h1>Import statements</h1>`, a table (`<table>` with row `<button>`s, `aria-label` `${name}: open checklist`) using `familyRow`; under it `Moves use ${pct}% of the family's holdings by value` and a primary button `Stop here, show my plan` (`go('plan')`); then "All files" (today's "Imported so far" list with Remove). Sample/empty states unchanged.
- With `memberId`: `<h1>Import statements</h1>`, `← Family` link (`#import`), `<h2>${name}</h2>`; success card (`role="status"`, green, `readLine` + `changes`, bar from `pctFrom` to `pctTo`) when present; file cards being read; then per account an `<h3>` with the broker and label, its `notes` (amber when the line starts "Newest data from", calm otherwise), and its steps: done collapsed with ✓ + `doneLine`; next open with `title`, `where`, `unlocks` and a drop zone (same `addFiles` for all zones); later greyed with `unlocks`; unreadable and suggestion as quiet lines. `first` → one card with Zerodha, Angel One and other instructions side by side and a drop zone. Then `cushion` lines (`Optional: the ${fy ?? 'older'} tradebook from ${broker} would free about ${inr(rupees)} more room.`), `otherGaps` (text + link), the completeness line, `Stop here, show my plan`, `More options` (`<details>`: paste rows; the opening-date checkbox), and `Files for ${name}`.
- On Add: capture `guideSummary` before (from the current `fam`), apply, then after the app recomputes (a `useEffect` on `fam` while a pending add is set) compute `successDiff` and `fileNotes`; notes go on that file's card (amber), the success card goes on top unless every note says it changed nothing. Toast: `Read and added to ${name}`.
- Remove the `GUIDE` constant and the member `<select>`.
- CSS: family table becomes stacked cards below 600 px; success bar `transition: width .6s` inside `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 1: Update the smoke tests first (failing)**
  - Replace the "same tradebook twice" test: from the family table click `Asha`-equivalent member row (the test creates its own family: after "Start my own family" the first member exists; read its name from the table), add `tradebook-a.csv`, expect `role=status` with text `/Read: .*trades/`… then add `tradebook-b.csv`, expect the card note `/^Same as tradebook-a.csv you added on /`. Keep `expectNoSideScroll`.
  - New: `#import` shows a table with one row per member, the "Stop here, show my plan" button navigates to `#plan`; at 375 px width `expectNoSideScroll` holds.
  - Run: `npm run test:smoke -- -g "import"` → FAIL.
- [ ] **Step 2: Build the screen and move `ItemCard`.**
- [ ] **Step 3: Run** `npm run typecheck && npx vitest run && npm run test:smoke` → all PASS.
- [ ] **Step 4: Browser check** (dev server via the preview tools, `.claude/launch.json`): start your own family, add two members; import synthetic Zerodha holdings (dated 60 days ago) for one — see "Newest data from" and the old-file note; import a synthetic Tax P&L — see the success card with room change; import the same file again — see "Same as …"; open the family table at 375 px. Take screenshots for the PR.
- [ ] **Step 5: Commit** — `git commit -m "Guided import: family table and member checklist on the Import screen"`

---

### Task 6: Docs, fresh-run validation, PR

**Files:**
- Modify: `docs/NEXT-WORK.md` (B1 → built, with the branch; findings rows 1 and 2 updated; B6 Coin and CAS-password items → fixed by the guide)

- [ ] **Step 1:** Re-read `docs/fresh-run-notes.md` points 1, 2, 9 and the founder rules; write in the PR text, per point, what now handles it, and that point 2's "no moves on months-old evidence" is the separate Plan session.
- [ ] **Step 2:** Run the private check if real files are present (`data/private/`, counts only): `npx tsx scripts/check-private.ts` — expect it still passes; report counts only.
- [ ] **Step 3:** Commit docs, push the branch, open the PR (body via the `pr` skill), run the `guardrail-reviewer` agent on it, fix blocking findings, and put its verified findings in the PR.
