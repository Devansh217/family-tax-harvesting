# Plan: mark moves that rest on old data (design)

24 Nov 2026. Source: `docs/fresh-run-notes.md` point 2 ("no moves, or clearly marked ones, where the only evidence is months old"). Decided with the founder in this session.

## Why

In the real run, A's files stopped at 31 March. The Plan offered "gift S1 to B" and "sell S2 at a loss" for shares A had sold in July, with nothing to say the data was eight months old. The family can't tell a move built on today's data from one built on a file from spring.

## Goals

- Every move that rests on old data says so on its row, with the date.
- Moves that use tax-free room say that the room may be smaller, because gains booked since the data's date aren't counted.
- The Plan says which accounts are old and links to Import.
- The headline only adds up moves backed by fresh data.

## Non-goals

- Holding moves back. The founder chose to mark them instead (24 Nov).
- The Import screen's "Newest data from <date>" line. That belongs to the guided import (branch `guided-import`, design `2026-11-24-guided-import-design.md`). It should call this design's engine function.
- Changing move sizing, move ids, dating or "Mark done".

## Anti-goals

- A marked move that looks just like a fresh one on Home or the Plan.
- A headline figure that counts moves on old data.
- Saved families computing differently apart from the new marks.

## Decisions (founder)

- **Mark, don't hold back.**
- **Leave marked moves out of the headline**: "₹X of gains made tax-free, of ₹Y possible", "cut from this year's tax … of ₹Y possible" and "worth up to ₹Z after costs".
- **Option 1: the engine marks each move**, so Plan, Home, the Member page and the calendar get the mark from the move itself, and the guided import reuses the date rule.

## Approaches considered

1. **The engine marks each move (chosen).** A pure engine function works out each account's newest evidence. `computeFamily` stamps the moves. There's one source of truth, and Home's move list (which reuses `MoveRow`) is covered.
2. **The Plan screen adds the mark** in `planView`. This leaves less engine change, but Home and the calendar would need their own copy, or would show unmarked moves, and the guided import would need its own date rule. Rejected.
3. **Hold back moves** (no move for an old account). Safest under §1, but the founder chose to mark instead.

## Design

### Newest evidence (engine)

A new function in `engine/freshness.ts`:

```ts
export const OLD_DATA_DAYS = 30;
/** Per `${memberId}|${normAccount(account)}`: the latest date any file shows for that account. */
export function newestEvidence(state: Pick<FamilyState, 'txns' | 'positions' | 'brokerSummaries'>): Map<string, ISODate>;
export const isOld = (date: ISODate, today: ISODate) => daysBetween(date, today) >= OLD_DATA_DAYS;
```

Per account, newest evidence is the latest of:
- the newest dated holdings position for that account, of any kind: a Zerodha holdings file, an Angel One fund holdings file, a demat CAS (any position's `asOf`). Not only the deciding file;
- for a fund (CAMS / KFintech) CAS: a fund CAS creates no positions, so for its folio accounts (`Folio …`) the date is the newest transaction whose source starts `Mutual fund CAS`. That is no later than the statement date, so a CAS-only account can only look older than it is, never fresher. If the CAS parser exposes the statement's period end, the builder may use that instead. So a member whose only file is a fund CAS still gets marks;
- the last tradebook trade (`isTradebook`);
- the `to` date of each Tax P&L that counts (`countingSummaries`). A P&L with no `to` date adds nothing.

An account with none of these (no dated file at all, e.g. the sample family) has no entry, so it gets no mark.

**One function for both designs (PR #19 guardrail review):** the guided import's "Newest data from <date>" line calls this same `newestEvidence`. Whichever of the two is built first adds `engine/freshness.ts`; the other imports it. There is no second definition.

"Old" means 30 or more days before the compute date (`asOf` in `computeFamily`). 29 days is not old.

### Marks on moves (engine)

Two optional fields on `MoveBase`:

- `oldData?: ISODate`: the newest-evidence date of the move's account, when it's old. For a gift, use the giver's account, since the units come from there.
- `roomMayBeSmaller?: true`: on a move that uses tax-free room, when any account of the member whose room it uses has old data. That member is the recipient for a gift and the member otherwise. Moves that use room are `harvest_gain`, `gift`, and `switch_direct` with `taxFreeGain > 0`. Losses and waits never set it.

A move can have `roomMayBeSmaller` without `oldData`. One example is a harvest in A's up-to-date Zerodha account while A's Angel One data is old. Another is a gift from a fresh giver to a recipient with old data. **Builder's call:** for a gift, the recipient's room is the one at risk, so the recipient's accounts decide `roomMayBeSmaller`.

`noRoom` moves (dated moves with nothing to do) get no marks. Sizing, ids, `reasons` and `fam.totals` don't change. `fam.totals` feeds the saved market history (`ui/market.ts`), so leaving it alone keeps that chart steady. **Builder's call.**

The engine also returns `oldAccounts: Array<{ memberId: string; account: string; newest: ISODate }>` on `FamilyView`, one per old account that any member holds something in. The Plan gap line uses it.

### Move row (`ui/screens/Plan.tsx`, `MoveRow`)

In the amber "time" colour, the style the "No room left" line uses, under the sub-line:

- `oldData`: "Based on data from 31 Mar 2026. Check you still hold these before acting."
- `roomMayBeSmaller`: "Gains booked since <date> aren't counted, so the tax-free room may be smaller. Import this year's tax P&L before acting." Here `<date>` is the oldest old date among the member's accounts.

When both apply, both lines show. Home's "Act before it lapses" list reuses `MoveRow`, so it shows them too.

### Plan gap (`ui/plan.ts`, `planGaps`)

There's a new key, `old_data`, one per old account: "<Name>'s <account>: newest data from 31 Mar 2026, so its moves may be out of date. Import today's holdings file." It links to `importHref(memberId)` with the action "Import". It goes in the existing "Make this plan complete" box. It isn't added for the sample family, since `planGaps` is skipped there already.

### Headline (`ui/plan.ts`, `planView`)

`gainTotal`, `nowTotal` and a new `laterSaving` count only open moves with neither `oldData` nor `roomMayBeSmaller`. The Plan header uses `planView().laterSaving` in place of `fam.totals.laterSaving`. Done moves still count as done. The lists and section totals still include marked moves, because the move row is where each one shows its own figure and its mark. **Builder's call:** the founder only decided the headline, and changing the section totals is left as a follow-up if the founder wants it.

### Guardrails

Add one sentence to `docs/GUARDRAILS.md` §1: "A move on an account whose newest data is 30 or more days old, or that uses room of a member with such an account, is shown marked (`oldData`, `roomMayBeSmaller`) and left out of the Plan headline. This is the accepted exception where a move may rest on out-of-date room."

## Tests (fail first)

- `freshness.test.ts`: the newest-evidence date takes the max of the holdings file, the last tradebook trade and the P&L `to`. Undated and older holdings files are ignored. A P&L that no longer counts is ignored. 29 days is not old; 30 days is.
- `family.test.ts`: an old account's harvest and loss carry `oldData`. A fresh account's harvest gets `roomMayBeSmaller` when the same member has an old account. A gift to a recipient with an old account gets `roomMayBeSmaller`. Ids and sizes are unchanged against the same state with fresh dates.
- `plan.test.ts`: there's an `old_data` gap per old account. The headline totals leave marked moves out.
- Smoke: a Plan with an old holdings file shows the mark.

## Left to the builder

The exact component layout, and the helper name for date arithmetic (reuse `addDays` or the existing date helpers).
