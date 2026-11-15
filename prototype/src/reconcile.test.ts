import { describe, expect, it } from 'vitest';
import { computeFamily } from './engine/family';
import { FY_2026_27 } from './engine/rules';
import { isZerodhaTaxPnl, parseZerodhaTaxPnl } from './parsers';
import { reconcile } from './reconcile';
import { applyImport, emptyState, type AppState } from './store';

// A synthetic workbook in the layout of Zerodha Console's Tax P&L export (made-up trades).
const HEAD = [null, 'Symbol', 'ISIN', 'Entry Date', 'Exit Date', 'Quantity', 'Buy Value', 'Sell Value', 'Profit', 'Period of Holding', 'Fair Market Value', 'Taxable Profit', 'Turnover'];
const row = (sym: string, isin: string, entry: string, exit: string, qty: number, buy: number, sell: number, fmv = 0) =>
  [null, sym, isin, entry, exit, qty, buy, sell, sell - buy, 0, fmv, sell - buy, Math.abs(sell - buy)];
const sheets = [
  {
    sheet: 'Tradewise Exits from 2026-04-01',
    data: [
      [null, 'Client ID', 'XX0000'],
      [null, 'Tradewise Exits from 2026-04-01 to 2026-11-14'],
      [null, 'Equity - Intraday'], HEAD, row('INFY', 'INE009A01021', '2026-06-01', '2026-06-01', 10, 15000, 15200),
      [null, 'Equity - Short Term'], HEAD, row('TCS', 'INE467B01029', '2026-01-10', '2026-07-01', 5, 15000, 17500),
      [null, 'Equity - Long Term'], HEAD,
      row('ITC', 'INE154A01025', '2016-05-01', '2026-08-01', 100, 20000, 45000, 27000),
      row('HDFCBANK', 'INE040A01034', '2023-01-02', '2026-08-01', 20, 30000, 33000),
      [null, 'Equity - Buyback'], HEAD,
      [null, 'Mutual Funds'], HEAD, row('PARAG PARIKH FLEXI CAP', 'INF879O01027', '2022-01-10', '2026-09-01', 100, 5000, 9000),
      [null, 'F&O'], [null, 'Symbol', 'Entry Date', 'Exit Date', 'Quantity', 'Buy Value', 'Sell Value', 'Profit', 'Turnover'],
    ],
  },
  {
    sheet: 'Equity and Non Equity',
    data: [
      [null, 'Equity Intraday/Speculative profit', 200],
      [null, 'Equity Short Term profit', 2500],
      [null, 'Equity Long Term profit', 21000], // ITC taxed on 45,000 − 27,000 (2018 value) = 18,000; HDFC 3,000
    ],
  },
  { sheet: 'Mutual Funds', data: [[null, 'Equity Long Term profit', 4000]] },
  { sheet: 'F&O', data: [[null, 'Options Realized Profit', -12000], [null, 'Futures Realized Profit', 2000], [null, 'Options Turnover', 30000], [null, 'Futures Turnover', 8000]] },
];

describe('Zerodha tax P&L', () => {
  it('is recognised and read section by section', () => {
    expect(isZerodhaTaxPnl(sheets)).toBe(true);
    const r = parseZerodhaTaxPnl(sheets);
    expect(r.txns).toHaveLength(10);
    expect(r.brokerSummary).toMatchObject({ from: '2026-04-01', to: '2026-11-14', fno: -10000_00, fnoTurnover: 38000_00, equityLongTerm: 21000_00 });
    expect(r.fmv2018).toEqual({ INE154A01025: 270_00 });
  });

  it('the engine reproduces every broker total, with F&O set on the member', () => {
    let s: AppState = { ...emptyState(), members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new' }] };
    s = applyImport(s, 'a', 'taxpnl.xlsx', parseZerodhaTaxPnl(sheets), { account: 'Zerodha' });
    expect(s.members[0]!.business).toMatchObject({ fno: -10000_00, fnoTurnover: 38000_00 });
    const fam = computeFamily(s, '2026-11-14', FY_2026_27);
    const lines = reconcile(fam, s.brokerSummaries[0]!);
    expect(lines.map((l) => [l.label, l.ok])).toEqual([
      ['Intraday', true], ['Shares, short-term', true], ['Shares, long-term', true], ['Mutual funds, long-term', true],
    ]);
    // The ₹10,000 F&O loss first absorbs the ₹200 intraday profit, then ₹9,800 of capital gains.
    expect(fam.members[0]!.year.business.setOffAgainstGains).toBe(9800_00);
  });
});

describe('Zerodha holdings and check-only tax P&L', () => {
  const HH = [null, 'Symbol', 'ISIN', 'Sector', 'Quantity Available', 'Quantity Discrepant', 'Quantity Long Term', 'Quantity Pledged (Margin)', 'Quantity Pledged (Loan)', 'Average Price', 'Previous Closing Price', 'Unrealized P&L', 'Unrealized P&L Pct.'];
  const holdings = [
    { sheet: 'Equity', data: [[null, 'Client ID', 'XX0000'], HH, [null, 'INFY', 'INE009A01021', 'IT', 8, 0, 6, 2, 0, 1500, 1900, 3200, 26.6]] },
    { sheet: 'Mutual Funds', data: [[null, 'Symbol', 'ISIN', 'Instrument Type', 'Quantity Available', 'Quantity Discrepant', 'Quantity Pledged (Margin)', 'Quantity Pledged (Loan)', 'Average Price', 'Previous Closing Price'], [null, 'PARAG PARIKH FLEXI CAP', 'INF879O01027', 'Equity', 100.5, 0, 0, 0, 50, 94.26]] },
    { sheet: 'Combined', data: [HH, [null, 'INFY', 'INE009A01021', 'IT', 8, 0, 6, 2, 0, 1500, 1900, 3200, 26.6]] },
  ];

  it('reads equity and fund sheets, counts pledged units, and skips the combined sheet', async () => {
    const { isZerodhaHoldings, parseZerodhaHoldings } = await import('./parsers');
    expect(isZerodhaHoldings(holdings)).toBe(true);
    const r = parseZerodhaHoldings(holdings);
    expect(r.prices).toHaveLength(2);
    expect(r.prices[0]).toMatchObject({ isin: 'INE009A01021', qty: 100_000, ltQty: 60_000, price: 1900_00, cost: 15000_00 });
    expect(r.prices[1]).toMatchObject({ isin: 'INF879O01027', qty: 1_005_000 });
  });

  it('check-only keeps the broker totals and F&O but adds no trades', () => {
    let s: AppState = { ...emptyState(), members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new' }] };
    s = applyImport(s, 'a', 'taxpnl.xlsx', parseZerodhaTaxPnl(sheets), { account: 'Zerodha', checkOnly: true });
    expect(s.txns).toHaveLength(0);
    expect(s.brokerSummaries).toHaveLength(1);
    expect(s.members[0]!.business?.fno).toBe(-10000_00);
    // With no trades of its own, booked gains come from the broker's totals so room and tax stay right.
    const fam = computeFamily(s, '2026-11-14', FY_2026_27);
    expect(fam.brokerAdjustments.map((a) => a.label)).toEqual(['Shares, short-term', 'Shares, long-term', 'Mutual funds, long-term']);
    expect(fam.members[0]!.year.stGains).toBe(2500_00);
    expect(fam.members[0]!.year.ltGains).toBe(25000_00);
    expect(reconcile(fam, s.brokerSummaries[0]!).find((l) => l.label === 'Shares, long-term')!.ok).toBe(false);
  });
});
