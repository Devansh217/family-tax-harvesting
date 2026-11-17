import { beforeEach, describe, expect, it } from 'vitest';
import { handleAdmin, type AdminDb } from './admin.ts';
import { toB64 } from './base64.ts';
import { familyAad, importKeyRing, sealJson, type Envelope, type KeyRing } from './envelope.ts';

const key = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
const invites = new Map<string, string | null>();
let ring: KeyRing, log: Array<{ familyUserId: string; adminUserId: string; reason: string }>, rows: Map<string, { version: number; envelope: Envelope }>;
const db: AdminDb = {
  isAdmin: async (u) => u === 'boss',
  list: async () => [...rows].map(([userId, r]) => ({ userId, email: `${userId}@x.in`, version: r.version, updatedAt: '2026-11-17' })),
  logRead: async (row) => { log.push(row); },
  invites: {
    list: async () => [...invites].map(([email, note]) => ({ email, note, invitedAt: '2026-11-17' })),
    add: async (email, note) => { invites.set(email, note); },
    remove: async (email) => { invites.delete(email); },
  },
  family: { get: async (u) => rows.get(u) ?? null },
};
const call = (path: 'list' | 'read', who = 'boss', aal = 'aal2', body?: unknown, r = ring) =>
  handleAdmin({ method: path === 'list' ? 'GET' : 'POST', path, userId: who, aal, body: body === undefined ? undefined : JSON.stringify(body) }, { db, ring: r });

beforeEach(async () => {
  ring = await importKeyRing(JSON.stringify({ k1: key() }), 'k1');
  log = [];
  invites.clear();
  rows = new Map([['fam1', { version: 3, envelope: await sealJson({ version: 1, members: [] }, ring, familyAad('fam1', 3)) }]]);
});

describe('admin function', () => {
  it('needs two-factor, then an admin', async () => {
    expect(await call('list', 'boss', 'aal1')).toEqual({ status: 403, json: { error: 'two_factor_required' } });
    expect(await call('read', 'someone', 'aal2', { familyUserId: 'fam1', reason: 'debug' })).toEqual({ status: 403, json: { error: 'not_admin' } });
    expect(log).toEqual([]);
  });

  it('lists families without their data, and does not log a list', async () => {
    const r = await call('list');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toMatch(/envelope|state|members/);
    expect(log).toEqual([]);
  });

  it('needs a reason and an existing family', async () => {
    expect((await call('read', 'boss', 'aal2', { familyUserId: 'fam1', reason: '  ' })).status).toBe(400);
    expect((await call('read', 'boss', 'aal2', { familyUserId: 'nobody', reason: 'debug sync' })).status).toBe(404);
    expect(log).toEqual([]);
  });

  it('logs the read, then returns the family', async () => {
    const r = await call('read', 'boss', 'aal2', { familyUserId: 'fam1', reason: '  Sync error on Plan  ' });
    expect(r).toEqual({ status: 200, json: { state: { version: 1, members: [] }, version: 3 } });
    expect(log).toEqual([{ familyUserId: 'fam1', adminUserId: 'boss', reason: 'Sync error on Plan' }]);
  });

  it('the log is written even when decryption then fails', async () => {
    const otherRing = await importKeyRing(JSON.stringify({ k2: key() }), 'k2');
    const r = await call('read', 'boss', 'aal2', { familyUserId: 'fam1', reason: 'check keys' }, otherRing);
    expect(r.status).toBe(500);
    expect(log).toHaveLength(1);
  });

  describe('invites', () => {
    const inv = (method: string, body?: unknown, who = 'boss', aal = 'aal2') =>
      handleAdmin({ method, path: 'invites', userId: who, aal, body: body === undefined ? undefined : JSON.stringify(body) }, { db, ring });

    it('needs two-factor and an admin', async () => {
      expect(await inv('GET', undefined, 'boss', 'aal1')).toEqual({ status: 403, json: { error: 'two_factor_required' } });
      expect(await inv('POST', { email: 'a@b.in' }, 'someone')).toEqual({ status: 403, json: { error: 'not_admin' } });
      expect(invites.size).toBe(0);
    });

    it('adds with a lower-cased trimmed email, lists, and logs against the admin', async () => {
      expect((await inv('POST', { email: '  Mum@Example.IN ', note: 'family' })).status).toBe(200);
      expect((await inv('POST', { email: 'mum@example.in', note: 'again' })).status).toBe(200);
      expect(await inv('GET')).toEqual({ status: 200, json: [{ email: 'mum@example.in', note: 'again', invitedAt: '2026-11-17' }] });
      expect(log[0]).toEqual({ familyUserId: 'boss', adminUserId: 'boss', reason: 'invite: mum@example.in' });
      expect(log).toHaveLength(2);
    });

    it('removes and logs', async () => {
      await inv('POST', { email: 'a@b.in' });
      expect((await inv('DELETE', { email: 'A@B.in' })).status).toBe(200);
      expect(invites.size).toBe(0);
      expect(log.at(-1)).toEqual({ familyUserId: 'boss', adminUserId: 'boss', reason: 'uninvite: a@b.in' });
    });

    it('refuses a bad email or bad json, logging nothing', async () => {
      for (const email of ['', 'nope', 'a@b', 'a b@c.in', 5]) expect(await inv('POST', { email })).toEqual({ status: 400, json: { error: 'bad_email' } });
      expect((await inv('DELETE', { email: 'x' })).status).toBe(400);
      expect((await handleAdmin({ method: 'POST', path: 'invites', userId: 'boss', aal: 'aal2', body: 'nope' }, { db, ring })).status).toBe(400);
      expect(log).toEqual([]);
    });

    it('keeps the log reason within 300 characters', async () => {
      const long = `${'a'.repeat(250)}@${'b'.repeat(100)}.in`;
      await inv('POST', { email: long });
      expect(log[0]!.reason.length).toBeLessThanOrEqual(300);
    });

    it('rejects other methods', async () => {
      expect((await inv('PUT', {})).status).toBe(405);
    });
  });
});
