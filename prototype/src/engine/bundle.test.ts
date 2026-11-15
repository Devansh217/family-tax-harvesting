import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as source from './index';
import type { Member, Security, Txn } from './types';

// The engine must run outside the browser (server functions, later the phone apps). This builds the one-file bundle
// and checks it gives the same answer as the source on a golden case from engine.test.ts.
const ROOT = join(__dirname, '..', '..');
let bundle: typeof source;

beforeAll(async () => {
  execSync('npm run -s build:engine', { cwd: ROOT, stdio: 'pipe' });
  bundle = await import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'dist-engine', 'engine.js')).href);
}, 60_000);

const rs = (n: number) => Math.round(n * 100);
const member: Member = { id: 'm1', name: 'Test', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: rs(20_00_000) , from: 'manual' as const }]} as Member;
const sec = { isin: 'A', name: 'A', taxType: 'equity', listed: true } as Security;
const txns: Txn[] = [
  { id: 't1', memberId: 'm1', isin: 'A', date: '2024-01-01', side: 'buy', qty: source.QTY_SCALE, amount: rs(1_00_000), source: 'test' },
  { id: 't2', memberId: 'm1', isin: 'A', date: '2026-06-01', side: 'sell', qty: source.QTY_SCALE, amount: rs(3_25_000), source: 'test' },
];

describe('engine bundle', () => {
  it('matches the source engine on LTCG above the exemption', () => {
    const run = (e: typeof source) => e.summariseYear(member, e.buildLedger(txns, [sec]).realised, e.FY_2026_27);
    expect(run(source).tax).toBe(rs(13_000));
    expect(run(bundle)).toEqual(run(source));
  });
});
