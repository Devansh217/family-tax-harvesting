// Runs the real migrations on a throwaway local Postgres, then the checks in supabase/tests.
// Needs the Postgres server (postgres, initdb, pg_ctl) and psql on PATH; Homebrew's postgresql formula has all four
// (libpq alone has no server). Skipped when any is missing. The text checks at the bottom always run.
// Local only: the database lives in a temp folder, listens on a Unix socket only, and is deleted afterwards.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(__dirname, '..', 'supabase');
const hasPostgres = ['postgres', 'initdb', 'pg_ctl', 'psql'].every((b) => spawnSync('which', [b]).status === 0);

// The cron migration also schedules the daily call (pg_cron, pg_net, Vault), which a plain Postgres lacks.
// Keep only its part 1, the season_alert_families view.
function migrationSql(file: string): string {
  const sql = readFileSync(join(root, 'migrations', file), 'utf8');
  if (!file.endsWith('_season_cron.sql')) return sql;
  const cut = sql.indexOf('\n-- 2.');
  if (cut < 0) throw new Error(`${file}: expected a "-- 2." section to cut the cron part at`);
  return sql.slice(0, cut);
}

describe.skipIf(!hasPostgres)('migrations on a local Postgres', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harvest-pg-'));
  const data = join(dir, 'data');
  const port = '54329';

  function psql(sql: string): string {
    return execFileSync('psql', ['-X', '-q', '-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  }

  beforeAll(() => {
    execFileSync('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-sync'], { stdio: 'ignore' });
    execFileSync('pg_ctl', ['-D', data, '-w', '-l', join(dir, 'log'), '-o', `-k ${dir} -p ${port} -c listen_addresses=''`, 'start'], { stdio: 'ignore' });
    const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    psql([readFileSync(join(root, 'tests', 'stubs.sql'), 'utf8'), ...files.map((f) => `\\echo ${f}\n${migrationSql(f)}`)].join('\n'));
  }, 60_000);

  afterAll(() => {
    try { execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('season_alert_families lists only invited families and admins', () => {
    const out = psql(readFileSync(join(root, 'tests', 'season_alert_families.sql'), 'utf8'));
    expect(out).toContain('season_alert_families: ok');
  });
});

// Without a database: the newest definition of the view must carry the invite gate and the access lines.
describe('season_alert_families, newest definition', () => {
  const file = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => /create or replace view public\.season_alert_families/i.test(readFileSync(join(root, 'migrations', f), 'utf8'))).at(-1)!;
  const sql = readFileSync(join(root, 'migrations', file), 'utf8').replace(/\s+/g, ' ').toLowerCase();

  it('lists only invited sign-in emails or admins', () => {
    expect(sql).toContain('exists (select 1 from public.beta_invites i where i.email = lower(u.email))');
    expect(sql).toContain('exists (select 1 from public.admins a where a.user_id = f.user_id)');
  });

  it('stays server only', () => {
    expect(sql).toContain('revoke all on public.season_alert_families from public, anon, authenticated;');
    expect(sql).toContain('grant select on public.season_alert_families to service_role;');
  });
});
