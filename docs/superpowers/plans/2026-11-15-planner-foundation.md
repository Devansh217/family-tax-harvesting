# Planner Foundation Implementation Plan

**Status (16 Nov 2026): ready; building.** Checked against all ten research notes and the founder's 15–16 Nov decisions. Changes from that check: Task 0 (architecture), the ₹12 L-aware harvest room in Task 5, small-savings rates with a date and EPF in Task 9, and the gift-to-parent warning in Task 9. Everything else in the research belongs to the beta and full-planner projects.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every holding taxed under its real treatment, a "what it brings home" comparison across family members, and the member profile and shared model that later projects build on.

**Architecture:** Extend the existing pure-TypeScript engine in `prototype/src/engine`. One function, `taxForYear`, computes a member's tax for a year; harvesting, "brings home" and every later feature call it. Fund tax types come from AMFI's category headings, which the nightly price job already downloads. The saved family stays one document (browser + Supabase `family_data`); splitting it is the separate "secure storage" project.

**Tech Stack:** TypeScript 5.8, React 18, Vite 6, Vitest 3. Run everything from `prototype/`: `npm test`, `npm run typecheck`.

**Spec:** `docs/superpowers/specs/2026-11-15-planner-foundation-design.md` (read it first). Research behind the figures: `docs/research/2026-11-15-family-financial-planning.md`.

## Global Constraints

- Money is integer paise (`Paise`), quantities are units × `QTY_SCALE`, dates are ISO `YYYY-MM-DD`. Round tax to the rupee only at the end.
- The engine (`src/engine/**`) stays pure: no React, DOM, `localStorage`, `fetch`, Supabase, Node built-ins or randomness, so the same code runs in the browser, in server functions and later in the phone apps. Task 0's boundary test enforces it.
- Family data reaches Supabase only through `src/storage/` (architecture design, 16 Nov 2026).
- FY 2026-27 values: equity STCG 20% (s.196); equity LTCG 12.5% above ₹1,25,000 (s.198); other long-term 12.5% with no exemption; cess 4%; new-regime nil band ₹4 L, rebate up to ₹60,000 if total income ≤ ₹12 L (s.156); old-regime nil band ₹2.5 L / ₹3 L (60+) / ₹5 L (80+), rebate up to ₹12,500 if total ≤ ₹5 L; standard deduction on salary and pension ₹75,000 new, ₹50,000 old (s.19); senior deposit-interest deduction ₹50,000, old regime only (s.153); rent taxed after a 30% deduction; specified-fund cutoff 1 April 2023; holding periods 12 months (equity, listed other) and 24 months (unlisted other).
- Tax rules, rates, category mappings and assumed returns are data in `TaxRules` / `categories.ts`, never inline in logic.
- Never store a full PAN: `panLast4` only. Statements are parsed in the browser and never uploaded.
- UI copy: plain English, short sentences, Indian number format (`₹1.25 L`). Assumed returns are always labelled "assumed".
- Every existing test keeps passing. Where a task changes an existing test's fixture shape (e.g. `kind` → `taxType`), update the fixture, not the expected figure.

## Review Focus

1. **A family saved before this change** (old `kind`, `otherIncome`, `incomeBand`, `done` keys without a year) must load and show the same tax figures for an equity-only family. Test in Task 4.
2. **The funds file fails to load or lacks an ISIN.** Funds show "check", share harvesting still works, nothing crashes. Test in Task 2.
3. **A member with no income entered** keeps today's meaning: unknown income gives no basic-exemption ("bonus") room, and trading profit is taxed at 30%. `income: undefined` (unknown) is not the same as `income: []` (none). Test in Task 5.
4. **Member links that disagree or point at a deleted member** (spouse linked on one side only, parent id no longer in the family). Treat a one-sided spouse link as spouse; ignore ids that are not in the family. Test in Task 6.
5. **"Brings home" with a nonsense input** (amount ≤ 0, period under 3 months or over 40 years, return below −50% or above 50%). Return an error result naming the field; never NaN in the table. Test in Task 9.

---

### Task 0: Module boundaries, storage behind one interface, engine runs outside the browser

From `docs/superpowers/specs/2026-11-16-architecture-design.md` (read it first). No behaviour changes: the app works exactly as before.

**Files:**
- Create: `src/storage/index.ts` (`FamilyStore`, `familyStore`), `src/storage/supabase.ts` (`supabaseFamilyStore`, plus `loadProfile` / `saveProfile` moved from `cloud.ts`)
- Create: `src/engine/index.ts` (re-exports the engine's public API)
- Modify: `src/engine/dates.ts` (`todayISO` in India time)
- Create: `scripts/build-engine.ts` (bundles `src/engine/index.ts` to `dist-engine/engine.js`, one ESM file, no external imports), `package.json` script `build:engine`
- Modify: `src/cloud.ts` (keeps only the Supabase client, sign-in, sign-out, password reset, `namesFromLogin`, `friendly`), `src/ui/useCloud.ts`, `src/ui/screens/Account.tsx` (data calls go through `familyStore` and `src/storage`), `.gitignore` (`dist-engine/`)
- Test: `src/boundaries.test.ts`, `src/engine/bundle.test.ts`, existing `src/cloud.test.ts` (move data-function tests to `src/storage/supabase.test.ts`)

**Interfaces:**
- Produces:
  - `interface FamilyStore { load(userId: string): Promise<CloudFamily | null>; save(userId: string, state: AppState, knownVersion: number | null): Promise<number | 'conflict'>; remove(userId: string): Promise<void> }`; `CloudFamily` moves to `src/storage/index.ts`.
  - `familyStore: FamilyStore` (today `supabaseFamilyStore`, with the bodies of `loadFamily`, `saveFamily`, `deleteFamily` unchanged).
  - `src/engine/index.ts` exports everything the UI and later server functions import from the engine; UI may keep importing individual engine files.
  - `todayISO(now: Date = new Date()): ISODate` in `src/engine/dates.ts`: the calendar date at UTC+5:30, not the machine's local time.

- [ ] **Step 1: Write the failing tests.** `boundaries.test.ts` reads every non-test `.ts`/`.tsx` file under `src/` and checks its `import … from '…'` paths:
  - files in `src/engine/` import only from `src/engine/` (and `vitest` in tests);
  - files in `src/parsers/` and `src/prices/` import from `src/engine/` with `import type` only, or from each other;
  - no file outside `src/cloud.ts` and `src/storage/` imports `@supabase/supabase-js`;
  - no file outside `src/storage/` calls `supabase.from(` (sign-in calls on `supabase.auth` stay allowed in `cloud.ts` and `useCloud.ts`);
  - no file in `src/engine/` mentions `window`, `document`, `localStorage`, `fetch(`, `Math.random` or `crypto.`, and `new Date(` appears only in `todayISO`.

  `bundle.test.ts` runs `npm run build:engine` once, dynamically imports `dist-engine/engine.js`, runs one existing golden case from `engine.test.ts` through both the bundle and the source engine, and expects identical results.

  In `engine.test.ts`: `todayISO` returns the date **in India** whatever the machine's time zone. A server runs in UTC, and between midnight and 5:30 am IST a local-time date would be yesterday, which would misdate 31 March alerts. Test with a fixed instant: `todayISO(new Date('2027-03-30T19:00:00Z'))` → `'2027-03-31'` (00:30 IST).
- [ ] **Step 2:** `npm test` → `boundaries.test.ts` FAILS on `useCloud.ts` and `Account.tsx` (data calls through `cloud.ts`); `bundle.test.ts` FAILS (no bundle).
- [ ] **Step 3:** Create `src/storage/`, move the data functions, update `useCloud.ts` and `Account.tsx` to use `familyStore` and `src/storage` profile functions. Create `src/engine/index.ts` and `scripts/build-engine.ts` (Vite library mode or esbuild, whichever adds no new dependency; target `es2022`, format `esm`).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → all pass. Then sign in on the dev server (`fasal-prototype`, port 5199) with a test account, change a member's name, reload, and see it saved.
- [ ] **Step 5:** Commit: `git commit -am "Storage behind one interface; module boundary test; engine bundle"`

### Task 1: Tax types replace asset kinds

**Files:**
- Modify: `src/engine/types.ts` (Security, Realised; remove `AssetKind`)
- Modify: `src/engine/rules.ts` (`roundTripCost`, new rule fields)
- Modify: `src/engine/ledger.ts`, `src/engine/family.ts`, `src/parsers/common.ts`, `src/parsers/*.ts`, `src/reconcile.ts`, `src/store.ts`, `src/sample.ts`, `src/ui/**` (every use of `.kind` on a security, `'equity_mf'`, `kindFromIsin`)
- Test: `src/engine/engine.test.ts`, `src/engine/family.test.ts`, `src/parsers/parsers.test.ts`

**Interfaces:**
- Produces:
  - `type TaxType = 'equity' | 'slab' | 'other_lt' | 'interest' | 'exempt' | 'check'`
  - `Security` gains `taxType: TaxType`, `listed: boolean`, `taxTypeSource?: 'share' | 'amfi' | 'override' | 'user'`, `category?: string`, `plan?: 'direct' | 'regular'`, `option?: 'growth' | 'idcw'`, `distributor?: string`; loses `kind`.
  - `Realised` gains `taxType: TaxType`.
  - `classifyByIsin(isin: string): Pick<Security, 'taxType' | 'listed' | 'taxTypeSource'>` in `src/parsers/common.ts` (replaces `kindFromIsin`): `INE…` → `{ taxType: 'equity', listed: true, taxTypeSource: 'share' }`; `INF…` → `{ taxType: 'check', listed: false }`.
  - `roundTripCost(sec: Pick<Security, 'listed'>, value: Paise, r: TaxRules): Paise`: listed uses the equity-delivery formula, unlisted uses `mfStampBuy`.
  - `TaxRules` gains `otherLongTermMonths: 24`, `specifiedFundCutoff: '2023-04-01'`, `standardDeduction: { new: 75_000_00, old: 50_000_00 }`, `seniorInterestDeduction: 50_000_00`, `rentDeduction: 0.3`.
  - `unitStep(sec: Pick<Security, 'isin'>): Qty` in `family.ts`: `INF` → `QTY_SCALE / 1000`, else `QTY_SCALE` (replaces `step(kind)`).

- [ ] **Step 1: Write the failing tests** in `engine.test.ts`:

```ts
it('classifies by ISIN', () => {
  expect(classifyByIsin('INE002A01018')).toEqual({ taxType: 'equity', listed: true, taxTypeSource: 'share' });
  expect(classifyByIsin('INF209K01YN0')).toEqual({ taxType: 'check', listed: false });
});
it('round-trip cost follows listing, not asset class', () => {
  expect(roundTripCost({ listed: false }, rs(1_00_000), R)).toBe(Math.round(rs(1_00_000) * R.costs.mfStampBuy));
  expect(roundTripCost({ listed: true }, rs(1_00_000), R)).toBeGreaterThan(rs(200));
});
```

- [ ] **Step 2:** `npm test` → FAIL (`classifyByIsin` not exported).
- [ ] **Step 3:** Make the type change and fix every compile error from `npm run typecheck`. Existing fixtures map `kind: 'equity'` and `kind: 'equity_mf'` → `taxType: 'equity'` (`listed: true` for `INE`, `false` for `INF`), `kind: 'other'` → `taxType: 'slab'`. `effectiveCost` and `isCertain` apply grandfathering only when `taxType === 'equity'`. Harvest, loss and wait moves in `computeFamily` are only made for securities with `taxType === 'equity'`.
- [ ] **Step 4:** `npm test && npm run typecheck` → all pass.
- [ ] **Step 5:** Commit: `git commit -am "Replace asset kinds with tax types"`

### Task 2: Fund categories from AMFI

**Files:**
- Create: `src/engine/categories.ts`, `src/engine/fund-overrides.json`
- Modify: `src/prices/parse.ts` (new `parseAmfiFunds`), `scripts/build-prices.ts` (write `prices/funds.json`), `src/ui/market.ts` (load and apply)
- Test: `src/engine/categories.test.ts`, `src/prices/prices.test.ts`

**Interfaces:**
- Produces:
  - `type ReturnClass = 'equity' | 'debt' | 'conservative_hybrid' | 'balanced' | 'gold' | 'international' | 'fd' | 'ppf'`
  - `interface Classification { taxType: TaxType; listed: boolean; returnClass: ReturnClass | null }`
  - `classifyFund(category: string, schemeName: string): Classification` in `categories.ts`
  - `interface FundsFile { date: ISODate; funds: Record<string, { n: string; c: string }> }` (ISIN → name, category heading)
  - `parseAmfiFunds(text: string): FundsFile['funds']` in `prices/parse.ts`
  - `withFunds(securities: Security[], file: FundsFile | null, overrides: Record<string, TaxType>): Security[]` in `ui/market.ts`. Precedence: user override (`taxTypeSource: 'user'`) > repo override file (`'override'`) > AMFI (`'amfi'`). Shares untouched.

The mapping (category heading text inside the brackets of lines like `Open Ended Schemes(Hybrid Scheme - Conservative Hybrid Fund)`):

| Heading contains | taxType | listed | returnClass |
|---|---|---|---|
| `Debt Scheme` (any) | `slab` | false | debt |
| `Equity Scheme` (any, incl. ELSS) | `equity` | false | equity |
| `Conservative Hybrid` | `slab` | false | conservative_hybrid |
| `Balanced Hybrid` | `other_lt` | false | balanced |
| `Aggressive Hybrid`, `Arbitrage`, `Equity Savings` | `equity` | false | equity |
| `Dynamic Asset Allocation`, `Balanced Advantage`, `Multi Asset Allocation` | `check` | false | balanced |
| `Solution Oriented` | `check` | false | null |
| `Gold ETF` | `other_lt` | true | gold |
| `FoF Overseas` | `other_lt` | false | international |
| `FoF Domestic` | `check` | false | null |
| `Index Funds`, `Other ETFs` | domestic-equity name rule below; else `check` | ETFs true | equity / null |
| anything else (incl. close-ended `Income`, `Growth`) | `check` | false | null |

Domestic-equity name rule (index funds and other ETFs): name matches `/nifty|sensex|bse/i` and does not match `/gold|silver|gilt|g-sec|gsec|sdl|bond|psu|crisil|nasdaq|s&p|hang seng|us |global|international|liquid|money market|bharat bond/i` → `equity`.

- [ ] **Step 1: Write the failing tests** in `categories.test.ts`:

```ts
it('maps hybrid categories by tax treatment', () => {
  expect(classifyFund('Hybrid Scheme - Conservative Hybrid Fund', 'X Conservative Hybrid').taxType).toBe('slab');
  expect(classifyFund('Hybrid Scheme - Arbitrage Fund', 'X Arbitrage').taxType).toBe('equity');
  expect(classifyFund('Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage', 'X BAF').taxType).toBe('check');
  expect(classifyFund('Hybrid Scheme - Balanced Hybrid Fund', 'X').taxType).toBe('other_lt');
});
it('separates domestic equity index funds from the rest', () => {
  expect(classifyFund('Other Scheme - Index Funds', 'UTI Nifty 50 Index Fund').taxType).toBe('equity');
  expect(classifyFund('Other Scheme - Index Funds', 'Motilal Oswal Nasdaq 100 Index').taxType).toBe('check');
  expect(classifyFund('Other Scheme - Gold ETF', 'Nippon Gold BeES')).toEqual({ taxType: 'other_lt', listed: true, returnClass: 'gold' });
});
it('every known AMFI heading maps, and an unknown one is check', () => {
  for (const h of KNOWN_AMFI_HEADINGS) expect(classifyFund(h, 'x')).toBeDefined();
  expect(classifyFund('Something New', 'x').taxType).toBe('check');
});
```

`KNOWN_AMFI_HEADINGS` is a `string[]` exported from `categories.ts`: the 40-odd SEBI category headings, copied from a current `NAVAll.txt` (download it once with `scripts/fetch-prices.sh` into a git-ignored folder, extract the bracketed headings). In `prices.test.ts`, add a fixture of a few `NAVAll.txt` lines spanning two headings and assert `parseAmfiFunds` gives each ISIN (growth and reinvestment columns) its heading. Add the Review Focus #2 test: `withFunds([fundSec], null, {})` returns the fund with `taxType: 'check'` and no throw.

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. `fund-overrides.json` is `[]` with this shape documented in `categories.ts`: `{ isin: string; taxType: TaxType; listed?: boolean; reason: string; date: ISODate }[]`. `build-prices.ts` writes `funds.json` next to `latest.json` when the NAV file parsed. `market.ts` fetches `./prices/funds.json` once, after `latest.json`; a failed fetch gives `null`. User overrides live in `AppState.taxTypeOverrides: Record<string, TaxType>` (add to `store.ts`, `emptyState`, `normalizeState`).
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Read fund tax types from AMFI categories"`

### Task 3: CAS keeps plan, option and distributor

**Files:**
- Modify: `src/parsers/cas.ts`, `src/parsers/common.ts` (`ParsedPrice` gains the three fields), `src/store.ts` (merge them onto `Security` on import)
- Test: `src/parsers/parsers.test.ts`

**Interfaces:**
- Produces: `ParsedPrice` gains `plan?: 'direct' | 'regular'`, `option?: 'growth' | 'idcw'`, `distributor?: string`.

- [ ] **Step 1: Write the failing test:** a scheme line `X Flexi Cap Fund - Regular Plan - Growth (Advisor: ARN-12345) ISIN: INF000X01011` parses to `{ plan: 'regular', option: 'growth', distributor: 'ARN-12345' }`; `... - Direct Plan - IDCW ... (Advisor: DIRECT)` parses to `{ plan: 'direct', option: 'idcw', distributor: undefined }`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Read them from the scheme line before `schemeName()` strips the advisor part (`cas.ts:24`). `IDCW`, `Dividend`, `Payout`, `Reinvest` → `idcw`.
- [ ] **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Keep plan, option and distributor from the CAS"`

### Task 4: Member profile and migration

**Files:**
- Modify: `src/engine/types.ts` (Member), `src/store.ts` (`normalizeState`), `src/sample.ts`
- Test: `src/store.test.ts`

**Interfaces:**
- Produces:
  - `type IncomeKind = 'salary' | 'pension' | 'interest' | 'rent' | 'business' | 'other'`
  - `interface IncomeSource { kind: IncomeKind; amount: Paise /* yearly, gross */; from: 'ais' | 'manual' | 'band'; band?: string; asOf?: ISODate }`
  - `Member` gains `type: 'person' | 'huf'`, `dob?: ISODate`, `resident?: boolean` (default true), `spouseId?: string`, `parentIds?: string[]`, `hufMemberIds?: string[]`, `income?: IncomeSource[]` (undefined = unknown), `deductions?: Paise` (old regime, one total), `consent?: { agreedAt: ISODate; recordedBy: string }`, `panLast4?: string`. Keeps `age` (used when `dob` is missing) and `relation` (relation to the manager, for display). Loses `otherIncome` and `incomeBand`.
  - `ageOn(m: Member, date: ISODate): number` in `src/engine/dates.ts`: from `dob` when present, else `m.age`.
  - `AppState` gains `recommendations: RecommendationRecord[]` (Task 7), `taxTypeOverrides` (Task 2); `version` stays `1`, migration is in `normalizeState`.

- [ ] **Step 1: Write the failing tests** in `store.test.ts`:

```ts
it('migrates old income fields to income sources', () => {
  const s = normalizeState(oldState({ otherIncome: rs(8_00_000), incomeBand: '₹4–8 L (5%)' }))!;
  expect(s.members[0]!.income).toEqual([{ kind: 'other', amount: rs(8_00_000), from: 'band', band: '₹4–8 L (5%)' }]);
  expect(s.members[0]!.type).toBe('person');
});
it('keeps unknown income unknown', () => {
  expect(normalizeState(oldState({}))!.members[0]!.income).toBeUndefined();
});
it('links spouse and parents from manager-relative relations', () => {
  // self + spouse + parent + parent → spouseId on self/spouse, parentIds on self, parents linked as spouses
});
it('prefixes old move ticks with the tax year', () => {
  expect(normalizeState(oldState({}, { done: { 'harvest_gain|m1|INE1|': true } }))!.done)
    .toEqual({ 'FY 2026-27|harvest_gain|m1|INE1|': true });
});
it('an equity-only family saved before the change keeps its tax figures', () => {
  // Review Focus #1: the sample family's summariseYear(...).tax before (hard-coded expected values) and after migration are equal
});
```

`oldState(memberOverrides, stateOverrides?)` is a test helper building a version-1 state with the pre-change member shape. Saved securities migrate too: `kind: 'equity'` → `{ taxType: 'equity', listed: true, taxTypeSource: 'share' }`, `'equity_mf'` → `{ taxType: 'equity', listed: false }` until the funds file reclassifies it, `'other'` → `{ taxType: 'check', listed: false }`; add a test for each. Migration of `otherIncome` without `incomeBand` uses `from: 'manual'`. Two members with `relation: 'parent'` are linked as each other's spouses only if exactly two exist.

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement the migration in `normalizeState`.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Member profile: income sources, links, consent"`

### Task 5: One tax function

**Files:**
- Modify: `src/engine/rules.ts` (`slabTax` unchanged; new `normalIncomeOf`), `src/engine/tax.ts` (new `taxForYear`, `setOff`; `summariseYear` rebuilt on them), `src/engine/ledger.ts` (per-lot tax type and term)
- Test: `src/engine/tax.test.ts` (new), `src/engine/engine.test.ts`

**Interfaces:**
- Consumes: `TaxType`, `Member.income`, `ageOn` (Tasks 1, 4).
- Produces:
  - `lotTaxType(sec: Security, buyDate: ISODate, r: TaxRules): TaxType`: `slab` bought before `r.specifiedFundCutoff` → `other_lt`; else `sec.taxType`.
  - `longTermMonthsFor(t: TaxType, listed: boolean, r: TaxRules): number | null`: equity → `r.longTermMonths`; `other_lt` → listed ? `r.longTermMonths` : `r.otherLongTermMonths`; others → `null` (never long-term). `buildLedger` and `previewSale` set `Realised.taxType` via `lotTaxType` and `term` via this.
  - `normalIncomeOf(m: Member, r: TaxRules, asOf: ISODate): Paise | null`: null when `income` is undefined. Salary and pension less the regime's standard deduction (once, on their sum, not below 0); rent × (1 − `rentDeduction`); old regime only: less `seniorInterestDeduction` (capped at interest) when `ageOn ≥ 60`, then less `deductions`; never below 0.
  - `interface GainBuckets { equitySt: Paise; equityLt: Paise; otherLt: Paise; slab: Paise }` (all ≥ 0, after set-off)
  - `type StOrder = Array<keyof GainBuckets>` (a permutation of all four buckets); `type LtOrder = Array<'otherLt' | 'equityLt'>`
  - `setOff(realised: Realised[], carried: { st: Paise; lt: Paise }, order: { st: StOrder; lt: LtOrder }): { net: GainBuckets; carryForward: { st: Paise; lt: Paise }; unchecked: Paise }`. Short-term losses (any type, `term: 'st'`) offset buckets in `order.st`; long-term losses offset `order.lt`. Carried losses after this year's, same rules. `check` gains are taxed as `slab` and summed into `unchecked` so the UI can say so.
  - `bestSetOff(realised: Realised[], carried: { st: Paise; lt: Paise }, m: Member, normal: Paise, r: TaxRules, asOf: ISODate): ReturnType<typeof setOff> & { order: { st: StOrder; lt: LtOrder } }`: tries all 24 × 2 orders and keeps the one with the lowest `taxForYear(...).tax`; ties keep the first in this default order: st `['slab', 'equitySt', 'otherLt', 'equityLt']`, lt `['otherLt', 'equityLt']`. `summariseYear` uses it and exposes `setOffOrder` on `YearSummary` (spec §4.3: the law's freedom to choose is an open question, so the order is shown).
  - `interface TaxBreakdown { total: Paise; exemptionUsed: Paise; basicGapUsed: Paise; rebate: Paise; marginalRelief: Paise; tax: Paise /* incl. cess, rounded to the rupee */ }`
  - `taxForYear(m: Member, normal: Paise, g: GainBuckets, r: TaxRules, asOf: ISODate): TaxBreakdown`
  - `freeEquityLtRoom(m: Member, normal: Paise, g: GainBuckets, r: TaxRules, asOf: ISODate): Paise`: the largest extra long-term equity gain `x` (to the rupee) with `taxForYear(g + x).tax === taxForYear(g).tax`. Binary search between 0 and `r.ltcgExemption + basicExemption`; tax never falls as gain rises. This replaces "exemption left + basic gap left" as the harvesting room in `summariseYear` (`room.free` and `bonus.free` are capped so their sum never exceeds it) and so in `computeFamily`. *Added 16 Nov 2026 from the archetypes research:* today's room ignores the ₹12 L line, so a new-regime member on ₹12 L salary is told to harvest ₹1.25 L and pays ₹26,000.

`taxForYear` algorithm (the order matters):
1. `slabIncome = normal + g.slab`; `total = slabIncome + g.equitySt + g.equityLt + g.otherLt`.
2. `exemptionUsed = min(g.equityLt, r.ltcgExemption)`.
3. Residents: `gap = max(0, basicExemption − slabIncome)`, used against `equitySt`, then `equityLt − exemptionUsed`, then `otherLt`.
4. `slabPart = slabTax(slabIncome, total, m, r)` (already applies the rebate to slab tax only, using `total` for the test).
5. `special = equitySt' × stcgRate + (equityLt' − exemptionUsed) × ltcgRate + otherLt' × ltcgRate`.
6. New regime, `total > 12 L`: `marginalRelief = max(0, slabPart + special − (total − 12 L))`, subtracted.
7. `tax = roundRupee((slabPart + special − marginalRelief) × (1 + cess))`.

`summariseYear` keeps every existing `YearSummary` field with its meaning (equity buckets map to `stGains`, `ltNet` etc.), adds `buckets: GainBuckets` and `unchecked: Paise`, and sets `tax = taxForYear(with gains and business).tax − taxForYear(no gains, no business).tax`. When `normalIncomeOf` is null, keep today's behaviour: no basic gap, business at 30% (Review Focus #3).

- [ ] **Step 1: Write the failing tests** in `tax.test.ts`, the research's worked examples (`docs/research/…` section 4.2) plus edges:

```ts
it('debt fund gain: 30% earner pays 31.2%, retired parent pays nil', () => {
  const son = person({ income: [salary(30_00_000)] }), mum = person({ age: 66, income: [pension(3_00_000)] });
  expect(delta(son, { slab: rs(70_000) })).toBe(rs(21_840));
  expect(delta(mum, { slab: rs(70_000) })).toBe(0);
});
it('no-income adult books ₹5.25 L LTCG at nil; 30% earner pays ₹52,000', () => {
  expect(delta(person({ income: [] }), { equityLt: rs(5_25_000) })).toBe(0);
  expect(delta(person({ income: [salary(30_00_000)] }), { equityLt: rs(5_25_000) })).toBe(rs(52_000));
});
it('the ₹12 L cliff', () => {
  const p = person({ income: [interest(11_00_000)] });
  expect(delta(p, { equityLt: rs(1_00_000) })).toBe(0);
  expect(taxForYear(p, normalIncomeOf(p, R, D)!, b({ equityLt: rs(2_00_000) }), R, D).tax).toBe(rs(61_750));
});
it('marginal relief just above ₹12 L', () => {
  const p = person({ income: [interest(12_10_000)] });
  expect(taxForYear(p, normalIncomeOf(p, R, D)!, b({}), R, D).tax).toBe(rs(10_400));
});
it('senior with ₹9 L FD interest: nil new regime, ₹83,200 old', () => {
  expect(taxForYear(person({ age: 65, income: [interest(9_00_000)] }), …).tax).toBe(0);
  expect(taxForYear(person({ age: 65, regime: 'old', income: [interest(9_00_000)] }), …).tax).toBe(rs(83_200));
});
it('debt lots bought before April 2023 are long-term other after 24 months', () => {
  expect(lotTaxType(debtFund, '2023-03-31', R)).toBe('other_lt');
  expect(lotTaxType(debtFund, '2023-04-01', R)).toBe('slab');
});
it('a short-term loss avoids long-term gains the exemption already covers', () => {
  // 30% earner; ₹1 L short-term equity loss; gains: ₹1 L equity LT (inside ₹1.25 L) and ₹1 L debt fund (slab).
  // bestSetOff puts the loss against the slab gain (31.2%), leaving the LT gain inside the exemption: gains tax 0.
  // The opposite order would leave ₹1 L slab gain taxed: ₹31,200. Expect order.st[0] === 'slab' and tax delta 0.
});
it('other long-term gains get no rebate', () => {
  // new regime, interest ₹6 L, other_lt LT gain ₹1 L (gold): tax = ₹1 L × 12.5% × 1.04 = ₹13,000
});
it('unknown income keeps today’s meaning', () => { /* Review Focus #3: income undefined → bonus.total 0 */ });
it('harvest room stops at the ₹12 L line (archetype A, Priya)', () => {
  const priya = person({ income: [salary(12_00_000)] });          // new regime; ₹11.25 L after standard deduction
  expect(freeEquityLtRoom(priya, normalIncomeOf(priya, R, D)!, b({}), R, D)).toBe(rs(75_000));
  expect(delta(priya, { equityLt: rs(1_00_000) })).toBe(rs(26_000)); // marginal relief: ₹25,000 + cess
  expect(freeEquityLtRoom(person({ income: [] }), 0, b({}), R, D)).toBe(rs(1_25_000) + rs(4_00_000));
});
```

`delta(m, g)` = `taxForYear(with g) − taxForYear(with nothing)`; `D = '2026-11-15'`; helpers `salary/pension/interest(rupees)` build `IncomeSource`s with `from: 'manual'`.

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Update the `slabTax` doc comment: marginal relief is now in `taxForYear`.
- [ ] **Step 4:** `npm test && npm run typecheck` → all pass, including the old `summariseYear` tests unchanged in their expected figures.
- [ ] **Step 5:** Commit: `git commit -am "One tax function for every tax type"`

### Task 6: Relations and clubbing between any two members

**Files:**
- Create: `src/engine/relations.ts`
- Modify: `src/engine/family.ts` (`canGift` and the gift planner use it)
- Test: `src/engine/relations.test.ts`

**Interfaces:**
- Consumes: `Member` links (Task 4), `ageOn`.
- Produces:
  - `type PairRelation = 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'grandparent' | 'grandchild' | 'parent_in_law' | 'child_in_law' | 'other'` (relation of `b` to `a`)
  - `pairRelation(a: Member, b: Member, members: Member[]): PairRelation`
  - `clubbing(from: Member, to: Member, members: Member[], asOf: ISODate): { taxedInId: string; reason: string } | null`
    - `to` is `from`'s spouse → taxed in `from`.
    - `to` is `from`'s child-in-law → taxed in `from` (conservative: a son-in-law is not clubbed by law, but the model has no gender; reason text says so).
    - `to` is a minor (`ageOn < 18`) → taxed in the minor's parent with the higher `normalIncomeOf`, or `from` if no parent is in the family.
    - `to.type === 'huf'` and `from.id` in `to.hufMemberIds` → taxed in `from`.
    - otherwise `null`.
  - `canGift(from: Member, to: Member, members: Member[], asOf: ISODate): boolean` = `from.id !== to.id && clubbing(...) === null && to.resident !== false`.

- [ ] **Step 1: Write the failing tests:** Dad → Mum (both `relation: 'parent'`, linked as spouses) is clubbed to Dad; manager → own mother is not; manager → minor child is taxed in the higher-income parent; grandparent → minor grandchild is taxed in the grandchild's higher-income parent; member → their HUF is taxed in the member; Review Focus #4: a spouse link on one side only is still `spouse`, and a `parentIds` entry not in the family is ignored.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement; replace the relation-pair table in `family.ts:229` with `canGift(from, to, state.members, asOf)`.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass (existing gift planner tests still pass).
- [ ] **Step 5:** Commit: `git commit -am "Work out relations and clubbing between any two members"`

### Task 7: Stable move ids and recommendation records

**Files:**
- Create: `src/engine/records.ts`
- Modify: `src/engine/family.ts` (moves get `id` from `moveId`, and `reasons`), `src/ui/app-context.ts` (remove `moveKey`, use `m.id`), `src/ui/App.tsx` or `useCloud.ts` (append records after each compute and status change), `src/store.ts`
- Test: `src/engine/records.test.ts`, `src/engine/family.test.ts`

**Interfaces:**
- Produces:
  - `moveId(m: Omit<Move, 'id'>, r: TaxRules): string` = `` `${r.label}|${old moveKey format}` ``
  - `MoveBase` gains `reasons: string[]` (one plain-English line per reason, e.g. "Uses ₹40,000 of Asha's ₹1.25 L tax-free room").
  - `type RecordEvent = 'shown' | 'in_plan' | 'done' | 'dismissed' | 'undone'`
  - `interface RecommendationRecord { moveId: string; at: string /* ISO date-time */; event: RecordEvent; move: Move }`
  - `newShownRecords(moves: Move[], existing: RecommendationRecord[], at: string): RecommendationRecord[]`: one `'shown'` record for each move id never recorded before.
  - `statusRecord(move: Move, event: RecordEvent, at: string): RecommendationRecord`

- [ ] **Step 1: Write the failing tests:** computing the same family twice gives identical move ids; `newShownRecords` on a second compute returns `[]`; a move whose quantity changes keeps its id; two different tax years give different ids.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Records are append-only in `AppState.recommendations` (never edited or removed by the app; account deletion removes them with the family). Ticking a move done writes `'done'`, unticking writes `'undone'`; adding a planned sale writes `'in_plan'`.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Stable move ids and recommendation records"`

### Task 8: Rules by year and dated events

**Files:**
- Modify: `src/engine/rules.ts`
- Create: `src/engine/events.ts`
- Test: `src/engine/engine.test.ts`, `src/engine/events.test.ts`

**Interfaces:**
- Produces:
  - `RULES: TaxRules[]` (today: `[FY_2026_27]`) and `rulesFor(date: ISODate): TaxRules`: the entry whose `start..end` contains the date; for a later date, the latest entry with `label`, `start`, `end` moved to that tax year.
  - `type EventKind = 'turns_long_term' | 'room_left'`
  - `interface DatedEvent { date: ISODate; kind: EventKind; memberId: string; isin?: string; amount?: Paise; text: string }`
  - `datedEvents(view: FamilyView, asOf: ISODate, horizonDays = 90): DatedEvent[]`, sorted by date: a lot with gain turning long-term within the horizon (`HoldingLot.longTermOn`); each member with free room > 0 on `view.rules.end`.

- [ ] **Step 1: Write the failing tests:** `rulesFor('2028-06-01')` has label `FY 2028-29` and `start: '2028-04-01'`; `rulesFor('2026-11-15') === FY_2026_27`; a lot bought `2025-12-01` gives a `turns_long_term` event on `2026-12-02` as of `2026-11-15`; a member with ₹50,000 room left gives a `room_left` event on `2027-03-31`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit: `git commit -am "Tax rules by year and dated events"`

### Task 9: What it brings home (engine)

**Files:**
- Create: `src/engine/planner.ts`
- Create: `src/engine/marketAssumptions.ts`; Modify: `src/engine/rules.ts` (`smallSavings`)
- Test: `src/engine/planner.test.ts`

**Interfaces:**
- Consumes: `taxForYear`, `normalIncomeOf`, `clubbing`, `rulesFor`, `classifyFund`, `FamilyView.members[].plan` (current-year context).
- Produces:
  - `src/engine/marketAssumptions.ts`: copy the data block from `docs/research/2026-11-15-india-returns-risk-inflation.md` §3 verbatim (`AssetClass`, `Scenario`, `CPI`, `REAL_RETURN`, `VOLATILITY`, `CORRELATION_ORDER`, `CORRELATION`, `GoalKind`, `GOAL_INFLATION`), plus `ASSUMPTIONS_REVIEWED = '2026-11-15'`. Volatility, correlations and goal inflation are unused until the full planner but live here now.
  - `RETURN_MIX: Record<Exclude<ReturnClass, 'ppf'>, Partial<Record<AssetClass, number>>>`: equity `{ equity_large: 1 }`, debt `{ debt_short: 1 }`, conservative_hybrid `{ equity_large: 0.2, debt_short: 0.8 }`, balanced `{ equity_large: 0.5, debt_short: 0.5 }`, gold `{ gold: 1 }`, international `{ intl_equity: 1 }`, fd `{ fd: 1 }`.
  - `nominalReturn(c: ReturnClass, s: Scenario = 'base', r: TaxRules): number`: weighted real return × CPI as `(1 + real)(1 + CPI[s]) − 1`; `ppf` returns `r.smallSavings.ppf` (add `smallSavings: { asOf: '2026-10-01', ppf: 0.071, scss: 0.082, ssy: 0.082, nsc: 0.077, kvp: 0.075, mis: 0.074, epf: 0.0825 }` to `TaxRules`, Oct–Dec 2026, refreshed quarterly; EPF at the notified rate for every year, per the founder's 15 Nov decision). When `asOf` is more than 100 days before the comparison date, PPF and FD rows carry the warning "Rate last checked <date>" (product-universe research §7).
  - `type Product = { kind: 'fund'; isin: string } | { kind: 'category'; category: string } | { kind: 'fd' } | { kind: 'ppf' } | { kind: 'gold_etf' }`
  - `interface BringsHomeInput { product: Product; amount: Paise; years: number; annualReturn?: number; scenario?: Scenario; fromMemberId: string; payout?: 'growth' | 'idcw' }`
  - `interface BringsHomeRow { memberId: string; taxedInId: string; gift: boolean; clubbedReason?: string; value: Paise; gain: Paise; tax: Paise; bringsHome: Paise; warnings: string[] }`
  - `type BringsHomeResult = { status: 'ok'; taxType: TaxType; listed: boolean; annualReturn: number; rows: BringsHomeRow[] } | { status: 'check'; reason: string } | { status: 'invalid'; field: 'amount' | 'years' | 'annualReturn'; message: string }`
  - `bringsHome(input: BringsHomeInput, view: FamilyView, members: Member[], securities: Security[], asOf: ISODate): BringsHomeResult`

Rules (spec 5.2, builder-check calls): rows for every member, sorted by `bringsHome` descending. Growth: `value = amount × (1 + r)^years`, one sale at `addMonths(asOf, round(years × 12))`; term from `longTermMonthsFor`. Sale inside `view.rules` year → context is that member's current-year `plan` gains and carried losses; later year → clean year with `rulesFor(saleDate)`. `interest` and `idcw`: tax each year on that year's income against a clean year; balance compounds after tax. `exempt`: tax 0; warn when amount > ₹1.5 L ("PPF takes at most ₹1.5 L a year") or years < 15 ("PPF locks money for 15 years"). FD → `interest`, PPF → `exempt`, gold ETF → `other_lt` listed. Tax lands on `clubbing(...).taxedInId` when clubbed; for a minor's clubbed income, the parent's taxable amount is reduced by ₹1,500 only if that parent is on the old regime (Sch III Sl. 17). Unlisted fund purchases deduct stamp duty (`amount × mfStampBuy`) before growth; exit loads are not modelled. Warnings: `gift` row → "Gift from <name>: it becomes theirs"; a gift to the giver's parent adds "It passes by their will: tell your siblings and check the will" (founder decision, 15 Nov); new regime and sale-year total within ₹2 L of ₹12 L → "Near the ₹12 L line: more income here can cost far more"; old regime with equity → "Old regime: deductions don't reduce these gains". Validation (Review Focus #5): `amount > 0`; `0.25 ≤ years ≤ 40`; `−0.5 ≤ annualReturn ≤ 0.5`.

- [ ] **Step 1: Write the failing tests:** `nominalReturn` base: equity ≈ 0.1104, conservative_hybrid ≈ 0.0780, fd ≈ 0.0673, ppf = 0.071 (to 4 decimals); cautious equity < base < optimistic. ₹5 L conservative hybrid, 1 year, 7.8%: the no-income parent's row is first with tax 0 and `gift: true`, the 30% earner pays 31.2% of the gain; a spouse row has `taxedInId` = giver and the giver's tax; a `check` fund returns `{ status: 'check' }`; a 3-year equity fund for a no-income adult uses a clean future year (full ₹1.25 L exemption); PPF ₹2 L warns; `amount: 0`, `years: 0.1`, `annualReturn: 0.9` each return `invalid` naming the field.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** Commit: `git commit -am "What it brings home, per member"`

### Task 10: Compare screen

**Files:**
- Create: `src/ui/screens/Compare.tsx`
- Modify: `src/ui/App.tsx` (route `compare`, tab "Compare"), `src/ui/market.ts` (expose the loaded `FundsFile` for search), `src/styles.css`

**Interfaces:**
- Consumes: `bringsHome`, `nominalReturn`, `Scenario`, `ASSUMPTIONS_REVIEWED`, `FundsFile` (Tasks 2, 9).

Screen (spec 5.1): product picker (search the funds file by name, ≥ 3 characters, top 20; plus "Fund category", "Fixed deposit", "PPF", "Gold ETF"); amount; years; "Whose money" (default the manager); scenario toggle (Cautious / Base / Optimistic, default Base); return prefilled from `nominalReturn`, labelled "assumed average return", editable, with "Assumptions reviewed Nov 2026" underneath; growth / payout toggle for funds. Output: the table from the spec sketch (member, slab, gain, tax, brings home), best first, gift and clubbing notes and warnings under each row, one tap on "gift" opens the gift explanation (becomes theirs, counts as their income, passes by their will or nominee, keep a gift letter and a bank transfer from giver to receiver). "Compare with another fund" adds a second "Brings home" column. A `check` result shows "Set this fund's tax type first" with a link to the member screen; `invalid` shows the message by its field.

- [ ] **Step 1:** Build the screen.
- [ ] **Step 2:** `npm run typecheck` → pass.
- [ ] **Step 3:** Run the app (`preview_start` with `fasal-prototype` from `.claude/launch.json`, port 5199), load the sample family, compare ₹5 L conservative hybrid for 1 year; confirm the parent row ranks first with "Gift from" and nil tax, and that the spouse row shows the giver's tax. Screenshot at desktop and mobile width.
- [ ] **Step 4:** Commit: `git commit -am "Compare screen: what it brings home"`

### Task 11: Funds to check on the member screen

**Files:**
- Modify: `src/ui/screens/Member.tsx`, `src/ui/screens/Home.tsx`

Each holding shows its tax type as a small label ("Equity", "Slab rate", "Long-term 12.5%", "Check"). A "Funds to check" list at the top of the member screen names each `check` holding with its category and the possible treatments, and a picker that sets `AppState.taxTypeOverrides[isin]` (`taxTypeSource: 'user'`). Home shows a one-line notice when any holding is `check`, and when `YearSummary.unchecked > 0` ("Includes gains from funds still to check, taxed at slab rate for now").

- [ ] **Step 1:** Build it.
- [ ] **Step 2:** `npm run typecheck` → pass.
- [ ] **Step 3:** In the running app, import a family holding a balanced-advantage fund; confirm it shows "Check", is absent from Plan moves, and after picking "Equity" it gets moves. Screenshot.
- [ ] **Step 4:** Commit: `git commit -am "Show and settle funds to check"`

### Task 12: Family setup (questionnaire steps 1, 2 and 8)

**Files:**
- Create: `src/ui/screens/Setup.tsx`
- Modify: `src/ui/screens/Family.tsx` (`MemberForm` fields), `src/ui/App.tsx` (route `setup`), `src/ui/screens/Home.tsx` (prompt)

Three steps, one screen each (spec 3.2):
1. **Who's in the family:** per person name, relation to you, date of birth, person / HUF (HUF: pick its members), resident in India (no → note that non-residents aren't covered yet), spouse and parents (picked from the family list), PAN last four characters (validated `/^[A-Z0-9]{4}$/`, input never accepts more), and for each adult other than the manager "They agreed to be included" with today's date (stores `consent`).
2. **Money coming in:** per adult, add income sources (kind, amount, per month / per year, stored yearly) or pick a slab band; regime new / old / not sure (not sure stores `new`); if old or not sure, one field "Total deductions you claim (80C, health insurance, rent, NPS…)".
3. **Carried losses (optional):** short-term and long-term losses carried from last year's return.

`MemberForm` on the Family screen edits the same fields. Home shows "Finish family setup" while any adult lacks `dob` or `income`.

- [ ] **Step 1:** Build it.
- [ ] **Step 2:** `npm run typecheck` → pass.
- [ ] **Step 3:** In the running app, set up self, spouse and two parents linked as spouses; enter a pension for one parent; confirm the Compare screen's Dad → Mum case is clubbed and the pension row shows the standard deduction applied (slab column). Screenshot each step at mobile width.
- [ ] **Step 4:** Commit: `git commit -am "Family setup: who, income, carried losses"`

### Task 13: Whole-branch check

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` → all pass.
- [ ] **Step 2:** `npm run check:private` → no private files staged.
- [ ] **Step 3:** In the running app with the sample family: Home, Plan, Simulate, Member, Compare and Setup all render with no console errors; harvesting moves for shares match the figures on `main` (open both and compare the Plan total).
- [ ] **Step 4:** Update `README.md` "What it does today" with the Compare screen and tax types, and `docs/PLANNER-NOTES.md` with what shipped. Commit: `git commit -am "Document the planner foundation"`
