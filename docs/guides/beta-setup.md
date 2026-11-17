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
