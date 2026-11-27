# Beta manual test plan

> **Out of date (24 Nov 2026):** written 20 Nov, before the holdings-first engine (PR #18). Some checks describe screens that B1 and E2 change. Update it as NEXT-WORK F3 says before the next test day.

For a day of hands-on testing as **a family member** and as **the founder (admin)**. Live site: https://devansh217.github.io/family-tax-harvesting/ (runs `main`: foundation, secure storage, beta features from PR #5). Local: `npm run dev` in `prototype/` → http://localhost:5199.

Each check says what to do and what you should see. Note anything different (see "Reporting a problem" at the end).

## Before you start

- **Two Google accounts.** Your own (admin) and a second one for the family role: a family member's, or a second Gmail of yours. Invite the second one first (Admin → Beta invites).
- **Two browser windows.** Use a normal window for one account and a private (incognito) window for the other, so the sign-ins don't mix.
- **Real statements** for the family role: a detailed mutual fund CAS (CAMS/KFintech, PDF) and, for shares, a broker tradebook or tax P&L (Excel/CSV). Statements are read in the browser and never uploaded.
- **Today is November.** Some things only appear from **1 Feb 2027**: the "last safe day" banner, season emails, and weekly season numbers. They're listed under "Not testable yet".

---

## Part A: family member (shareable)

Send this part to family testers as is.

> **Harvesting beta: please try these and tell me what looks wrong**
>
> Open https://devansh217.github.io/family-tax-harvesting/ and tap **Continue with Google** with the Gmail I invited.

| # | Try this | You should see |
|---|---|---|
| A1 | Sign in with Google | You're in. If you see "This beta is invite-only", tell me which Gmail you used. |
| A2 | **Family → Family setup**: add yourself and family members (date of birth, spouse and parents, income per year or per month, tax regime) | Each step saves as you go. Typing `0` in a money field stays `0`. A minor gets the "parent or guardian" consent tick. |
| A3 | **Import**: add your mutual fund statement (PDF) and, for shares, your broker's tradebook | Holdings appear under each member. Funds show a label: Equity, Slab rate, Long-term 12.5% or Check. |
| A4 | Open a member (Home → their name) | Holdings with gains; ELSS units still in lock-in say "locked until <date>". Any fund marked "Check" is listed under "Funds to check"; pick how it's taxed. |
| A5 | **Plan** | Suggested moves: sell-and-buy-back to use the ₹1.25 L tax-free room, gifts to relatives with spare room, switch regular plans to direct. Each shows rupees saved. No move under ₹1,000. Nothing sells ELSS units in lock-in. |
| A6 | On a move, **pick a date** | The buy-back step appears under it with its own date (next trading day for shares, next business day for funds). |
| A7 | **Add to my calendar** | A calendar file downloads; opening it adds the dated steps plus 31 March. Titles name the person, action and fund, but no rupee amounts. |
| A8 | A **switch to direct** card (if you hold regular plans) | Fee saved a year in rupees, tax now (often ₹0), and "check the exit load in your fund statement before selling". |
| A10 | **Member page → "Capital gains this year"** (then **Download CSV**) | Gains for this tax year in sections (equity long-term, short-term, other, slab), sales listed one by one, a CSV download, and a note that the new return forms aren't out yet. |
| A11 | **Account**: turn on **Harvest season help** | The switch explains that our server reads your family on email days from 1 Feb to 31 Mar. You can turn it off any time. |
| A12 | **Account → Who has looked at your data** | Usually "Nobody has opened your family". Any automatic season checks appear here later. |
| A13 | Reload the page, then sign in on your phone too | Your family is the same everywhere. |
| A14 | Make a change on the phone, then on the laptop, without reloading | The app loads the newer copy or asks which copy to keep. It never silently loses a change. |
| A15 | **Sign out** | Your family disappears from this browser and is still there when you sign in again. |

**Please don't** delete your account (Account → Delete) unless you mean it: it removes everything.

---

## Part B: founder (admin) on the live site

| # | Try this | You should see |
|---|---|---|
| B1 | Sign in, open **Admin**, enter the authenticator code if asked | The two-factor step, then the families list (account, saves, last saved), and **Beta invites**. |
| B2 | **Beta invites**: add an email, then remove it | The list updates; the person removed sees "This beta is invite-only" next time but can still delete their account. |
| B3 | Sign in (private window) with a Gmail that isn't invited | "This beta is invite-only". Nothing saves. |
| B4 | **Open** a family with a reason, e.g. "test day check" | A yellow "read-only" banner; you see their family on every screen; any edit says "Read-only". **Close** returns you to your own family, unchanged. |
| B5 | As that family (their window), **Account → Who has looked at your data** | Your read is listed with the time and your reason. |
| B6 | In read-only view, try **Family → export/backup** | Known gap (deferred from review): export still works in read-only view. Note it, don't share the file. |
| B7 | **Admin → Season numbers** | Empty until the first Sunday run in February. |
| B8 | Your own family: do A2–A15 (A9 is retired) as a family member | As in Part A. |

## Part C: on your laptop (local app)

`npm run dev` in `prototype/`, open http://localhost:5199. The local app talks to the **live** Supabase project, so test **signed out** here (everything stays in the browser) unless you mean to change your real account.

| # | Try this | You should see |
|---|---|---|
| C1 | Signed out, first open | "Before you start" note, then the sample family. |
| C2 | Sample family: Plan, Member, Simulate | Moves and figures as on the live site; useful for trying screens without real data. |
| C3 | **Start your own** and import real statements (signed out) | Same as A3–A10 (A9 is retired), nothing leaves the browser. |
| C4 | Built site: `npm run build && npm run preview -- --port 4173`, open http://localhost:4173 | Same app with the page lock (Content Security Policy) on; no errors in the browser console; fonts look right. |
| C5 | Tests: `npm test` and `npm run typecheck` | All pass. |
| C6 | Open `#compare` (the Compare page was removed in #27; A9 is retired) | Home opens; no Compare tab or link anywhere. |

## Not testable yet

| Thing | Why | From |
|---|---|---|
| Season emails (start, weekly, deadline) | Brevo and the `alerts` function aren't set up (beta guide Part 2) | After Part 2, and only from 1 Feb |
| "Last safe day" banner on Home and Plan | Shown from 1 Feb | 1 Feb 2027 |
| Weekly season numbers on Admin | Written on Sunday runs | First Sunday after 1 Feb |
| Moves marked done automatically | Needs a statement imported **after** you act on a move | After a real sale |
| Restore test of backups | Your step (secure storage guide, step 7) | Any time |

## Reporting a problem

For each problem, note: the check number (e.g. A5), what you did, what you expected, what you saw, and a screenshot. Device and browser help too (e.g. "iPhone, Safari"). **Never** send statements, PANs, keys or passwords. A screenshot with figures blurred is enough.
