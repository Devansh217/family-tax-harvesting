import { describe, expect, it } from 'vitest';
import { detectDone, seasonStartOf } from './detect';
import type { Move } from './family';
import { datedRecord, statusRecord, type RecommendationRecord } from './records';
import { FY_2026_27 } from './rules';
import type { Txn } from './types';

const base = { name: 'Fund', account: 'Z', value: 0, taxAvoided: 0, costs: 0, saving: 0, reasons: [] as string[] };
const harvest = (over: Partial<Move> = {}): Move => ({ ...base, id: 'h1', kind: 'harvest_gain', memberId: 'a', isin: 'INF1', qty: 100, gain: 1, ...over } as Move);
const sw = (over: Record<string, unknown> = {}): Move => ({ ...base, id: 's1', kind: 'switch_direct', memberId: 'a', isin: 'INF1', qty: 100, gain: 0, tax: 0, feeSavedPerYear: 0, when: 'now', ...over } as Move);
const gift = (): Move => ({ ...base, id: 'g1', kind: 'gift', fromId: 'a', toId: 'b', isin: 'INF1', qty: 100, gain: 1 } as Move);
let n = 0;
const txn = (over: Partial<Txn> = {}): Txn => ({ id: `t${++n}`, memberId: 'a', isin: 'INF1', date: '2027-02-05', side: 'sell', qty: 100, amount: 1, source: 'x', ...over } as Txn);
const run = (moves: Move[], newTxns: Txn[], o: { records?: RecommendationRecord[]; dated?: { moveId: string; date: string }[] } = {}) =>
  detectDone({ moves, records: o.records ?? [], datedMoves: o.dated ?? [], newTxns, seasonStart: '2027-02-01', seasonEnd: '2027-03-31' });
const dated = [{ moveId: 'h1', date: '2027-02-10' }];

describe('detectDone', () => {
  it('detects a sale within 5% and 10 days of the picked date', () => {
    const r = run([harvest({ date: '2027-02-10' })], [txn({ date: '2027-02-14', qty: 103 })], { dated });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ moveId: 'h1', event: 'detected_done' });
  });
  it('rejects units 10% off the sizing and the snapshot', () => {
    const rec = [datedRecord(harvest({ qty: 100 }), '2027-02-10', 't')];
    expect(run([harvest()], [txn({ date: '2027-02-14', qty: 110 })], { dated, records: rec })).toEqual([]);
  });
  it('accepts units near the in_plan snapshot when sizing has moved', () => {
    const rec = [datedRecord(harvest({ qty: 200 }), '2027-02-10', 't')];
    expect(run([harvest({ qty: 100 })], [txn({ date: '2027-02-14', qty: 198 })], { dated, records: rec })).toHaveLength(1);
  });
  it('dated window: 3 days before to 10 days after the picked day, both edges in', () => {
    expect(run([harvest()], [txn({ date: '2027-02-07' })], { dated })).toHaveLength(1);
    expect(run([harvest()], [txn({ date: '2027-02-06' })], { dated })).toEqual([]);
    expect(run([harvest()], [txn({ date: '2027-02-20' })], { dated })).toHaveLength(1);
    expect(run([harvest()], [txn({ date: '2027-02-21' })], { dated })).toEqual([]);
  });
  it('undated window: the whole season, 1 Feb to the end of the tax year, both edges in', () => {
    expect(run([harvest()], [txn({ date: '2027-02-01' })])).toHaveLength(1);
    expect(run([harvest()], [txn({ date: '2027-01-31' })])).toEqual([]);
    expect(run([harvest()], [txn({ date: '2027-03-31' })])).toHaveLength(1);
    expect(run([harvest()], [txn({ date: '2027-04-01' })])).toEqual([]);
  });
  it('needs the same member and ISIN, and a sell', () => {
    expect(run([harvest()], [txn({ memberId: 'b' })])).toEqual([]);
    expect(run([harvest()], [txn({ isin: 'INF9' })])).toEqual([]);
    expect(run([harvest()], [txn({ side: 'buy' })])).toEqual([]);
  });
  it('gift is detected by the receiver\'s sale only', () => {
    expect(run([gift()], [txn({ memberId: 'a' })])).toEqual([]);
    expect(run([gift()], [txn({ memberId: 'b' })])).toHaveLength(1);
  });
  it('switch with toIsin needs the buy too', () => {
    const m = sw({ toIsin: 'INF2' });
    expect(run([m], [txn()])).toEqual([]);
    expect(run([m], [txn(), txn({ side: 'buy', isin: 'INF2' })])).toHaveLength(1);
    expect(run([m], [txn(), txn({ side: 'buy', isin: 'INF2', date: '2027-04-02' })])).toEqual([]);
  });
  it('switch without toIsin counts on the sell alone', () => {
    expect(run([sw()], [txn()])).toHaveLength(1);
  });
  it('never detects wait or noRoom moves', () => {
    const w = { ...base, id: 'w1', kind: 'wait', memberId: 'a', isin: 'INF1', qty: 100, gain: 1, until: '2027-03-01', days: 5 } as Move;
    expect(run([w, harvest({ noRoom: true, qty: 0 })], [txn(), txn({ qty: 0 })])).toEqual([]);
  });
  it('does not record a move twice', () => {
    const rec = [statusRecord(harvest(), 'detected_done', 't')];
    expect(run([harvest()], [txn()], { records: rec })).toEqual([]);
  });
  it('one txn confirms at most one move', () => {
    const a = harvest({ id: 'h1' });
    const b = harvest({ id: 'h2' });
    expect(run([a, b], [txn()])).toHaveLength(1);
    expect(run([a, b], [txn(), txn()])).toHaveLength(2);
  });
});

describe('seasonStartOf', () => {
  it('is 1 Feb of the year the tax year ends', () => {
    expect(seasonStartOf(FY_2026_27)).toBe('2027-02-01');
  });
});
