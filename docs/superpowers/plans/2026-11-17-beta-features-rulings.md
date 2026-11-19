# Beta features: decisions taken while building

20 Nov 2026. Branch `beta-features`. The founder delegated the calls (17 Nov 2026). Each line is one decision Claude made during the build: what was decided, why, and what it costs if wrong. The design-level calls are in the spec, section 12. The test suite was 385 tests passing at the end.

## Decisions, in the order they were made

- Ruling: T2 ships without Step 5 (holiday list stays published:false) — circular not out until mid-Dec — cost: last safe day hidden until filled; fill before 10 Jan.
- Ruling: founder steps in T7/T11 are written into docs/guides/beta-setup.md, not executed — they need his accounts/keys.
- Ruling: gap ≤ 0.1 → no switch move — nothing to gain — cost: none.
- Ruling: in-room regular lots switch before harvest_gain and replace it; switch wait replaces generic wait for regular holdings — avoid double-counting room/duplicate cards — cost: family can't choose plain harvest of a regular fund.
- Ruling: switch floor = taxAvoided + one year's fee saved ≥ ₹1,000 — fee saving is the switch's own benefit — cost: small switches hidden.
- Ruling: ELSS regular funds never switched — a switch restarts the 3-year lock — cost: ELSS fee drag stays.
- Ruling: beyond-room remainder of a holding already switching in-room gets no move this year — one moveId per holding/account — cost: shows next year instead.
- Ruling: slab rate defaults to 30%+cess when income not entered — conservative, avoids a free-looking switch — cost: some nil-tax switches shown as next_year.
- Ruling (T4): datable kinds = harvest_gain, switch_direct, gift, harvest_loss; wait not datable — waits already carry a date — cost: none.
- Ruling (T4): dated priority inside each step + dated-gift receiver room reserved before step 1 — reuse existing sizing, no second engine — cost: cross-step priority edge cases.
- Ruling (T4): stale datedMoves (holding gone) dropped from sizing silently, kept in state — cost: orphan entries.
- Ruling (T6): match against moves computed before the import + latest in_plan snapshot — after the import the move shrinks/vanishes — cost: none.
- Ruling (T6): gift confirmed by the receiver's sale; switch needs the toIsin buy when toIsin known; one txn confirms one move — cost: gift transfers alone never count.
- Ruling (T7): DELETE always allowed for non-invited users — an uninvited family must still be able to delete its data — cost: none (overrides plan's 403 on DELETE).
- Ruling (T7): admins count as invited (isInvited(email, userId)) — else the founder can't reach Admin to invite anyone — cost: none.
- Ruling (T7): invite changes logged via logRead with family=admin=self, reason "invite: <email>" — reuse existing log — cost: shows in founder's own Account log.
- Ruling (M1 fix): undated detection window = seasonStart..rules.end; dated window = [date − 3 days, date + 10 days] — families trade when they can — cost: rare false match.
- Ruling (M1 fix): a dated entry is retired (skipped in sizing) once its move has done/detected_done; Plan shows a "Done this season" list built from done/detected_done records — done moves stop being generated — cost: none.
- Ruling (M1 fix): ELSS detection falls back to the scheme name (/ELSS|Tax Saver|Tax Saving/i) when category is missing, AND the shown-records effect waits until market data has loaded — append-only record must not hold unsafe moves — cost: a non-ELSS fund named "tax saver" treated as locked.
- Ruling (M1 fix): slab-taxed switch gains use the member's remaining nil-band (bonus) room first and reduce it; only the excess is taxed at slab — matches summariseYear — cost: none.
- Ruling (M1 fix): T2 Step 5 (holiday list) is a gate for season-ready by 10 Jan, not for starting M2.
- Ruling (M1 fix, accepting fixer's deviation): a dated switch is re-emitted only as 'now' with ₹0 tax; otherwise it shows "No room left" — keeps "no taxed move under the family's date" while not breaking dated tax-free debt switches for nil-income members — cost: none.
- Ruling (M1 fix): switch tax = exact summariseYear difference against the member's earlier moves — replaces separate bonus-pool tracking, cross-check test passes — cost: none.
- Ruling (M1 fix): un-ticking a manual done (latest record 'undone') restores date priority; detected_done is permanent — cost: none.
- Ruling (M1 residual, replaces earlier I4 ruling for manual done): only detected_done retires a dated move; a manual done keeps the move's room until the import confirms it — the sale isn't in txns yet — cost: the card stays listed (ticked) until the statement is imported. Small targeted fix dispatched (load-bearing money correctness).
- Ruling (T9): used_m = min(LT equity gain since season start, max(0, full room − LT gain before season)) — counts only gain that fell inside the room — cost: none.
- Ruling (T9): movesWaiting excludes wait, noRoom and done/detected moves; doneSinceWeek = done/detected records in the last 7 days — cost: none.
- Ruling (T10): seasonEmail.ts uses a local structural input type with a Vitest assignability check against seasonSummary's return — Deno _shared can't import src/ — cost: none.
- Ruling (T10): email subjects carry no ₹ figure or names; no urgency words or emojis — spec anti-nagging and privacy — cost: none.
- Ruling (T11): log-exists check before decrypt; log before send, delete on send failure — no double sends, no needless decrypts — cost: none.
- Ruling (T11): if prices/latest.json can't be fetched, skip the whole run — never email wrong numbers — cost: a missed day.
- Ruling (T11): recipient = confirmed sign-in email via a service-role-only view/RPC; families without one skipped — cost: none.
- Ruling (T11): console logs carry counts only, never emails, names or amounts — cost: harder debugging.
- Ruling (T11 fix): move withFunds/withPrices + repo fund overrides into the engine; server fetches funds.json too and skips the run if either fetch fails or is malformed — one classification path for browser and server — cost: none.
- Ruling (T11 fix): add season_log.sent boolean (default false, set true after a successful send); Account shows "Emailed" only when sent, else "Read your family (<kind> day)" — keep kind for idempotency — cost: none.
- Ruling (T11 fix): the email's one ₹ figure and the ₹2,000 floor use usable room left (Σ left_m = usable − used), worded "tax-free room your family can still use" — a family with nothing to harvest shouldn't be told it has ₹1.25 L — cost: departs from spec wording "family room left"; recorded for founder.
- Ruling (T11 fix): test-send branch gated by the secret + header x-alerts-test: 1, fixed sample email with no family data to ALERTS_SENDER — lets the founder test Brevo before 1 Feb — cost: none.
- Ruling (M2 fix): actionable moves only in movesWaiting (switch_direct must be 'now'); drop "₹0 room" sentence — anti-nagging — cost: none.
- Ruling (M2 fix): never unlog after decrypt; send failure keeps row sent=false; same-day re-run resends only sent=false rows — keeps every read visible — cost: extra read on a manual re-run.
- Ruling (M2 fix): final totals on 31 Mar, no reads after 31 Mar; consent reworded "on each email day (once a week, plus a few deadline days)" — consent must match reads — cost: 29–31 Mar sales imported later miss the totals.
- Ruling (M2 fix): weekly import nudge when lastImport null or ≥30 days and moves waiting — feeds detected_done success measure — cost: one more line in some emails.
- Ruling (M2 fix): secret-gated x-alerts-date rehearsal, no stats written — test the live path before 1 Feb — cost: none.
- Ruling (M2 fix): backup restore resets season help to off — consent needs a click on this device — cost: families re-tick after restoring.
- Ruling (M2 fix): Home prompt hidden after any explicit choice (alerts.chosen) — no nag after "off" — cost: none.
- Ruling (M2 fix, accepting): rehearsal with x-alerts-date uses that day's log row, so the founder's own family skips the real 14 Feb email — only his family is opted in at rehearsal — cost: one weekly email for the founder.
- Ruling (M2 fix, accepting): backup restore resets alerts to { seasonHelp:false, chosen:false } so the Home prompt reappears — consent re-asked after restore — cost: none.
- Ruling (T13): funds with tax type 'check' go into a "Needs checking (tax type unknown)" section, never silently placed — cost: one more section.
- Ruling (T13): totals invariant excludes set-off and business sections; no tax-maths changes — discrepancy → NEEDS_CONTEXT — cost: none.
- Ruling (T13 fix): CSV/screen header "Cost for tax (₹)" + one-line note explaining grandfathered cost; set-off section shows in-year set-off lines if the tax result exposes them, else title "Losses brought forward and carried forward"; blank dates on non-sale rows; formula-injection guard (prefix ' to cells starting =,+,-,@ in text fields) — CA-facing clarity — cost: header differs from plan wording.
- Ruling (final fix): rehearsal restricted to admin families, date 2027-03-01 — reviewer showed the earlier accepted cost was understated — cost: none.
- Ruling (final fix): consent text adds "and on 31 March for the final totals" — consent must match reads before families consent in Dec/Jan — cost: none.
- Ruling (final fix): season_log.outcome + retrying claim; retry only 'failed' — no double sends, no needless re-decrypts — cost: one more migration.
- Ruling (final fix): one ordered setup sequence: push → admin → merge → invite → family → season emails — no lockout window — cost: none.
- Ruling (after PR #5 review, finding 1, 20 Nov 2026): season_alert_families lists only families whose lower(sign-in email) is on beta_invites, or who are in admins — same gate as family load/save; uninvited families' saves are refused, so they couldn't turn season_help off and kept getting reads and emails — new migration 20261215000400_season_alerts_invited.sql (the earlier ones are live); a removed invite stops reads and emails from the next daily run — cost: none; families.season_help stays true in the row, so re-inviting resumes emails without a new click (the family had consented before).

## Small findings left open (from task and milestone reviews)

- Task 1: minor (deferred): lockedUntil computed twice in holdings build; floor only tested for harvest_gain; Member.tsx IIFE for lock date.
- Task 1: minor (deferred): floor test name says "₹800 not shown" but first half asserts shown; ELSS no-gift test lacks a precondition that the holding exists.
- Task 2: minor (deferred): Plan.tsx LastSafeDay gate hardcodes '2027'; no UI test for 1 Feb gate; Step 5 holiday fill + hand-computed test owed after mid-Dec 2026.
- Task 3: minor (deferred): raw ISO date in wait reason; no gap≤0.1 guard in generator; switch.ts hardcodes rates instead of rules; in-room switch room missing from headline totals; loss step ignores usedQty (harvest_loss + switch on same units); records capture first when/until only; beyond-room now-with-tax reason omits partial room.
- Task 3: minor (deferred): SIP test lot-date formula uncommented, misleading comment; exit-load line in MoveRow has no UI test.
- Task 4: minor (deferred): noRoom moves counted in "N of M done" and show ₹0 figures; noRoom harvest_loss says "No room left"; gift date line says "Sell on"; past-date dated moves keep priority forever; parseDated splits on | and > in ids.
- Task 4: minor (deferred): `biggest` ordering uses start-of-pass room; beyond-room switch doesn't record usedQty (harmless now). UI checked by typecheck only.
- Task 5: minor (deferred): filename hardcodes 2026-27; dated wait-only shows button with no events.
- Task 5: minor (deferred): non-ASCII fold test doesn't target the exact 75-octet boundary.
- Task 6: minor (deferred): window edges (anchor day, anchor+10) not pinned by tests; no exact-5% test, float 0.05 (safe); new Date() inside state updater; buy search doesn't exclude estimated buys; greedy matching; no test for `at` default or Import wiring; redundant Shares copy; detected chip reuses `chip room` class.
- Task 7: minor (deferred): invite log rows in admin_reads show on founder's Account and are erased if founder deletes account (per ruling 3); not_invited never clears in session; uninvited users can still write own profiles row; "never read" spy misses updateIf/removeAll; long note silently cut to 200 server-side.
- Task 7: minor (deferred): Delete-account path for uninvited users shows two toasts; signOutPlan keys only on current status.
- M1 minor (deferred): no fetch timeout on market gate; "worth up to" sentence uses fam.totals while headline uses planView; dated tax-free slab switch not sized ahead of harvests; loss harvest sizes against plan taxable without move gains (pre-existing); Math.max clamp on loss-making switch tax (theoretical).
- Task 8: minor (deferred, privacy — triage at M2 review): restoring a backup carrying seasonHelp:true re-enables server reads without a click on this device (reset alerts in parseBackup). Others: consent test reads source (move copy to a module); stacked doc comment in _shared/family.ts; consent text not aria-describedby; raw ISO date in season log list.
- Task 9: minor (deferred): broker-adjustment rows land in `before` undocumented; negative pre-season LT loss widens fullRoom−before (harmless); no isolated undone test.
- Task 11: minor (deferred): swallowed markSent failure not logged; alerts/index.ts Deno wiring untested (not run locally); engine PriceFile/FundsFile types duplicate src/prices/parse; cron migration edited in place (never pushed); security-definer view kept (advisor will flag); stats can be missing for a week after a crashed run.
- Task 12: minor (deferred): season stats load failure leaves "Loading…" forever; redundant client re-sort; 11-column table unchecked at phone width; admin.ts imports alerts.ts for a type.
- M2 minor (deferred → final review fix wave): retry path bypasses unique-insert guard (overlapping runs could double-send a sent=false row); guide step 7 contradicts the cron note at line 21; rehearsal guide should say nothing sends if the founder's family is under the floor; bad x-alerts-date validated after market fetch; 31 Mar season_check read isn't on an "email day" — consent wording should cover it ("on each email day and on 31 Mar"); restore of a help-off backup turns help off with only a plain toast.
- Task 13: minor (deferred): no per-section total rows in CSV; business carry-forward not shown; isSection const ordering in Member.tsx.
- Final fix wave re-review: all addressed, no new Critical/Important. Minors kept: retry claimed-then-crashed row never retried (fails safe); one test name overstates; guide retry line references Step 14.
