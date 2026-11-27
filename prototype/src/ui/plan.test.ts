import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import type { Member, Security, Txn } from '../engine/types';
import type { Move } from '../engine/family';
import { statusRecord } from '../engine/records';
import { cushionNudge, datePickerBounds, dateVerb, importHref, importMemberOf, nameList, planGaps, planView, sleepOnIt } from './plan';

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
    // That gap already asks for the file again, so the undated-file gap isn't added too.
    expect(gaps.filter((g) => g.memberId === 'r').map((g) => g.key)).toEqual(['shares_no_dates']);
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

  it('a Tax P&L for this year read before buybacks counted asks to be imported again, and closes no buyback gap', () => {
    const positions = [{ memberId: 'r', isin: 'INF1', qty: 10 * 10_000, source: 'Zerodha holdings', account: 'Zerodha', asOf: '2026-11-01', importId: 'h1', canTrim: true }];
    const buy: Txn = { id: 'rb', memberId: 'r', isin: 'INE1', date: '2025-01-10', side: 'buy', qty: 10 * 10_000, amount: 1_000_00, source: 'Trade history (Zerodha)', account: 'Zerodha' };
    const trimmed = computeFamily({ members: [m('r')], securities: secs, txns: [buy], positions }, '2026-11-22', FY_2026_27);
    const summaries = [{ importId: 'p1', memberId: 'r', account: 'Zerodha', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-10-31' } }];
    // The warning the parser gave before buybacks from 1 Apr 2026 counted as capital gains.
    const old = [{ id: 'p1', memberId: 'r', format: 'Zerodha Tax P&L · 2026-04-01 to 2026-10-31', warnings: ['1 buyback exits were left out: since Oct 2024 buyback money is taxed as dividend income, not capital gains.'] }];
    const gaps = planGaps(trimmed, positions, summaries, old).filter((g) => g.memberId === 'r');
    expect(gaps.find((g) => g.key === 'pnl_again')).toMatchObject({
      href: '#import-r', action: 'Import',
      text: "Rekha: import Zerodha's tax P&L for FY 2026-27 again. It was read before buybacks from 1 Apr 2026 counted as capital gains.",
    });
    // The buyback gap isn't repeated for that account: importing the P&L again closes both.
    expect(gaps.find((g) => g.key === 'buyback_pnl')).toBeUndefined();
    // Imported again: a newer P&L for that account and period, with no old warning, closes the ask (the old one stays
    // stored but counts for nothing), and the buyback gap stays closed by the new one.
    const again = [...summaries, { importId: 'p2', memberId: 'r', account: 'Zerodha', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-11-20' } }];
    const both = [...old, { id: 'p2', memberId: 'r', format: 'Zerodha Tax P&L · 2026-04-01 to 2026-11-20', warnings: [] }];
    const after = planGaps(trimmed, positions, again, both).filter((g) => g.memberId === 'r').map((g) => g.key);
    expect(after).not.toContain('pnl_again');
    expect(after).not.toContain('buyback_pnl');
    // A newer P&L for another account doesn't hide the old one.
    const other = [...summaries, { importId: 'p3', memberId: 'r', account: 'Zerodha 2', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-11-20' } }];
    const otherImports = [...old, { id: 'p3', memberId: 'r', format: 'Zerodha Tax P&L · 2026-04-01 to 2026-11-20', warnings: [] }];
    expect(planGaps(trimmed, positions, other, otherImports).find((g) => g.key === 'pnl_again')).toBeDefined();
    // A P&L for last year with the old warning asks nothing: buybacks then were dividends.
    const lastYear = [{ ...summaries[0]!, summary: { broker: 'Zerodha', from: '2025-04-01', to: '2026-03-31' } }];
    expect(planGaps(trimmed, positions, lastYear, old).find((g) => g.key === 'pnl_again')).toBeUndefined();
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

describe('old-data marks (plan)', () => {
  const harvest = (id: string, gain: number, extra: Partial<Move> = {}) =>
    ({ id: `FY 2026-27|${id}`, kind: 'harvest_gain', gain, saving: gain / 10, taxFreeGain: gain, noRoom: false, ...extra }) as unknown as Move;

  it('planView leaves marked open moves out of the headline', () => {
    const a = harvest('a', 10_000_00);
    const b = harvest('b', 5_000_00, { oldData: '2026-03-31' });
    const c = harvest('c', 3_000_00, { roomMayBeSmaller: '2026-03-31' });
    const fam = { moves: [a, b, c], rules: FY_2026_27 };
    const v = planView(fam, []);
    expect(v.gainTotal).toBe(10_000_00);
    expect(v.laterSaving).toBe(1_000_00);
    const done = planView(fam, [statusRecord(b, 'done', '2026-11-25T00:00:00Z')]);
    expect(done.gainDone).toBe(5_000_00);
    expect(done.gainTotal).toBe(15_000_00);
    expect(done.laterSaving).toBe(1_000_00);
  });

  it('planGaps adds one old_data line per old account', () => {
    const f = computeFamily({ members: [{ id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [] }], securities: [{ isin: 'INE1', name: 'S', taxType: 'equity', listed: true, price: 100_00 }], txns: [{ id: 't', memberId: 'a', isin: 'INE1', date: '2025-01-01', side: 'buy', qty: 10_000, amount: 50_00, source: 'x', estimated: false }] }, '2026-11-22', FY_2026_27);
    const gaps = planGaps({ ...f, oldAccounts: [{ memberId: 'a', account: 'Zerodha', newest: '2026-03-31' }] }, []);
    expect(gaps.find((g) => g.key === 'old_data')).toMatchObject({
      memberId: 'a', href: '#import-a', action: 'Import',
      text: "Asha's Zerodha: newest data from 31 Mar 2026, so its moves may be out of date. Import today's holdings file.",
    });
  });

  it('planView laterSaving leaves out a marked gift and a marked switch, keeps unmarked ones', () => {
    const gift = (id: string, extra: Partial<Move> = {}) =>
      ({ id: `FY 2026-27|gift|${id}`, kind: 'gift', fromId: 'a', toId: 'p', gain: 1_000_00, saving: 100_00, taxAvoided: 100_00, noRoom: false, ...extra }) as unknown as Move;
    const sw = (id: string, extra: Partial<Move> = {}) =>
      ({ id: `FY 2026-27|switch_direct|${id}`, kind: 'switch_direct', memberId: 'a', gain: 0, taxFreeGain: 0, taxAvoided: 20_00, saving: 0, feeSavedPerYear: 5_00, noRoom: false, ...extra }) as unknown as Move;
    const v = planView({ moves: [gift('g1'), gift('g2', { roomMayBeSmaller: '2026-03-31' }), sw('s1'), sw('s2', { oldData: '2026-03-31' })], rules: FY_2026_27 }, []);
    expect(v.laterSaving).toBe(100_00 + 20_00);
  });

  it('planView nowTotal leaves out a marked harvest_loss', () => {
    const loss = (id: string, extra: Partial<Move> = {}) =>
      ({ id: `FY 2026-27|harvest_loss|${id}`, kind: 'harvest_loss', memberId: 'a', loss: 1_000_00, term: 'st', saving: 200_00, taxAvoided: 200_00, noRoom: false, ...extra }) as unknown as Move;
    const v = planView({ moves: [loss('l1'), loss('l2', { oldData: '2026-03-31' })], rules: FY_2026_27 }, []);
    expect(v.nowTotal).toBe(200_00);
  });

  it('planView keeps a done placement move out of Done this season and the counts', () => {
    const place = { id: 'FY 2026-27|place_sip|a>p|INF1|', kind: 'place_sip', fromId: 'a', toId: 'p', isin: 'INF1', account: '', qty: 0, value: 1_20_000_00, monthly: 10_000_00, yearlyGift: 1_20_000_00, savingPerYear: 20_000_00, saving10y: 2_00_000_00, saving: 20_000_00, taxAvoided: 20_000_00, costs: 0, reasons: [] } as unknown as Move;
    const v = planView({ moves: [], rules: FY_2026_27 }, [statusRecord(place, 'done', '2026-11-25T00:00:00Z')]);
    expect(v.done).toEqual([]);
    expect(v.doneCount).toBe(0);
    expect(v.liveCount).toBe(0);
  });

  it('sleepOnIt asks first only for a placement gift over ₹5 L', () => {
    const sip = (value: number) => ({ kind: 'place_sip', value }) as unknown as Move;
    const holding = (value: number) => ({ kind: 'place_holding', value }) as unknown as Move;
    expect(sleepOnIt(sip(5_00_000_00))).toBe(false);
    expect(sleepOnIt(sip(5_00_000_01))).toBe(true);
    expect(sleepOnIt(holding(6_00_000_00))).toBe(true);
    expect(sleepOnIt({ kind: 'gift', value: 9_00_000_00 } as unknown as Move)).toBe(false);
  });

  it('nameList joins names in plain English', () => {
    expect(nameList(['Hari'])).toBe('Hari');
    expect(nameList(['Hari', 'Kabir'])).toBe('Hari and Kabir');
    expect(nameList(['Hari', 'Kabir', 'Meera'])).toBe('Hari, Kabir and Meera');
  });

  it('planGaps adds one old_room line per member, after their old_data lines', () => {
    const f = computeFamily({ members: [{ id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [] }], securities: [{ isin: 'INE1', name: 'S', taxType: 'equity', listed: true, price: 100_00 }], txns: [{ id: 't', memberId: 'a', isin: 'INE1', date: '2025-01-01', side: 'buy', qty: 10_000, amount: 50_00, source: 'x', estimated: false }] }, '2026-11-22', FY_2026_27);
    const gaps = planGaps({ ...f, oldAccounts: [{ memberId: 'a', account: 'Zerodha', newest: '2026-03-31' }], oldRoom: [{ memberId: 'a', since: '2026-03-31' }] }, []);
    const keys = gaps.map((g) => g.key);
    expect(keys.filter((k) => k === 'old_room')).toHaveLength(1);
    expect(keys.indexOf('old_room')).toBe(keys.indexOf('old_data') + 1);
    expect(gaps.find((g) => g.key === 'old_room')).toMatchObject({
      memberId: 'a', href: '#import-a', action: 'Import',
      text: "Asha's tax-free room: gains booked since 31 Mar 2026 aren't counted. Import this year's tax P&L.",
    });
  });
});
