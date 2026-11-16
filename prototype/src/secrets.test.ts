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

  it('no tracked file holds one', () => {
    const files = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter((f) => f && !SKIP.test(f));
    const hits = files.flatMap((f) => { try { return findSecrets(f, readFileSync(join(ROOT, f), 'utf8')); } catch { return []; } });
    expect(hits).toEqual([]);
  });
});
