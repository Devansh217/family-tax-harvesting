import { describe, expect, it } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import { QTY_SCALE, type Member } from '../engine/types';
import type { BrokerSummary, ParseResult } from '../parsers';
import { applyImport, emptyState, type AppState } from '../store';
import { brokerOf, evidenceDate, memberAccounts, pct, usableShare } from './importGuide';

const ASOF = '2026-11-24';
const asha: Member = { id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [] };
const ravi: Member = { id: 'r', name: 'Ravi', relation: 'spouse', age: 42, regime: 'new', income: [] };
const zHoldings = (asOf: string, rows: Array<[isin: string, qty: number, lt: number, avg: number, close: number]>): ParseResult => ({
  format: 'Zerodha holdings', txns: [], skipped: 0, warnings: [],
  prices: rows.map(([isin, qty, lt, avg, close]) => ({ isin, name: isin, price: close * 100, priceDate: asOf, qty: qty * QTY_SCALE, ltQty: lt * QTY_SCALE, cost: avg * qty * 100 })),
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
