import { describe, expect, it } from 'vitest';
import { computeFamily, type FamilyState } from './family';
import { datedRecord, moveId, newShownRecords, statusRecord } from './records';
import { FY_2026_27 as R, type TaxRules } from './rules';
import { QTY_SCALE, type Member, type Txn } from './types';

const rs = (n: number) => Math.round(n * 100);
const person = (id: string, over: Partial<Member> = {}): Member => ({
  id, name: id.toUpperCase(), relation: 'self', age: 40, regime: 'new', type: 'person', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }], ...over,
});
const buy = (id: string, units: number, priceRs: number): Txn => ({
  id, memberId: 'a', isin: 'INE1', date: '2023-01-01', side: 'buy', qty: units * QTY_SCALE, amount: rs(units * priceRs), source: 't',
});
const state = (units: number): FamilyState => ({
  members: [person('a')],
  securities: [{ isin: 'INE1', name: 'X Ltd', taxType: 'equity', listed: true, price: rs(2000) }],
  txns: [buy('b1', units, 1000)],
});
const AT = '2026-11-15T10:00:00Z';

describe('stable move ids', () => {
  it('computing the same family twice gives identical ids, and a second compute records nothing new', () => {
    const one = computeFamily(state(100), '2026-11-14', R), two = computeFamily(state(100), '2026-11-14', R);
    expect(one.moves.map((m) => m.id)).toEqual(two.moves.map((m) => m.id));
    expect(one.moves[0]!.id).toBe('FY 2026-27|harvest_gain|a|INE1|');
    const first = newShownRecords(one.moves, [], AT);
    expect(first).toHaveLength(one.moves.length);
    expect(newShownRecords(two.moves, first, AT)).toEqual([]);
  });

  it('a move whose quantity changes keeps its id; another tax year gives another id', () => {
    const small = computeFamily(state(50), '2026-11-14', R).moves[0]!, big = computeFamily(state(100), '2026-11-14', R).moves[0]!;
    expect(small.qty).not.toBe(big.qty);
    expect(small.id).toBe(big.id);
    const next: TaxRules = { ...R, label: 'FY 2027-28' };
    const { id: _id, ...rest } = big;
    expect(moveId(rest, next)).not.toBe(big.id);
  });

  it('every move explains itself in plain English', () => {
    const m = computeFamily(state(100), '2026-11-14', R).moves[0]!;
    expect(m.reasons.length).toBeGreaterThan(0);
    expect(m.reasons[0]).toMatch(/A's ₹1,25,000 tax-free room/);
  });

  it('status changes are records too', () => {
    const m = computeFamily(state(100), '2026-11-14', R).moves[0]!;
    expect(statusRecord(m, 'done', AT)).toEqual({ moveId: m.id, at: AT, event: 'done', move: m });
  });

  it('picking a date writes an in_plan record carrying the date', () => {
    const m = computeFamily(state(100), '2026-11-14', R).moves[0]!;
    expect(datedRecord(m, '2026-12-04', AT)).toEqual({ moveId: m.id, at: AT, event: 'in_plan', date: '2026-12-04', move: m });
  });
});
