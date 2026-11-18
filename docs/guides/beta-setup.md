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

Push the new migration (`npx supabase@2 db push`, adds `season_log`, `season_stats` and the `families.season_help` column) and redeploy `family` (`npx supabase@2 functions deploy family`) from `prototype/`.

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
8. **Try it once by hand**, with your own family's season help turned on and your email confirmed:
   `curl -X POST -H "x-alerts-secret: <ALERTS_SECRET>" https://<project-ref>.supabase.co/functions/v1/alerts`
   Outside the season (before 1 Feb 2027) the reply is `{"sent":0,"checked":0,"stats":false}` and no email goes out; that is correct. Emails only go out on send days inside the season, so the first real check is 1 Feb 2027: on a send day a send day gives you an email and a line under "Automatic season checks" on the Account page.
9. **Know what it does and doesn't do.** It skips the whole run if the site's `prices/latest.json` can't be fetched (no wrong numbers are emailed). Running it twice in a day sends nothing the second time. Families without a confirmed sign-in email get nothing.
