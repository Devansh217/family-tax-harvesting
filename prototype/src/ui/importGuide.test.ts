import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import { QTY_SCALE, type Member } from '../engine/types';
import type { BrokerSummary, ParseResult } from '../parsers';
import { applyImport, emptyState, type AppState } from '../store';
import { accountGuide, brokerOf, evidenceDate, fyOf, memberAccounts, pct, usableShare } from './importGuide';

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
    expect(both.steps.filter((x) => x.kind === 'tradebook')).toEqual([expect.objectContaining({ status: 'done', doneLine: 'Tradebooks · FY 2026-27, FY 2025-26' })]);
    expect(both.notes).toContain("1 share (₹1,000) aren't in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves.");
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
    const may18 = add('a', 'mf.csv', tradebook([['INF1', '2018-05-10', 'buy', 10, 10]]), 'Zerodha');
    expect(step(family(may18, coin, pnl))).toMatchObject({ fy: 'FY 2017-18' });
    const jun17 = add('a', 'mf17.csv', tradebook([['INF1', '2017-06-10', 'buy', 10, 10]]), 'Zerodha');
    expect(step(family(jun17, coin, pnl))).toBeUndefined();
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

  it('other brokers have no steps yet', () => {
    const s = family(add('a', 'angel.csv', tradebook([['INE2', '2026-06-01', 'buy', 5, 100]], 'Trade history · Angel One · x'), 'Angel One'));
    expect(guide(s).steps).toEqual([]);
  });
});
