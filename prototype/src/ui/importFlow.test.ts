import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 as R } from '../engine/rules';
import { QTY_SCALE } from '../engine/types';
import { emptyState, type AppState } from '../store';
import { importAndDetect } from './importFlow';
import { planView } from './plan';

const rs = (n: number) => Math.round(n * 100);
const q = (n: number) => n * QTY_SCALE;

describe('import → detect → Plan (m6)', () => {
  const start: AppState = {
    ...emptyState(),
    members: [{ id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] }],
    securities: [{ isin: 'INF1', name: 'Nifty 50 Index Fund - Direct Plan - Growth', taxType: 'equity', listed: false, price: rs(200) }],
    txns: [{ id: 'b1', memberId: 'a', isin: 'INF1', date: '2023-01-01', side: 'buy', qty: q(1000), amount: rs(1_00_000), source: 't', importId: 'i0', account: '' }],
  };
  const ASOF = '2027-02-05';

  it('a sale in the new statement marks the dated move done, retires its day and moves it to "Done this season"', () => {
    const seen = computeFamily(start, ASOF, R);
    const move = seen.moves.find((m) => m.kind === 'harvest_gain')!;
    expect(move).toMatchObject({ qty: q(1000), gain: rs(1_00_000) });
    const dated: AppState = { ...start, datedMoves: [{ moveId: move.id, date: '2027-02-10' }] };
    const shown = computeFamily(dated, ASOF, R);
    expect(shown.moves.find((m) => m.id === move.id)!.date).toBe('2027-02-10');

    const next = importAndDetect(dated, {
      memberId: 'a', fileName: 'cas.pdf', seen: shown.moves, rules: R, at: '2027-02-12T10:00:00Z', opts: {},
      result: { format: 'CAS', txns: [{ date: '2027-02-09', isin: 'INF1', name: 'Nifty 50 Index Fund - Direct Plan - Growth', side: 'sell', qty: q(1000), amount: rs(2_00_000) }], prices: [], warnings: [], skipped: 0 },
    });
    expect(next.recommendations.filter((r) => r.event === 'detected_done').map((r) => r.moveId)).toEqual([move.id]);
    expect(next.datedMoves).toEqual(dated.datedMoves); // append-only: the day is kept, only skipped

    const after = computeFamily(next, ASOF, R);
    expect(after.moves.some((m) => m.id === move.id)).toBe(false); // units sold: nothing left, and no "No room left"
    const plan = planView(after, next.recommendations);
    expect(plan.done).toEqual([expect.objectContaining({ detected: true, label: 'Done, seen in your statement' })]);
    expect(plan.done[0]!.move).toMatchObject({ id: move.id, memberId: 'a', kind: 'harvest_gain', name: move.name });
    expect(plan.gainDone).toBe(rs(1_00_000));
    expect(plan.gainTotal).toBe(rs(1_00_000));
  });
});
