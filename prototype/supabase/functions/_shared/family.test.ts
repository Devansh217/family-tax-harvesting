import { beforeEach, describe, expect, it } from 'vitest';
import { toB64 } from './base64.ts';
import { familyAad, importKeyRing, openJson, type Envelope, type KeyRing } from './envelope.ts';
import { handleFamily, verifiedEmail, type FamilyDb } from './family.ts';

/** In-memory stand-in for the families table, with the same compare-and-set behaviour as the SQL. */
const invited = new Set<string>(['dev@x.in']);
const asked: Array<[string, string]> = [];
function memoryDb() {
  const rows = new Map<string, { version: number; envelope: Envelope }>();
  const db: FamilyDb = {
    get: async (u) => rows.get(u) ?? null,
    insert: async (u, envelope) => (rows.has(u) ? false : (rows.set(u, { version: 1, envelope }), true)),
    updateIf: async (u, known, next, envelope) => {
      const r = rows.get(u);
      if (!r || r.version !== known) return false;
      rows.set(u, { version: next, envelope });
      return true;
    },
    removeAll: async (u) => { rows.delete(u); },
    isInvited: async (email, userId) => { asked.push([email, userId]); return invited.has(email); },
  };
  return { db, rows };
}

const state = (n: number) => ({ version: 1, members: [{ id: 'a', name: `A${n} Zq7-distinct-plaintext-marker` }] });
let ring: KeyRing, mem: ReturnType<typeof memoryDb>;
const call = (method: string, body?: unknown, email: string = 'dev@x.in') => handleFamily({ method, userId: 'u1', email, body: body === undefined ? undefined : JSON.stringify(body) }, { db: mem.db, ring });

beforeEach(async () => {
  ring = await importKeyRing(JSON.stringify({ k1: toB64(crypto.getRandomValues(new Uint8Array(32))) }), 'k1');
  mem = memoryDb();
  invited.clear(); invited.add('dev@x.in'); asked.length = 0;
});

describe('family function', () => {
  it('loads nothing before the first save', async () => {
    expect(await call('GET')).toEqual({ status: 200, json: null });
  });

  it('saves encrypted, bound to the owner and version, and loads it back', async () => {
    expect(await call('PUT', { state: state(1), knownVersion: null })).toEqual({ status: 200, json: { version: 1 } });
    const row = mem.rows.get('u1')!;
    expect(JSON.stringify(row.envelope)).not.toContain('Zq7-distinct-plaintext-marker');
    expect(await openJson(row.envelope, ring, familyAad('u1', 1))).toEqual(state(1));
    expect(await call('GET')).toEqual({ status: 200, json: { state: state(1), version: 1 } });
    expect(await call('PUT', { state: state(2), knownVersion: 1 })).toEqual({ status: 200, json: { version: 2 } });
  });

  it('a save from a device that missed the last save is refused and changes nothing', async () => {
    await call('PUT', { state: state(1), knownVersion: null });
    await call('PUT', { state: state(2), knownVersion: 1 });
    expect(await call('PUT', { state: state(3), knownVersion: 1 })).toEqual({ status: 409, json: { conflict: true } });
    expect(await call('PUT', { state: state(3), knownVersion: null })).toEqual({ status: 409, json: { conflict: true } });
    expect((await call('GET')).json).toEqual({ state: state(2), version: 2 });
  });

  it('refuses a body over 5 MB and a state that is not a family', async () => {
    const big = await handleFamily({ method: 'PUT', userId: 'u1', email: 'dev@x.in', body: 'x'.repeat(5 * 1024 * 1024 + 1) }, { db: mem.db, ring });
    expect(big.status).toBe(413);
    expect((await call('PUT', { state: { version: 2 }, knownVersion: null })).status).toBe(400);
    expect((await call('PUT', { state: null, knownVersion: null })).status).toBe(400);
    expect((await handleFamily({ method: 'PUT', userId: 'u1', email: 'dev@x.in', body: 'not json' }, { db: mem.db, ring })).status).toBe(400);
  });

  it('deletes everything', async () => {
    await call('PUT', { state: state(1), knownVersion: null });
    expect(await call('DELETE')).toEqual({ status: 204 });
    expect((await call('GET')).json).toBeNull();
  });

  it('other methods are refused', async () => {
    expect((await call('PATCH')).status).toBe(405);
  });

  it('refuses GET and PUT for someone not invited, without touching the family', async () => {
    const reads: string[] = [];
    const spy = { ...mem.db, get: async (u: string) => { reads.push(u); return null; }, insert: async () => { reads.push('insert'); return true; }, updateIf: async () => { reads.push('updateIf'); return true; }, removeAll: async () => { reads.push('removeAll'); } };
    const go = (method: string, email: string | undefined, knownVersion: number | null = null) => handleFamily({ method, userId: 'u1', email, body: JSON.stringify({ state: state(1), knownVersion }) }, { db: spy, ring });
    expect((await go('PUT', 'out@x.in', 2)).status).toBe(403);
    for (const m of ['GET', 'PUT']) expect(await go(m, 'out@x.in')).toEqual({ status: 403, json: { error: 'not_invited' } });
    expect(await go('GET', undefined)).toEqual({ status: 403, json: { error: 'not_invited' } });
    expect(reads).toEqual([]);
  });

  it('asks about the lower-cased email and the user id', async () => {
    expect((await call('GET', undefined, 'DEV@X.in')).status).toBe(200);
    expect(asked).toEqual([['dev@x.in', 'u1']]);
  });

  it('deleting the account is always allowed, even if not invited', async () => {
    expect(await call('DELETE', undefined, 'out@x.in')).toEqual({ status: 204 });
    expect(await call('DELETE', undefined, '')).toEqual({ status: 204 });
  });

  it('only a confirmed email counts', () => {
    expect(verifiedEmail({ email: 'A@x.in', email_confirmed_at: '2026-11-17T00:00:00Z' })).toBe('a@x.in');
    expect(verifiedEmail({ email: 'a@x.in', email_confirmed_at: null })).toBe('');
    expect(verifiedEmail({ email: 'a@x.in' })).toBe('');
    expect(verifiedEmail({ email_confirmed_at: '2026-11-17' })).toBe('');
  });
});
