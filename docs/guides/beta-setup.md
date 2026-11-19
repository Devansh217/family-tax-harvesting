# Invite-only beta and season emails: your setup steps

For the founder. Do the steps in this order, top to bottom, once. Claude does not run any of this for you.

Each step ends with a **Check:** line, and some with a **Where you are:** line saying what is now live. Don't start the next step until the check is true. If a step goes wrong, stop there and ask; nothing later depends on guessing.

All commands run in a terminal, from the `prototype/` folder of this repo.

## Already pushed the database before 20 Nov 2026? Push once more

You ran Step 1 already, and one migration has been added since: `20261215000400_season_alerts_invited.sql`. It stops season reads and emails for anyone whose invite you removed. Before it, they kept getting them and couldn't turn them off, because the site refuses their saves.

From the `prototype/` folder, run:

`npx supabase@2 db push`

A plain push is enough. This migration's name sorts after the ones you pushed, so `--include-all` isn't needed.

**Check:** the push lists only `20261215000400_season_alerts_invited.sql` and finishes without an error. Then in the SQL Editor, run `select count(*) from public.season_alert_families;`. It should be no more than the number of invited families with season help on, plus you.

If you haven't done Step 1 yet, skip this section. Step 1 pushes this migration with the others.

## Part 1: the invite-only beta

About 20 minutes.

### Step 0. Check email sign-up

In the Supabase dashboard, open Authentication and find the settings for the Email provider. Make sure new email sign-up is off, or that "Confirm email" is on. The invite check only trusts emails the account has confirmed. (Google sign-in confirms the email itself.)

**Check:** email sign-up is off, or "Confirm email" is on.

### Step 1. Push the database changes

Run:

`npx supabase@2 db push`

This applies every new migration in one go:

- the beta invite list,
- the season tables (the season log and the weekly totals),
- the season help switch on each family,
- the list of families with season help on (a database view called `season_alert_families`); only invited families and admins are on it,
- the daily 11:00 IST schedule for the season emails,
- the columns that record whether each season email was sent.

If the push prints an error (for example about `pg_cron` or `pg_net`), stop here and ask. Don't try to fix it by hand.

Good to know:

- The daily schedule starts now, but it fails harmlessly each day until you add the Vault secrets in Step 12. Nothing is sent and nothing breaks.
- If a new migration is added later, before 15 Dec 2026, its name sorts before migrations you have already pushed. Push it with `npx supabase@2 db push --include-all`.
- The Supabase advisor (the security warnings list in the dashboard) will flag the `season_alert_families` view as "security definer". That is expected. Only the server can read that view.

**Check:** the push finishes without an error.

**Where you are:** the database is ready. The live site still runs the old version, so nothing has changed for families yet.

### Step 2. Deploy the admin function

Run:

`npx supabase@2 functions deploy admin`

**Check:** the command says the function was deployed.

### Step 3. Merge the pull request and wait for the site

Merge the beta pull request on GitHub. GitHub then rebuilds the live site. On GitHub, open the Actions tab and wait until the latest Pages deploy shows a green tick.

**Check:** on the live site, sign in, open Admin (top bar) and step up with your authenticator code if asked. You see a section called "Beta invites". If it says "Redeploy the admin function (see the setup guide)", go back to Step 2.

**Where you are:** the new site and admin function are live. The family function is still the old one, so everyone can still load and save.

### Step 4. Invite everyone, including yourself

On the Admin page, under "Beta invites", type each person's email (the one they sign in with) and press Invite. Add your own email too, so you stay on the list.

To uninvite someone, press Remove. That person sees "This beta is invite-only" next time, but can still delete their account and data. Every invite and removal is written to the admin log against your own account.

**Check:** the list shows every email you meant to invite, including yours.

### Step 5. Deploy the family function (last)

Run:

`npx supabase@2 functions deploy family`

This turns the invite check on. It goes last so that nobody on your list is locked out while you were still inviting.

**Check:** sign in as someone not on the list (or ask a family member who isn't): they see the invite-only message. An invited person loads their family normally.

### Step 6. Ask early families to save once more

A family's season help switch only reaches the server when the family saves. Anyone who turned on "Harvest season help" before Step 5 should make any small change in the app (for example, turn the switch off and on again) so it saves.

**Check:** you have told every family that turned season help on early.

**Where you are:** the invite-only beta is fully on. Part 2 can wait until you are ready, but must be done before 1 Feb 2027.

## Part 2: season emails

About 30 minutes. Until you finish this part, season emails simply don't go out. Nothing else breaks.

### Step 7. Create a Brevo account

Sign up for the free plan (no card) at brevo.com.

**Check:** you can sign in to Brevo.

### Step 8. Verify a sender address

In Brevo, find the senders settings and add a sender. Use an address you own (for example your own Gmail). Click the link Brevo emails you.

**Check:** Brevo shows the sender as verified.

### Step 9. Note the free plan's limits

In Brevo, find your plan's details and write the limits here:

- daily send limit: ______
- sender rules: ______

The season needs one email per family per send day. A daily limit above the number of beta families is enough.

**Check:** the daily limit is higher than the number of families in the beta.

### Step 10. Make a Brevo API key

In Brevo, find the API keys settings and generate a new key. Copy it once. Don't paste it anywhere except Step 11.

**Check:** you have the key copied.

### Step 11. Set the function secrets

Pick your own long random `ALERTS_SECRET` (for example the output of `openssl rand -hex 32`). `APP_URL` is the live site, ending in `/`. Run:

`npx supabase@2 secrets set BREVO_API_KEY=... ALERTS_SENDER=your-verified-address ALERTS_SECRET=... APP_URL=https://...`

`FAMILY_KEYS` and `FAMILY_KEY_CURRENT` are already set from the secure storage setup. Don't change them.

**Check:** the command says the secrets were set.

### Step 12. Put the address and secret in Vault

The daily schedule reads the function's address and secret from Vault. In the Supabase dashboard, open the SQL Editor and run these two lines. Use your project reference and the same `ALERTS_SECRET` as in Step 11 (the function itself is deployed in the next step):

`select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/alerts', 'alerts_url');`

`select vault.create_secret('<the same ALERTS_SECRET>', 'alerts_secret');`

**Check:** both lines run without an error.

### Step 13. Build the engine and deploy the alerts function

Run these two commands:

`npm run build:engine`

`npx supabase@2 functions deploy alerts --no-verify-jwt`

The first copies the app's tax engine into `supabase/functions/_shared/engine.js`. That file is generated and not saved in the repo, so run it before every deploy of `alerts`. The second deploys the function. The daily schedule calls it without a sign-in; the secret is its lock.

**Check:** both commands finish without an error.

**Where you are:** everything for season emails is in place. What is left is checking it works.

### Step 14. Send a test email

This sends a fixed sample email (no family data) to your verified sender address. Run:

`curl -X POST -H "x-alerts-secret: <ALERTS_SECRET>" -H "x-alerts-test: 1" https://<project-ref>.supabase.co/functions/v1/alerts`

If nothing arrives, look in the spam folder, and check the From line shows your verified sender.

Without the `x-alerts-test` header, the same call runs the real daily job. Before 1 Feb 2027 it replies `{"sent":0,"checked":0,"stats":false}` and sends nothing. That is correct.

**Check:** the reply is `{"test":"sent"}` and the email arrives within a minute.

### Step 15. Rehearse a real send day (in January)

This runs the real job as if it were 1 Mar 2027, but only for families whose account is an admin (yours). Nobody else is read or emailed. It writes no season totals, so the real numbers stay clean.

1. On the live site, on the Account page, turn on "Harvest season help" for your own family.
2. Run:

   `curl -X POST -H "x-alerts-secret: <ALERTS_SECRET>" -H "x-alerts-date: 2027-03-01" https://<project-ref>.supabase.co/functions/v1/alerts`

3. Run the same command a second time.

Good to know:

- Nothing is sent if your family has under ₹2,000 of tax-free room left and no moves waiting. The reply then shows `"sent":0` but `"checked":1`. That is correct.
- If your family was last saved more than 30 days before 1 Mar 2027, the email only asks you to import fresh statements. That is correct too.
- The rehearsal uses up your family's row for 1 Mar 2027, so you won't get the real 1 Mar email. Everyone else will.
- A date that isn't a real date from 1 Feb to 31 Mar 2027 gets the reply `bad date` and nothing runs.

**Check:** the first call's email arrives; the Account page shows a new row for 2027-03-01 under "Automatic season checks"; the second call replies with `"sent":0` and sends nothing.

**Where you are:** you are done. The first real emails go out on 1 Feb 2027 at about 11:00 IST.

### What the daily job does and doesn't do

- It skips the whole run if the site's `prices/latest.json` or `prices/funds.json` can't be fetched or are malformed. No wrong numbers are emailed.
- Running it twice in a day sends nothing the second time. The only exception is an email whose send failed: the next run that day tries that one again, once.
- To retry failed emails on the day they failed, run the Step 14 call without the `-H "x-alerts-test: 1"` part. That runs today's real job, for every family.
- A call with `x-alerts-date` is always a rehearsal: it only reads your own family, whatever the date.
- There are no reads after 31 March. The final season totals are written on 31 March.
- Families without a confirmed sign-in email get nothing.
- Only invited families (and admins) get reads or emails. Remove someone's invite and they get nothing from the next daily run, even if their season help is still on.
