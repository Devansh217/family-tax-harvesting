# Secure storage: your setup steps

For the founder. About 30 minutes, all on free plans. Claude never types a password, key or code for you; where a step needs one, you type it.
Design: `docs/superpowers/specs/2026-11-17-secure-storage-design.md`.

**We keep the existing project** `iaesqhisslztykbglcck` (Singapore), decided 17 Nov 2026. It is upgraded in place: new encrypted tables beside the old one, which is dropped at the end. The live site keeps working throughout.

**Before you start, install** (Mac, once): `brew install age libpq gh`, then `brew link --force libpq`, and sign in to GitHub with `gh auth login`.

Keep a note open in your password manager called **Harvesting keys**. Steps 2 and 4 put two keys in it. Without them, the encrypted families and the backups can't be read by anyone, including you.

---

## Part A: you do these, then send Claude one public value

### 1. Google sign-in only
In the project: **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up" for the beta. Google sign-in stays as it is.

*Worked if:* the Google provider still shows "Enabled".

### 2. The family key
On your Mac:
```bash
openssl rand -base64 32
```
Save the output in the note as **FAMILY_KEYS k1**. You'll paste it in step 3 as `{"k1":"<that value>"}`.

### 3. Add the new tables and the server functions
From `prototype/` in this repo:
```bash
npx supabase@2 login
```
```bash
npx supabase@2 link --project-ref iaesqhisslztykbglcck
```
(asks for the project's database password; reset it under **Project Settings → Database** if you don't have it, and save it in the note)
```bash
npx supabase@2 db push
```
```bash
npx supabase@2 secrets set FAMILY_KEY_CURRENT=k1 FAMILY_KEYS='{"k1":"<your key from step 2>"}'
```
```bash
npx supabase@2 functions deploy family admin
```
*Worked if:* **Database → Tables** shows `families`, `admin_reads` and `admins` next to `profiles` and `family_data`; **Edge Functions** shows `family` and `admin`. The live site still works: it uses `family_data` until Claude's change is deployed.

### 4. Backups
1. On your Mac: `age-keygen -o harvesting-backup.key`. It prints `Public key: age1…`.
   - Copy the file's contents (the `AGE-SECRET-KEY-…` line) into the note as **Backup private key**, then delete the file: `rm harvesting-backup.key`.
   - Send Claude the `age1…` **public** key. It goes into the repo, and it can only encrypt.
2. In the project: **Connect** (top bar) → **Session pooler** → copy the connection string and put your database password in it.
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**: name `SUPABASE_DB_URL`, value that string.

### Send Claude
The `age1…` public key, and a note that step 3 worked. Claude then checks the deployed functions and gets the branch ready to merge (Part B starts after the merge).

---

## Part B: after Claude's change is merged and deployed

### 5. Move your family
1. Open the live site in the browser that holds your family, signed in with **Google**.
2. Your new encrypted store is empty, so the app saves this browser's family into it. If it asks which copy to keep, choose **this browser**.
3. Reload. *Worked if:* your family is there, and Account shows "Saved".

### 6. Make yourself the admin
1. **Authentication → Users**: copy your user's **UID**.
2. **SQL Editor**: `insert into public.admins values ('<your UID>');` → Run.
3. On the site, open **Admin** (top bar) → **Set up an authenticator app** → scan the QR code → enter the 6-digit code.

*Worked if:* the Admin page lists your family. Open it with a reason like "setup check"; your Account page then lists that read.

### 7. First backup and restore test
1. GitHub → **Actions → Nightly encrypted backup → Run workflow**. *Worked if:* the run is green with a `backup` artifact.
2. On your Mac, from `prototype/`:
   ```bash
   SUPABASE_DB_URL='<session pooler string>' npm run restore-test
   ```
   Paste the backup private key and the `{"k1":"…"}` JSON when asked.
   *Worked if:* it prints `RESTORE TEST PASSED …`. Tell Claude the line; it goes into `docs/PLANNER-NOTES.md`.
3. Add a monthly calendar reminder to run step 2 again.

### 8. Drop the old plain table
**SQL Editor**: `select count(*) from public.family_data;` should return `1` (only you). Then `drop table public.family_data;` → Run. From then on no family is stored in plain text.

### 9. Check who shares the site's origin
GitHub → your repositories → each one's **Settings → Pages**. Every Pages site on `devansh217.github.io` shares the browser origin with Harvesting. Confirm they are all yours and hold no scripts you didn't write.
