import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import type { Member, Security, Txn } from '../engine/types';
import { datePickerBounds, dateVerb, importHref, importMemberOf, planGaps } from './plan';

describe('date picker (m2, m4)', () => {
  it('max is the last safe day, or the end of the tax year when the holiday list is not out; min is today', () => {
    expect(datePickerBounds('2026-11-17', '2027-03-31', '2027-03-26')).toEqual({ min: '2026-11-17', max: '2027-03-26' });
    expect(datePickerBounds('2026-11-17', '2028-03-31', null)).toEqual({ min: '2026-11-17', max: '2028-03-31' });
  });
  it('a gift is gifted and sold on the day, a switch switched, anything else sold', () => {
    expect(dateVerb('gift')).toBe('Gift and sell on');
    expect(dateVerb('switch_direct')).toBe('Switch on');
    expect(dateVerb('harvest_gain')).toBe('Sell on');
  });
});

describe('what the plan is missing', () => {
  const m = (id: string): Member => ({ id, name: id === 'd' ? 'Devansh' : 'Rekha', relation: 'self', age: 40, regime: 'new', income: [] });
  const secs: Security[] = [
    { isin: 'INE1', name: 'Share', taxType: 'equity', listed: true, price: 100_00 },
    { isin: 'INF1', name: 'Fund A', taxType: 'equity', listed: false, price: 100_00 },
    { isin: 'INF2', name: 'Fund B', taxType: 'check', listed: false, price: 100_00 },
  ];
  const lot = (memberId: string, isin: string, units: number): Txn => ({
    id: `${memberId}${isin}`, memberId, isin, date: '2025-01-01', side: 'buy', qty: units * 10_000, amount: units * 50_00, source: 'x', estimated: true,
  });
  const fam = computeFamily({ members: [m('d'), m('r')], securities: secs, txns: [lot('d', 'INF1', 1000), lot('d', 'INF2', 10), lot('r', 'INE1', 50)] }, '2026-11-22', FY_2026_27);

  it('names each member’s gaps with the file that fixes it', () => {
    const gaps = planGaps(fam, [{ memberId: 'r', isin: 'INE1', qty: 50 * 10_000, ltQty: 50 * 10_000, source: 'Zerodha holdings' }]);
    const d = gaps.filter((g) => g.memberId === 'd').map((g) => g.key);
    expect(d).toEqual(['funds_no_dates', 'funds_to_check']);
    expect(gaps.find((g) => g.key === 'funds_no_dates')!.text).toMatch(/₹1,01,000 in mutual funds.*CAS/);
    // Rekha's holdings file was read before it kept cost: importing it again fills the dates.
    expect(gaps.find((g) => g.memberId === 'r')).toMatchObject({ key: 'shares_no_dates' });
    expect(gaps.find((g) => g.memberId === 'r')!.text).toMatch(/holdings file again/);
  });

  it('counts fund units the holdings file shows but the history does not explain', () => {
    // Devansh holds 3,000 units of Fund A per the holdings file; the history explains 1,000 (all guessed here).
    const gaps = planGaps(fam, [{ memberId: 'd', isin: 'INF1', qty: 3000 * 10_000, source: 'Zerodha holdings' }]);
    expect(gaps.find((g) => g.key === 'funds_no_dates')!.text).toMatch(/₹3,01,000 in mutual funds/);
  });

  it('says when a member has nothing imported yet', () => {
    const empty = computeFamily({ members: [m('d')], securities: [], txns: [] }, '2026-11-22', FY_2026_27);
    expect(planGaps(empty, [])).toMatchObject([{ memberId: 'd', key: 'no_holdings' }]);
  });
});

describe('import links for one member', () => {
  it('open Import with that member picked, and read back from the route', () => {
    expect(importHref('mmwk1')).toBe('#import-mmwk1');
    expect(importMemberOf('import-mmwk1')).toBe('mmwk1');
    expect(importMemberOf('import')).toBeUndefined();
    expect(importMemberOf('plan')).toBeUndefined();
  });
  it('gap links go to the member they are about', () => {
    const empty = computeFamily({ members: [{ id: 'd', name: 'D', relation: 'self', age: 40, regime: 'new' }], securities: [], txns: [] }, '2026-11-22', FY_2026_27);
    expect(planGaps(empty, [])[0]!.href).toBe('#import-d');
  });
});
