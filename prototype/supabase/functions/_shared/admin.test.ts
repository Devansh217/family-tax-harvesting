import { beforeEach, describe, expect, it } from 'vitest';
import { handleAdmin, type AdminDb } from './admin.ts';
import { toB64 } from './base64.ts';
import { familyAad, importKeyRing, sealJson, type Envelope, type KeyRing } from './envelope.ts';

const key = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
let ring: KeyRing, log: Array<{ familyUserId: string; adminUserId: string; reason: string }>, rows: Map<string, { version: number; envelope: Envelope }>;
const db: AdminDb = {
  isAdmin: async (u) => u === 'boss',
  list: async () => [...rows].map(([userId, r]) => ({ userId, email: `${userId}@x.in`, version: r.version, updatedAt: '2026-11-17' })),
  logRead: async (row) => { log.push(row); },
  family: { get: async (u) => rows.get(u) ?? null },
};
const call = (path: 'list' | 'read', who = 'boss', aal = 'aal2', body?: unknown, r = ring) =>
  handleAdmin({ method: path === 'list' ? 'GET' : 'POST', path, userId: who, aal, body: body === undefined ? undefined : JSON.stringify(body) }, { db, ring: r });

beforeEach(async () => {
  ring = await importKeyRing(JSON.stringify({ k1: key() }), 'k1');
  log = [];
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
});
