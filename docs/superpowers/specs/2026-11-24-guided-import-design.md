# Guided import: design

Date: 24 Nov 2026. Status: written after a brainstorm with the founder (layout, stop rule, success and wrong-file screens, approach all agreed); awaiting the founder's approval of this document.
Source: `docs/NEXT-WORK.md` item B1 (was §3 items 1 and 5); `docs/fresh-run-notes.md` points 1, 2, 9 and the founder rules; builds on `docs/superpowers/specs/2026-11-22-holdings-first-engine-design.md`.

Paths are under `prototype/src/` unless they say otherwise.

## Why

During the 22 Nov fresh import the founder found no guide while uploading. The Import screen takes any file, shows the same fixed "What to import" list to everyone, and confirms with a brief "Added to <name>" toast. On that run an eight-month-old holdings file and the same tradebook year twice went in with no warning, and the Plan suggested moves on shares sold months earlier (notes point 2). It wasn't clear whether a file had worked (point 1).

The holdings-first engine (PR #18) made the holdings file decide what's held and the Tax P&L decide what's booked, with tradebooks optional. It also knows what each member is missing. The guided import turns that knowledge into a per-member checklist: which file next, where to download it, what it unlocks, and when to stop.

## Goals

1. **A family view first, a checklist per member on click.** The Import screen opens on a table of members × steps; clicking a member opens their checklist.
2. **Order:** holdings file (today's) → this year's Tax P&L → tradebooks newest first, only while gaps remain. Each step says what it unlocks, in rupees or share counts where known.
3. **"Stop here, show my plan"** is always available, with a completeness line: "Moves use X% of <member>'s holdings by value".
4. **Steps follow the broker and the member.** The first file decides a member's broker; a second broker adds its own steps.
5. **Wrong files are caught and named** on the file's card: the same file again, an older holdings file, an old holdings file with nothing newer, last year's Tax P&L in place of this year's, a missing tradebook year.
6. **Clear success:** after each file, a card says what was read and what changed in the plan.
7. **Results never depend on upload order.** The guide is worked out from the saved family on every render; nothing about progress is stored.

## Non-goals

- New readers. The Angel One holdings reader (shares, SGBs, long-term counts; NEXT-WORK B3) and the Angel One Tax P&L reader (B2) are separate work. The guide shows their steps honestly as "not read yet" and is built so they join by flipping a capability flag.
- Recognising gifts within the family (NEXT-WORK B5), wording fixes (C3), animations of transfers (E4).
- Detecting a file imported under the wrong member.
- Marking or holding back **Plan moves whose only evidence is months old** (notes point 2). The founder chose to keep that Plan change separate (24 Nov); this design only shows the "Newest data from <date>" line (section 7).
- Any engine change. The guide reads the engine; it doesn't change a tax figure, room or move.

## Anti-goals (failure even if it "works")

- **The checklist and the plan disagree.** A tick that stays after its import is removed, or a step "done" that the engine doesn't use. Avoided by deriving every status from the saved family on every render.
- **The guide demands files.** Fewer files is worth the 10% cushion (founder). A member is "done" when only the cushion is left; tradebooks never block the plan.
- **A wrong file silently changes or hides anything.** Every flagged file is still kept ("more data never spoils"), and the note says what it did or didn't change.
- **Promising what the app can't read.** No step says a file will unlock something the readers don't support today.
- **Stored progress.** No new field in `AppState`, so no migration and nothing to drift.

## Constraints

- All of `docs/GUARDRAILS.md`; in particular §3 (import order and re-imports give the same result), §4 (files read in the browser only, passwords in component state only, no personal data in fixtures or logs), §6 (plain English, estimates not advice, Indian grouping through `ui/format.ts`), §7 (`ui/` may import the engine; the engine never imports `ui/`), §8 (tests that fail first, typecheck, vitest, smoke suite, browser check).
- Free tier, no new dependencies.
- Phone width works: the family table becomes stacked rows.

## Approaches considered

1. **Work the guide out on every compute (chosen).** A pure helper `ui/importGuide.ts` takes `AppState` and `FamilyView` and returns each member's brokers, steps with statuses and unlock figures, and the completeness figure. A second pure helper compares the family before and after a file for the success card and wrong-file notes. The screen only draws. No stored state, so no migration, and order independence follows by construction. Reuses `decidingFiles`, `tradebookFrom`, `planGaps`, `cushionNudge`, `importAddedNothing`.
2. **Store each member's guide progress.** Simpler to draw, but new stored state with a migration, and it drifts from the files (remove an import, the tick stays). Rejected: works against "never depends on order".
3. **Grow `planGaps` into the guide.** One list for Plan and Import, but `planGaps` returns sentences and the guide needs structured steps, statuses, rupee figures and broker instructions. Reshaping it ripples into the Plan screen. Rejected; the Plan's gap links already open a member's checklist (`importHref`).

## Design

### 1. Screen and routes

- `#import` opens the **family table**. `#import-<memberId>` (existing `importHref`, used by the Plan's "Make this plan complete") opens that **member's checklist**. The member picker dropdown goes; the checklist has a "← Family" link.
- **Family table:** one row per member. Columns: Holdings, Tax P&L, Tradebooks, "Moves use". Each cell shows the step state in a word or two: "✓ 23 Nov", "Next", "Start", "Can't read yet", "Funds only", "✓ 2 years", "Done". A member with nothing imported shows "Start" in Holdings. A family "Moves use X%" line and one **"Stop here, show my plan"** button (goes to `#plan`) sit under the table. Rows are buttons (keyboard and screen reader friendly). On phones, each row becomes a stacked card.
- **Member checklist** (founder's option A): one section per account (broker). Each step is one of:
  - **done:** collapsed to a tick and one line of what was read ("Zerodha holdings · as on 23 Nov 2026 · 18 shares, ₹14.2 L"; "Tax P&L · 1 Apr – 22 Nov 2026"; "Tradebooks · FY 2026-27, 2025-26");
  - **next:** open, with the file's name, where to download it (broker-specific path), what it unlocks, and a drop zone;
  - **later:** greyed, one line of what it would add;
  - **can't read yet:** the reader doesn't exist; says what the plan does instead;
  - **optional:** the quiet cushion line (section 4).
  Under the steps: the completeness line, "Stop here, show my plan", and the member's other gaps from `planGaps` that aren't steps (funds to check, P&L overlap, P&L again, buyback P&L, holdings without a date), using their existing text and links.
- **Any drop zone takes any file.** The file is read and added to that member, and whichever step it fills ticks. The steps suggest an order; they never route or reject a file.
- The file cards (password, column mapping, preview, account label, "Also import its exits", Add) keep their current behaviour and live in the member checklist, above the steps, while files are being read. Paste rows, and the "record holdings with no history as bought on" option, move behind a "More options" disclosure in the member checklist.
- "Imported so far" becomes "Files for <member>" at the foot of the checklist (with Remove, as today), plus "All files" at the foot of the family table.
- The fixed `GUIDE` list in `Import.tsx` is removed; its download paths move into the broker step definitions (section 3).

### 2. Which broker and accounts a member has

- Worked out from the member's saved imports, positions, transactions and broker summaries: each distinct account label (`normAccount`) is an account. Its **broker** comes from the label and import formats: `Zerodha` (labels or formats matching Zerodha/Console/Kite), `Angel One`, otherwise **Other** (Groww, Upstox, demat CAS, MF folios and anything unrecognised).
- A member with no files shows a single **first step: "Holdings file"** with instructions for Zerodha and Angel One side by side and a line for other brokers (holdings export or NSDL/CDSL CAS). The first file decides the broker. The guide never asks which broker a member uses (founder).
- A second broker's file adds a second account section with its own steps.
- Fund-only sources: a mutual fund CAS ("MF folios") is its own **Mutual funds** section, not a broker.

### 3. Steps per broker

A step table in `ui/importGuide.ts`, one entry per broker, with a **capability flag** per step so a new reader flips a flag instead of rewriting the guide.

**Zerodha**
1. **Holdings file (today's).** Console → Portfolio → Holdings → Download (.xlsx). Done when the account has a dated deciding file (`decidingFiles`). Unlocks: "what's held today, long-term units and average cost: enough for a first plan."
2. **Tax P&L, this tax year.** Console → Reports → Tax P&L → <FY> → Download (.xlsx). Done when a counting broker summary (`countingSummaries`) for the account overlaps the current tax year. Unlocks: "exact gains booked this year, so the room matches Zerodha's figures."
3. **Tradebooks, newest first.** Console → Reports → Tradebook, one tax year per download (equity segment for shares). One step at a time, for the year before the oldest tradebook in the account (`tradebookFrom`), or the current year when there's none. Asked **only while gaps a tradebook can fix remain** (builder check Q1, my call):
   - The holdings file's long-term count already dates long-term units (`approx`, usable). What's left undated from the fill-in is the short-term rest, bought in the 12 months before the file's date. So only the tradebooks of the **tax years overlapping the 12 months before the deciding file's `asOf`** (at most two: usually this year and last) can date them. The step asks those years, newest first, and never older ones.
   - Undated lots no tradebook can fix don't count as a gap: corporate-action credits (`opening-ca`), multi-date split guesses (`guessAll`), equity bought before 31 Jan 2018 missing its FMV (own existing note), and units still undated after those years are in. They show one calm line: "N shares (₹X) aren't in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves." They never block "done".
   - Unlock line: "could date up to N shares (₹X) bought in the last year". When the years are in or nothing fixable is left, the step is done.
4. **Fund tradebooks (Coin)**, when the account holds funds with unknown dates: Console → Reports → Tradebook, segment MF, every year back to the first purchase, newest first, while funds in the account have undated lots. Never older than FY 2017-18 (my call: Coin opened in 2017, so no older Coin purchase exists). Unlock: "dates N funds (₹X) so they can get moves." This fixes the known gap that sends Coin users to the CAS (NEXT-WORK B6).

**Angel One**
1. **Holdings file**: capability "funds only". Instructions: the "Your Holding Details" file has a password; open it, save a copy as .xlsx, import the copy. Done-state line: "Funds read. Shares and SGBs in this file aren't read yet: they come from your tradebooks for now."
2. **Tax P&L**: capability "not read yet". Shown as "Angel One's tax P&L can't be read yet. Sales with unknown buy dates are counted the safe way." Never "next"; doesn't block "done".
3. **Tradebooks, newest first.** Reports → Trade history (Excel), one per tax year. Because Angel shares have no holdings file to check against, the guide can't tell when history is complete: the step asks "back to the year of your first purchase" and lists the years already in. It stays a suggestion and never blocks "done" (see "Calls").
4. Funds outside Angel: the Mutual funds section.

**Other / demat CAS:** one generic holdings step (holdings export or NSDL/CDSL CAS; done when the account has any holdings statement) and a generic tradebook step. Like Angel's, the generic tradebook step asks "back to the year of your first purchase", lists the years in and never blocks "done", because there's no long-term count to bound it. **Mutual funds (CAS):** "Detailed CAS from MF Central, CAMS or KFintech, from your first purchase to today". The password hint says "the password you chose when you asked for it" (fixes NEXT-WORK B6's "usually your PAN").

### 4. When a member is done, and the cushion line

- A member is **done** when every step is done, "can't read yet", or a suggestion that can't be checked (Angel tradebooks), no fixable gap remains (section 3), and no account shows the "Newest data from" line (section 7).
- **Cushion line (founder: option a, ₹4,000):** when the member is done but has moves on `approx` lots, sum the room kept spare over **every** open `approx` move of that member: gain × `APPROX_MARGIN` per move, summed, then rounded to ₹100 (not `cushionNudge`'s per-move ₹1,000 floor; builder check Q4, my call). If the total is **₹4,000 or more**, show one optional line per account that has such moves: "Optional: the FY <year> tradebook from <broker> would free about ₹X more room", with that account's year as `cushionNudge` gives it ("older tradebooks" when it gives none). Never "next", never blocks. The Plan's per-move nudge stays at its ₹1,000 threshold.

### 5. Completeness figure

- Per member: **value of holding lots moves can use ÷ value of all holding lots**, at today's prices (`Holding.lots[].value`). A lot is usable when `certain` is true and its holding's `taxType` is not `'check'`. `approx` lots count as usable (the cushion is accepted). Lots with no price (`value` null) are left out of both sides.
- **Units a holdings statement shows that no lot explains** (accounts without a Zerodha holdings file: demat CAS, generic holdings export, Angel fund holdings) count as **not usable**, valued as `planGaps` values them (`unexplained`: missing units × price). So an account whose tradebooks miss older purchases doesn't read 100% (builder check Q2, my call).
- **Angel One shares**, with no holdings file read, can't be checked: the figure covers what the app can see, and the Angel section says "Angel shares are counted from your tradebooks only until Angel's holdings file can be read." 
- Family: the same over all members.
- Shown as a whole percent, "Moves use 82% of <member>'s holdings by value". With no holdings: not shown ("—" in the table).

### 6. Success card

- When a file is added, the guide summary (steps, completeness, each member's tax-free room left, booked gains this year, counts of undated shares and funds) is captured **before** the import and compared with the summary **after** the family recomputes.
- A green card at the top of the member checklist shows:
  - **what was read**, one line by kind: holdings "as on <date> · N shares and M funds, ₹X"; Tax P&L "<from> – <to> · booked ₹X long-term, ₹Y short-term"; tradebook "N trades, <from> to <to>"; CAS "N funds, M transactions";
  - **what changed:** "Moves use 82% → 94%" with a bar that fills from the old to the new value (CSS transition, off under `prefers-reduced-motion`); and/or "Tax-free room left ₹1.02 L → ₹1.01 L, now matching Zerodha's figures"; and "N undated shares now dated". If nothing in the plan changed: "Read. Your plan is unchanged by this file."
  - the step it ticked, which collapses, and the next step opens.
- The card stays until the next file is added or the member is left. It has `role="status"`. The toast stays, reworded "Read and added to <member>".
- Not shown for a flagged file whose note already says it changed nothing.

### 7. Wrong files

Shown as an amber note on the file's own card **after it is added**. The file is always kept. Checks (all pure, from state before and after):

- **Same file again:** the import added nothing (`importAddedNothing`). Name the earlier import whose transactions or positions it matches: "Same as <file> you added on <date>. Nothing new was added." (Replaces the bare "Nothing new" line.)
- **Older holdings file:** a holdings file whose `asOf` is before the account's deciding file: "This holdings file is from <date>. You already have one from <date>, so this one changes nothing. Shares sold since <date> won't come back."
- **Old holdings file, nothing newer:** the new file is the deciding file, and its `asOf` is **30 or more days before today**, or it's in the engine's `staleFiles` (trades after its date): "This holdings file is from <date> and you've traded since / it's N months old. Download today's from <broker path>." The holdings step stays "next".
- **Last year's Tax P&L:** a P&L whose period ends before the current tax year starts: "This is the FY <year> tax P&L. It's kept, but this year's room needs FY <current>, from 1 Apr <year> to today." The P&L step stays "next".
- **A missing tradebook year:** after a tradebook is added, the account's tradebook transactions cover tax years with a gap between the oldest and newest: "No trades from FY <year> are in. If you traded that year, add its tradebook." Soft wording: a year with no trades is possible.
- **Old data overall (founder, 24 Nov; notes point 2):** per account, the newest evidence date is the latest of: the newest holdings statement's date for that account (a Zerodha holdings file, an Angel fund holdings file, a demat CAS: any position's `asOf`; for a fund CAS, which adds no positions, the newest CAS transaction per folio), the last tradebook trade, and the end of the newest counting Tax P&L. It is computed by the engine's `newestEvidence` (`engine/freshness.ts`, from the old-data design C1), the one definition shared with the Plan's marks; whichever of B1 and C1 is built first adds it. When it is **30 or more days before today**, the family table's row and the account's section in the member checklist show "Newest data from <date>" in the amber note style, with the account's holdings step reopened as "next" ("Refresh: download today's"), for every broker including Angel One. So the member isn't "done" until it's refreshed; a done tick for the older file stays visible under it (builder check Q3, my call). This is a standing line, not tied to one file. An account with no dated evidence at all doesn't show it.
- **A missing current year:** tradebooks exist for the account but none in the current tax year, and the account has a P&L or holdings file dated this year: "This year's tradebook isn't in, so trades since 1 Apr come only from <the tax P&L / the holdings file>." Informational.

### 8. Module layout and tests

- `ui/importGuide.ts` (pure, no React): `memberAccounts`, `memberGuide(state, fam, memberId, today)`, `familyGuide(state, fam, today)`, `usableShare(holdings)`, `guideSummary(...)`, `successDiff(before, after)`, `fileNotes(stateBefore, stateAfter, importId, fam, today)`. Broker step table with capability flags.
- `ui/screens/Import.tsx` becomes the family table and member checklist; `ItemCard` stays (moved to its own file if it helps size).
- Tests (`ui/importGuide.test.ts`, synthetic data, each failing first):
  1. Empty member → one holdings step with Zerodha and Angel instructions.
  2. Zerodha holdings in → holdings done with "as on" date; Tax P&L next.
  3. P&L in → P&L done; tradebook next for the current year only while undated shares exist; none asked when there are none.
  4. Tradebook step asks the year before the oldest tradebook; unlock figures equal the undated shares' count and value.
  5. Coin funds undated → fund tradebook step.
  6. Angel member: holdings "funds only", P&L "can't read yet", never blocking done.
  7. Two brokers → two sections.
  8. Order independence: the same files applied in every order give an identical `familyGuide`.
  9. Removing an import un-ticks its step.
  10. Completeness: hand-checked value ratio; `check` funds, guessed lots and unpriced lots handled as in section 5.
  11. Cushion line appears at ₹4,000 total, not at ₹3,900.
  12. Wrong files: duplicate names the earlier import; older holdings file; 30-day-old sole file; stale file; last year's P&L; gap year; missing current year; "Newest data from" at 30 days, not at 29.
  13. Success diff: completeness and room before/after; "unchanged" case.
- Smoke test (Playwright): family table renders, clicking a member opens the checklist, "Stop here" goes to the Plan.
- Browser check on the dev server with synthetic files, at desktop and phone width.

## What's left to the builder

- Component and class names, exact table/card styling within `docs/DESIGN.md`.
- Whether `ItemCard` moves to its own file.
- How the before-summary is held between add and recompute (component state is fine).
- Exact copy within the lines above, keeping GUARDRAILS §6.

## Calls made in this design (founder to check)

- The 30-day line for an old holdings file.
- Angel One tradebooks: the guide can't check completeness, so the step is a suggestion that lists years in and never blocks "done".
- The member picker dropdown goes; members are picked from the family table.
- Paste rows and the opening-date option move behind "More options".
- Flagged files are kept, never rejected.
- "Moves use X%" counts `approx` lots as usable and leaves unpriced lots out.
- Fund-only CAS is its own "Mutual funds" section, not a broker.
- Share tradebooks for a Zerodha account are asked only for the years overlapping the 12 months before the holdings file's date; shares still undated after that get a calm "possibly a bonus, IPO allotment or transfer in" line and never block "done".
- Coin fund tradebooks are never asked before FY 2017-18.
- Unexplained units in non-Zerodha accounts count as not usable in "Moves use X%"; Angel shares are counted from tradebooks only, with a line saying so.
- A stale account (30+ days) reopens its holdings step, so the member isn't "done" until it's refreshed.
- The ₹4,000 cushion total counts every approx move, with no per-move floor.
