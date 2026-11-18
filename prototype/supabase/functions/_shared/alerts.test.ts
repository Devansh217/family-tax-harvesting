import { beforeEach, describe, expect, it } from 'vitest';
import { runAlerts, secretMatches, type AlertsDb, type AlertsDeps, type SeasonStatsRow } from './alerts.ts';
import { toB64 } from './base64.ts';
import { familyAad, importKeyRing, sealJson, type Envelope, type KeyRing } from './envelope.ts';
import { computeFamily, FY_2026_27, lastSafeDay, NSE_HOLIDAYS_2027, seasonSummary, todayISO, QTY_SCALE } from '../../../src/engine/index';

const key = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
const rs = (n: number) => Math.round(n * 100);
const engine = { computeFamily, seasonSummary, lastSafeDay, todayISO, rules: FY_2026_27, holidays: NSE_HOLIDAYS_2027 };
const prices = { date: '2027-02-05', source: 'test', prices: { X: rs(2000) } };

const stateOf = (seasonHelp: boolean) => ({
  version: 1,
  members: [{ id: 'a', name: 'Asha Private', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] }],
  securities: [{ isin: 'X', name: 'Secret Fund', taxType: 'equity', listed: true, price: rs(1000) }],
  txns: [{ id: 'b1', memberId: 'a', isin: 'X', date: '2023-01-01', side: 'buy', qty: 100 * QTY_SCALE, amount: rs(100_000), source: 'test' }],
  imports: [], recommendations: [], datedMoves: [], taxTypeOverrides: {}, alerts: { seasonHelp },
});

let ring: KeyRing, decrypts: number;
let logs: Set<string>, stats: SeasonStatsRow[], sent: Array<{ to: string; subject: string; text: string }>;
let fams: Array<{ userId: string; email: string; version: number; envelope: Envelope; updatedAt: string }>;
let failFor: string | null;

const mkDb = (): AlertsDb => ({
  optedIn: async () => fams,
  logged: async (u, k, d) => logs.has(`${u}|${k}|${d}`),
  log: async (u, k, d) => { const id = `${u}|${k}|${d}`; if (logs.has(id)) return false; logs.add(id); return true; },
  unlog: async (u, k, d) => { logs.delete(`${u}|${k}|${d}`); },
  saveStats: async (row) => { stats.push(row); },
});
const deps = (): AlertsDeps => ({
  db: mkDb(), ring, prices, appUrl: 'https://app.example.in/', engine,
  send: async (to, subject, text) => { if (failFor === to) throw new Error('boom'); sent.push({ to, subject, text }); },
});
const run = (d: string, x: AlertsDeps) => { decrypts = 0; return runAlerts(d, x); };
const fam = async (userId: string, seasonHelp = true, email = `${userId}@x.in`) =>
  ({ userId, email, version: 2, envelope: await sealJson(stateOf(seasonHelp), ring, familyAad(userId, 2)), updatedAt: '2027-02-05T04:00:00Z' });

beforeEach(async () => {
  const real = await importKeyRing(JSON.stringify({ k1: key() }), 'k1');
  decrypts = 0;
  ring = { current: real.current, keys: new Proxy(real.keys, { get: (t, p) => { decrypts++; return (t as Record<string | symbol, unknown>)[p]; } }) };
  logs = new Set(); stats = []; sent = []; failFor = null;
  fams = [await fam('f1'), await fam('f2')];
});

describe('runAlerts', () => {
  it('never decrypts a family when nothing is due (a weekday outside send days)', async () => {
    expect(await run('2027-02-08', deps())).toEqual({ sent: 0, checked: 0, stats: false });
    expect(decrypts).toBe(0); expect(logs.size).toBe(0); expect(stats).toHaveLength(0);
  });

  it('a Sunday send day: one email per family, the email row is the only log row, one stats row without user ids', async () => {
    const r = await run('2027-02-07', deps());
    expect(r).toEqual({ sent: 2, checked: 2, stats: true });
    expect([...logs].sort()).toEqual(['f1|email_weekly|2027-02-07', 'f2|email_weekly|2027-02-07']);
    expect(sent.map((s) => s.to).sort()).toEqual(['f1@x.in', 'f2@x.in']);
    expect(stats).toHaveLength(1);
    expect(stats[0]!.week).toBe('2027-02-07');
    expect(stats[0]!.families).toBe(2);
    expect(stats[0]!.used_share_by_family).toEqual([0, 0]);
    expect(JSON.stringify(stats[0])).not.toMatch(/f1|f2|@/);
  });

  it('a send day that is not a Sunday sends and logs the email kind, with no stats', async () => {
    const r = await run('2027-03-01', deps());
    expect(r).toEqual({ sent: 2, checked: 2, stats: false });
    expect([...logs].sort()).toEqual(['f1|email_deadline|2027-03-01', 'f2|email_deadline|2027-03-01']);
    expect(stats).toHaveLength(0);
  });

  it('is idempotent: a second run the same day decrypts nothing, sends nothing, writes nothing', async () => {
    await run('2027-02-07', deps());
    const before = logs.size;
    expect(await run('2027-02-07', deps())).toEqual({ sent: 0, checked: 0, stats: false });
    expect(decrypts).toBe(0); expect(sent).toHaveLength(2); expect(logs.size).toBe(before); expect(stats).toHaveLength(1);
  });

  it('families whose switch is off in the database are never decrypted; no row; belt and braces on the decrypted switch', async () => {
    fams = [];
    expect(await run('2027-02-07', deps())).toEqual({ sent: 0, checked: 0, stats: false });
    expect(decrypts).toBe(0); expect(logs.size).toBe(0);
    fams = [await fam('f3', false)]; // database says on, document says off
    const r = await run('2027-02-07', deps());
    expect(r.sent).toBe(0); expect(r.checked).toBe(0); expect(stats).toHaveLength(0);
  });

  it('first Sunday of April: a season_check row per family plus stats, no email; later Sundays nothing', async () => {
    const r = await run('2027-04-04', deps());
    expect(r).toEqual({ sent: 0, checked: 2, stats: true });
    expect([...logs].sort()).toEqual(['f1|season_check|2027-04-04', 'f2|season_check|2027-04-04']);
    expect(sent).toHaveLength(0); expect(stats).toHaveLength(1);
    expect(await run('2027-04-11', deps())).toEqual({ sent: 0, checked: 0, stats: false });
  });

  it('a send that throws leaves no log row for that family and the others still go out', async () => {
    failFor = 'f1@x.in';
    const r = await run('2027-02-07', deps());
    expect(r).toEqual({ sent: 1, checked: 2, stats: true });
    expect([...logs]).toEqual(['f2|email_weekly|2027-02-07']);
    // a retry sends to the one that failed and nothing else
    failFor = null;
    const r2 = await run('2027-02-07', deps());
    expect(r2.sent).toBe(1);
    expect(sent.map((s) => s.to).sort()).toEqual(['f1@x.in', 'f2@x.in']);
    expect(stats).toHaveLength(1); // the retry does not overwrite the first run's totals
  });

  it('logs before sending, so a clash from a concurrent run sends nothing', async () => {
    const d = deps();
    d.db.log = async () => false;
    expect((await run('2027-02-07', d)).sent).toBe(0);
    expect(decrypts).toBe(0);
  });

  it('skips a family without a confirmed email, and a family that cannot be decrypted does not stop the rest', async () => {
    fams = [await fam('f1', true, ''), { ...(await fam('f2')), version: 9 }, await fam('f3')];
    const r = await run('2027-02-07', deps());
    expect(r.sent).toBe(1);
    expect(sent[0]!.to).toBe('f3@x.in');
    expect([...logs]).toEqual(['f3|email_weekly|2027-02-07']);
  });

  it('emails use the updated_at date as saved-on, carry no names, and nothing is sent under the floor', async () => {
    await run('2027-02-07', deps());
    expect(sent[0]!.text).toContain('Based on what you last saved on 5 Feb 2027');
    expect(sent[0]!.text + sent[0]!.subject).not.toMatch(/Asha|Secret/);
  });

  it('sends nothing under the floor, but the read is still logged', async () => {
    const empty = { ...stateOf(true), members: [], txns: [] };
    fams = [{ ...(await fam('f1')), envelope: await sealJson(empty, ring, familyAad('f1', 2)) }];
    const r = await run('2027-02-07', deps());
    expect(r.sent).toBe(0); expect(r.checked).toBe(1);
    expect([...logs]).toEqual(['f1|email_weekly|2027-02-07']);
  });

  it('does nothing outside the rules year', async () => {
    expect(await run('2028-02-13', deps())).toEqual({ sent: 0, checked: 0, stats: false });
  });
});

describe('secretMatches', () => {
  it('compares in full and rejects missing or different values', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abd', 'abc')).toBe(false);
    expect(secretMatches('abcd', 'abc')).toBe(false);
    expect(secretMatches(null, 'abc')).toBe(false);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches('x', undefined)).toBe(false);
  });
});
