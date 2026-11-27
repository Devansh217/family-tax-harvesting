# Guardrails

The rules every change must keep. The `guardrail-reviewer` agent (`.claude/agents/guardrail-reviewer.md`) checks each PR against every rule here; a broken rule blocks the merge. When a change makes a rule wrong, change the rule in the same PR and say why.

Paths are under `prototype/src/` unless they say otherwise.

## 1. Tax safety: a move never creates tax

The plan is the product. A family that follows a move must never pay more tax than the move says.

- **Room is the ceiling.** A harvest, gift or in-room switch books gain only inside the member's free room after booked sales, planned sales and the moves sized before it (`engine/family.ts`). Lots from a holdings file count their gain `1 + APPROX_MARGIN` times against the room (`engine/openingLots.ts`); the cushion is never spent by a later move.
- **Known lots only.** Moves use long-term lots with a known date and cost: never an `estimated` lot, never a short-term lot for a harvest, never an ELSS lot still locked, never a pre-Feb-2018 share missing its 31 Jan 2018 value. `approx` lots are allowed only with the cushion.
- **Gifts follow clubbing.** A gift move goes only where `canGift` (`engine/relations.ts`) allows: a relative, not clubbed back (spouse, minor child, son's wife, HUF), resident.
- **One tax function.** Tax comes from `taxForYear` / `summariseYear` (`engine/tax.ts`), with the set-off order, rebate and the ₹12 L line in one place. Rates and limits live in `engine/rules.ts` per tax year, never as literals elsewhere.
- **Broker totals win.** Where the history is incomplete, booked gains use the broker's Tax P&L (`brokerAdjustments`); a change keeps room and tax matching the broker.
- **Old data is marked.** A move on an account whose newest data is 30 or more days old, or that uses room of a member with such an account, is shown marked (`oldData`, `roomMayBeSmaller`) and left out of the Plan and Home headlines. A holdings file dates the units, not the gains booked since, so on an account with a trade history, fund statement or Tax P&L it never clears `roomMayBeSmaller`; only newer such evidence does. An account with only a holdings file is dated by that file, so an old one still raises the mark. This is the accepted exception where a move may rest on out-of-date room.
- **Worked numbers.** Every change to a tax rule or move sizing carries a test with hand-checked rupee figures.

## 2. Money and units

- Money is integer paise (`Paise`), quantities integer units × `QTY_SCALE`. Round once, explicitly, at the point of division (`prorate`, `Math.round`).
- Display goes through `ui/format.ts` (`inr`, `inrShort`, `units`).

## 3. Saved families keep working

Families live in browsers and in accounts; a deploy reaches them all at once.

- A family saved before the change loads and computes the same or better. Shape changes go through `normalizeState` (`store.ts`) with a migration test.
- Prefer repairs worked out on every compute (like `effectiveTxns`) over rewriting stored data. When a fix needs the user to re-import, the Plan says so (`planGaps`).
- Import order and re-importing the same file give the same result.
- Move ids stay stable, and `recommendations` is append-only: records are never edited or removed.
- The lazy screens survive a deploy (`ui/staleDeploy.ts`).

## 4. Privacy

- Statement files and their passwords are read in the browser only: never sent over the network, never logged, never stored. Passwords live only in component state.
- Personal data stays out of the repo and out of everything public: no names, PANs, folio or account numbers, emails or real amounts in code, test fixtures, commits, PR text, logs or `console` output. Real statements stay in the git-ignored `data/private/`; scripts over them print counts and match/no-match only (`scripts/check-private.ts`).
- No Aadhaar and no broker passwords, ever.
- Privacy copy states what the code does (who can read the account copy: see security review H3).

## 5. Security

- **CSP holds** (`csp.ts`, `csp.test.ts`): no new external origin, inline script or `eval`. pdf.js keeps `isEvalSupported: false`.
- **Untrusted input is validated:** statements, backups (`parseBackup`), CSV export (formula guard), file size.
- **Supabase:** row-level security on every table, no service key in the client, every function checks the caller. Migrations are new files under `prototype/supabase/migrations/`, never edits of applied ones.
- Open findings in `docs/security/2026-11-21-security-review.md` are not made worse.

## 6. Wording and compliance

- Moves are tax arithmetic on holdings the family already owns: sell and buy back the same security, gift, book a loss, wait, switch to the direct plan of the same fund. The app never names a new security to buy.
- Copy reads as estimates, not advice: no "you should buy", "recommended", "best fund". Every screen with a move keeps the disclaimer (`Disclaimer`).
- Plain English, short sentences, rupees in Indian grouping.

## 7. Architecture and cost

- Module boundaries hold (`boundaries.test.ts`): the engine imports only the engine; parsers and prices only the engine and packages.
- Free tier only: no paid service, API key or dependency that bills.
- Dependencies are pinned and few; a new one earns its place in the PR text.

## 8. Proof

- Behaviour changes ship with tests that failed first.
- `npm run typecheck`, `npx vitest run` and the smoke suite (`npm run test:smoke`) pass.
- A change the browser shows is checked in a browser, and the PR says how.
