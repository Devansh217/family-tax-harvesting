import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import { QTY_SCALE, type Member } from '../engine/types';
import type { BrokerSummary, ParseResult } from '../parsers';
import { applyImport, emptyState, removeImport, type AppState } from '../store';
import { accountGuide, brokerOf, evidenceDate, familyGuide, familyRow, fyOf, memberAccounts, memberGuide, pct, usableShare } from './importGuide';

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
    const r = g(family(angelFunds(), angelTrades));
    expect(r.accounts.map((a) => a.broker)).toEqual(['Angel One']);
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
    // Without the holdings file, Angel's holdings step is next and the member isn't done.
    const noFile = g(family(angelTrades));
    expect(statuses(noFile)).toEqual(['next', 'unreadable', 'suggestion']);
    expect(noFile.done).toBe(false);
    expect(noFile.accounts[0]!.notes).toContain("Angel shares are counted from your tradebooks only until Angel's holdings file can be read.");
    expect(g(family(angelFunds())).accounts[0]!.notes).toEqual([]);
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
