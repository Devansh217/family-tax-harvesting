import { beforeEach, describe, expect, it } from 'vitest';
import { parseFunds, parsePrices, rehearsalDate, runAlerts, sampleEmail, secretMatches, type AlertsDb, type AlertsDeps, type Outcome, type SeasonStatsRow } from './alerts.ts';
import { toB64 } from './base64.ts';
import { familyAad, importKeyRing, sealJson, type Envelope, type KeyRing } from './envelope.ts';
import { computeFamily, FY_2026_27, lastSafeDay, NSE_HOLIDAYS_2027, seasonSummary, todayISO, withFunds, withPrices, QTY_SCALE } from '../../../src/engine/index';

const key = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
const rs = (n: number) => Math.round(n * 100);
const engine = { withFunds, withPrices, computeFamily, seasonSummary, lastSafeDay, todayISO, rules: FY_2026_27, holidays: NSE_HOLIDAYS_2027 };
const prices = { date: '2027-02-05', source: 'test', prices: { X: rs(2000), INF000A01010: rs(2000) } };
const fundsFile = { date: '2027-02-05', funds: { INF000A01010: { n: 'Blue Fund - Direct Plan - Growth', c: 'Equity Scheme - Large Cap Fund' } } };

const stateOf = (seasonHelp: boolean) => ({
  version: 1,
  members: [{ id: 'a', name: 'Asha Private', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] }],
  securities: [{ isin: 'X', name: 'Secret Fund', taxType: 'equity', listed: true, price: rs(1000) }],
  txns: [{ id: 'b1', memberId: 'a', isin: 'X', date: '2023-01-01', side: 'buy', qty: 100 * QTY_SCALE, amount: rs(100_000), source: 'test' }],
  imports: [], recommendations: [], datedMoves: [], taxTypeOverrides: {}, alerts: { seasonHelp },
});

let ring: KeyRing, decrypts: number;
let marked: string[];
let outcomes: Map<string, { outcome: Outcome | null; retrying: boolean }>;
let logs: Set<string>, stats: SeasonStatsRow[], sent: Array<{ to: string; subject: string; text: string }>;
let fams: Array<{ userId: string; email: string; version: number; envelope: Envelope; updatedAt: string }>;
let admins: Set<string>;
let failFor: string | null;

const mkDb = (): AlertsDb => ({
  optedIn: async (adminsOnly) => (adminsOnly ? fams.filter((f) => admins.has(f.userId)) : fams),
  logged: async (u, k, d) => {
    const id = `${u}|${k}|${d}`, o = outcomes.get(id);
    return { exists: logs.has(id), outcome: o?.outcome ?? null, retrying: o?.retrying ?? false };
  },
  log: async (u, k, d) => { const id = `${u}|${k}|${d}`; if (logs.has(id)) return false; logs.add(id); outcomes.set(id, { outcome: null, retrying: false }); return true; },
  claimRetry: async (u, k, d) => {
    const o = outcomes.get(`${u}|${k}|${d}`);
    if (!o || o.outcome !== 'failed' || o.retrying) return false;
    o.retrying = true; return true;
  },
  unlog: async (u, k, d) => { logs.delete(`${u}|${k}|${d}`); outcomes.delete(`${u}|${k}|${d}`); },
  setOutcome: async (u, k, d, outcome) => { const id = `${u}|${k}|${d}`; if (outcome === 'sent') marked.push(id); outcomes.set(id, { outcome, retrying: false }); },
  saveStats: async (row) => { stats.push(row); },
});
const outcomeOf = (id: string) => outcomes.get(id)?.outcome ?? null;
const deps = (): AlertsDeps => ({
  db: mkDb(), ring, prices, funds: fundsFile, appUrl: 'https://app.example.in/', engine,
  send: async (to, subject, text) => { if (failFor === to) throw new Error('boom'); sent.push({ to, subject, text }); },
});
const run = (d: string, x: AlertsDeps, o?: { rehearsal?: boolean }) => { decrypts = 0; return runAlerts(d, x, o); };
const fam = async (userId: string, seasonHelp = true, email = `${userId}@x.in`) =>
  ({ userId, email, version: 2, envelope: await sealJson(stateOf(seasonHelp), ring, familyAad(userId, 2)), updatedAt: '2027-02-05T04:00:00Z' });

beforeEach(async () => {
  const real = await importKeyRing(JSON.stringify({ k1: key() }), 'k1');
  decrypts = 0;
  ring = { current: real.current, keys: new Proxy(real.keys, { get: (t, p) => { decrypts++; return (t as Record<string | symbol, unknown>)[p]; } }) };
  marked = []; outcomes = new Map(); admins = new Set(); logs = new Set(); stats = []; sent = []; failFor = null;
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

  it('31 March: a season_check row per family plus final stats, no email; no reads after it', async () => {
    const r = await run('2027-03-31', deps());
    expect(r).toEqual({ sent: 0, checked: 2, stats: true });
    expect([...logs].sort()).toEqual(['f1|season_check|2027-03-31', 'f2|season_check|2027-03-31']);
    expect(sent).toHaveLength(0); expect(stats).toHaveLength(1);
    for (const d of ['2027-04-01', '2027-04-04', '2027-04-11']) expect(await run(d, deps())).toEqual({ sent: 0, checked: 0, stats: false });
    expect(decrypts).toBe(0);
  });

  it('a send that throws marks the row failed; a retry the same day sends only to that family', async () => {
    failFor = 'f1@x.in';
    const r = await run('2027-02-07', deps());
    expect(r).toEqual({ sent: 1, checked: 2, stats: true });
    expect([...logs].sort()).toEqual(['f1|email_weekly|2027-02-07', 'f2|email_weekly|2027-02-07']); // every decrypt stays logged
    expect(marked).toEqual(['f2|email_weekly|2027-02-07']);
    expect(outcomeOf('f1|email_weekly|2027-02-07')).toBe('failed');
    failFor = null;
    const r2 = await run('2027-02-07', deps());
    expect(r2.sent).toBe(1);
    expect(sent.map((s) => s.to).sort()).toEqual(['f1@x.in', 'f2@x.in']);
    expect(marked).toContain('f1|email_weekly|2027-02-07');
    expect(stats).toHaveLength(1); // the retry does not overwrite the first run's totals
    expect((await run('2027-02-07', deps())).sent).toBe(0); // and now nothing is left to send
    expect(outcomeOf('f1|email_weekly|2027-02-07')).toBe('sent');
  });

  it('a rehearsal run reads, logs and emails only families of admins and writes no season totals', async () => {
    admins = new Set(['f2']);
    fams = [await fam('f2')];
    await run('2027-03-01', deps());
    const oneFamily = decrypts;
    expect(oneFamily).toBeGreaterThan(0);
    logs = new Set(); outcomes = new Map(); sent = []; marked = [];
    fams = [await fam('f1'), await fam('f2')];
    const r = await run('2027-02-07', deps(), { rehearsal: true });
    expect(r).toEqual({ sent: 1, checked: 1, stats: false });
    expect(decrypts).toBe(oneFamily); // f1 is never decrypted
    expect([...logs]).toEqual(['f2|email_weekly|2027-02-07']);
    expect(sent.map((m) => m.to)).toEqual(['f2@x.in']);
    expect(stats).toHaveLength(0);
  });

  it('a rehearsal with no admin family opted in reads nobody', async () => {
    expect(await run('2027-03-01', deps(), { rehearsal: true })).toEqual({ sent: 0, checked: 0, stats: false });
    expect(decrypts).toBe(0); expect(logs.size).toBe(0);
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

const fundState = () => {
  const s = stateOf(true);
  return { ...s, securities: [{ isin: 'INF000A01010', name: 'Blue Fund', taxType: 'check', listed: false, price: rs(1000) }], txns: [{ ...s.txns[0]!, isin: 'INF000A01010' }] };
};

describe('runAlerts: funds, logging and sent marks', () => {
  it('classifies an unchecked fund from AMFI like the app does: its gain counts in the email figure and the totals', async () => {
    fams = [{ ...(await fam('f1')), envelope: await sealJson(fundState(), ring, familyAad('f1', 2)) }];
    await run('2027-02-07', deps());
    expect(stats[0]!.room_usable).toBe(rs(1_00_000));
    expect(sent[0]!.text).toContain('₹1,00,000');
  });

  it('the email figure is the usable room still left, not the whole free room', async () => {
    await run('2027-02-07', deps()); // 1,00,000 of gain to harvest, 1,25,000+ of free room
    expect(sent[0]!.text).toContain('₹1,00,000');
    expect(sent[0]!.text).not.toMatch(/₹1,2\d,\d{3}/);
  });

  it('a read stays logged when the engine throws after a successful decrypt', async () => {
    const d = deps();
    d.engine = { ...engine, computeFamily: () => { throw new Error('engine'); } };
    const r = await run('2027-02-07', d);
    expect(r.sent).toBe(0);
    expect(logs.size).toBe(2);
  });

  it('records an outcome for every read: sent, nothing to send (under the floor, switch off in the document, 31 March)', async () => {
    fams = [await fam('f1'), { ...(await fam('f2')), envelope: await sealJson({ ...stateOf(true), members: [], txns: [] }, ring, familyAad('f2', 2)) }, await fam('f3', false)];
    await run('2027-02-07', deps());
    expect(outcomeOf('f1|email_weekly|2027-02-07')).toBe('sent');
    expect(outcomeOf('f2|email_weekly|2027-02-07')).toBe('nothing_to_send');
    expect(outcomeOf('f3|email_weekly|2027-02-07')).toBe('nothing_to_send');
    await run('2027-03-31', deps());
    expect(outcomeOf('f1|season_check|2027-03-31')).toBe('nothing_to_send');
  });

  it('a same-day re-run does not decrypt a nothing-to-send row again', async () => {
    fams = [{ ...(await fam('f1')), envelope: await sealJson({ ...stateOf(true), members: [], txns: [] }, ring, familyAad('f1', 2)) }];
    await run('2027-02-07', deps());
    expect(await run('2027-02-07', deps())).toEqual({ sent: 0, checked: 0, stats: false });
    expect(decrypts).toBe(0);
  });

  it('a send that went out but whose outcome write failed is never sent again; the failure is logged by code only', async () => {
    const d = deps();
    d.db.setOutcome = async () => { throw Object.assign(new Error('Asha'), { code: 'PGRST301' }); };
    const errs: unknown[][] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errs.push(a); };
    try { expect((await run('2027-02-07', d)).sent).toBe(2); } finally { console.error = orig; }
    expect(errs.length).toBeGreaterThan(0);
    for (const e of errs) expect(JSON.stringify(e)).not.toMatch(/Asha|f1|f2|@/);
    expect(errs.flat()).toContain('PGRST301');
    expect((await run('2027-02-07', deps())).sent).toBe(0); // outcome still null: in progress, never retried
    expect(sent).toHaveLength(2);
  });

  it('a failed row is retried by only one run: the claim is conditional', async () => {
    failFor = 'f1@x.in';
    await run('2027-02-07', deps());
    failFor = null;
    const d = deps();
    d.db.claimRetry = async () => false; // another run claimed it first
    expect((await run('2027-02-07', d)).sent).toBe(0);
    expect(decrypts).toBe(0);
  });

  it('only email days retry; a failed engine run after a decrypt is marked failed', async () => {
    const d = deps();
    d.engine = { ...engine, computeFamily: () => { throw new Error('engine'); } };
    await run('2027-02-07', d);
    expect(outcomeOf('f1|email_weekly|2027-02-07')).toBe('failed');
  });

  it('marks the log row as sent only after a successful send', async () => {
    failFor = 'f1@x.in';
    await run('2027-02-07', deps());
    expect(marked).toEqual(['f2|email_weekly|2027-02-07']);
  });

  it('marks nothing when nothing is sent (under the floor)', async () => {
    fams = [{ ...(await fam('f1')), envelope: await sealJson({ ...stateOf(true), members: [], txns: [] }, ring, familyAad('f1', 2)) }];
    await run('2027-02-07', deps());
    expect(marked).toEqual([]);
  });

  it('one database blip on the log check does not stop the other families', async () => {
    const d = deps();
    const real = d.db.logged;
    d.db.logged = async (u, k, dt) => { if (u === 'f1') throw new Error('network'); return real(u, k, dt); };
    const r = await run('2027-02-07', d);
    expect(r.sent).toBe(1);
  });
});

describe('market files and the test email', () => {
  it('accepts well-formed files and rejects malformed ones', () => {
    expect(parsePrices(prices)).toEqual(prices);
    expect(parsePrices({ date: 5, prices: {} })).toBeNull();
    expect(parsePrices({ date: '2027-02-05' })).toBeNull();
    expect(parsePrices(null)).toBeNull();
    expect(parseFunds(fundsFile)).toEqual(fundsFile);
    expect(parseFunds({ date: '2027-02-05', funds: null })).toBeNull();
    expect(parseFunds({ funds: {} })).toBeNull();
  });
  it('the test email is a fixed sample with no family data', () => {
    const m = sampleEmail('https://app.example.in/');
    expect(m.subject).toMatch(/test/i);
    expect(m.text).toContain('https://app.example.in/');
    expect(m.text).not.toMatch(/₹\d/);
  });
});

describe('rehearsalDate', () => {
  it('accepts a real date from 1 Feb to 31 Mar of the rules year and nothing else', () => {
    expect(rehearsalDate('2027-02-07', '2027-03-31')).toBe('2027-02-07');
    expect(rehearsalDate('2027-02-01', '2027-03-31')).toBe('2027-02-01');
    expect(rehearsalDate('2027-03-31', '2027-03-31')).toBe('2027-03-31');
    for (const bad of ['2027-01-31', '2027-04-01', '2026-02-07', '2027-02-30', '07-02-2027', 'x', '', null]) expect(rehearsalDate(bad, '2027-03-31')).toBeNull();
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

describe('the alerts entry', () => {
  it('rejects a bad x-alerts-date (400) before fetching the market files', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../alerts/index.ts', import.meta.url), 'utf8');
    const bad = src.indexOf("'bad date'"), fetchPrices = src.indexOf("'latest.json'");
    expect(bad).toBeGreaterThan(0); expect(fetchPrices).toBeGreaterThan(0);
    expect(bad).toBeLessThan(fetchPrices);
  });
});
