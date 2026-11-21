import { describe, expect, it } from 'vitest';
import { nextLongTerm, sharePicks } from './simulate';
import { QTY_SCALE } from '../engine/types';
import type { HoldingLot } from '../engine/family';

const U = QTY_SCALE;
const lot = (over: Partial<HoldingLot>): HoldingLot => ({ account: 'a', date: '2026-06-01', qty: 10 * U, cost: 0, value: 0, gain: 100, term: 'st', longTermOn: '2027-06-01', certain: true, ...over });

describe('sharePicks: 25% / 50% / 75% / All of the largest single holding', () => {
  it('works for a holding under ₹1 L, in whole units for shares', () => {
    // 41 units at ₹1,925 = ₹78,925
    const picks = sharePicks(41 * U, 192500, U);
    expect(picks.map((p) => p.label)).toEqual(['25%', '50%', '75%', 'All']);
    expect(picks.map((p) => p.qty / U)).toEqual([10, 20, 30, 41]);
    expect(picks[3]!.value).toBe(41 * 192500);
  });

  it('All is exactly what is held, even in fractional fund units', () => {
    const step = U / 1000;
    const qty = 123456 * step; // 123.456 units
    expect(sharePicks(qty, 5000, step)[3]!.qty).toBe(qty);
  });

  it('nothing to pick when nothing is held', () => {
    expect(sharePicks(0, 192500, U)).toEqual([]);
  });
});

describe('nextLongTerm: when short-term units in gain turn long-term', () => {
  it('the soonest date after today, with the units turning then', () => {
    const lots = [
      lot({ longTermOn: '2027-03-01', qty: 5 * U }),
      lot({ longTermOn: '2027-01-10', qty: 3 * U }),
      lot({ longTermOn: '2027-01-10', qty: 2 * U }),
      lot({ longTermOn: '2026-12-01', gain: -50 }), // in loss: not counted
      lot({ term: 'lt', longTermOn: '2025-01-01' }),
    ];
    expect(nextLongTerm(lots, '2026-11-21')).toEqual({ date: '2027-01-10', qty: 5 * U });
  });

  it('none when every short-term lot is in loss or already past', () => {
    expect(nextLongTerm([lot({ gain: -1 }), lot({ term: 'lt' })], '2026-11-21')).toBeNull();
  });
});
