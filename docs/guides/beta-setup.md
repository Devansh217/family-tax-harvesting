# Invite-only beta: your setup steps

For the founder. About 10 minutes. Claude does not run any of this for you.

Until you finish these steps, nobody (including you) can load or save a family on the live site once the new `family` function is deployed.

1. **Check email sign-up.** In the project, **Authentication → Providers → Email**: make sure new email sign-up is off, or "Confirm email" is on. The invite check only trusts emails the account has confirmed (Google does this itself).
2. **Push the new table.** From `prototype/` in this repo, run `npx supabase@2 db push`. It adds the `beta_invites` table (empty, locked to the server).
3. **Deploy the two functions.** From `prototype/`, run `npx supabase@2 functions deploy family` and then `npx supabase@2 functions deploy admin`.
4. **Sign in on the live site** with your own account. You are an admin, so you are let in even though the invite list is empty.
5. **Open Admin** (top bar) and step up with your authenticator code if asked.
6. **Invite people.** Under "Beta invites", type each family member's email (the one they sign in with) and press Invite. Add your own email too, so you stay on the list. Remove an email to uninvite; that person sees "This beta is invite-only" next time, but can still delete their account and data.
7. **Check it worked.** Sign in as someone not on the list (or ask a family member): they should see the invite-only message, and an invited person should load normally.

Every invite and removal is written to the admin log against your own account.

## Harvest season help (added later)

Push the new migration (`npx supabase@2 db push`, adds `season_log`, `season_stats` and the `families.season_help` column) and redeploy `family` and `admin` from `prototype/` (`npx supabase@2 functions deploy family`, then `npx supabase@2 functions deploy admin`). Redeploying `admin` matters: the Admin page's "Season numbers" section needs the new version, and shows an error until you do.

The same push also schedules the daily cron job. Until you add the Vault secrets in "Season emails" step 6, that job fails harmlessly each day (nothing is sent, nothing breaks). If you create any further migration before 15 Dec 2026, its name will sort before the already-pushed season migration (which is dated 15 Dec 2026), so push it with `npx supabase@2 db push --include-all`.

## Season emails

The daily `alerts` function emails families that turned on "Harvest season help" and adds their numbers, without names, to the beta totals. About 15 minutes. Claude does not run any of this for you. Until step 8, the emails simply don't go out; nothing else breaks.

1. **Create a Brevo account** (free plan, no card) at brevo.com.
2. **Verify a sender address.** In Brevo, **Senders, Domains & Dedicated IPs → Senders → Add a sender**, use an address you own (for example your own Gmail) and click the link Brevo emails you.
3. **Check the free plan's limits** in Brevo (**Plan** page) and write them here: daily send limit: ______ ; sender rules: ______ . The season needs one email per family per send day, so a daily limit above the number of beta families is enough.
4. **Make a Brevo API key** (**SMTP & API → API keys → Generate a new API key**). Copy it once; don't paste it anywhere except step 5.
5. **Set the function secrets.** From `prototype/` (pick your own long random `ALERTS_SECRET`, for example the output of `openssl rand -hex 32`; `APP_URL` is the live site, ending in `/`):
   `npx supabase@2 secrets set BREVO_API_KEY=... ALERTS_SENDER=your-verified-address ALERTS_SECRET=... APP_URL=https://...`
   (`FAMILY_KEYS` and `FAMILY_KEY_CURRENT` are already set from the secure storage setup.)
6. **Put the call's address and secret in Vault**, for the daily cron. In the Supabase dashboard open **SQL Editor** and run (use the same `ALERTS_SECRET` and your project reference):
   `select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/alerts', 'alerts_url');`
   `select vault.create_secret('<the same ALERTS_SECRET>', 'alerts_secret');`
7. **Push the migration and deploy.** From `prototype/`:
   `npx supabase@2 db push` (adds the `season_alert_families` view and the 05:30 UTC daily schedule, which is 11:00 IST)
   `npm run build:engine` (copies the engine into `supabase/functions/_shared/engine.js`; that file is generated and not committed, so run this before every deploy of `alerts`)
   `npx supabase@2 functions deploy alerts --no-verify-jwt` (Cron calls it without a sign-in; the secret header is its lock)
8. **Check the email provider now, before the season.** Send yourself a fixed sample email (no family data) to your verified sender address:
   `curl -X POST -H "x-alerts-secret: <ALERTS_SECRET>" -H "x-alerts-test: 1" https://<project-ref>.supabase.co/functions/v1/alerts`
   The reply is `{"test":"sent"}` and the email arrives within a minute. Without the `x-alerts-test` header the same call runs the real daily job; outside the season (before 1 Feb 2027) it replies `{"sent":0,"checked":0,"stats":false}` and sends nothing, which is correct. The first real emails go out on 1 Feb 2027; on a send day you get one and see a line under "Automatic season checks" on the Account page. If nothing arrives, look in the spam folder and check the From line shows your verified sender.
9. **Rehearse the real run in January.** Before the season, with only your own family opted in (Account, "Turn on harvest season help"), run the real job as if it were a send day. A dated run needs the secret and a date from 1 Feb to 31 Mar 2027; it sends and logs exactly like a real day, but writes no season totals, so the real numbers stay clean:
   `curl -X POST -H "x-alerts-secret: <ALERTS_SECRET>" -H "x-alerts-date: 2027-02-14" https://<project-ref>.supabase.co/functions/v1/alerts`
   Check three things: the email arrives; the Account page shows a new row under "Automatic season checks" for that date; and a second identical call replies with `"sent":0` and sends nothing. A rehearsal uses up that date's row, so use `2027-02-14` (a Sunday), and you will not get the real email for that one day. You can re-run a failed day by hand the same way.
10. **Know what it does and doesn't do.** It skips the whole run if the site's `prices/latest.json` or `prices/funds.json` can't be fetched or are malformed (no wrong numbers are emailed). Running it twice in a day sends nothing the second time, except that a send that failed (the row is left marked as not sent) is retried by the next run that day; a failed day can also be re-run by hand with the same call. There are no reads after 31 March; the final season totals are written on 31 March. Families without a confirmed sign-in email get nothing.
