import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A Supabase secret key or service-role token must never be committed: the repo is public.
const ROOT = execSync('git rev-parse --show-toplevel', { cwd: __dirname }).toString().trim();
const SKIP = /(^|\/)node_modules\/|\.lock$|package-lock\.json$|\.(png|jpe?g|gif|ico|woff2?|pdf|xlsx|zip)$/i;

export function findSecrets(name: string, text: string): string[] {
  const hits: string[] = [];
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) hits.push(`${name}: Supabase secret key`);
  // Security review (21 Nov 2026): the other secrets this project holds. The age private key opens every backup,
  // the database URL carries the postgres password, Brevo sends email as the app, a GitHub token pushes to main.
  if (/AGE-SECRET-KEY-1[0-9A-Z]{20,}/.test(text)) hits.push(`${name}: age private key`);
  if (/postgres(ql)?:\/\/[^:\s/]+:[^@\s<>{}[\]]{6,}@/.test(text)) hits.push(`${name}: database URL with a password`);
  if (/xkeysib-[a-f0-9]{20,}/.test(text)) hits.push(`${name}: Brevo API key`);
  if (/\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(text)) hits.push(`${name}: GitHub token`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) hits.push(`${name}: private key`);
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g) ?? []) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());
      if (payload.role === 'service_role') hits.push(`${name}: service-role token`);
    } catch { /* not a JWT */ }
  }
  return hits;
}

describe('no secrets in the repo', () => {
  it('flags a secret key and a service-role token', () => {
    const svc = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'service_role', ref: 'abcdefgh' })).toString('base64url'), 'c2lnbmF0dXJlXzEyMw'].join('.');
    expect(findSecrets('x', 'key = ' + ['sb', 'secret', 'abcdefghijklmnop'].join('_'))).toHaveLength(1);
    expect(findSecrets('x', svc)).toHaveLength(1);
    expect(findSecrets('x', 'sb_publishable_CNFrds5IHwjo7O5pZ-x7GQ_rcpzng24')).toEqual([]);
  });

  it('flags the other secrets this project holds, and not their public halves', () => {
    const j = (...p: string[]) => p.join('');
    expect(findSecrets('x', j('AGE-SECRET-KEY-1', 'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ'))).toHaveLength(1);
    expect(findSecrets('x', j('postgresql://postgres.abc:', 'hunter2hunter2', '@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'))).toHaveLength(1);
    expect(findSecrets('x', j('xkeysib-', '0123456789abcdef0123456789abcdef'))).toHaveLength(1);
    expect(findSecrets('x', j('ghp_', 'A'.repeat(36)))).toHaveLength(1);
    expect(findSecrets('x', j('-----BEGIN ', 'OPENSSH PRIVATE KEY-----'))).toHaveLength(1);
    expect(findSecrets('x', 'age1meth456u4sja7ffl04ymehh70djhf2sukxfds7mkj6xk7wtq75cst3efsj')).toEqual([]);
    expect(findSecrets('x', 'postgresql://postgres:[YOUR-PASSWORD]@db.example.supabase.co:5432/postgres')).toEqual([]);
  });

  it('no statement, spreadsheet or backup file is tracked (the repo is public)', () => {
    const files = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter(Boolean);
    expect(files.filter((f) => /\.(csv|pdf|xlsx?|age|dump)$|^data\/private\/|harvesting-backup-.*\.json$/i.test(f))).toEqual([]);
  });

  it('no tracked file holds one', () => {
    const files = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter((f) => f && !SKIP.test(f));
    const hits = files.flatMap((f) => { try { return findSecrets(f, readFileSync(join(ROOT, f), 'utf8')); } catch { return []; } });
    expect(hits).toEqual([]);
  });
});
