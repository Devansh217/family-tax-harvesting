import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import type { Member, Security, Txn } from '../engine/types';
import type { Move } from '../engine/family';
import { cushionNudge, datePickerBounds, dateVerb, importHref, importMemberOf, planGaps } from './plan';

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

  it('planGaps asks to re-import holdings when positions have no asOf', () => {
    const undated = { memberId: 'd', isin: 'INF1', qty: 1000 * 10_000, source: 'Zerodha holdings', account: 'Zerodha' };
    const gap = planGaps(fam, [undated]).find((g) => g.key === 'holdings_no_date');
    expect(gap).toMatchObject({ memberId: 'd', href: '#import-d', action: 'Import', text: "Import Devansh's holdings file again so sold or moved shares drop out." });
    // A dated file for the same account decides instead, so the old undated rows don't matter.
    const dated = { ...undated, asOf: '2026-11-01', account: ' zerodha ' };
    expect(planGaps(fam, [undated, dated]).find((g) => g.key === 'holdings_no_date')).toBeUndefined();
    // Other statements never trim, so their missing date asks for nothing.
    expect(planGaps(fam, [{ ...undated, source: 'Demat CAS (NSDL / CDSL)' }]).find((g) => g.key === 'holdings_no_date')).toBeUndefined();
  });

  it('planGaps adds the buyback gap when an account has trimmed units and no current-year Tax P&L', () => {
    // Rekha bought 10 of a share in 2025; her Zerodha holdings file of 1 Nov 2026 doesn't list it, so it is trimmed.
    const positions = [{ memberId: 'r', isin: 'INF1', qty: 10 * 10_000, source: 'Zerodha holdings', account: 'Zerodha', asOf: '2026-11-01', importId: 'h1', canTrim: true }];
    const buy: Txn = { id: 'rb', memberId: 'r', isin: 'INE1', date: '2025-01-10', side: 'buy', qty: 10 * 10_000, amount: 1_000_00, source: 'Trade history (Zerodha)', account: 'Zerodha' };
    const trimmed = computeFamily({ members: [m('r')], securities: secs, txns: [buy], positions }, '2026-11-22', FY_2026_27);
    expect(trimmed.holdingsNotes.trimmed).toMatchObject([{ memberId: 'r', isins: ['INE1'] }]);
    const gap = planGaps(trimmed, positions).find((g) => g.key === 'buyback_pnl');
    expect(gap).toMatchObject({ memberId: 'r', href: '#import-r', action: 'Import' });
    expect(gap!.text).toBe("Rekha: if any shares left Zerodha in a buyback this year, that gain counts. Import Zerodha's tax P&L.");
    // A Tax P&L for this year in that account closes the gap; one for last year doesn't.
    const pnl = (from: string, to: string) => [{ memberId: 'r', account: 'Zerodha', summary: { broker: 'Zerodha', from, to } }];
    expect(planGaps(trimmed, positions, pnl('2026-04-01', '2026-10-31')).find((g) => g.key === 'buyback_pnl')).toBeUndefined();
    expect(planGaps(trimmed, positions, pnl('2025-04-01', '2026-03-31')).find((g) => g.key === 'buyback_pnl')).toBeDefined();
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

describe('nudge to recover the cushion', () => {
  const member: Member = { id: 'd', name: 'Devansh', relation: 'self', age: 40, regime: 'new', income: [] };
  const sec: Security = { isin: 'INE1', name: 'Share', taxType: 'equity', listed: true, price: 100_00 };
  const tb = (date: string, account: string): Txn => ({ id: `${date}${account}`, memberId: 'd', isin: 'INE1', date, side: 'buy', qty: 10 * 10_000, amount: 500_00, source: 'Trade history · Zerodha', account });
  const fam = computeFamily({ members: [member], securities: [sec], txns: [tb('2025-03-10', 'Zerodha'), tb('2024-05-02', 'Zerodha'), tb('2020-01-01', 'Angel One')] }, '2026-11-22', FY_2026_27);
  const move = (gain: number, over: Partial<Move> = {}) => ({ kind: 'harvest_gain', id: 'x', memberId: 'd', isin: 'INE1', name: 'Share', account: 'Zerodha', gain: gain * 100, approx: true, ...over }) as unknown as Move;

  it('an approx move names the tax year before the oldest tradebook and the room left spare', () => {
    expect(cushionNudge(move(56_400), fam)).toEqual({ fy: 'FY 2023-24', rupees: 5_600_00 });
    // An account label differing in case or spaces is the same account; a January date is in the year before it starts.
    expect(cushionNudge(move(56_400, { account: ' zerodha ' }), fam)!.fy).toBe('FY 2023-24');
    expect(cushionNudge(move(56_400, { account: 'Angel One' }), fam)!.fy).toBe('FY 2018-19');
  });
  it('has no year when the account has no tradebook', () => {
    expect(cushionNudge(move(56_400, { account: 'Groww' }), fam)).toEqual({ fy: null, rupees: 5_600_00 });
  });
  it('exact moves and small amounts give nothing', () => {
    expect(cushionNudge(move(56_400, { approx: false }), fam)).toBeNull();
    expect(cushionNudge(move(8_000), fam)).toBeNull();
    // 9,400 x 10% = 940 rounds to 900: under the 1,000 threshold. 9,600 rounds to 1,000: shown.
    expect(cushionNudge(move(9_400 * 1), fam)).toBeNull();
    expect(cushionNudge(move(9_600 * 1), fam)).not.toBeNull();
  });
});
