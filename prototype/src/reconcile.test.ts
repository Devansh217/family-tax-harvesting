import { describe, expect, it } from 'vitest';
import { computeFamily, countingSummaries, pnlGroups } from './engine/family';
import { planGaps } from './ui/plan';
import { pnlCoverage } from './ui/warnings';
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

describe('FY 2026-27 buyback exits beside a tradebook', () => {
  // Synthetic share TESTCO: 10 bought on 10 Jan 2022 for ₹1,000 (tradebook), tendered in a buyback on 10 Jun 2026
  // for ₹1,500, so a ₹500 long-term gain. A tender never shows in a tradebook, only in the Tax P&L. The November
  // holdings file no longer lists TESTCO; OTHER (5 shares) is still held.
  const T = 'INE000000001', O = 'INE000000002';
  const BH = [null, 'Symbol', 'ISIN', 'Entry Date', 'Exit Date', 'Quantity', 'Buy Value', 'Sell Value', 'Profit'];
  const pnl = (lt: number) => parseZerodhaTaxPnl([
    { sheet: 'Tradewise Exits from 2026-04-01', data: [[null, 'Tradewise Exits from 2026-04-01 to 2026-11-14'], [null, 'Equity - Buyback'], BH, [null, 'TESTCO', T, '2022-01-10', '2026-06-10', 10, 1000, 1500, 500]] },
    { sheet: 'Equity and Non Equity', data: [[null, 'Equity Short Term profit', 0], [null, 'Equity Long Term profit', lt]] },
  ]);
  const tb = { format: 'Trade history · tb.xlsx', skipped: 0, warnings: [], prices: [], txns: [
    { isin: T, name: 'TESTCO', date: '2022-01-10', side: 'buy' as const, qty: 10_0000, amount: 1000_00 },
    { isin: O, name: 'OTHER', date: '2022-01-10', side: 'buy' as const, qty: 5_0000, amount: 500_00 },
  ] };
  const holdings = { format: 'Zerodha holdings', txns: [], skipped: 0, warnings: [],
    prices: [{ isin: O, name: 'OTHER', price: 200_00, priceDate: '2026-11-20', qty: 5_0000, ltQty: 5_0000, cost: 500_00 }] };
  const family = (lt: number, withTradebook = true) => {
    let s: AppState = { ...emptyState(), members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: 20_00_000_00, from: 'manual' }] }] };
    if (withTradebook) s = applyImport(s, 'a', 'tb.xlsx', tb, { account: 'Zerodha' });
    s = applyImport(s, 'a', 'pnl.xlsx', pnl(lt), { account: 'Zerodha' });
    s = applyImport(s, 'a', 'h.xlsx', holdings, { account: 'Zerodha' });
    return computeFamily(s, '2026-11-23', FY_2026_27);
  };

  for (const [what, lt] of [['includes it', 500], ['leaves it out', 0]] as const) {
    it(`books the tender as a ₹500 long-term gain at the tradebook's cost when the broker total ${what}`, () => {
      const fam = family(lt);
      expect(fam.ledger.realised).toMatchObject([{ isin: T, sellDate: '2026-06-10', qty: 10_0000, cost: 1000_00, gain: 500_00, term: 'lt' }]);
      // The units left in the tender, not by a transfer: nothing is trimmed, and the total lands on the broker's.
      expect(fam.holdingsNotes.trimmed).toEqual([]);
      expect(fam.brokerAdjustments).toEqual([]);
      expect(fam.members[0]!.year.ltGains).toBe(500_00);
      expect(fam.members[0]!.year.room.free).toBe(1_24_500_00);
    });
  }

  it('a Tax P&L saved before buybacks were marked gets the mark when imported again', () => {
    let s: AppState = { ...emptyState(), members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new' }] };
    s = applyImport(s, 'a', 'pnl.xlsx', pnl(500), { account: 'Zerodha' });
    const saved: AppState = { ...s, txns: s.txns.map(({ buyback: _b, ...t }) => t) };
    const again = applyImport(saved, 'a', 'pnl.xlsx', pnl(500), { account: 'Zerodha' });
    expect(again.txns.map((t) => t.buyback)).toEqual([true, true]);
  });

  it('an account with only the Tax P&L books the same ₹500', () => {
    const fam = family(500, false);
    expect(fam.members[0]!.year.ltGains).toBe(500_00);
    expect(fam.brokerAdjustments).toEqual([]);
  });
});

describe('a Tax P&L imported again replaces the one it overlaps', () => {
  // The same account and period read twice: first by the parser before buybacks counted (₹500 long-term, the
  // buyback left out), then again with the buyback booked: ₹1,000 → ₹1,01,000, a ₹1,00,000 long-term gain, so the
  // total is ₹1,00,500. Only the newer one counts: no correction from the old ₹500 total cancels the buyback.
  const Q = 10_000;
  const fmt = 'Zerodha Tax P&L · 2026-04-01 to 2026-10-31';
  const pair = (isin: string, sell: string, buyRs: number, sellRs: number, buyback = false) => [
    { isin, name: isin, date: '2022-01-10', side: 'buy' as const, qty: 10 * Q, amount: buyRs * 100, ...(buyback ? { buyback: true as const } : {}) },
    { isin, name: isin, date: sell, side: 'sell' as const, qty: 10 * Q, amount: sellRs * 100, ...(buyback ? { buyback: true as const } : {}) },
  ];
  const summary = (from: string, to: string, ltRs: number) => ({ broker: 'Zerodha', from, to, intraday: null, equityShortTerm: 0, equityLongTerm: ltRs * 100, mfShortTerm: null, mfLongTerm: null, fno: null, fnoTurnover: null });
  const oldPnl = { format: fmt, txns: pair('INE000000001', '2026-06-10', 1000, 1500), prices: [], skipped: 0, brokerSummary: summary('2026-04-01', '2026-10-31', 500),
    warnings: ['1 buyback exits were left out: since Oct 2024 buyback money is taxed as dividend income, not capital gains.'] };
  const newPnl = { format: fmt, txns: [...pair('INE000000001', '2026-06-10', 1000, 1500), ...pair('INE000000002', '2026-07-10', 1000, 101000, true)], prices: [], skipped: 0,
    brokerSummary: summary('2026-04-01', '2026-10-31', 100500), warnings: [] };
  // A holdings file with one share still held, so the member has a plan to show gaps for.
  const held = { format: 'Zerodha holdings', txns: [], skipped: 0, warnings: [],
    prices: [{ isin: 'INE000000009', name: 'H', price: 200_00, priceDate: '2026-11-20', qty: 10 * Q, ltQty: 10 * Q, cost: 1000_00 }] };
  const start = (): AppState => applyImport({ ...emptyState(), members: [{ id: 'm', name: 'M', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: 20_00_000_00, from: 'manual' }] }] },
    'm', 'h.xlsx', held, { account: 'Zerodha' });

  it('booked long-term is the new ₹1,00,500, with no negative correction and no ask to import again', () => {
    let s = applyImport(start(), 'm', 'old.xlsx', oldPnl, { account: 'Zerodha' });
    expect(planGaps(computeFamily(s, '2026-11-23', FY_2026_27), s.positions, s.brokerSummaries, s.imports).map((g) => g.key)).toContain('pnl_again');
    s = applyImport(s, 'm', 'new.xlsx', newPnl, { account: 'Zerodha' });
    expect(s.brokerSummaries).toHaveLength(2);
    const fam = computeFamily(s, '2026-11-23', FY_2026_27);
    expect(fam.brokerAdjustments).toEqual([]);
    expect(fam.members[0]!.year.ltGains).toBe(1_00_500_00);
    expect(planGaps(fam, fam.positions, s.brokerSummaries, s.imports).map((g) => g.key)).not.toContain('pnl_again');
  });

  it('a follow-on P&L that only overlaps the old one at its edge hides nothing', () => {
    // The old Apr–Oct P&L (buyback left out) still counts beside a 31 Oct–20 Nov one: the ask to import it again stays
    // and booked long-term doesn't fall (no room gained).
    let s = applyImport(start(), 'm', 'old.xlsx', oldPnl, { account: 'Zerodha' });
    const before = computeFamily(s, '2026-11-23', FY_2026_27).members[0]!.year.ltGains;
    s = applyImport(s, 'm', 'nov.xlsx', { format: 'Zerodha Tax P&L · 2026-10-31 to 2026-11-20', txns: pair('INE000000003', '2026-11-10', 1000, 1200), prices: [], skipped: 0,
      warnings: [], brokerSummary: summary('2026-10-31', '2026-11-20', 200) }, { account: 'Zerodha' });
    expect(countingSummaries(s.brokerSummaries)).toHaveLength(2);
    const fam = computeFamily(s, '2026-11-23', FY_2026_27);
    expect(planGaps(fam, fam.positions, s.brokerSummaries, s.imports).map((g) => g.key)).toContain('pnl_again');
    expect(fam.members[0]!.year.ltGains).toBe(before + 200_00);
  });

  it('a newer P&L over a wider period replaces the older one', () => {
    let s = applyImport(start(), 'm', 'old.xlsx', oldPnl, { account: 'Zerodha' });
    s = applyImport(s, 'm', 'wide.xlsx', { ...newPnl, format: 'Zerodha Tax P&L · 2026-04-01 to 2026-11-20', brokerSummary: summary('2026-04-01', '2026-11-20', 100500) }, { account: 'Zerodha' });
    expect(countingSummaries(s.brokerSummaries).map((b) => b.summary.to)).toEqual(['2026-11-20']);
    const fam = computeFamily(s, '2026-11-23', FY_2026_27);
    expect(fam.members[0]!.year.ltGains).toBe(1_00_500_00);
    expect(planGaps(fam, fam.positions, s.brokerSummaries, s.imports).map((g) => g.key)).not.toContain('pnl_again');
  });

  it('two halves of the year both count', () => {
    let s = applyImport(start(), 'm', 'h1.xlsx', { ...oldPnl, warnings: [], format: 'Zerodha Tax P&L · 2026-04-01 to 2026-06-30', brokerSummary: summary('2026-04-01', '2026-06-30', 500) }, { account: 'Zerodha' });
    s = applyImport(s, 'm', 'h2.xlsx', { ...newPnl, warnings: [], format: 'Zerodha Tax P&L · 2026-07-01 to 2026-10-31', txns: pair('INE000000002', '2026-07-10', 1000, 101000, true),
      brokerSummary: summary('2026-07-01', '2026-10-31', 1_00_000) }, { account: 'Zerodha' });
    const fam = computeFamily(s, '2026-11-23', FY_2026_27);
    expect(fam.brokerAdjustments).toEqual([]);
    expect(fam.members[0]!.year.ltGains).toBe(1_00_500_00);
    expect(countingSummaries(s.brokerSummaries)).toHaveLength(2);
    const covered = pnlCoverage(s.brokerSummaries, FY_2026_27);
    expect([covered('m', 'Zerodha', '2026-06-10'), covered('m', 'Zerodha', '2026-07-10')]).toEqual([true, true]);
  });
});

describe('Tax P&Ls that partly overlap', () => {
  // One sale of 100 units on 31 Oct 2026 at ₹600, of units bought before the history; the holdings file (100 left,
  // ₹100 average) makes the engine count a ₹50,000 long-term gain, while the real gain is ₹20,000. P&L A (1 Apr–31 Oct)
  // and P&L B (31 Oct–20 Nov) both list that sale: ₹20,000 long-term each.
  // Per P&L the corrections are −₹30,000 twice: booked −₹10,000, room ₹1,25,000 (₹20,000 more than the truth).
  // As one group: ₹20,000 + ₹20,000 − ₹50,000 = −₹10,000, booked ₹40,000, room ₹85,000. The higher booked wins.
  const Q = 10_000;
  const summary = (from: string, to: string, ltRs: number) => ({ broker: 'Zerodha', from, to, intraday: null, equityShortTerm: 0, equityLongTerm: ltRs * 100, mfShortTerm: null, mfLongTerm: null, fno: null, fnoTurnover: null });
  const pnl = (from: string, to: string, ltRs: number) => ({ format: `Zerodha Tax P&L · ${from} to ${to}`, txns: [], prices: [], skipped: 0, warnings: [], brokerSummary: summary(from, to, ltRs) });
  const base = (): AppState => {
    let s: AppState = { ...emptyState(), members: [{ id: 'm', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: 20_00_000_00, from: 'manual' }] }] };
    s = applyImport(s, 'm', 'h.xlsx', { format: 'Zerodha holdings', txns: [], skipped: 0, warnings: [],
      prices: [{ isin: 'INE000000005', name: 'X', price: 3000_00, priceDate: '2026-11-20', qty: 100 * Q, ltQty: 100 * Q, cost: 10_000_00 }] }, { account: 'Zerodha' });
    s = applyImport(s, 'm', 'tb.csv', { format: 'Zerodha tradebook', skipped: 0, warnings: [], prices: [],
      txns: [{ isin: 'INE000000005', name: 'X', date: '2026-10-31', side: 'sell' as const, qty: 100 * Q, amount: 60_000_00 }] }, { account: 'Zerodha' });
    s = applyImport(s, 'm', 'a.xlsx', pnl('2026-04-01', '2026-10-31', 20_000), { account: 'Zerodha' });
    return applyImport(s, 'm', 'b.xlsx', pnl('2026-10-31', '2026-11-20', 20_000), { account: 'Zerodha' });
  };

  it('the group is corrected once: booked ₹40,000, room ₹85,000, no move past it', () => {
    const fam = computeFamily(base(), '2026-11-23', FY_2026_27);
    expect(fam.brokerAdjustments.map((a) => [a.label, a.gain])).toEqual([['Shares, long-term', -10_000_00]]);
    expect(fam.totals.freeRoom).toBe(85_000_00);
    const gain = fam.moves.filter((m) => m.kind === 'harvest_gain').reduce((a, m) => a + (m.kind === 'harvest_gain' ? m.gain : 0), 0);
    expect(gain).toBeLessThanOrEqual(85_000_00);
  });

  it('asks for one P&L for the year, and stops once one covers the group', () => {
    const s = base();
    const gapsOf = (st: AppState) => { const fam = computeFamily(st, '2026-11-23', FY_2026_27); return planGaps(fam, fam.positions, st.brokerSummaries, st.imports); };
    expect(gapsOf(s).find((g) => g.key === 'pnl_overlap')).toMatchObject({
      memberId: 'm', href: '#import-m', action: 'Import',
      text: "Asha's tax P&L files overlap. Import one tax P&L for FY 2026-27 from 1 Apr to today.",
    });
    const whole = applyImport(s, 'm', 'all.xlsx', pnl('2026-04-01', '2026-11-20', 20_000), { account: 'Zerodha' });
    expect(gapsOf(whole).find((g) => g.key === 'pnl_overlap')).toBeUndefined();
    // One P&L now: −₹30,000, booked ₹20,000, room ₹1,05,000 (the truth).
    const fam = computeFamily(whole, '2026-11-23', FY_2026_27);
    expect(fam.brokerAdjustments.map((a) => a.gain)).toEqual([-30_000_00]);
    expect(fam.totals.freeRoom).toBe(1_05_000_00);
  });

  it('a P&L whose period could not be read is replaced by a newer one from 1 Apr', () => {
    // A P&L with no readable period overlaps every other, so it joins any group; one from 1 Apr to 20 Nov replaces it.
    let s = base();
    s = { ...s, brokerSummaries: s.brokerSummaries.map((b, i) => (i === 0 ? { ...b, summary: { ...b.summary, from: null, to: null } } : b)) };
    const gapsOf = (st: AppState) => { const fam = computeFamily(st, '2026-11-23', FY_2026_27); return planGaps(fam, fam.positions, st.brokerSummaries, st.imports); };
    expect(gapsOf(s).map((g) => g.key)).toContain('pnl_overlap');
    const whole = applyImport(s, 'm', 'all.xlsx', pnl('2026-04-01', '2026-11-20', 20_000), { account: 'Zerodha' });
    expect(countingSummaries(whole.brokerSummaries).map((b) => b.summary.from)).toEqual(['2026-04-01']);
    expect(gapsOf(whole).map((g) => g.key)).not.toContain('pnl_overlap');
    // One P&L: ₹20,000 − ₹50,000 = −₹30,000, booked ₹20,000, room ₹1,05,000 (the truth).
    expect(computeFamily(whole, '2026-11-23', FY_2026_27).totals.freeRoom).toBe(1_05_000_00);
  });

  it('the member page check lists the group once, over its whole period', () => {
    const s = base();
    const fam = computeFamily(s, '2026-11-23', FY_2026_27);
    const groups = pnlGroups(s.brokerSummaries);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.summary).toMatchObject({ from: '2026-04-01', to: '2026-11-20', equityLongTerm: 40_000_00 });
    expect(reconcile(fam, groups[0]!).find((l) => l.label === 'Shares, long-term')).toMatchObject({ broker: 40_000_00, ours: 50_000_00, ok: false });
  });
});
