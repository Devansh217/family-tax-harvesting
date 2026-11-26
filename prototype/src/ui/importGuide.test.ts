import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import { QTY_SCALE, type Member } from '../engine/types';
import type { BrokerSummary, ParseResult } from '../parsers';
import { applyImport, emptyState, removeImport, type AppState } from '../store';
import { accountGuide, brokerOf, evidenceDate, familyGuide, familyRow, fileNotes, fyOf, guideSummary, memberAccounts, memberGuide, pct, readLine, successDiff, UNCHANGED, usableShare } from './importGuide';

const ASOF = '2026-11-24';
const asha: Member = { id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [] };
const ravi: Member = { id: 'r', name: 'Ravi', relation: 'spouse', age: 42, regime: 'new', income: [] };
const zHoldings = (asOf: string, rows: Array<[isin: string, qty: number, lt: number | null, avg: number, close: number]>): ParseResult => ({
  format: 'Zerodha holdings', txns: [], skipped: 0, warnings: [],
  prices: rows.map(([isin, qty, lt, avg, close]) => ({ isin, name: isin, price: close * 100, priceDate: asOf, qty: qty * QTY_SCALE, ltQty: lt == null ? undefined : lt * QTY_SCALE, cost: avg * qty * 100 })),
});
const tradebook = (rows: Array<[isin: string, date: string, side: 'buy' | 'sell', qty: number, price: number]>, format = 'Trade history'): ParseResult => ({
  format, skipped: 0, warnings: [], prices: [],
  txns: rows.map(([isin, date, side, qty, price]) => ({ isin, name: isin, date, side, qty: qty * QTY_SCALE, amount: qty * price * 100 })),
});
const zPnl = (from: string, to: string): ParseResult => ({
  format: `Zerodha Tax P&L · ${from} to ${to}`, txns: [], prices: [], skipped: 0, warnings: [],
  brokerSummary: { broker: 'Zerodha', from, to, intraday: null, equityShortTerm: null, equityLongTerm: null, mfShortTerm: null, mfLongTerm: null, fno: null, fnoTurnover: null } as BrokerSummary,
});
const family = (...steps: Array<(s: AppState) => AppState>) => steps.reduce((s, f) => f(s), { ...emptyState(), members: [asha, ravi] });
const add = (m: string, file: string, r: ParseResult, account: string) => (s: AppState) => applyImport(s, m, file, r, { account });
const fam = (s: AppState) => computeFamily(s, ASOF, FY_2026_27);

describe('accounts and completeness', () => {
  it('labels', () => {
    const s = family(
      add('a', 'tb.csv', tradebook([['INE1', '2026-06-01', 'buy', 10, 100]]), 'Zerodha'),
      add('a', 'h.csv', zHoldings('2026-10-01', [['INE1', 10, 0, 100, 100]]), ' zerodha '),
      add('r', 'tb.csv', tradebook([['INE1', '2026-06-01', 'buy', 10, 100]]), ''),
    );
    const a = memberAccounts(s, 'a');
    expect(a).toHaveLength(1);
    expect(a[0]!.broker).toBe('Zerodha');
    const r = memberAccounts(s, 'r');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ label: '', broker: 'Other' });
  });

  it('label is the most common spelling, ties to the first sorted', () => {
    const tie = (order: 'ab' | 'ba') => {
      const a = add('a', 'tb.csv', tradebook([['INE1', '2026-06-01', 'buy', 10, 100]]), 'zerodha');
      const b = add('a', 'h.csv', zHoldings('2026-10-01', [['INE1', 10, 0, 100, 100]]), ' Zerodha ');
      return memberAccounts(order === 'ab' ? family(a, b) : family(b, a), 'a')[0]!.label;
    };
    expect(tie('ab')).toBe('Zerodha');
    expect(tie('ba')).toBe('Zerodha');
    const most = family(
      add('a', 'h.csv', zHoldings('2026-10-01', [['INE1', 10, 0, 100, 100]]), 'Zerodha'),
      add('a', 'tb.csv', tradebook([['INE1', '2026-06-01', 'buy', 10, 100], ['INE1', '2026-06-02', 'buy', 1, 100]]), 'zerodha'),
    );
    expect(memberAccounts(most, 'a')[0]!.label).toBe('zerodha');
  });

  it('two brokers', () => {
    const s = family(
      add('a', 'h.csv', zHoldings('2026-10-01', [['INE1', 10, 0, 100, 100]]), 'Zerodha'),
      add('a', 'angel.csv', tradebook([['INE2', '2026-06-01', 'buy', 5, 100]], 'Trade history · Angel One · x'), 'Angel One'),
    );
    expect(memberAccounts(s, 'a').map((x) => x.broker)).toEqual(['Zerodha', 'Angel One']);
  });

  it('mutual fund folios are Mutual funds, sorted last', () => {
    const s = family(
      add('a', 'cas.pdf', tradebook([['INF1', '2026-06-01', 'buy', 5, 100]], 'Mutual fund CAS (CAMS / KFintech)'), 'Folio 123/45'),
      add('a', 'comb.pdf', tradebook([['INF2', '2026-06-01', 'buy', 5, 100]], 'Combined CAS'), 'Folio 9/9'),
      add('a', 'h.csv', zHoldings('2026-10-01', [['INE1', 10, 0, 100, 100]]), 'Zerodha'),
    );
    expect(memberAccounts(s, 'a').map((x) => [x.label, x.broker])).toEqual([
      ['Zerodha', 'Zerodha'], ['Folio 123/45', 'Mutual funds'], ['Folio 9/9', 'Mutual funds'],
    ]);
    expect(brokerOf('MF folios', [])).toBe('Mutual funds');
    expect(brokerOf(' mf FOLIOS ', [])).toBe('Mutual funds');
    expect(brokerOf('Kite', [])).toBe('Zerodha');
  });

  it('evidence date', () => {
    const s = family(
      add('a', 'h.csv', zHoldings('2026-10-01', [['INE1', 10, 0, 100, 100]]), 'Zerodha'),
      add('a', 'tb.csv', tradebook([['INE1', '2026-10-20', 'buy', 1, 100]]), 'Zerodha'),
      add('a', 'p.xlsx', zPnl('2026-04-01', '2026-11-02'), 'Zerodha'),
    );
    expect(evidenceDate(s, 'a', 'zerodha')).toBe('2026-11-02');
    expect(evidenceDate(family(), 'a', 'zerodha')).toBeNull();
  });

  it('completeness', () => {
    const s = family(
      add('a', 'tb.csv', tradebook([['INE2', '2026-06-01', 'buy', 10, 100]]), 'Zerodha'),
      add('a', 'h.csv', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150], ['INE2', 30, 0, 100, 100]]), 'Zerodha'),
    );
    const share = usableShare(fam(s), 'a');
    expect(share).toEqual({ usable: 16_000_00, total: 18_000_00 });
    expect(pct(share)).toBe(89);
    expect(pct({ usable: 0, total: 0 })).toBeNull();
  });

  it('unexplained counts against', () => {
    const s = family(
      add('r', 'tb.csv', tradebook([['INF9', '2026-06-01', 'buy', 20, 100]], 'Mutual fund CAS (CAMS / KFintech)'), 'Folio 1/1'),
      add('r', 'angel.csv', {
        format: 'Angel One fund holdings', txns: [], skipped: 0, warnings: [],
        prices: [{ isin: 'INF9', name: 'INF9', price: 100_00, priceDate: '2026-11-20', qty: 50 * QTY_SCALE }],
      }, 'Angel One'),
    );
    const f = fam(s);
    const held = f.members.find((m) => m.member.id === 'r')!.holdings.find((h) => h.isin === 'INF9')!;
    const lotsValue = held.lots.reduce((a, l) => a + (l.value ?? 0), 0);
    const share = usableShare(f, 'r');
    expect(share.total).toBe(lotsValue + 3_000_00);
    expect(share.usable).toBeLessThanOrEqual(lotsValue);
  });

  it('check funds and unpriced lots', () => {
    const s = family(add('a', 'tb.csv', tradebook([['INF1', '2026-01-01', 'buy', 10, 100], ['INE5', '2026-01-01', 'buy', 10, 100]]), 'Zerodha'));
    const f = fam(s);
    const m = f.members.find((x) => x.member.id === 'a')!;
    const fund = m.holdings.find((h) => h.isin === 'INF1')!;
    fund.taxType = 'check';
    fund.lots.forEach((l) => { l.value = 1_000_00; l.certain = true; });
    const eq = m.holdings.find((h) => h.isin === 'INE5')!;
    eq.lots.forEach((l) => { l.value = null; l.certain = true; });
    expect(usableShare(f, 'a')).toEqual({ usable: 0, total: fund.lots.length * 1_000_00 });
  });
});

describe('Zerodha steps', () => {
  const guide = (s: AppState, today = ASOF) => accountGuide(s, fam(s), 'a', memberAccounts(s, 'a')[0]!, today);
  const shape = (g: ReturnType<typeof guide>) => g.steps.map((x) => [x.kind, x.status]);
  const twoLongTerm = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150], ['INE4', 10, 10, 100, 100]]), 'Zerodha');
  const undated = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150], ['INE4', 10, 10, 100, 100], ['INE2', 20, 0, 100, 100]]), 'Zerodha');
  const pnl = add('a', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha');

  it('fyOf', () => {
    expect(fyOf('2025-06-01')).toBe('FY 2025-26');
    expect(fyOf('2026-03-31')).toBe('FY 2025-26');
    expect(fyOf('2026-04-01')).toBe('FY 2026-27');
    expect(fyOf('2009-12-01')).toBe('FY 2009-10');
  });

  it('holdings in → P&L next', () => {
    const g = guide(family(twoLongTerm));
    expect(shape(g)).toEqual([['holdings', 'done'], ['pnl', 'next']]);
    expect(g.steps[0]!.doneLine).toMatch(/as on 20 Nov 2026 · 2 shares/);
    expect(g.steps[0]!.doneLine).toBe('Zerodha holdings · as on 20 Nov 2026 · 2 shares, ₹16,000');
    expect(g.steps[1]).toMatchObject({ title: 'Tax P&L, FY 2026-27', where: 'Console → Reports → Tax P&L → FY 2026-27 → Download (.xlsx)' });
    expect(g.stale).toBe(false);
    expect(g.notes).toEqual([]);
  });

  it('nothing in → holdings next', () => {
    const s = family(add('a', 'tb.csv', tradebook([['INE1', '2026-11-10', 'buy', 10, 100]]), 'Zerodha'));
    const g = guide(s);
    expect(g.steps[0]).toMatchObject({ kind: 'holdings', status: 'next', title: 'Holdings file', where: 'Console → Portfolio → Holdings → Download (.xlsx)' });
    expect(g.steps[1]).toMatchObject({ kind: 'pnl', status: 'later' });
  });

  it('P&L in → tradebook only while gaps remain', () => {
    const done = guide(family(twoLongTerm, pnl));
    expect(shape(done)).toEqual([['holdings', 'done'], ['pnl', 'done']]);
    expect(done.steps[1]!.doneLine).toBe('Tax P&L · 1 Apr 2026 – 20 Nov 2026');
    const g = guide(family(undated, pnl));
    expect(g.steps.map((x) => x.kind)).toEqual(['holdings', 'pnl', 'tradebook']);
    expect(g.steps[2]).toMatchObject({ status: 'next', fy: 'FY 2026-27', title: 'Tradebook, FY 2026-27' });
    expect(g.steps[2]!.unlocks).toMatch(/Could date up to 1 share \(₹2,000\)/);
    const two = guide(family(add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE2', 20, 0, 100, 100], ['INE3', 10, 0, 100, 100]]), 'Zerodha'), pnl));
    expect(two.steps[2]!.unlocks).toMatch(/Could date up to 2 shares \(₹3,000\)/);
  });

  it('tradebook years walk back once', () => {
    const july = add('a', 'tb26.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100]]), 'Zerodha');
    const g = guide(family(july, undated, pnl));
    const tb = g.steps.find((x) => x.kind === 'tradebook')!;
    expect(tb).toMatchObject({ status: 'next', fy: 'FY 2025-26', title: 'Tradebook, FY 2025-26' });
    expect(tb.unlocks).toMatch(/Could date up to 1 share \(₹1,500\)/);
    const sept = add('a', 'tb25.csv', tradebook([['INE2', '2025-09-01', 'buy', 5, 100]]), 'Zerodha');
    const both = guide(family(july, sept, undated, pnl));
    expect(both.steps.filter((x) => x.kind === 'tradebook')).toEqual([expect.objectContaining({ status: 'done', doneLine: 'Tradebooks · FY 2026-27, 2025-26' })]);
    expect(both.notes).toContain("1 share (₹1,000) isn't in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves.");
  });

  it("a lone older tradebook doesn't fill this year's", () => {
    // Only last year's tradebook is in (INE3 bought Dec 2025); INE2's 20 short-term units were bought this year.
    const tb25 = add('a', 'tb25.csv', tradebook([['INE3', '2025-12-01', 'buy', 5, 100]]), 'Zerodha');
    const h = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE3', 5, 0, 100, 100], ['INE2', 20, 0, 100, 100]]), 'Zerodha');
    const s = family(tb25, h, pnl);
    const g = guide(s);
    expect(g.steps.find((x) => x.kind === 'tradebook')).toMatchObject({ status: 'next', fy: 'FY 2026-27', title: 'Tradebook, FY 2026-27', doneLine: 'Tradebooks · FY 2025-26' });
    expect(g.notes.some((n) => n.includes('possibly a bonus'))).toBe(false);
    expect(memberGuide(s, fam(s), 'a', ASOF).done).toBe(false);
    // A lone FY 2023-24 tradebook asks for this year first.
    const tb23 = add('a', 'tb23.csv', tradebook([['INE3', '2023-07-01', 'buy', 5, 100]]), 'Zerodha');
    const h23 = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE3', 5, 5, 100, 100], ['INE2', 20, 0, 100, 100]]), 'Zerodha');
    expect(guide(family(tb23, h23, pnl)).steps.find((x) => x.kind === 'tradebook')).toMatchObject({ status: 'next', fy: 'FY 2026-27' });
    // Years between the oldest and newest tradebook count as in: FY 2026-27 and 2024-25 in, so FY 2025-26 is too.
    const tb24 = add('a', 'tb24.csv', tradebook([['INE3', '2024-07-01', 'buy', 1, 100]]), 'Zerodha');
    const tb26 = add('a', 'tb26.csv', tradebook([['INE3', '2026-07-01', 'buy', 1, 100]]), 'Zerodha');
    const h3 = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE3', 2, 1, 100, 100], ['INE2', 20, 0, 100, 100]]), 'Zerodha');
    expect(guide(family(tb24, tb26, h3, pnl)).steps.filter((x) => x.kind === 'tradebook')).toEqual([expect.objectContaining({ status: 'done' })]);
  });

  it('two undated shares are plural', () => {
    const july = add('a', 'tb26.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100]]), 'Zerodha');
    const sept = add('a', 'tb25.csv', tradebook([['INE2', '2025-09-01', 'buy', 5, 100]]), 'Zerodha');
    const h = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE2', 20, 0, 100, 100], ['INE3', 10, 0, 100, 100]]), 'Zerodha');
    expect(guide(family(july, sept, h, pnl)).notes).toContain("2 shares (₹2,000) aren't in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves.");
  });

  it('fund trades do not fill the equity tradebook years', () => {
    const coin = add('a', 'mf.csv', tradebook([['INF1', '2026-07-01', 'buy', 5, 100], ['INF1', '2025-07-01', 'buy', 5, 100]]), 'Zerodha');
    const g = guide(family(coin, undated, pnl));
    expect(g.steps.find((x) => x.kind === 'tradebook')).toMatchObject({ status: 'next', fy: 'FY 2026-27' });
    expect(g.steps.find((x) => x.kind === 'tradebook')!.doneLine).toBeUndefined();
    const sharesIn = add('a', 'tb26.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100]]), 'Zerodha');
    expect(guide(family(coin, sharesIn, undated, pnl)).steps.find((x) => x.kind === 'tradebook')).toMatchObject({ fy: 'FY 2025-26', doneLine: 'Tradebooks · FY 2026-27' });
  });

  it('corporate-action credit is not a gap', () => {
    const s = family(
      add('a', 'tb.csv', tradebook([['INE7', '2026-06-01', 'buy', 10, 1000]]), 'Zerodha'),
      add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE7', 20, 0, 500, 500]]), 'Zerodha'),
      pnl,
    );
    const f = fam(s);
    expect(f.holdingsNotes.corporateActions.map((c) => c.isin)).toEqual(['INE7']);
    const lots = f.members.find((m) => m.member.id === 'a')!.holdings.find((h) => h.isin === 'INE7')!.lots;
    expect(lots.some((l) => !l.certain && !l.approx)).toBe(true);
    const g = guide(s);
    expect(g.steps.filter((x) => x.kind === 'tradebook' && x.status !== 'done')).toEqual([]);
  });

  it('Coin funds', () => {
    const coin = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INF1', 1000, null, 10, 12]]), 'Zerodha');
    const step = (s: AppState) => guide(s).steps.find((x) => x.kind === 'fund_tradebook');
    expect(step(family(coin, pnl))).toMatchObject({
      status: 'next', fy: 'FY 2026-27', title: 'Fund tradebook (Coin), FY 2026-27', where: 'Console → Reports → Tradebook → segment MF → FY 2026-27',
      unlocks: 'Dates 1 fund (₹12,000) so they can get moves.',
    });
    // A lone older fund tradebook doesn't fill the years after it: this year's is asked first.
    const may18 = add('a', 'mf.csv', tradebook([['INF1', '2018-05-10', 'buy', 10, 10]]), 'Zerodha');
    expect(step(family(may18, coin, pnl))).toMatchObject({ fy: 'FY 2026-27' });
    const jun23 = add('a', 'mf23.csv', tradebook([['INF1', '2023-06-10', 'buy', 10, 10]]), 'Zerodha');
    expect(step(family(jun23, coin, pnl))).toMatchObject({ fy: 'FY 2026-27' });
    // This year's and FY 2018-19's in: the years between count as in, so FY 2017-18 is next.
    const jul26 = add('a', 'mf26.csv', tradebook([['INF1', '2026-07-10', 'buy', 10, 10]]), 'Zerodha');
    expect(step(family(may18, jul26, coin, pnl))).toMatchObject({ fy: 'FY 2017-18' });
    // Back to FY 2017-18: Coin has nothing older.
    const jun17 = add('a', 'mf17.csv', tradebook([['INF1', '2017-06-10', 'buy', 10, 10]]), 'Zerodha');
    expect(step(family(jun17, jul26, coin, pnl))).toBeUndefined();
  });

  it('stale at 30 days, not 29', () => {
    const old = guide(family(add('a', 'h.xlsx', zHoldings('2026-10-25', [['INE1', 100, 100, 100, 150]]), 'Zerodha'), pnl));
    expect(old.newest).toBe('2026-11-20');
    const s = family(add('a', 'h.xlsx', zHoldings('2026-10-25', [['INE1', 100, 100, 100, 150]]), 'Zerodha'), add('a', 'p.xlsx', zPnl('2026-04-01', '2026-10-20'), 'Zerodha'));
    const g = guide(s);
    expect(g).toMatchObject({ newest: '2026-10-25', stale: true });
    expect(g.steps[0]).toMatchObject({
      kind: 'holdings', status: 'next', title: 'Holdings file: refresh', unlocks: "Download today's: your newest data is from 25 Oct 2026.",
      doneLine: 'Zerodha holdings · as on 25 Oct 2026 · 1 share, ₹15,000',
    });
    expect(g.steps[1]).toMatchObject({ kind: 'pnl', status: 'done' });
    expect(g.notes).toContain('Newest data from 25 Oct 2026.');
    const fresh = guide(family(add('a', 'h.xlsx', zHoldings('2026-10-26', [['INE1', 100, 100, 100, 150]]), 'Zerodha')));
    expect(fresh).toMatchObject({ newest: '2026-10-26', stale: false });
    expect(fresh.steps[0]!.status).toBe('done');
    expect(fresh.notes).toEqual([]);
  });

  it('an old holdings file reopens as a refresh even when newer data is in', () => {
    // Eight months old, with a Tax P&L to 20 Nov: the account's newest data is fresh, the holdings file isn't.
    const s = family(add('a', 'h.xlsx', zHoldings('2026-03-20', [['INE1', 100, 100, 100, 150]]), 'Zerodha'), pnl);
    const g = guide(s);
    expect(g).toMatchObject({ newest: '2026-11-20', stale: false });
    expect(g.notes).toEqual([]);
    expect(g.steps[0]).toMatchObject({
      kind: 'holdings', status: 'next', refresh: true, title: 'Holdings file: refresh',
      unlocks: "Download today's: the one you added is from 20 Mar 2026.", doneLine: 'Zerodha holdings · as on 20 Mar 2026 · 1 share, ₹15,000',
    });
    const m = memberGuide(s, fam(s), 'a', ASOF);
    expect(m.done).toBe(false);
    expect(familyRow(m).holdings).toBe('Refresh');
    // A fresh file traded since (in the engine's stale files) reopens too.
    const traded = family(
      add('a', 'h.xlsx', zHoldings('2026-11-15', [['INE1', 100, 100, 100, 150]]), 'Zerodha'),
      add('a', 'tb.csv', tradebook([['INE2', '2026-11-18', 'buy', 5, 100]]), 'Zerodha'), pnl,
    );
    expect(fam(traded).holdingsNotes.staleFiles).toHaveLength(1);
    expect(guide(traded).steps[0]).toMatchObject({
      status: 'next', refresh: true, title: 'Holdings file: refresh', unlocks: "Download today's: you've traded since the one you added (15 Nov 2026).",
    });
    // 29 days old and nothing traded since: done.
    expect(guide(family(add('a', 'h.xlsx', zHoldings('2026-10-26', [['INE1', 100, 100, 100, 150]]), 'Zerodha'), pnl)).steps[0]!.status).toBe('done');
  });

  it('stale with no holdings file keeps the step title', () => {
    const g = guide(family(add('a', 'tb.csv', tradebook([['INE1', '2026-09-01', 'buy', 10, 100]]), 'Zerodha')));
    expect(g.stale).toBe(true);
    expect(g.steps[0]).toMatchObject({ kind: 'holdings', status: 'next', title: 'Holdings file', unlocks: "Download today's: your newest data is from 1 Sep 2026." });
  });
});

describe('member and family guide', () => {
  const angelFunds = (asOf = '2026-11-20') => add('r', 'angel.xlsx', {
    format: 'Angel One fund holdings', txns: [], skipped: 0, warnings: [],
    prices: [{ isin: 'INF9', name: 'INF9', price: 100_00, priceDate: asOf, qty: 50 * QTY_SCALE }],
  }, 'Angel One');
  const angelTrades = add('r', 'angel-tb.xlsx', tradebook([['INE2', '2026-11-10', 'buy', 5, 100]], 'Trade history · Angel One · x'), 'Angel One');
  const g = (s: AppState, m = 'r') => memberGuide(s, fam(s), m, ASOF);
  const statuses = (x: ReturnType<typeof g>, i = 0) => x.accounts[i]!.steps.map((st) => st.status);

  it('first step', () => {
    const r = g(family());
    expect(r).toMatchObject({ memberId: 'r', name: 'Ravi', first: true, accounts: [], pct: null, done: false, cushion: [] });
    expect(familyRow(r)).toEqual({ holdings: 'Start', pnl: '—', tradebooks: '—', usable: '—' });
  });

  it('Angel never blocks done', () => {
    // The funds' buy dates come from a CAS: without one the CAS gap keeps the member from done (tested below).
    const angelCas = add('r', 'cas.pdf', tradebook([['INF9', '2026-06-01', 'buy', 50, 100]], 'Mutual fund CAS (CAMS / KFintech)'), 'Folio 1/1');
    const r = g(family(angelFunds(), angelTrades, angelCas));
    expect(r.accounts.map((a) => a.broker)).toEqual(['Angel One', 'Mutual funds']);
    expect(statuses(r)).toEqual(['done', 'unreadable', 'suggestion']);
    expect(r.done).toBe(true);
    expect(r.first).toBe(false);
    const [h, p, t] = r.accounts[0]!.steps;
    expect(h).toMatchObject({
      kind: 'holdings', doneLine: "Funds read. Shares and SGBs in this file aren't read yet: they come from your tradebooks for now.",
      where: 'Open "Your Holding Details" with its password, save a copy as .xlsx, import the copy.',
    });
    expect(p).toMatchObject({ kind: 'pnl', unlocks: "Angel One's tax P&L can't be read yet. Sales with unknown buy dates are counted the safe way." });
    expect(t).toMatchObject({
      kind: 'tradebook', title: 'Trade history, every year', where: 'Reports → Trade history (Excel), one per tax year',
      unlocks: 'Back to the year of your first purchase. In: FY 2026-27.',
    });
    expect(r.accounts[0]!.notes).toContain("Angel shares are counted from your tradebooks only until Angel's holdings file can be read.");
    expect(familyRow(r)).toMatchObject({ holdings: 'Funds only', pnl: "Can't read yet", tradebooks: 'Optional' });
    // Shares only, no funds: Angel's holdings file has nothing the app can read, so its step can't be read yet and the
    // member is done.
    const noFile = g(family(angelTrades));
    expect(statuses(noFile)).toEqual(['unreadable', 'unreadable', 'suggestion']);
    expect(noFile.accounts[0]!.steps[0]).toMatchObject({ kind: 'holdings', unlocks: "Angel's holdings file can't be read for shares yet." });
    expect(noFile.done).toBe(true);
    expect(familyRow(noFile).holdings).toBe("Can't read yet");
    expect(noFile.accounts[0]!.notes).toContain("Angel shares are counted from your tradebooks only until Angel's holdings file can be read.");
    expect(g(family(angelFunds())).accounts[0]!.notes).toEqual([]);
  });

  it("Angel shares only never go stale: no file it can read would move the date", () => {
    const oldTrades = add('r', 'angel-tb.xlsx', tradebook([['INE2', '2026-09-01', 'buy', 5, 100]], 'Trade history · Angel One · x'), 'Angel One');
    const r = g(family(oldTrades));
    expect(r.accounts[0]).toMatchObject({ newest: '2026-09-01', stale: false });
    expect(r.accounts[0]!.notes.some((n) => n.includes('Newest data from'))).toBe(false);
    expect(r.done).toBe(true);
    // With funds, the holdings file can move the date: old fund holdings still reopen the step.
    const withFunds = g(family(angelFunds('2026-09-01'), oldTrades));
    expect(withFunds.accounts[0]).toMatchObject({ stale: true });
    expect(withFunds.accounts[0]!.steps[0]).toMatchObject({ status: 'next', refresh: true });
    expect(withFunds.done).toBe(false);
  });

  it('two brokers, two sections', () => {
    const s = family(
      add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150]]), 'Zerodha'),
      angelFunds(), angelTrades,
    );
    const r = g(s);
    expect(r.accounts.map((a) => [a.label, a.broker])).toEqual([['Zerodha', 'Zerodha'], ['Angel One', 'Angel One']]);
    expect(statuses(r, 0)).toEqual(['done', 'next']);
    expect(r.done).toBe(false);
    expect(familyRow(r)).toMatchObject({ holdings: 'Funds only', pnl: 'Next', tradebooks: 'Optional' });
  });

  it('other broker', () => {
    const s = family(
      add('r', 'groww.csv', { format: 'Groww holdings', txns: [], skipped: 0, warnings: [], prices: [{ isin: 'INE5', name: 'INE5', price: 100_00, priceDate: '2026-11-20', qty: 10 * QTY_SCALE }] }, 'Groww'),
      add('r', 'groww-tb.csv', tradebook([['INE5', '2025-05-01', 'buy', 10, 50], ['INE5', '2026-05-01', 'buy', 1, 50]]), 'Groww'),
    );
    const r = g(s);
    expect(r.accounts.map((a) => a.broker)).toEqual(['Other']);
    expect(r.accounts[0]!.steps).toEqual([
      expect.objectContaining({ kind: 'holdings', status: 'done', where: "Your broker's holdings export, or the NSDL / CDSL CAS." }),
      expect.objectContaining({ kind: 'tradebook', status: 'suggestion', title: 'Trade history, every year', unlocks: 'Back to the year of your first purchase. In: FY 2026-27, 2025-26.' }),
    ]);
    expect(r.done).toBe(true);
    expect(statuses(g(family(add('r', 'groww-tb.csv', tradebook([['INE5', '2026-11-01', 'buy', 10, 50]]), 'Groww'))))).toEqual(['next', 'suggestion']);
  });

  it('MF CAS only', () => {
    const cas = (file: string, folio: string, date: string, isin: string) =>
      add('a', file, tradebook([[isin, date, 'buy', 5, 100]], 'Mutual fund CAS (CAMS / KFintech)'), folio);
    const s = family(cas('cas.pdf', 'Folio 1/1', '2026-11-10', 'INF1'), cas('cas2.pdf', 'Folio 2/2', '2026-11-20', 'INF2'));
    const a = g(s, 'a');
    expect(a.accounts).toHaveLength(1);
    expect(a.accounts[0]).toMatchObject({ label: 'Mutual funds', broker: 'Mutual funds', newest: '2026-11-20', stale: false });
    expect(a.accounts[0]!.steps).toEqual([expect.objectContaining({
      kind: 'cas', status: 'done',
      where: 'MF Central, CAMS or KFintech: the detailed statement from your first purchase to today. It comes by email as a PDF.',
      password: 'Use the password you chose when you asked for the statement.',
    })]);
    expect(a.done).toBe(true);
    expect(familyRow(a)).toMatchObject({ holdings: '✓ 20 Nov', pnl: '—', tradebooks: '—' });
  });

  it('a fund CAS never goes stale', () => {
    const oldCas = add('r', 'cas.pdf', tradebook([['INF1', '2026-08-26', 'buy', 5, 100]], 'Mutual fund CAS (CAMS / KFintech)'), 'Folio 1/1');
    const only = g(family(oldCas));
    expect(only.done).toBe(true);
    expect(only.accounts[0]!.stale).toBe(false);
    expect(only.accounts[0]!.steps[0]).toMatchObject({ kind: 'cas', status: 'done' });
    expect(only.accounts[0]!.notes.some((n) => n.includes('Newest data from'))).toBe(false);
    const withZerodha = g(family(
      add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150]]), 'Zerodha'),
      add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha'),
      oldCas,
    ));
    expect(withZerodha.accounts.map((a) => a.broker)).toEqual(['Zerodha', 'Mutual funds']);
    expect(withZerodha.done).toBe(true);
  });

  it('removing the P&L reopens its step', () => {
    const s = family(add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150]]), 'Zerodha'), add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha'));
    expect(statuses(g(s))).toEqual(['done', 'done']);
    expect(g(s).done).toBe(true);
    expect(familyRow(g(s))).toEqual({ holdings: '✓ 20 Nov', pnl: '✓', tradebooks: '—', usable: '100%' });
    const pnlImport = s.imports.find((i) => i.fileName === 'p.xlsx')!;
    const after = g(removeImport(s, pnlImport.id));
    expect(statuses(after)).toEqual(['done', 'next']);
    expect(after.done).toBe(false);
  });

  it('stale account blocks done and shows Refresh', () => {
    const s = family(add('r', 'h.xlsx', zHoldings('2026-10-01', [['INE1', 100, 100, 100, 150]]), 'Zerodha'), add('r', 'p.xlsx', zPnl('2026-04-01', '2026-10-01'), 'Zerodha'));
    const r = g(s);
    expect(r.done).toBe(false);
    expect(familyRow(r).holdings).toBe('Refresh');
  });

  it('other gaps leave out what the steps cover', () => {
    const s = family(add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150]]), 'Zerodha'));
    const f = fam(s);
    f.members.find((m) => m.member.id === 'r')!.holdings[0]!.taxType = 'check';
    const r = memberGuide(s, f, 'r', ASOF);
    expect(r.otherGaps.map((x) => x.key)).toEqual(['funds_to_check']);
    expect(g(family()).otherGaps).toEqual([]);
  });

  it('undated shares outside Zerodha stay in other gaps: no tradebook step asks for them', () => {
    // A Groww holdings export shows 100 units; the trade history explains 10.
    const groww = (s: AppState) => add('r', 'groww.csv', {
      format: 'Groww holdings', txns: [], skipped: 0, warnings: [],
      prices: [{ isin: 'INE7', name: 'INE7', price: 100_00, priceDate: '2026-11-20', qty: 100 * QTY_SCALE }],
    }, 'Groww')(add('r', 'groww-tb.csv', tradebook([['INE7', '2026-06-01', 'buy', 10, 100]], 'Trade history · Groww'), 'Groww')(s));
    const r = g(family(groww));
    expect(r.accounts.map((a) => a.broker)).toEqual(['Other']);
    expect(r.otherGaps.map((x) => x.key)).toContain('shares_no_dates');
    // A Zerodha-only member's undated shares are the tradebook step's, so they don't repeat.
    const z = g(family(add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 0, 100, 150]]), 'Zerodha')));
    expect(z.accounts.map((a) => a.broker)).toEqual(['Zerodha']);
    expect(z.otherGaps.map((x) => x.key)).not.toContain('shares_no_dates');
  });

  it('Groww holdings with no trades: the shares gap shows, and other brokers\' trade history never blocks done', () => {
    const groww = add('r', 'groww.csv', {
      format: 'Groww holdings', txns: [], skipped: 0, warnings: [],
      prices: [{ isin: 'INE5', name: 'INE5', price: 100_00, priceDate: '2026-11-20', qty: 10 * QTY_SCALE }],
    }, 'Groww');
    const r = g(family(groww));
    expect(r.accounts.map((a) => a.broker)).toEqual(['Other']);
    expect(r.otherGaps.find((x) => x.key === 'shares_no_dates')?.text)
      .toBe("Ravi: ₹1,000 in shares has no buy dates, so it gets no moves. Import the broker's holdings file, or tradebooks going back to the first purchase.");
    expect(r.done).toBe(true);
  });

  it('Groww holdings with every trade in but IPO or bonus units: the gap shows and the member is done', () => {
    // The trade history explains 10 of the 100 units: the rest came from an IPO allotment or a bonus.
    const s = family(
      add('r', 'groww-tb.csv', tradebook([['INE7', '2025-06-01', 'buy', 10, 100]], 'Trade history · Groww'), 'Groww'),
      add('r', 'groww.csv', {
        format: 'Groww holdings', txns: [], skipped: 0, warnings: [],
        prices: [{ isin: 'INE7', name: 'INE7', price: 100_00, priceDate: '2026-11-20', qty: 100 * QTY_SCALE }],
      }, 'Groww'),
    );
    const r = g(s);
    expect(r.otherGaps.map((x) => x.key)).toContain('shares_no_dates');
    expect(r.done).toBe(true);
  });

  it("the shares gap beside a Zerodha account counts only the other broker's undated shares", () => {
    // Zerodha: a bonus credit (cost 0, no date), which no file can date. Groww: ₹1,000 of shares with no buy dates.
    const s = family(
      add('r', 'tb.csv', tradebook([['INE7', '2026-06-01', 'buy', 10, 1000]]), 'Zerodha'),
      add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE7', 20, 0, 500, 500]]), 'Zerodha'),
      add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha'),
      add('r', 'groww.csv', {
        format: 'Groww holdings', txns: [], skipped: 0, warnings: [],
        prices: [{ isin: 'INE5', name: 'INE5', price: 100_00, priceDate: '2026-11-20', qty: 10 * QTY_SCALE }],
      }, 'Groww'),
    );
    const r = g(s);
    expect(r.accounts.map((a) => a.broker)).toEqual(['Zerodha', 'Other']);
    expect(r.otherGaps.find((x) => x.key === 'shares_no_dates')?.text)
      .toBe("Ravi: ₹1,000 in shares has no buy dates, so it gets no moves. Import the broker's holdings file, or tradebooks going back to the first purchase.");
    expect(r.done).toBe(true);
  });

  it('demat shares from a combined CAS are an Other section, and their gap shows', () => {
    // A combined CAS: one fund folio with its purchase, and demat shares (no buy dates anywhere).
    const combined = add('r', 'cas.pdf', {
      format: 'Combined CAS', skipped: 0, warnings: [],
      txns: [{ isin: 'INF1', name: 'INF1', date: '2026-06-01', side: 'buy', qty: 5 * QTY_SCALE, amount: 500_00, account: 'Folio 1/1' }],
      prices: [
        { isin: 'INF1', name: 'INF1', price: 100_00, priceDate: '2026-11-20', qty: 5 * QTY_SCALE },
        { isin: 'INE5', name: 'INE5', price: 100_00, priceDate: '2026-11-20', qty: 10 * QTY_SCALE, demat: true },
      ],
    }, 'Demat (CAS)');
    const s = family(combined);
    expect(memberAccounts(s, 'r').map((a) => [a.label, a.broker])).toEqual([['Demat (CAS)', 'Other'], ['Folio 1/1', 'Mutual funds']]);
    const r = g(s);
    expect(r.accounts.map((a) => a.broker)).toEqual(['Other', 'Mutual funds']);
    expect(r.otherGaps.map((x) => x.key)).toContain('shares_no_dates');
    expect(r.done).toBe(true);
  });

  describe('undated funds outside Zerodha with no CAS', () => {
    const fundsFile = (format: string, account: string) => add('r', 'h.xlsx', {
      format, txns: [], skipped: 0, warnings: [],
      prices: [{ isin: 'INF9', name: 'INF9', price: 100_00, priceDate: '2026-11-20', qty: 50 * QTY_SCALE }],
    }, account);
    const shareTrade = (account: string) => add('r', 'tb.xlsx', tradebook([['INE2', '2026-11-10', 'buy', 5, 100]], `Trade history · ${account}`), account);
    const casGap = (r: ReturnType<typeof g>) => r.otherGaps.find((x) => x.key === 'funds_no_dates');
    for (const [format, account] of [['Angel One fund holdings', 'Angel One'], ['Groww holdings', 'Groww']] as const) {
      it(`${account}: the CAS gap shows and the member isn't done`, () => {
        for (const s of [family(fundsFile(format, account)), family(fundsFile(format, account), shareTrade(account))]) {
          const r = g(s);
          expect(r.accounts.map((a) => a.broker)).not.toContain('Mutual funds');
          expect(casGap(r)?.text).toBe('Ravi: ₹5,000 in mutual funds has no buy dates, so it gets no moves. Import their detailed CAS (free from MF Central, CAMS or KFintech): it has every purchase.');
          expect(r.done).toBe(false);
        }
      });
    }
    it('a Zerodha account beside them does not hide the gap', () => {
      const z = add('r', 'z.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150]]), 'Zerodha');
      const zPnlR = add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha');
      for (const [format, account] of [['Angel One fund holdings', 'Angel One'], ['Groww holdings', 'Groww']] as const) {
        const r = g(family(z, zPnlR, fundsFile(format, account)));
        expect(r.accounts.map((a) => a.broker)).toContain('Zerodha');
        expect(casGap(r)).toBeDefined();
        expect(r.done).toBe(false);
      }
      // Undated Coin funds in the Zerodha account alone are the fund tradebook step's: no repeat.
      const coin = g(family(add('r', 'z.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150], ['INF1', 1000, null, 10, 12]]), 'Zerodha'), zPnlR));
      expect(casGap(coin)).toBeUndefined();
    });
    it('a CAS for the funds clears it', () => {
      const cas = add('r', 'cas.pdf', tradebook([['INF9', '2026-06-01', 'buy', 50, 100]], 'Mutual fund CAS (CAMS / KFintech)'), 'Folio 1/1');
      const r = g(family(fundsFile('Angel One fund holdings', 'Angel One'), shareTrade('Angel One'), cas));
      expect(casGap(r)).toBeUndefined();
      expect(r.done).toBe(true);
    });
  });

  it("Angel's holdings step doesn't promise moves", () => {
    // An Angel account with fund trades and no holdings file: the file can add the funds held today.
    const fundTrade = add('r', 'angel-tb.xlsx', tradebook([['INF9', '2026-11-10', 'buy', 5, 100]], 'Trade history · Angel One · x'), 'Angel One');
    const h = g(family(fundTrade, angelTrades)).accounts[0]!.steps[0]!;
    expect(h).toMatchObject({ status: 'next', unlocks: 'The funds held today, so the plan can see them.' });
  });

  describe('cushion', () => {
    // One long-term share whose whole gain is harvested from approx lots (bought before the trade history).
    const build = (gainRupees: number) => family(
      add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 100 + gainRupees / 100]]), 'Zerodha'),
      add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha'),
    );
    it('at ₹4,000, not ₹3,900', () => {
      const s = build(40_000);
      const f = fam(s);
      const moves = f.moves.filter((m) => m.kind === 'harvest_gain' && m.memberId === 'r' && m.approx && !m.noRoom);
      expect(moves.map((m) => m.kind === 'harvest_gain' && m.gain)).toEqual([40_000_00]);
      const r = memberGuide(s, f, 'r', ASOF);
      expect(r.done).toBe(true);
      expect(r.cushion).toEqual([{ account: 'Zerodha', broker: 'Zerodha', fy: null, rupees: 4_000_00 }]);
      expect(g(build(39_000)).cushion).toEqual([]);
    });
    it('names the year before the oldest tradebook', () => {
      const s = family(
        add('r', 'tb.csv', tradebook([['INE9', '2026-06-01', 'buy', 1, 100]]), 'Zerodha'),
        add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 100, 100, 500], ['INE9', 1, 0, 100, 100]]), 'Zerodha'),
        add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha'),
      );
      const r = g(s);
      expect(r.done).toBe(true);
      expect(r.cushion).toEqual([expect.objectContaining({ account: 'Zerodha', fy: 'FY 2025-26' })]);
    });
  });

  it('order independence', () => {
    const files = [
      add('r', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 100, 80, 100, 150], ['INE2', 20, 0, 100, 120]]), 'Zerodha'),
      add('r', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), 'Zerodha'),
      add('r', 'tb26.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100], ['INE1', '2026-08-01', 'buy', 10, 100]]), 'Zerodha'),
      add('r', 'tb25.csv', tradebook([['INE2', '2025-09-01', 'buy', 5, 100], ['INE1', '2025-10-01', 'buy', 10, 100]]), 'Zerodha'),
      angelFunds(),
    ];
    const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const all = perms(files);
    expect(all).toHaveLength(120);
    const out = (order: typeof files) => {
      const s = family(...order);
      return JSON.stringify(familyGuide(s, fam(s), ASOF));
    };
    const first = out(all[0]!);
    expect(JSON.parse(first).members[1].accounts).toHaveLength(2);
    for (const order of all.slice(1)) expect(out(order)).toBe(first);
  });
});

describe('wrong files', () => {
  /** The state before and after adding one file, with every saved import's date pinned so the notes are fixed. */
  const pin = (s: AppState): AppState => ({ ...s, imports: s.imports.map((i, n) => ({ ...i, at: `2026-11-${String(10 + n).padStart(2, '0')}T09:00:00.000Z` })) });
  const notes = (before: AppState, step: (s: AppState) => AppState, today = ASOF) => {
    const b = pin(before);
    const after = step(b);
    const id = after.imports[after.imports.length - 1]!.id;
    return fileNotes(b, after, id, fam(after), today);
  };
  const h = (asOf: string) => add('a', `h-${asOf}.xlsx`, zHoldings(asOf, [['INE1', 100, 100, 100, 150]]), 'Zerodha');
  const tb26 = add('a', 'tb26.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100]]), 'Zerodha');
  const tb25 = add('a', 'tb25.csv', tradebook([['INE2', '2025-07-01', 'buy', 5, 100]]), 'Zerodha');

  it('a fresh file today gives no notes', () => {
    expect(notes(family(), h(ASOF))).toEqual([]);
    expect(notes(family(h(ASOF)), add('a', 'p.xlsx', zPnl('2026-04-01', ASOF), 'Zerodha'))).toEqual([]);
  });

  /** Like `notes`, with the parsed file passed through, as the import screen does. */
  const exact = (before: AppState, m: string, file: string, r: ParseResult, account: string) => {
    const b = pin(before);
    const after = applyImport(b, m, file, r, { account });
    return fileNotes(b, after, after.imports[after.imports.length - 1]!.id, fam(after), ASOF, { result: r, opts: { account } });
  };
  const tb26rows: Array<[string, string, 'buy' | 'sell', number, number]> = [['INE2', '2026-07-01', 'buy', 5, 100]];

  it('same file names the earlier one', () => {
    // The holdings file again: its positions match the first import's (pinned to 10 Nov).
    expect(notes(family(tb26, h('2026-11-20')), h('2026-11-20'))).toEqual(['Same as h-2026-11-20.xlsx you added on 11 Nov 2026. Nothing new was added.']);
    // The same tradebook again, under another name.
    expect(exact(family(tb26), 'a', 'tb26 (1).csv', tradebook(tb26rows), 'Zerodha'))
      .toEqual(['Same as tb26.csv you added on 10 Nov 2026. Nothing new was added.']);
  });

  it('two earlier tradebooks: names the one holding the trades', () => {
    expect(exact(family(tb25, tb26), 'a', 'tb.csv', tradebook(tb26rows), 'Zerodha'))
      .toEqual(['Same as tb26.csv you added on 11 Nov 2026. Nothing new was added.']);
    const both = add('a', 'both.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100], ['INE2', '2025-07-01', 'buy', 5, 100]]), 'Zerodha');
    expect(exact(family(tb25, both), 'a', 'again.csv', tradebook(tb26rows), 'Zerodha'))
      .toEqual(['Same as both.csv you added on 11 Nov 2026. Nothing new was added.']);
  });

  it('trades already in from a file of another format name that file', () => {
    // A Tax P&L whose exits were saved as trades, then a tradebook with the same sale. The only earlier file of the
    // tradebook's own format (tb26) doesn't hold it.
    const sale: Array<[string, string, 'buy' | 'sell', number, number]> = [['INE3', '2026-08-01', 'sell', 2, 300]];
    const pnlTrades = add('a', 'pnl.xlsx', { ...zPnl('2026-04-01', '2026-11-20'), txns: tradebook(sale).txns }, 'Zerodha');
    expect(exact(family(tb26, pnlTrades), 'a', 'tb-aug.csv', tradebook(sale), 'Zerodha'))
      .toEqual(['Same as pnl.xlsx you added on 11 Nov 2026. Nothing new was added.']);
  });

  it("another account's file of the same format is not named for trades it doesn't hold", () => {
    // Zerodha's tradebook is the only earlier 'Trade history' file; the Groww trade came in through a Groww-format file.
    const groww: Array<[string, string, 'buy' | 'sell', number, number]> = [['INE5', '2026-05-01', 'buy', 3, 200]];
    const growwFile = add('a', 'groww.csv', tradebook(groww, 'Trade history · Groww'), 'Groww');
    expect(exact(family(tb26, growwFile), 'a', 'groww-again.csv', tradebook(groww), 'Groww'))
      .toEqual(['Same as groww.csv you added on 11 Nov 2026. Nothing new was added.']);
  });

  it('without the parsed file, trades fall back', () => {
    expect(notes(family(tb26), add('a', 'tb26 (1).csv', tradebook(tb26rows), 'Zerodha'))).toEqual(['Nothing new: these trades are already in.']);
    expect(exact(family(tb26, tb25), 'a', 'tb.csv', tradebook([['INE2', '2026-07-01', 'buy', 5, 100], ['INE2', '2025-07-01', 'buy', 5, 100]]), 'Zerodha'))
      .toEqual(['Same as tb26.csv you added on 10 Nov 2026. Nothing new was added.']);
  });

  it('older holdings file', () => {
    expect(notes(family(h('2026-11-20')), h('2026-11-01'))).toEqual([
      "This holdings file is from 1 Nov 2026. You already have one from 20 Nov 2026, so this one changes nothing. Shares sold since 1 Nov 2026 won't come back.",
    ]);
  });

  it('old sole file: 30 days, not 29', () => {
    expect(notes(family(), h('2026-10-25'))).toEqual([
      "This holdings file is from 25 Oct 2026 and it's 1 month old. Download today's from Console → Portfolio → Holdings → Download (.xlsx).",
    ]);
    expect(notes(family(), h('2026-10-26'))).toEqual([]);
    expect(notes(family(), h('2026-08-20'))).toEqual([
      "This holdings file is from 20 Aug 2026 and it's 3 months old. Download today's from Console → Portfolio → Holdings → Download (.xlsx).",
    ]);
  });

  it('stale sole file: traded since', () => {
    const later = add('a', 'tb.csv', tradebook([['INE2', '2026-11-22', 'buy', 5, 100]]), 'Zerodha');
    expect(notes(family(later), h('2026-11-20'))).toEqual([
      "This holdings file is from 20 Nov 2026 and you've traded since. Download today's from Console → Portfolio → Holdings → Download (.xlsx).",
    ]);
  });

  it("last year's P&L", () => {
    expect(notes(family(h(ASOF)), add('a', 'p25.xlsx', zPnl('2025-04-01', '2026-03-31'), 'Zerodha'))).toEqual([
      "This is the FY 2025-26 tax P&L. It's kept, but this year's room needs FY 2026-27, from 1 Apr 2026 to today.",
    ]);
  });

  it('gap year', () => {
    const tb24 = add('a', 'tb24.csv', tradebook([['INE2', '2024-07-01', 'buy', 5, 100]]), 'Zerodha');
    const tb23 = add('a', 'tb23.csv', tradebook([['INE2', '2023-07-01', 'buy', 5, 100]]), 'Zerodha');
    expect(notes(family(h(ASOF), tb26), tb24)).toEqual(['No trades from FY 2025-26 are in. If you traded that year, add its tradebook.']);
    expect(notes(family(h(ASOF), tb26), tb23)).toEqual([
      'No trades from FY 2025-26 are in. If you traded that year, add its tradebook.',
      'No trades from FY 2024-25 are in. If you traded that year, add its tradebook.',
    ]);
    expect(notes(family(h(ASOF), tb26), tb25)).toEqual([]);
  });

  it('missing current year', () => {
    expect(notes(family(h(ASOF)), tb25)).toEqual(["This year's tradebook isn't in, so trades since 1 Apr come only from the holdings file."]);
    expect(notes(family(h(ASOF), add('a', 'p.xlsx', zPnl('2026-04-01', ASOF), 'Zerodha')), tb25))
      .toEqual(["This year's tradebook isn't in, so trades since 1 Apr come only from the tax P&L."]);
    // Nothing dated this year: nothing to say.
    expect(notes(family(), tb25)).toEqual([]);
  });

  it('is deterministic', () => {
    const b = pin(family(h('2026-11-20')));
    const after = h('2026-11-01')(b);
    const id = after.imports[1]!.id;
    expect(fileNotes(b, after, id, fam(after), ASOF)).toEqual(fileNotes(b, after, id, fam(after), ASOF));
  });
});

describe('success', () => {
  const summary = (s: AppState) => guideSummary(s, fam(s), 'a', ASOF);

  it('read lines', () => {
    expect(readLine(zHoldings('2026-11-20', [['INE1', 100, 100, 100, 150], ['INE2', 20, 0, 100, 100], ['INF1', 1000, null, 10, 12]])))
      .toBe('Holdings · as on 20 Nov 2026 · 2 shares and 1 fund, ₹29,000');
    expect(readLine({ ...zPnl('2026-04-01', '2026-11-20'), brokerSummary: { ...zPnl('2026-04-01', '2026-11-20').brokerSummary!, equityLongTerm: 1_20_000_00, mfLongTerm: 5_000_00, equityShortTerm: -3_000_00 } }))
      .toBe('Tax P&L · 1 Apr 2026 – 20 Nov 2026 · booked ₹1.25 L long-term, −₹3,000 short-term');
    expect(readLine(tradebook([['INE2', '2026-07-01', 'buy', 5, 100], ['INE2', '2025-07-01', 'buy', 5, 100], ['INE3', '2026-01-02', 'sell', 1, 100]])))
      .toBe('Tradebook · 3 trades, 1 Jul 2025 to 1 Jul 2026');
    expect(readLine(tradebook([['INF1', '2026-07-01', 'buy', 5, 100], ['INF2', '2025-07-01', 'buy', 5, 100], ['INF1', '2025-01-02', 'buy', 1, 100]], 'Mutual fund CAS (CAMS / KFintech)')))
      .toBe('Fund statement · 2 funds, 3 transactions');
  });

  it('moves use 67% → 100% after a tradebook dates the guessed lots', () => {
    // Before: INE1 10 units, all long-term, ₹400 each = ₹4,000 usable (from average cost); INE2 20 units, none long-term,
    // ₹100 each = ₹2,000 guessed. 4,000 / 6,000 = 66.7% → 67%. After the tradebook dates INE2's 20 units:
    // 6,000 / 6,000 = 100%.
    const hold = add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 10, 10, 100, 400], ['INE2', 20, 0, 100, 100]]), 'Zerodha');
    const before = family(hold);
    const after = add('a', 'tb.csv', tradebook([['INE2', '2026-07-01', 'buy', 20, 100]]), 'Zerodha')(before);
    const [b, a] = [summary(before), summary(after)];
    expect([b.pct, a.pct, b.undatedShares, a.undatedShares]).toEqual([67, 100, 1, 0]);
    const s = successDiff(b, a, 'Tradebook · 1 trade, 1 Jul 2026 to 1 Jul 2026');
    expect(s).toMatchObject({ read: 'Tradebook · 1 trade, 1 Jul 2026 to 1 Jul 2026', pctFrom: 67, pctTo: 100, unchanged: false });
    expect(s.changes).toEqual(['Moves use 67% → 100%', '1 undated share now dated']);
  });

  it('room change, matching the broker once the P&L is in', () => {
    const b = { pct: 80, room: 1_02_000_00, bookedLt: 0, bookedSt: 0, undatedShares: 2, undatedFunds: 3, stepsDone: ['a|zerodha:holdings'] };
    const a = { ...b, room: 1_01_000_00, undatedFunds: 1, stepsDone: ['a|zerodha:holdings', 'a|zerodha:pnl'] };
    expect(successDiff(b, a, 'x').changes).toEqual(["Tax-free room left ₹1.02 L → ₹1.01 L, now matching Zerodha's figures", '2 undated funds now dated']);
    expect(successDiff({ ...b, stepsDone: a.stepsDone }, a, 'x').changes[0]).toBe('Tax-free room left ₹1.02 L → ₹1.01 L');
  });

  it('a check-only P&L that leaves the room alone changes nothing', () => {
    const before = family(add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 10, 10, 100, 400]]), 'Zerodha'));
    const after = applyImport(before, 'a', 'p.xlsx', zPnl('2026-04-01', '2026-11-20'), { account: 'Zerodha', checkOnly: true });
    const [b, a] = [summary(before), summary(after)];
    expect(a.room).toBe(b.room);
    expect(a.stepsDone).toContain('a|zerodha:pnl');
    const s = successDiff(b, a, readLine(zPnl('2026-04-01', '2026-11-20')));
    expect(s).toMatchObject({ changes: [], unchanged: true, pctFrom: 100, pctTo: 100 });
    expect(UNCHANGED).toBe('Read. Your plan is unchanged by this file.');
  });

  it('summary fields', () => {
    const s = family(
      add('a', 'h.xlsx', zHoldings('2026-11-20', [['INE1', 10, 10, 100, 400], ['INF1', 1000, null, 10, 12]]), 'Zerodha'),
    );
    const g = summary(s);
    const m = fam(s).members.find((x) => x.member.id === 'a')!;
    expect(g).toMatchObject({ room: m.roomAfterPlan, bookedLt: 0, bookedSt: 0, undatedShares: 0, undatedFunds: 1, stepsDone: ['a|zerodha:holdings'] });
  });
});
