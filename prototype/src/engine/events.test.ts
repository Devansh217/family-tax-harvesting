import { describe, expect, it } from 'vitest';
import { datedEvents } from './events';
import { computeFamily } from './family';
import { FY_2026_27 as R, rulesFor } from './rules';
import { QTY_SCALE, type Member } from './types';

const rs = (n: number) => Math.round(n * 100);
const a: Member = { id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', type: 'person', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] };
const AS_OF = '2026-11-15';

describe('tax rules by year', () => {
  it('finds the year a date falls in, and rolls the latest rules forward for later years', () => {
    expect(rulesFor('2026-11-15')).toBe(R);
    expect(rulesFor('2027-03-31')).toBe(R);
    const later = rulesFor('2028-06-01');
    expect(later).toMatchObject({ label: 'FY 2028-29', start: '2028-04-01', end: '2029-03-31', ltcgExemption: R.ltcgExemption });
  });
});

describe('dated events', () => {
  it('a lot turning long-term soon, and room left on 31 March', () => {
    const fam = computeFamily({
      members: [a],
      securities: [{ isin: 'INE1', name: 'X Ltd', taxType: 'equity', listed: true, price: rs(1500) }],
      txns: [
        { id: 't1', memberId: 'a', isin: 'INE1', date: '2025-12-01', side: 'buy', qty: 10 * QTY_SCALE, amount: rs(10_000), source: 't' },
      ],
    }, AS_OF, R);
    const ev = datedEvents(fam, AS_OF);
    expect(ev[0]).toMatchObject({ date: '2026-12-02', kind: 'turns_long_term', memberId: 'a', isin: 'INE1', amount: rs(5_000) });
    expect(ev.at(-1)).toMatchObject({ date: '2027-03-31', kind: 'room_left', memberId: 'a', amount: rs(1_25_000) });
    expect(ev.map((e) => e.date)).toEqual([...ev.map((e) => e.date)].sort());
  });

  it('lots turning long-term beyond the horizon, and debt funds that never do, give no event', () => {
    const fam = computeFamily({
      members: [a],
      securities: [{ isin: 'INE1', name: 'X', taxType: 'equity', listed: true, price: rs(1500) }, { isin: 'INF1', name: 'Debt', taxType: 'slab', listed: false, price: rs(1500) }],
      txns: [
        { id: 't1', memberId: 'a', isin: 'INE1', date: '2026-06-01', side: 'buy', qty: 10 * QTY_SCALE, amount: rs(10_000), source: 't' },
        { id: 't2', memberId: 'a', isin: 'INF1', date: '2025-12-01', side: 'buy', qty: 10 * QTY_SCALE, amount: rs(10_000), source: 't' },
      ],
    }, AS_OF, R);
    expect(datedEvents(fam, AS_OF).filter((e) => e.kind === 'turns_long_term')).toEqual([]);
  });
});
