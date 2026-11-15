# Planner foundation: design

Status: **draft, not approved.** Research: `docs/research/2026-11-15-family-financial-planning.md`.

Background and the decisions behind this doc: `docs/PLANNER-NOTES.md`.

## 1. Intent

The app is turning from a capital-gains harvesting tool into a tax-first family financial planner. Its central question: **what does an investment actually bring home after tax, and in whose name should it sit?**

The foundation is the three pieces every later feature stands on:

1. **Every asset taxed correctly.** Today the engine knows listed shares and equity funds and guesses everything else.
2. **"What it brings home" per member.** For any fund or product, the after-tax result for each family member side by side.
3. **Family profile and questionnaire.** Who is in the family, their income and regime, recorded consent, and the 2-minute questions a target plan starts from.

Who it's for: the Family CFO who manages money for a family of about five adults (self, spouse, parents, adult children), in a free, invite-only beta for family and friends during the 2026-27 season.

## 2. Goals, non-goals, anti-goals

**Goals**
- Any holding the family can import (shares, all mutual fund categories, ETFs including gold and international) gets the right tax type, or an explicit "check", never a silent guess.
- Gains on every tax type are taxed correctly for each member: right rate, right holding period, right exemption, right set-off.
- For an amount, a period and a fund or category, show what each member would bring home, ranked, with gifts flagged.
- One set of tax rules shared by harvesting and the planner.
- Settle the shape of the data and the engine for every later project (section 6), so the beta features, the full planner and the public launch add to it rather than rebuild it.

**Non-goals (this round)**
- The target split, emergency fund and moves to close the gap: they come next and build on this.
- Listed bonds, market-linked debentures, unlisted shares, ULIPs and insurance products, property, surcharge, NRIs.
- The Expo app. The beta is the existing web prototype.
- Questionnaire steps 3–7, the target split and the emergency fund (full planner).
- Splitting storage into tables and the security hardening (the "secure storage" project, before beta invites).
- Per-member sign-in. The beta uses one manager with recorded consent.

**Anti-goals (would be failure even if it works)**
- A fund taxed under the wrong treatment without saying so. Wrong confidently is worse than "check".
- Return assumptions presented as predictions. They are labelled, editable and secondary to the tax gap.
- Suggesting a move into another member's name without saying it is a gift and what that means.
- Raw statements, PDF passwords or full PANs stored anywhere.

## 3. Family profile and questionnaire

Grounded in `docs/research/2026-11-15-family-financial-planning.md` (section numbers below are the Income-tax Act, 2025). Planners collect cash flow, emergency savings, insurance, debts and goals before tax and allocation; the questionnaire follows that order but only asks what changes a number.

### 3.1 Decided
- **Consent:** one manager signs in. For each adult member the manager records "they agreed" with the date. Stored as `consent: { agreedAt, recordedBy }` on the member so per-member sign-in can replace it at the public launch.
- **PAN:** store only the last four characters, and whether it is a person or an HUF (the PAN's fourth character).

### 3.2 The family questionnaire (about 2 minutes, one screen per step)

| Step | Asks | Why it matters |
|---|---|---|
| 1. Who's in the family | For each person: name, relation, date of birth, resident in India (yes / no; non-residents are out of scope and get a note) | Age drives senior rules and the old-regime nil band; relation drives clubbing (s.99) and gift rules (s.92); minors' income is clubbed |
| 2. Money coming in | For each adult: income sources (salary, pension, interest, rent, business, other), each as a monthly or yearly amount or a slab band, stored yearly; regime (new / old / not sure) | Slab position, the ₹12 L rebate headroom (s.156), the basic exemption gap for gains (s.196(2), s.198(3)). "Not sure" defaults to new: research shows the old regime rarely wins |
| 3. Money out | Family monthly expenses (one number, with a "help me estimate" split); total EMIs | Emergency fund size and investable surplus |
| 4. Loans | Each loan: type (home, education, vehicle, personal, card), borrower(s) and share, balance, rate, EMI; home loan: self-occupied or let-out | Prepay-vs-invest compares the post-tax loan rate with the post-tax return of the cheapest holder. Interest deductions (s.22, s.129) and house property loss set-off (₹2 L, s.109) count only for old-regime members |
| 5. Safety net | Cash and liquid savings already set aside; term cover per earner; health cover per member (amount, and whether parents have their own) | Emergency fund gap; insurance adequacy flags (a flag only, never a product suggestion) |
| 6. Goals | Name, amount today, target date, for whom (e.g. "Riya's college, ₹25 L, 2034") | Goal horizon decides how much can be in equity |
| 7. Comfort with risk | Per adult: reaction to a 30% fall, investing experience, how soon they might need the money | Risk profile per member, which SEBI will require before advice (Reg 16). Asked in the beta, enforced at launch |
| 8. Carried losses (optional) | Losses carried forward from last year's return, short and long term | Not in AIS; changes this year's harvesting and set-off (s.111) |

Old-regime deductions (80C-type investments, health premiums, rent, NPS 1B) are asked **only** for members on the old regime or "not sure", in a follow-up, so new-regime families never see them.

### 3.3 Later, replacing typing
- **AIS upload** fills income sources, interest, dividends and TDS per member (marked "from AIS").
- **Lender interest certificate** fills the home loan split. **Last year's return** (Schedule CFL) fills carried losses.
- Every answer stores its source and date, so an upload can replace a typed figure without losing the history.

### 3.4 What the questionnaire produces
Stored answers (section 6.2: Member, Liability, Goal, Profile answers).

**Built this round: steps 1, 2 and 8 only**, the ones the tax maths uses, plus the old-regime deduction total. The founder decided the beta starts from holdings, so steps 3–7 (expenses, loans, safety net, goals, risk), the target split and the emergency fund come with the full planner after beta feedback. Their data shapes are defined now (section 6.2) so that project adds screens, not migrations.

## 4. Every asset taxed correctly

### 4.1 Tax types

Each security gets one tax type for gains. Rates are FY 2026-27 under the Income-tax Act, 2025 (old section numbers in brackets).

| Tax type | What it covers | Short-term | Long-term |
|---|---|---|---|
| `equity` | Listed shares; equity-oriented funds (≥65% in domestic equity), including arbitrage, equity savings, aggressive hybrid, most dynamic allocation | ≤12 months: 20% (s.196, old 111A) | >12 months: 12.5% above ₹1.25 L a year (s.198, old 112A); grandfathering at 31 Jan 2018 |
| `slab` | Specified mutual funds (>65% in debt and money market): debt funds, liquid, conservative hybrid; debt FoFs | Always slab rate, whatever the holding period (s.76, old 50AA) | none |
| `other_lt` | Funds in between (e.g. balanced hybrid, most multi-asset, international FoFs, domestic FoFs that don't qualify as equity); gold and silver ETFs; gold and silver funds | Slab rate up to 24 months for unlisted fund units, 12 months for listed ETFs | 12.5%, no ₹1.25 L exemption, no indexation |
| `interest` | Fixed deposits, recurring deposits, savings schemes taxed yearly | Interest at slab rate each year | — |
| `exempt` | PPF, Sukanya Samriddhi | none | none |

**Lot-date rule for debt funds:** units of a debt fund bought **before 1 April 2023** are not caught by s.76. Those lots are taxed as `other_lt`. So the tax type is decided per lot, not only per security. (To verify in the research.)

**Dividends:** the payout (IDCW) option is a property of the scheme, not a tax type. Dividends are taxed at slab rate in the year paid. The planner treats an IDCW plan as `interest`-like yearly income on top of its gains treatment.

### 4.2 Where the tax type comes from

1. **AMFI category.** The app already downloads AMFI's `NAVAll.txt` daily (`prototype/scripts/fetch-prices.sh`). It lists every scheme with its ISIN under its SEBI category heading, e.g. `Open Ended Schemes(Hybrid Scheme - Conservative Hybrid Fund)`. A mapping table turns each category into a default tax type.
2. **Override list.** A small JSON file in the repo, by ISIN, with a reason and date, for funds whose actual allocation differs from their category default.
3. **Check.** Categories where the tax type depends on the fund's own allocation default to `check`, unless the override list settles it:
   - Dynamic asset allocation / balanced advantage (most stay ≥65% equity using arbitrage, not all)
   - Multi-asset allocation
   - Index funds and ETFs whose underlying is not domestic equity
   - Domestic FoFs, solution-oriented (retirement, children's) funds
4. **Shares** (ISIN starting `INE`) are `equity`. Non-AMFI ETFs (gold, silver, international, bond) are recognised from the exchange price files by name and default to `check` until mapped.

A `check` security still shows its value and the possible treatments, but is left out of any suggested move until it is settled. The member screen lists them with a one-tap way to set the type, which is stored as a family-level override.

### 4.3 Engine changes

- `AssetKind` (`'equity' | 'equity_mf' | 'other'`) is replaced by `TaxType` plus a `listed` flag on `Security`. A migration maps old values: `equity` and `equity_mf` → `equity`; `other` → `check`.
- `Realised` gains carry their tax type and term. `summariseYear` (`prototype/src/engine/tax.ts`) today taxes every gain at equity rates. It becomes bucketed:
  - equity ST at 20%; equity LT at 12.5% after the ₹1.25 L exemption;
  - `other_lt` LT at 12.5% with no exemption;
  - `slab` gains, `other_lt` ST and `interest` added to income taxed at slab rates, using the existing `slabTax`, so slab position and the s.87A rebate are handled in one place.
- Set-off keeps the existing order: short-term losses against any capital gain, long-term losses only against long-term gains, across all tax types (s.108, s.111). Capital losses never reduce other income (s.109(2)).
- **The ₹12 L rebate (s.156, new regime):** covers tax on slab-taxed income, including `slab` gains and interest, so a member with little other income can take up to ₹12 L of it at nil tax. It never covers s.196 / s.198 tax, but those gains **count toward the ₹12 L test** (the common reading; see section 11). **Marginal relief** just above ₹12 L, not modelled today (`rules.ts`), must be added: without it, the "cliff" where ₹1 L more of gains costs about ₹61,750 is wrong in both directions.
- **Deductions** (old regime) reduce only slab-taxed income, never s.196 / s.198 gains (s.196(4), s.198(6)).
- **Minor's income:** clubbed to the parent with higher income; the ₹1,500 exemption applies in the old regime only.
- The basic exemption gap for residents is used first by slab-rate income, then by special-rate gains, short-term first (existing behaviour, extended).
- Holding period comes from the tax type and `listed`: 12 months for equity and listed `other_lt`, 24 for unlisted `other_lt`.
- Rates, periods and the category mapping live in `TaxRules` as data, so a Budget change is a data change.

## 5. What it brings home

### 5.1 What the user sees

The user picks a fund (search the AMFI list) or a category, an amount and a period. Every member is shown side by side, best first:

```
₹5 L in a conservative hybrid fund, 3 years, ~8% a year (assumed, edit)

               Slab   Gain      Tax       Brings home
Mum (no inc.)   0%    ₹1.30 L   ₹0        ₹6.30 L   ← best · gift from you
Dad (pension)   5%    ₹1.30 L   ₹6,800    ₹6.23 L     gift from you
You            30%    ₹1.30 L   ₹40,600   ₹5.89 L
```

(Figures illustrative.)

- **Gift flag.** When the money comes from one member and the row is another, the row says "gift from <name>". One tap explains it: the money becomes theirs, counts as their income, passes by their will or nominee, and which paperwork to keep (gift deed or letter, bank transfer from giver to receiver).
- **Clubbing.** When the giver's relation to the row's member is spouse, son's wife, or parent of a minor (and for an HUF's own members), the row shows the tax in the giver's hands with the reason, not the receiver's lower tax. Relations come from member links (section 6.2), not from the relation to the manager.
- **Who gives.** The user picks whose money it is (default: the manager). Rows for everyone else are gifts from that person.
- **Comparing funds.** The same screen can compare two funds or categories for one member, e.g. conservative hybrid vs dynamic allocation.

### 5.2 How it is calculated

For each member: tax in the sale year **with** the gain minus tax **without** it. This one rule captures slab jumps, the basic exemption gap and the ₹12 L rebate without special cases.

*Builder-check calls (made by Claude, for the founder to check):*
- **When gains are taxed.** Growth funds: the whole gain is taxed once, in the year of a single sale at the end of the period. `interest` and IDCW: taxed every year on that year's income. Spreading sales over several years is a later option ("sell a slice each year"), not this round.
- **Which year's situation.** If the sale falls in the current tax year, use that member's gains already booked, carried losses and exemption room left. If it falls in a future year, assume a clean year: full ₹1.25 L exemption, no other gains, carried losses ignored, today's income and rules.
- **Golden test framing.** The research's "₹21,840 vs ₹0 a year" example is tested as a one-year period, where both models agree.
- **What can be compared.** Any AMFI fund, any fund category, plus three products as categories with an assumed rate: fixed deposit (`interest`), PPF (`exempt`, with its yearly limit) and gold ETF (`other_lt`). Other products wait for the Asset screens.

- **Assumed returns:** one default per category, kept as data with the tax rules, labelled "assumed" on screen and editable per comparison. No fund-specific predictions.
- **Costs:** stamp duty on purchase and exit loads where known; the existing `roundTripCost` stays for harvesting.
- **Simplification (stated on screen):** each member's income stays at today's level for the whole period.
- **Warnings on the row,** not just a number: "near the ₹12 L line: more gains here cost about 62%"; "this member is on the old regime: deductions don't reduce these gains"; "gift: becomes theirs".

## 6. Built for what comes next

The planner ships as separate projects: foundation, then the beta features, then the full planner after beta feedback, then the public launch. None of them should mean rebuilding an earlier one. So the foundation **settles the shape** of everything later projects will hang off, even where it doesn't fill it yet. The rule: if adding it later would mean migrating saved data or rewriting the engine's core functions, its shape goes in now. If it is only a new screen or a new function, it waits.

### 6.1 The product, end to end

A family answers a few questions, uploads statements, and gets a target, the gap to it, and the cheapest moves to close it, judged by what each member brings home after tax. Every suggestion is a recorded recommendation with its reasons. The public launch adds per-member sign-in, the adviser guardrails, live bank data through Account Aggregator and the Expo phone apps, all on the same engine and data.

### 6.2 The shared model

These are the nouns every project uses. The foundation defines all of them; columns marked *later* exist in the type and the storage but stay empty until their project.

| Entity | Holds | Filled by |
|---|---|---|
| **Family** | Members, manager, settings | Foundation |
| **Member** | Type (person / HUF), date of birth, regime, PAN last four, consent; **links to other members** (spouse, parents) so any pair's relation can be worked out; **income as a list of yearly gross sources** (salary, pension, interest, rent, business, other), each with amount and where it came from (AIS, manual, slab band); old-regime deductions as one total (itemised *later*); carried losses | Foundation (manual income, slab band, deduction total); AIS import and itemised deductions (*later*) |
| **Security** | ISIN, name, tax type, listed flag, AMFI category; plan (direct / regular), option (growth / IDCW), distributor code | Foundation (tax type, category); plan, option and distributor code read from the CAS now, used by the regular-to-direct switch (*later*) |
| **Lot / Txn** | As today, plus tax type per lot (the April 2023 debt rule) | Foundation |
| **Asset** | Anything not in a statement: fixed deposit, PPF, EPF, NPS, property, physical gold, cash. Owner, value, tax type, maturity | Shape now; entry screens with net worth and emergency fund (*later*) |
| **Liability** | Home loan, education loan, other loans: owner(s) and share, balance, rate, EMI | Shape now; used by the questionnaire and the planner (*later*) |
| **Goal** | Name, amount, date, priority, for whom | Shape now; goals screen (*later*) |
| **Profile answers** | Questionnaire answers with date: expenses, risk, reaction to a fall | Foundation (section 3) |
| **Move** | One suggested action: kind, from member, to member, security or asset, amount, tax cost now, tax saved, gift flag, reasons, status (suggested / in plan / done / dismissed) | Foundation generalises today's `Move`; each later feature adds kinds |
| **Recommendation record** | Snapshot of the inputs, the move and its reasons, when it was shown | Shape now, written for every move from the start; enforced at the public launch |

*Builder-check calls (made by Claude, for the founder to check):*
- **Relations between any two members.** Relation-to-the-manager isn't enough: Dad giving to Mum is a spouse gift and is clubbed, yet both are "parent" to the manager. Each member stores who their spouse is and who their parents are; any pair's relation (spouse, parent, child, sibling, in-law, grandparent) is worked out from those links. `canGift` and clubbing use the pair, including "minor's income goes to the parent with higher income". An HUF is a member of type HUF with its members listed; gifts from its own members are clubbed back (s.99(3)).
- **Income is yearly and gross.** The questionnaire asks salary and pension per month or per year, as the person prefers, and stores yearly. The engine applies the standard deduction to salary and pension (₹75,000 new, ₹50,000 old, s.19) and, in the old regime, the senior interest deduction (₹50,000, s.153). Other old-regime deductions are one total this round.
- **Moves have stable identities.** A move's id is built from what it is (kind, members, security, account, tax year), not random, so its status and records survive a recompute. Today `computeFamily` makes random ids.
- **When a record is written.** Once when a move first appears (keyed by its stable id), and again on every status change. Records are append-only: a server table when signed in, and a list inside the family data otherwise.

### 6.3 One tax function for every feature

The core of the engine becomes one function: **a member's tax for a tax year, given their income sources, realised gains by tax type, losses and deductions.** Everything else calls it:

| Feature (project) | How it uses the function |
|---|---|
| What it brings home (foundation) | Tax with the gain minus tax without it |
| Where to put new money (beta) | "Brings home" run for every member and every candidate category, ranked |
| Cheapest way to raise ₹X (beta) | Tax of each candidate sale, member and lot, searched for the cheapest combination |
| Harvesting (existing, beta) | Unchanged in purpose; moves onto the same function |
| Advance tax (beta) | The function on the year's projected income and gains, split across due dates |
| Capital gains schedule (beta) | Realised gains by tax type and section, from the same buckets |
| Regular-to-direct (beta) | Tax of the switch sale, against yearly commission saved |
| Rebalance on a tax budget (planner) | Cheapest-raise search with a tax limit |
| Old vs new regime (later) | The function run twice |
| Goals and projections (planner) | The function per future year, with that year's rules |

### 6.4 Rules by year

`TaxRules` is already data for one year. It becomes a table keyed by tax year, so projections and Budget changes add a row rather than change code. The category-to-tax-type mapping and default return assumptions live in the same table.

### 6.5 Dated events

The engine also returns a list of dated events: a lot turning long-term, exemption room left before 31 March, advance tax due dates, a deposit maturing. Harvesting alerts, the advance tax tracker and reminders all read this one list. The foundation produces the lot and exemption events; later projects add kinds.

### 6.6 Platform and storage

- **The engine stays pure TypeScript** with no browser, storage or network code, so the Expo apps and any server job reuse it unchanged.
- **Storage split is its own project, "secure storage",** run right after the foundation and before any beta invites: tables matching 6.2, field encryption with a key outside the database, admin-read logging, backups, and how two devices' edits are reconciled once there's no single version number. The foundation keeps today's single saved document (browser and `family_data`), with the new shapes inside it, so the engine and screen work can start at once.
- **Every saved shape has a version number**, and the app migrates older saved data on load, as it does today.

## 7. Data the foundation needs

| Data | Source | Sensitivity tier |
|---|---|---|
| Security tax type, category, listed flag | AMFI file, exchange price files, override list | 6 (public) |
| Member age, regime, other income, carried losses | Manager input now; AIS later (section 3) | 2–3 |
| Lots and realised gains | CAS and broker files, parsed on the device | 2 |
| Consent record | Manager input | 5 |
| Return assumptions | App defaults, user edits | 6 / 3 |

Storage follows the decisions in `docs/PLANNER-NOTES.md`: readable on the server, hardened.

## 8. Approaches considered

- **A. Extend the current engine (chosen).** Add the tax types and the brings-home calculation to `prototype/src/engine`. One tested engine for harvesting and planning; a Budget change is fixed once. Cost: touches tested code, so the existing tests must keep passing and new golden tests are needed.
- **B. A separate planner module.** Faster start, no risk to tested code, but tax rules split in two and drift.
- **C. Start the Expo app first.** Ready for app stores, but delays the planner by weeks for a beta that is web-only.

The founder picked A on 15 Nov 2026.

## 9. Testing

- Golden tests per tax type: one realised gain each, ST and LT, checked against a hand calculation.
- The debt-fund lot-date rule: same fund, lots either side of 1 April 2023.
- Set-off across tax types, including an equity short-term loss against a debt fund gain.
- Brings home: the member with no income pays nil on a slab-taxed gain inside the basic exemption; clubbed relations show the giver's tax.
- The research note's worked examples (section 4.2) as golden tests: debt fund with a 30% earner vs a retired parent (₹21,840 vs ₹0 a year); ₹5.25 L LTCG for a no-income adult (₹0) vs a 30% earner (₹52,000); the ₹12 L cliff (₹1 L LTCG on ₹11 L interest = ₹0, ₹2 L ≈ ₹61,750, with marginal relief checked); senior with ₹9 L FD interest (₹0 new vs ₹83,200 old).
- Category mapping: every AMFI category heading in a current `NAVAll.txt` maps to a tax type or `check`; a new unknown heading fails the test.
- All existing engine, family and reconcile tests still pass.

## 10. Left to the builder

- Exact UI placement of the comparison screen and the "check" list.
- Default return assumptions per category (to be shown to the founder before the beta).
- How the old `AssetKind` values in saved family data are migrated.
- Table and column names for the storage split, following section 6.2.

## 11. To verify before building

Confirmed by the research: slab-taxed income is covered by the ₹12 L rebate; s.196 / s.198 tax is not; deductions don't reduce those gains; capital loss set-off and carry-forward rules; the gift and clubbing lists.

Still to confirm (none blocks building; each is a rule in data that can change):
- The text of s.76 (specified mutual funds), including that debt-fund units bought before 1 April 2023 fall outside it.
- Whether s.196 / s.198 gains count toward the ₹12 L rebate test. The app uses the common reading (they do) and shows "check with a CA" when a member is within ₹2 L of the line.
- Holding period for gold and silver ETFs and international FoFs in FY 2026-27.
- Where the new Act puts the rule that a gifted asset keeps the giver's cost and holding period (old s.49). Gift suggestions depend on it.
- Sovereign Gold Bond redemption exemption after Budget 2026 (original subscribers only, per reports).
