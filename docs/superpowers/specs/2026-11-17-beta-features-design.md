# Beta features: design

17 Nov 2026 · Status: **built on branch `beta-features` (20 Nov 2026), not merged or deployed.** Sections 1–9 built (Tasks 1–13), each task reviewed, two milestone reviews and a final whole-branch review, all findings fixed; 385 tests pass. Section 10 (new money) gets its own plan in March. Decisions taken while building: `docs/superpowers/plans/2026-11-17-beta-features-rulings.md`. Setup: `docs/guides/beta-setup.md`.

Background: `docs/PLANNER-NOTES.md`, `docs/research/2026-11-15-core-feature-list.md` §2.2 and §2.4, the foundation spec (`2026-11-15-planner-foundation-design.md`), the architecture spec (`2026-11-16-architecture-design.md`) and the secure storage spec (`2026-11-17-secure-storage-design.md`).

**How this doc was decided.** The founder went offline and asked Claude to make the calls and list them at the end. Every decision below is Claude's call unless it quotes an earlier founder decision. The list for him to check is section 12.

## 1. Intent

Harvest season is **1 Feb – 31 Mar 2027**. Each member's ₹1.25 L equity exemption and unused nil band lapse on 31 March (core feature list, belief 1). The beta exists to find out whether real families, given one dated step at a time, actually use that room before it lapses, and whether the app's numbers hold up on their real statements.

**Who it is for:** at least 5 family-and-friends families, each run by one manager (the Family CFO) who signs in with Google. Free and invite-only, with the "not a registered adviser yet" disclaimer on every recommendation screen (founder, 15 Nov 2026).

**What a beta family does in Feb–Mar 2027 (Claude's call):**
1. Before 1 Feb: signs in from an invite, imports each member's statements, records consent.
2. Sees this season's moves: sell and buy back inside the room, switch regular plans to direct inside the same room, book useful losses, wait for lots about to turn long-term, gift then sell.
3. Picks a date for each move it wants; adds the dates to its own phone calendar.
4. Gets a short weekly season email and deadline emails (1 Feb, 1 Mar, 15 Mar, last safe day).
5. Does the trades at its own broker or fund house; imports a fresh statement; the app marks the moves done.
6. After 31 March: downloads each member's capital gains schedule for the tax return.

**How the founder judges the beta a success (Claude's call):**

| Measure | Target |
|---|---|
| Families signed in with real statements and season help turned on (section 7) by 1 Feb | ≥ 5 |
| Usable room used by 31 Mar, across those families (definition below) | ≥ 60% |
| Families with at least one move confirmed by a later import | ≥ 4 of 5 |
| Moves later found wrong (would have cost tax, or impossible to do) | 0 left unfixed for over 2 days |
| Families that turn off season emails | ≤ 1 |
| Capital gains schedule matches the broker's or CA's figures for each member who sold | Every case checked by the founder |

The main number is rupees of room used, the beta's version of the research's north star, "rupees realised" (NUDGE §5).

**Usable room, defined (Claude's call, fixed for the season):** per member, room is the engine's free tax-free room (`room.free + bonus.free`: the ₹1.25 L exemption plus the unused nil band). Room only counts if the member can use it, so:
- `used_m` = long-term equity gain the member realised from 1 Feb 2027 that fell inside their room (any sale counts: harvest, switch or an ordinary sale).
- `left_m` = the smaller of the room still free and the long-term gain still harvestable in certain, unlocked lots.
- `usable_m = used_m + left_m`. A member with no harvestable gain and nothing used adds 0 to both sides.
- Beta share = Σ used ÷ Σ usable over all members of families with season help on. Worked out afresh each Sunday from each family's own data, so no per-family baseline is stored.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Only invited people can use the beta.
2. Harvesting is safe to act on in season: no move on units that can't be sold yet (ELSS lock-in), no same-day buyback, a clear last safe day.
3. Regular-plan funds are switched to direct inside each member's yearly room, as part of harvesting.
4. Each move can carry a date the family picks, with a linked buyback step, and goes into the family's calendar.
5. A weekly season email and four deadline emails, with no holdings or names in them.
6. The next import marks moves done.
7. A capital gains schedule per member for FY 2026-27, downloadable.
8. Where to put new money across members, for the new tax year (from April 2027).
9. Season numbers the founder can read without opening any family.

**Non-goals (this project)**
- Cheapest way to raise ₹X (next project, after the season).
- Push notifications, SMS or WhatsApp.
- Advance tax tracker (only a one-line reminder in the season email).
- Short-term parking by slab, small-savings fit, rebalancing, goals.
- Per-member sign-in or per-member emails (the manager gets everything, NUDGE §4.3).
- Scheme-level TER data (a category table is used instead, section 5.3).
- Beta experiments E1–E8. Only the measures in section 1 are tracked. With 5 families, split tests would show nothing.

**Anti-goals (failure even if it works)**
- An email that shows fund names, member names, income or holdings.
- Nagging: more than the emails in section 7, or a "you'll miss savings" prompt when turning emails off.
- A move the family cannot do or that costs them tax: locked ELSS units, same-day buyback, a switch that pays short-term tax or an exit load without saying so.
- A stranger signing in with Google and storing a family.
- Anything that needs a paid plan.

## 3. Constraints

- **Free tiers only.** Supabase Free (Edge Functions, Cron), GitHub Pages and Actions, a free email API. Supabase Edge Functions cannot send mail over SMTP ports 25 and 587, so email must go through an HTTP API.
- **Architecture:** the engine in `prototype/src/engine` stays pure and runs unchanged in server functions through the engine bundle (`scripts/build-engine.ts`). Server logic lives in `supabase/functions/_shared/` (pure TS, Vitest) with thin Deno entries. Families are encrypted and readable only inside functions. Family data reaches Supabase only through `prototype/src/storage/`.
- **Recommendations:** every move shown goes into the append-only record (`src/engine/records.ts`). No spouse loans. Gifts only to legal relatives (`isRelative`).
- **Time:** 10 weeks to 1 Feb, built by Claude (founder's usual choice), with one fresh reviewer at the end of each milestone.

## 4. Approaches

| Approach | What ships when | Trade-off | Verdict |
|---|---|---|---|
| **A. Season first** | By 10 Jan: invites, safe harvesting, switch to direct, dated moves, calendar, import detection. By 25 Jan: season emails and season numbers. By 15 Mar: capital gains schedule. April: new money. | New money arrives after the season; but new money is year-round and the room lapses on 31 March | **Chosen** |
| B. All four at once for 1 Feb | Everything on 1 Feb | One big release ten weeks out; any slip loses the season; no time for families to onboard before 1 Feb | Rejected |
| C. Alerts first (email and web push) | Push and email by mid-Jan, features after | Most effort on plumbing; web push on iPhone needs the site installed to the home screen; least tax value | Rejected |

**Inside A, how alerts reach families:**

| Option | Verdict |
|---|---|
| **Calendar file for the family's own dates, plus a short server email for the season** | **Chosen.** The phone's calendar does the dated reminders with no server and no data leaving the browser. The server email only covers what the family hasn't scheduled: the weekly nudge and deadlines. |
| Server email for every dated step | More emails, more data in email, more to cap |
| Web push | iPhone needs home-screen install; service worker work; out |

**Inside A, how the switch to direct fits:** as a kind of harvesting move (sell the regular plan, buy the direct plan instead of buying back the same fund), sharing the member's room. A separate "switch" screen would compete with harvesting for the same ₹1.25 L and could double-count it.

## 5. Harvesting, made safe for the season

Builds on `computeFamily`'s move generator (`src/engine/family.ts`) and the Plan screen (`src/ui/screens/Plan.tsx`).

### 5.1 Fixes before families act
1. **ELSS lock-in.** Units of a fund whose AMFI category is ELSS can't be redeemed for 3 years from each purchase. Locked lots are excluded from every move that sells (harvest, loss, switch, gift-then-sell for units; gifting ELSS units is out). The member page shows "locked until <date>". Today nothing checks this.
2. **Buyback date.** Every sell-and-buy-back and switch move carries a buyback step: shares and ETFs on the next trading day after the sale (never the same day, SELL I2); mutual funds the next business day after the redemption date.
3. **Last safe day.** For FY 2026-27, the second-to-last trading day on or before 31 Mar 2027, from a data file of NSE trading holidays for 2027 (`src/engine/data/holidays-2027.ts`). *Claude's call:* one day earlier than strictly needed, for T+1 settlement and fund cut-offs. Shown on Home and the Plan screen from 1 Feb.
4. **Saving floor.** Moves saving under ₹1,000 are not shown (NUDGE guardrail; the engine currently uses ₹500 in SELL §3.3; ₹1,000 wins as the later founder-era rule).

### 5.2 Dated moves
- A move on the Plan screen gets a date picker (default: today if on or before the last safe day). Picking a date writes an `in_plan` record with the date and a snapshot of the move as sized that day (records gain an optional `date`).
- **A dated move is re-sized, not frozen (Claude's call).** Prices move between picking a date and the day itself; selling the old number of units could go past the room and cost tax. So the family's dated moves are stored as `AppState.datedMoves: { moveId, date }[]`. On every recompute, `computeFamily` sizes dated moves **first**, in date order, so they hold their room before any other suggestion; units and gain follow today's prices. The card says "Units for today's prices; check again on the day". A dated move whose room is gone (other sales used it) shows "No room left for this move" and is not counted in emails.
- The buyback or buy-direct step is shown under its sale as a linked second step with its own date (derived, editable later).
- **Add to my calendar** downloads one `.ics` file with every dated step plus the last safe day and 31 March. Event titles name the member, the action and the fund, but no units or rupee figures ("Asha: sell and buy back Nifty 50 Index Fund. Open Harvesting for today's units."). Event UIDs come from move ids, so re-downloading updates events instead of duplicating them. Reminder at the event time (9:30 am IST).

### 5.3 Switch regular to direct
**Spotting:** a fund holding with `plan: 'regular'` (already read from the CAS by `schemeDetails` in `src/parsers/cas.ts`).

**Direct twin:** found in the nightly `prices/funds.json` (ISIN → name and category) by matching the scheme name with "Regular" replaced by "Direct" and the same option (growth or IDCW). If no single match, the move says "find the direct plan of this fund at the fund house" and keeps no ISIN.

**Cost gap:** a category table (`src/engine/data/ter-gap.ts`), labelled as an estimate: about 1.0 point for active equity, 0.3 for index and ETF-like funds, 0.5 for hybrid, 0.4 for debt. *Claude's call:* scheme-level TER data would need a new monthly fetch; the category figure is enough to rank and decide.

**Decision per holding (UNIVERSE §2.4, adapted):**
1. Lots inside the member's free long-term room this year: **switch now** as part of harvesting. These take the room before plain sell-and-buy-back of direct funds, because the same room also stops a fee. *Claude's call.*
2. Remaining lots: run the break-even rule with a 10-year horizon (*Claude's call*). Short-term lots with ≤ 6 months to long-term → **wait** until that date. Equity units under 12 months old → assume a 1% exit load and **wait**. Break-even within 7 years and edge ≥ max(₹5,000, 0.5% of value) → **switch now, paying tax** (shows the tax). Otherwise → **switch next tax year inside the room** ("spread over tax years", replacing the note's SWITCH_SLICES).
3. Debt and other slab-taxed funds: tax at the member's slab rate on the gain; a nil-tax member switches whenever the gap is ≥ 0.1 point.
4. Every switch move shows: the fee saved a year in rupees, the tax paid now (often ₹0), and "check the exit load in your fund statement before selling".

New move kind: `switch_direct { memberId, isin, toIsin?, qty, value, gain, tax, feeSavedPerYear, when: 'now' | 'wait' | 'next_year', until? }`.

### 5.4 Marked done from the next import
After an import, each move shown or dated is matched against new sale transactions: same member, same ISIN, units within ±5% of the move's **latest sizing** (or of the `in_plan` snapshot, whichever is closer), sale within 10 days of the chosen date (from 1 Feb if none was picked). A match writes a `detected_done` record. For a switch, a purchase of the direct ISIN is also looked for; if found, both steps are done. The Plan screen shows "Done, seen in your statement". The family's own "Mark done" stays and writes `done`; only `detected_done` counts toward the success measure.

**Which statements confirm what:**
- Mutual funds: the CAMS/KFintech detailed CAS. Fund houses often record a regular-to-direct switch as "Switch Out" / "Switch In" lines. The CAS parser (`src/parsers/cas.ts`) classifies every transaction line by the sign of its units, so these already read as a sale and a purchase; a test pins it.
- Shares and ETFs: only the broker's tradebook or tax P&L (the NSDL/CDSL CAS has holdings, no transactions). Onboarding and the fresh-statement email say so: "For shares, import your broker's tradebook."

## 6. Invites

- New table `beta_invites (email text primary key, invited_at timestamptz, note text)`. Account data (tier 4), not encrypted.
- The `family` function refuses load and save for a signed-in user whose email isn't on the list; the app shows "This beta is invite-only. Ask the person who invited you." The founder's own email is seeded.
- The admin screen gets "Invite by email" and a list; each change is logged with the existing admin-read log mechanism.
- *Claude's call:* blocking at the function is enough; Google sign-in itself stays open because Supabase Free has no allowlist hook for Google, and an uninvited account holds nothing.

## 7. Season emails

**Consent:** one switch on the Account screen, **"Harvest season help"**, off until the manager turns it on, stored in the family document (`AppState.alerts = { seasonHelp: boolean }`). Its text: "From 1 Feb to 31 Mar, our server reads your family on each email day (once a week, plus a few deadline days) and on 31 March for the final totals, to email you what's left to do, and adds your numbers, without names, to the beta's totals. Each read is listed below." The onboarding checklist suggests it, and the founder asks beta families to turn it on. *Claude's call:* one switch for both, off by default, because both are the server reading the family, and the secure storage design promised every server read is shown to the family.

**Every automatic read is logged.** Each time the `alerts` function decrypts a family it writes a row to `season_log (family_user_id, kind, on_date)`, kind one of `season_check`, `email_start`, `email_weekly`, `email_deadline`. The Account page lists them under "Automatic season checks", beside the founder's reads. Families with the switch off are never decrypted by `alerts`: the `family` function copies the switch to a plain `families.season_help` column on each save, and `alerts` filters on it before decrypting.

**Freshness:** the server reads what was last saved. Every email says "Based on what you last saved on <date>" (from `families.updated_at`). If that is over 30 days old, the weekly email carries only the fresh-statement line, no room figure.

**What is sent (to the manager's sign-in email only):**

| Email | When (IST, 11 am) | Content |
|---|---|---|
| Season start | 1 Feb | Usable room left this year, last safe day, number of moves waiting |
| Weekly | Each Sunday from 7 Feb to 28 Mar | Room left, moves waiting and the next date the family picked, moves done since last week |
| Deadline | 1 Mar, 15 Mar, last safe day | Room left and the date; on 15 Mar, one line: "If anyone booked taxable gains this year, check the 15 March advance tax instalment." |
| Fresh statement | In a weekly email, if the last import is over 30 days old and moves are waiting | "Import this month's statements so the app can mark what's done." |

Every email: one rupee figure (usable room left: room the family can still use on gains it actually has, section 1; omitted when ₹0), counts and dates only, no names, funds or income; a link to the app; "Turn these off on the Account page" (one click, no prompt). At most one email a day. Nothing is sent if usable room left is under ₹2,000 and no moves the family can act on now are waiting (NUDGE floor). A send that fails keeps its log row, marked not sent; a same-day re-run resends only those. *Changed 18 Nov 2026 in the build (ruling): the figure was "family room left", which told families with nothing to harvest they had ₹1.25 L.*

**How it runs:**
- Supabase Cron calls a new `alerts` function daily at 05:30 UTC (11:00 IST).
- The function decides from the date whether today is a send day; if not, it only writes the season numbers on Sundays and stops.
- On a send day: for each family with `seasonHelp` on, decrypt, run the engine bundle (`computeFamily` with the public `prices/latest.json`), build the email from a pure template in `_shared/seasonEmail.ts`, send through the email API, and write the `season_log` row. A row already present for that family, kind and date means skip (safe to re-run).
- **Provider:** Brevo's free HTTP API (single verified sender, no domain needed), behind a one-function interface `sendEmail(to, subject, text)` so another HTTP provider can replace it. *To confirm at setup:* the free plan's daily limit and sender rules; Resend needs a domain the project doesn't own. The founder sets up the provider account and secret (a setup guide, like the secure storage guide).
- If the email provider can't be set up in time, the calendar file still carries every dated step; only the weekly nudge is lost.
- Side effect: a daily cron call keeps the free project from pausing after 7 idle days.

## 8. Season numbers for the founder

On each Sunday run from 1 Feb to 28 Mar, and a final run on 31 Mar (no reads after 31 Mar), the `alerts` function also computes, for every family with season help on (and logs that read, section 7), usable room and room used (section 1 definition), and moves shown, dated, marked done and detected done. It writes **one row for the whole beta** to `season_stats (week, families, room_usable, room_used, used_share_by_family numeric[] sorted, moves_shown, moves_dated, moves_done, moves_detected, families_with_detected)`. No family id is stored. The admin screen shows the table. *Claude's call:* totals only, so the founder can judge the beta without opening any family. Families with season help off aren't in the totals; the founder asks them directly.

## 9. Capital gains schedule

- Per member, for FY 2026-27, from the realised gains the engine already computes.
- Sections, labelled in plain words with the old ITR schedule name in brackets: equity long-term (112A), equity short-term (111A), other long-term, slab-taxed gains (debt and specified funds), losses set off and carried forward, intraday and F&O lines from broker summaries.
- The equity long-term section lists each sale (ISIN, name, units, sale date, sale value, cost, 31 Jan 2018 value where grandfathered, gain), because the return asks for it scrip-wise.
- Downloads as a CSV per member and shows on the member page. Built in the browser; no server.
- Note on the page: "The new Act's return forms for 2026-27 are not out yet (expected April–June 2027). Check the sections against the form, or give this to your CA."
- Tests: the foundation's golden tax cases and the 7 test families (core feature list §2.6) produce schedules whose totals equal the member's computed gains.

## 10. Where to put new money (April 2027)

- Method: PLACE §3.3 greedy with exact tax, regret ordering and swap pass, rounding to ₹1,000, with the headroom-bucket method (PLACE §3.6) as a test cross-check only. Tests: the PLACE §4 golden case, brute force on small random families (within 0.5% of optimum), and the invariants in PLACE §3.3.
- Asset classes: those `bringsHome` already prices (equity fund category, debt fund, FD, PPF, gold ETF), one sale at the end (earlier decision).
- Screen: the manager enters an amount, a split by asset class and a horizon; the result is one move card per placement with the PLACE §3.4 reason, gifts flagged with the gift wording and never pre-ticked.
- New move kind `place_new_money`, recorded like the others.
- *Claude's call:* designed here, planned in its own plan in March, after the season build is out, since new money is year-round and the room lapses on 31 March.

## 11. Left to the builder

- Exact screen layout of dated moves, the calendar button and the schedule table, within the existing UI patterns.
- The direct-twin name normalisation details, with tests on real AMFI names.
- The `season_log` and `season_stats` migrations and their row-level security: `season_log` readable by its own family (like `admin_reads`), `season_stats` by no browser (admin function only).
- Email wording within section 7's rules.

## 12. Decisions taken (for the founder to check)

| # | Decision | Why | Cost if wrong |
|---|---|---|---|
| 1 | Success = ≥5 families by 1 Feb, ≥60% of room used, moves confirmed by import in ≥4 families, zero unfixed wrong moves | Matches the research's north star and the season's lapse date | Targets can move; nothing in the build depends on them |
| 2 | Season first; new money in April; raise ₹X after the season | The room lapses 31 Mar; new money is year-round | New money waits 2 months |
| 3 | Switch to direct is part of harvesting and takes the room first | Same ₹1.25 L; switching also stops a fee | A family wanting the room for another fund can still choose |
| 4 | Calendar file for dated steps; server email only for the season | No data leaves the browser for daily steps; fewer emails | Families who ignore calendars get fewer reminders |
| 5 | Emails off by default, no names or funds, one figure | Server reads the family; email isn't private | Fewer families opt in |
| 6 | Brevo free HTTP API, behind a swappable function | Free, no domain; SMTP is blocked in Edge Functions | Swap provider; calendar still works |
| 7 | Invite list checked in the `family` function | Google sign-in can't be restricted on the free plan | None found |
| 8 | TER gap from a category table | No new data fetch | Switch timing slightly off for unusual funds |
| 9 | Last safe day = second-to-last trading day before 31 Mar | T+1 settlement and fund cut-offs | One day of season lost |
| 10 | Saving floor ₹1,000 (engine used ₹500) | NUDGE guardrail | Small moves hidden |
| 11 | Season numbers stored as beta totals only | Judge the beta without opening families | Can't see which family is stuck without asking them |
| 12 | Beta experiments E1–E8 not run | 5 families can't show differences | Learn less about wording |
| 13 | ELSS lock-in fix is part of this project | Harvesting could suggest selling locked units today | — |
| 14 | One "Harvest season help" switch covers emails and beta totals; every automatic read logged for the family | Keeps the secure-storage promise that every server read is shown | Families who leave it off are missing from the totals |
| 15 | "Usable room" = room the member can actually use (room and harvestable gain, whichever is smaller), recomputed weekly | A member with no gains to harvest shouldn't count as a miss | The 60% target means less if families hold little equity |
| 16 | Dated moves are re-sized at today's prices and hold their room first; calendar shows no units | Stale units could go past the room and cost tax | Families must open the app on the day |
| 17 | Shares are confirmed only from broker tradebooks; fund "Switch In/Out" lines count as purchase and sale (already parsed; a test pins it) | Demat CAS has no transactions; fund houses record switches that way | Families who don't import tradebooks show as unconfirmed |
| 18 | Emails say what date the data is from; over 30 days old, only the "import fresh statements" line | The server reads the last save, not the browser | — |
