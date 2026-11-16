/**
 * Monthly restore test (secure storage spec §5.6). Run on your own machine, never in GitHub:
 *   SUPABASE_DB_URL='<session pooler connection string>' npm run restore-test
 * Needs: the GitHub CLI (`gh`, signed in), PostgreSQL client tools (`pg_restore`, `psql`), and, typed when asked,
 * the age private key (AGE-SECRET-KEY-…) and the FAMILY_KEYS JSON from your password manager. Neither is saved.
 * It downloads the latest nightly backup, decrypts it, checks the archive, counts the families against the live
 * project and opens one with the family key. It reads the backup locally; nothing is written to any database.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Decrypter } from 'age-encryption';
import { familyAad, importKeyRing, openJson, type Envelope } from '../supabase/functions/_shared/envelope.ts';
import { checkRestore, copyRows } from './restore-check';

const db = process.env.SUPABASE_DB_URL;
if (!db) throw new Error('Set SUPABASE_DB_URL to the session pooler connection string first.');
const run = (cmd: string, args: string[], cwd?: string) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ageKey = (await rl.question('age private key (AGE-SECRET-KEY-…): ')).trim();
const familyKeys = (await rl.question('FAMILY_KEYS JSON: ')).trim();
rl.close();

const dir = mkdtempSync(join(tmpdir(), 'restore-test-'));
try {
  const runId = JSON.parse(run('gh', ['run', 'list', '--workflow', 'backup.yml', '--status', 'success', '--limit', '1', '--json', 'databaseId']))[0]?.databaseId;
  if (!runId) throw new Error('No successful backup run found.');
  run('gh', ['run', 'download', String(runId), '-n', 'backup', '-D', dir]);
  const file = readdirSync(dir).find((f) => f.endsWith('.tgz.age'));
  if (!file) throw new Error('The backup artifact holds no .tgz.age file.');

  const d = new Decrypter();
  d.addIdentity(ageKey);
  const tgz = await d.decrypt(readFileSync(join(dir, file)), 'uint8array');
  execFileSync('tar', ['xzf', '-', '-C', dir], { input: tgz });

  run('pg_restore', ['--list', join(dir, 'public.dump')]); // the archive itself is readable
  const rows = copyRows(run('pg_restore', ['--data-only', '--table=families', '-f', '-', join(dir, 'public.dump')]), 'families');
  const live = Number(run('psql', [db, '-tAc', 'select count(*) from public.families']).trim());
  let opened = false;
  if (rows[0]) {
    const [userId, version, envelopeText] = rows[0] as [string, string, string];
    const env = JSON.parse(envelopeText) as Envelope;
    try { await openJson(env, await importKeyRing(familyKeys, env.kid), familyAad(userId, Number(version))); opened = true; } catch { opened = false; }
  }
  const users = readFileSync(join(dir, 'users.csv'), 'utf8').trim().split('\n').length - 1;
  const r = checkRestore(rows.length, live, opened);
  console.log(`${r.ok ? 'RESTORE TEST PASSED' : 'RESTORE TEST FAILED'} ${new Date().toISOString().slice(0, 10)} ${r.message}; sign-in accounts in backup=${users}; backup ${file}`);
  if (!r.ok) process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
