# Secure storage: your setup steps

For the founder. About 45 minutes, all on free plans. Claude never types a password, key or code for you; where a step needs one, you type it.
Design: `docs/superpowers/specs/2026-11-17-secure-storage-design.md`.

**Before you start, install** (Mac, once): `brew install age libpq gh` then `brew link --force libpq`, and sign in to GitHub with `gh auth login`.

Keep a note open in your password manager called **Harvesting keys**: steps 3 and 4 put two keys in it. Without them, the encrypted families and the backups can't be read, by anyone, including you.

---

## Part A: you do these, then send Claude two public values

### 1. Create the Mumbai project
1. supabase.com → your organisation → **New project**. Name `harvesting`, plan **Free**, region **Mumbai (ap-south-1)**. Set a strong database password and save it in the note.
2. When it's ready: **Project Settings → API**. Copy the **Project URL** (`https://<ref>.supabase.co`) and the **Publishable key** (`sb_publishable_…`). Both are public; you'll send them to Claude.

*Worked if:* the project dashboard shows region "South Asia (Mumbai)".

### 2. Google sign-in for the new project
1. In the new project: **Authentication → Sign In / Providers → Google**: turn it on; paste the **Client ID** and **Client secret** of the Google OAuth client the app already uses (Google Cloud console → APIs & Services → Credentials).
2. In that Google OAuth client, add the authorised redirect URI `https://<ref>.supabase.co/auth/v1/callback` and save.
3. **Authentication → URL Configuration**: Site URL `https://devansh217.github.io/family-tax-harvesting/`; Redirect URLs: the same URL and `http://localhost:5199`.
4. **Authentication → Sign In / Providers → Email**: turn **off** email sign-ups for the beta (Google only).

*Worked if:* the Google provider shows "Enabled".

### 3. The family key
On your Mac:
```bash
openssl rand -base64 32
```
Save the output in the note as **FAMILY_KEYS k1**. You'll paste it in step 4 as `{"k1":"<that value>"}`.

### 4. Deploy the database and functions
From `prototype/` in this repo:
```bash
npx supabase@2 login
```
```bash
npx supabase@2 link --project-ref <ref>
```
(asks for the database password from step 1)
```bash
npx supabase@2 db push
```
```bash
npx supabase@2 secrets set FAMILY_KEY_CURRENT=k1 FAMILY_KEYS='{"k1":"<your key from step 3>"}'
```
```bash
npx supabase@2 functions deploy family admin
```
*Worked if:* **Database → Tables** shows `families`, `admin_reads`, `admins`, `profiles`; **Edge Functions** shows `family` and `admin`.

### 5. Backups
1. On your Mac: `age-keygen -o harvesting-backup.key`. It prints `Public key: age1…`.
   - Copy the whole file's contents (the `AGE-SECRET-KEY-…` line) into the note as **Backup private key**, then delete the file: `rm harvesting-backup.key`.
   - Send Claude the `age1…` **public** key (it goes into the repo; it can only encrypt).
2. New project → **Connect** (top bar) → **Session pooler** → copy the connection string and put your database password in it.
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**: name `SUPABASE_DB_URL`, value that string.

### Send Claude
The Project URL, the publishable key and the `age1…` public key. Claude then points the app at the new project (Part B).

---

## Part B: after Claude's change is merged and deployed

### 6. Move your family
1. Open the live site in the browser that holds your family. Sign in with **Google**.
2. The new account is empty, so if the app asks which copy to keep, choose **this browser**.
3. Reload. *Worked if:* your family is there, and Account shows "Saved".

### 7. Make yourself the admin
1. Supabase → **Authentication → Users**: copy your user's **UID**.
2. **SQL Editor**: `insert into public.admins values ('<your UID>');` → Run.
3. On the site, open **Admin** (top bar) → **Set up an authenticator app** → scan the QR code → enter the 6-digit code.

*Worked if:* the Admin page lists your family. Open it with a reason like "setup check"; your Account page then lists that read.

### 8. First backup and restore test
1. GitHub → **Actions → Nightly encrypted backup → Run workflow**. *Worked if:* the run is green with a `backup` artifact.
2. On your Mac, from `prototype/`:
   ```bash
   SUPABASE_DB_URL='<session pooler string>' npm run restore-test
   ```
   Paste the backup private key and the `{"k1":"…"}` JSON when asked.
   *Worked if:* it prints `RESTORE TEST PASSED …`. Tell Claude the line; it goes into `docs/PLANNER-NOTES.md`.
3. Add a monthly calendar reminder to run step 2 again.

### 9. Retire the old project
1. Old project → **SQL Editor**: `select count(*) from public.family_data;` → expect `1` (only you).
2. **Project Settings → General → Delete project**.

### 10. Check who shares the site's origin
GitHub → your repositories → each one's **Settings → Pages**. Every Pages site on `devansh217.github.io` shares the browser origin with Harvesting. Confirm they are all yours and hold no scripts you didn't write.
