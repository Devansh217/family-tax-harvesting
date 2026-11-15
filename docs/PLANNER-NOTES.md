# Planner direction: working notes

Running notes from the 15 Nov 2026 brainstorm on turning the app from a tax-harvesting tool into a tax-first family financial planner. Not a design yet: the design doc comes once the open decisions below are settled.

## Decided

- **Direction:** a family financial planner with tax as the main rule. Every suggestion is judged by what comes home after tax for the whole family.
- **It recommends,** not just calculates: how much in funds vs stocks, which member holds what, where new money goes.
- **Registration:** the founder registers as a SEBI investment adviser before the public launch, to keep full control.
- **This season (2026-27) is a soft launch** for family and friends. It behaves like the real tool; regulatory guardrails wait for the public launch. Proposed, not yet confirmed: keep it free and invite-only, show a disclaimer, and build the risk profile and recommendation record now but leave them switched off.

- **The beta starts from holdings (decided 15 Nov 2026, later the same day):** beta users start from their statements; the target split, emergency fund and questionnaire steps 3–7 come with the full planner after beta feedback. The target-first flow below is the full planner's flow, not the beta's.
- **Secure storage is its own project (Claude's proposal, not objected to):** the table split, field encryption, admin-read logging and backups run right after the foundation and before any beta invites. The foundation keeps today's single saved document with the new shapes.
- **A plan starts from a target (decided 15 Nov 2026, for the full planner):** a ~2-minute questionnaire (expenses, loans, goals with dates, reaction to a fall) gives an emergency fund and a family-level split; statements then show the gap and the lowest-tax moves to close it, compared across members.

- **Synced data stays readable on the server, hardened (decided 15 Nov 2026):** normal password reset, server-side alerts, and the founder can debug for users. Because a breach would expose everything, the hardening items in the security to-do are required before the beta, not nice-to-haves.

- **Cross-member suggestions allowed, flagged as gifts (decided 15 Nov 2026):** the app may rank every member as the holder of new money. A move into someone else's name is marked as a gift, with what that means (it becomes their money, counts as their income, passes by their will or nominee) and the paperwork to keep. Clubbing rules still exclude spouse, minor child, daughter-in-law and HUF.
- **Foundation design (proposed 15 Nov 2026, not yet written up):** six tax types (equity, debt-like, in-between, interest, tax-free, dividends) taken from the SEBI fund category plus a maintained override list, showing "check" when unsure; a "what it brings home" table per member, with editable default return assumptions per category. Fixes today's name-based guess in `prototype/src/parsers/common.ts`, which taxes conservative hybrid, gold and international funds as equity.

- **Beta consent: one manager (decided 15 Nov 2026):** one person signs in and manages every member. For each adult the manager records "they agreed" with a date, stored so per-member sign-in can replace it at the public launch without losing data.

- **Build approach: extend the current engine (decided 15 Nov 2026).** The design draft is `docs/superpowers/specs/2026-11-15-planner-foundation-design.md`.

## Open decisions

None right now.

## Features to explore, in order

1. **Foundation**
   - Family profile and onboarding: members, AIS upload, 2-minute questionnaire.
   - Every asset type taxed correctly: debt, the three hybrid treatments, gold, deposits and interest, dividend payouts.
   - "What it brings home" per member, for any fund or product.
2. **Beta, this season**
   - Where to put new money.
   - Cheapest way to raise ₹X.
   - Harvesting with alerts.
   - Advance tax tracker.
   - Regular-to-direct switch.
   - Capital gains schedule ready for the tax return.
3. **Full planner**
   - Target split and emergency fund, with the lowest-tax moves to reach it.
   - Family net worth.
   - Goals after tax.
   - Rebalance on a tax budget.
   - Real return.
4. **Later**
   - AIS mismatch check; old vs new regime per member.
   - Gift and loan paperwork; when an HUF pays off; nominee and will checklist.
   - Account Aggregator for live bank and deposit data.

## Where the data comes from

| Source | Gives |
|---|---|
| Mutual fund CAS (CAMS / KFintech, detailed) | All folios and transactions; regular vs direct plan and distributor code. The parser currently drops the distributor code (`prototype/src/parsers/cas.ts`). |
| Demat CAS (NSDL / CDSL) | Shares, ETFs, bonds and gold bonds held today; no buy prices. |
| Broker tradebook / tax P&L | Buy dates and prices. |
| PAN | Name, date of birth (age), person or HUF. No income or holdings. |
| AIS (each member downloads it) | Salary, interest, dividends, rent, tax deducted, reported sales. |
| Family questionnaire | Expenses, goals, risk, loans, insurance, property, PPF / EPF / NPS. |
| Account Aggregator (after registration) | Bank deposits, PPF, NPS, insurance. |

The app never asks for income tax portal or broker passwords.

## Data by sensitivity

| Tier | Data |
|---|---|
| 1. Never store | Raw statement files, PDF passwords, portal or broker logins, full PAN |
| 2. Highly sensitive | AIS income, holdings and transactions, folio and demat numbers, loans, insurance |
| 3. Personal | Member names, relations, ages, regime, goals, expenses, risk profile, children's details |
| 4. Account | Login email, phone, name |
| 5. Must keep later | Recommendations and their reasons, consent records |
| 6. Public | Prices, NAVs, fund categories, tax rules |

## Security to-do

Before the beta (data is readable on the server, so these are required):

- [ ] Split the single family JSON row into tables, so access and encryption can differ by tier.
- [ ] Encrypt tier 2 fields (income, holdings, account numbers) with a key held outside the database, so a database dump alone is unreadable.
- [ ] Log every admin or support read of a family's data, and show the family when it happened.
- [ ] Back up the database daily and test a restore once.
- [ ] Keep statements on the device: parse in the browser, never upload raw files or PDF passwords.
- [ ] Store only the PAN's last four characters.
- [ ] Encrypt the family data saved in the browser (it is plain text in `localStorage` today).
- [ ] Lock the page to our own scripts (Content Security Policy); host the fonts ourselves instead of loading Google Fonts.
- [ ] Turn on two-factor sign-in (passkey or authenticator app).
- [ ] Check the Supabase project's region; move to Mumbai (`ap-south-1`) before the public launch.
- [ ] Limit who has admin access to the Supabase project and keep the secret key out of the code and repo.
- [ ] Delete an account and all its data within a day of the request.
- [ ] Consent per family member, and parental consent for children's data, under India's data protection law.
- [ ] Before the public launch: risk profile per member, a saved record of each recommendation, Account Aggregator on a proper server.

## Adviser rules that shape the public launch (from the research)

- Risk profiling comes before any advice, and the client must consent to the completed profile (SEBI IA Regulations, Reg 16–17).
- No free trials before risk profiling (SEBI circular, Oct 2024). Affects a free tier that recommends.
- SEBI's "family" for fees is the client plus dependent spouse, children and parents. An earning adult child or working spouse may count as a separate client, which affects per-family pricing.
- Implementation only through direct plans; no commission.
- Not yet researched: SEBI fee caps per family.
