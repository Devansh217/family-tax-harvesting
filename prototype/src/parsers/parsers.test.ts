import { describe, expect, it } from 'vitest';
import { parseDematCAS, parseMutualFundCAS, schemeDetails } from './cas';
import { parseZerodhaHoldings, parseZerodhaTaxPnl } from './zerodhaTaxPnl';
import { parseCSV, parseDate, parseNumber } from './common';
import { parseStatementLines, parseTablePreview, previewTable } from './index';

describe('primitives', () => {
  it('reads Indian number and date formats', () => {
    expect(parseNumber('1,23,456.78')).toBe(123456.78);
    expect(parseNumber('(250.00)')).toBe(-250);
    expect(parseNumber('₹ 1,000')).toBe(1000);
    expect(parseNumber('abc')).toBeNull();
    expect(parseDate('2026-04-05 10:15:00')).toBe('2026-04-05');
    expect(parseDate('05-04-2026')).toBe('2026-04-05');
    expect(parseDate('05/04/2026')).toBe('2026-04-05');
    expect(parseDate('05-Apr-2026')).toBe('2026-04-05');
    expect(parseDate('5 April 2026')).toBe('2026-04-05');
  });
  it('parses quoted CSV and tab-separated paste', () => {
    expect(parseCSV('a,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
    expect(parseCSV('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('broker trade files', () => {
  it('reads a Zerodha-style tradebook and drops F&O rows', () => {
    const csv = [
      'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time',
      'INFY,INE009A01021,2024-03-12,NSE,EQ,EQ,buy,false,10.000000,1500.000000,1,2,2024-03-12T10:00:00',
      'INFY,INE009A01021,2026-06-02,NSE,EQ,EQ,sell,false,4.000000,1900.500000,3,4,2026-06-02T10:00:00',
      'NIFTY26JUNFUT,,2026-06-02,NFO,FO,,buy,false,50,22000,5,6,2026-06-02T10:00:00',
    ].join('\n');
    const p = previewTable(csv);
    expect(p.kind).toBe('trades');
    const r = parseTablePreview(p, p.mapping, 'tradebook.csv');
    expect(r.txns).toHaveLength(2);
    expect(r.txns[1]).toMatchObject({ date: '2026-06-02', isin: 'INE009A01021', side: 'sell', qty: 40_000, amount: 7_60_200 });
    expect(r.warnings.join(' ')).toMatch(/F&O or other non-delivery rows/);
  });

  it('finds the header below a title block and reads B/S and DD-MM-YYYY (Angel One / Groww style)', () => {
    const csv = [
      'Trade History Report',
      'Client Code: XXXX',
      '',
      'Date,Stock Name,ISIN,Buy/Sell,Qty,Rate,Amount',
      '12-03-2024,Infosys Ltd,INE009A01021,B,10,"1,500.00","15,000.00"',
      '02-06-2026,Infosys Ltd,INE009A01021,S,4,"1,900.50","7,602.00"',
    ].join('\n');
    const p = previewTable(csv);
    const r = parseTablePreview(p, p.mapping, 'angel.csv');
    expect(r.txns.map((t) => [t.date, t.side, t.amount])).toEqual([['2024-03-12', 'buy', 15_000_00], ['2026-06-02', 'sell', 7_602_00]]);
  });

  it('reads mutual fund order exports that use Purchase / Redemption and units', () => {
    const csv = 'Scheme Name,ISIN,Transaction Type,Date,Units,NAV,Amount\nParag Flexi Cap Direct Growth,INF879O01027,Purchase,01-Apr-2024,100.123,50.0000,5006.15\nParag Flexi Cap Direct Growth,INF879O01027,Redemption,01-Jun-2026,20.000,80.0000,1600.00';
    const p = previewTable(csv);
    const r = parseTablePreview(p, p.mapping, 'etmoney.csv');
    expect(r.txns[0]).toMatchObject({ side: 'buy', qty: 1_001_230 });
    expect(r.txns[1]).toMatchObject({ side: 'sell', amount: 1600_00 });
  });

  it('reads a holdings export as prices and units', () => {
    const csv = 'Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L\nINFY,6,1500,1910.25,11461.5,2461.5';
    const p = previewTable(csv);
    expect(p.kind).toBe('holdings');
    const r = parseTablePreview(p, p.mapping, 'holdings.csv');
    expect(r.prices[0]).toMatchObject({ isin: 'SYM:INFY', price: 1910_25, qty: 60_000, cost: 9000_00 });
  });
});

describe('CAS PDFs (text lines)', () => {
  const mfLines = [
    'Consolidated Account Statement',
    'CAMS',
    'Folio No: 1234567 / 89   PAN: ABCDE1234F',
    'PPFAS-Parag Parikh Flexi Cap Fund - Direct Plan Growth - ISIN: INF879O01027(Advisor: DIRECT)  Registrar : CAMS',
    'Opening Unit Balance: 0.000',
    '10-Jan-2022  Purchase - via Internet  10,000.00  200.000  50.0000  200.000',
    '10-Jan-2022  *** Stamp Duty ***  0.50',
    '15-Feb-2023  Systematic Investment Purchase  5,000.00  100.000  50.0000  300.000',
    '20-Jun-2026  Redemption  (4,000.00)  (50.000)  80.0000  250.000',
    'Closing Unit Balance: 250.000  NAV on 13-Nov-2026: INR 85.1234  Total Cost Value: 12,500.00  Market Value on 13-Nov-2026: INR 21,280.85',
  ];

  it('reads mutual fund transactions and the latest NAV', () => {
    const r = parseMutualFundCAS(mfLines);
    expect(r.txns).toHaveLength(3);
    expect(r.txns[0]).toMatchObject({ date: '2022-01-10', isin: 'INF879O01027', side: 'buy', qty: 2_000_000, amount: 10_000_00 });
    expect(r.txns[2]).toMatchObject({ side: 'sell', qty: 500_000, amount: 4_000_00 });
    expect(r.prices[0]).toMatchObject({ isin: 'INF879O01027', price: 85_12, priceDate: '2026-11-13' });
    expect(r.txns[0]!.name).toBe('Parag Parikh Flexi Cap Fund - Direct Plan Growth');
    expect(r.txns[0]!.account).toBe('Folio 1234567/89');
    expect(r.warnings).toHaveLength(0);
  });

  it('keeps plan, option and distributor from the scheme line', () => {
    expect(schemeDetails('X Flexi Cap Fund - Regular Plan - Growth (Advisor: ARN-12345) ISIN: INF000X01011')).toEqual({ plan: 'regular', option: 'growth', distributor: 'ARN-12345' });
    expect(schemeDetails('X Fund - Direct Plan - IDCW Payout (Advisor: DIRECT) ISIN: INF000X01011')).toEqual({ plan: 'direct', option: 'idcw', distributor: undefined });
    expect(schemeDetails('X Fund - Dividend Reinvestment ISIN: INF000X01011')).toEqual({ plan: undefined, option: 'idcw', distributor: undefined });
    expect(parseMutualFundCAS(mfLines).prices[0]).toMatchObject({ plan: 'direct', option: 'growth' });
  });

  it('switch lines: switch out and switch in read as a sale and a purchase on the same date', () => {
    const r = parseMutualFundCAS([
      'Folio No: 1234567 / 89   PAN: ABCDE1234F',
      'X Flexi Cap Fund - Regular Plan - Growth - ISIN: INF000X01011(Advisor: ARN-12345)  Registrar : CAMS',
      '10-Jan-2022  Purchase  10,000.00  100.000  100.0000  100.000',
      '12-Mar-2026  Switch Out - To Direct Plan  (15,000.00)  (100.000)  150.0000  0.000',
      'X Flexi Cap Fund - Direct Plan - Growth - ISIN: INF000X01029(Advisor: DIRECT)  Registrar : CAMS',
      '12-Mar-2026  Switch In - From Regular Plan  15,000.00  98.000  153.0612  98.000',
    ]);
    const out = r.txns.find((t) => t.isin === 'INF000X01011' && t.date === '2026-03-12')!;
    const inn = r.txns.find((t) => t.isin === 'INF000X01029')!;
    expect(out).toMatchObject({ side: 'sell', qty: 1_000_000, amount: 15_000_00 });
    expect(inn).toMatchObject({ side: 'buy', date: '2026-03-12', qty: 980_000 });
  });

  it('warns when the units do not reconcile with the closing balance', () => {
    const r = parseMutualFundCAS(mfLines.filter((l) => !l.startsWith('15-Feb')));
    expect(r.warnings.join(' ')).toMatch(/closes at 250\.000/);
  });

  it('reads demat holdings as prices', () => {
    const r = parseDematCAS([
      'NSDL Consolidated Account Statement as on 31-Oct-2026',
      'INE009A01021  INFOSYS LIMITED EQ  6  1,910.25  11,461.50',
      'INE040A01034  HDFC BANK LIMITED  100  1,650.00  1,65,000.00',
    ]);
    expect(r.prices).toHaveLength(2);
    expect(r.prices[1]).toMatchObject({ isin: 'INE040A01034', name: 'HDFC BANK LIMITED', price: 1650_00, qty: 1_000_000, priceDate: '2026-10-31' });
  });

  it('routes an unknown PDF to a helpful message', () => {
    expect(parseStatementLines(['Contract note', 'Brokerage']).warnings[0]).toMatch(/does not look like a CAS/);
  });
});

describe('Zerodha holdings date', () => {
  const header = ['Symbol', 'ISIN', 'Quantity Available', 'Quantity Long Term', 'Average Price', 'Previous Closing Price'];
  const row = ['EXAMPLE', 'INE000000001', 5, 5, 100, 120];
  const sheet = (above: unknown[][]) => [{ sheet: 'Equity', data: [...above, header, row] }];
  it('parseZerodhaHoldings reads the statement date', () => {
    const r = parseZerodhaHoldings(sheet([['Equity Holdings Statement as on 2026-11-22']]));
    expect(r.prices.map((p) => p.priceDate)).toEqual(['2026-11-22']);
  });
  it('parseZerodhaHoldings without a date leaves priceDate undefined', () => {
    const r = parseZerodhaHoldings(sheet([['Equity Holdings Statement']]));
    expect(r.prices).toHaveLength(1);
    expect(r.prices[0]!.priceDate).toBeUndefined();
  });
});

describe('Zerodha tax P&L buybacks', () => {
  const HEAD = [null, 'Symbol', 'ISIN', 'Entry Date', 'Exit Date', 'Quantity', 'Buy Value', 'Sell Value', 'Profit'];
  const row = (entry: string, exit: string) => [null, 'TESTCO', 'INE000000001', entry, exit, 10, 1000, 1500, 500];
  const book = (...rows: unknown[][]) => [{
    sheet: 'Tradewise Exits from 2024-04-01',
    data: [[null, 'Tradewise Exits from 2024-04-01 to 2026-11-14'], [null, 'Equity - Buyback'], HEAD, ...rows],
  }];

  it('books an exit from 1 Apr 2026 as a capital gain, like other long-term exits', () => {
    const r = parseZerodhaTaxPnl(book(row('2022-01-10', '2026-06-10')));
    expect(r.txns).toEqual([
      expect.objectContaining({ date: '2022-01-10', isin: 'INE000000001', side: 'buy', amount: 1000_00 }),
      expect.objectContaining({ date: '2026-06-10', isin: 'INE000000001', side: 'sell', amount: 1500_00 }),
    ]);
    expect(r.warnings.join(' ')).not.toMatch(/buyback/i);
  });

  it('leaves out an exit from 1 Oct 2024 to 31 Mar 2026 and says why', () => {
    const r = parseZerodhaTaxPnl(book(row('2022-01-10', '2025-06-10')));
    expect(r.txns).toHaveLength(0);
    expect(r.warnings).toContain('1 buyback exit from 1 Oct 2024 to 31 Mar 2026 was left out: in that period buyback money was taxed as dividend income.');
  });

  it('pluralises the dividend-period warning', () => {
    const r = parseZerodhaTaxPnl(book(row('2022-01-10', '2025-06-10'), row('2022-01-10', '2026-03-31')));
    expect(r.warnings).toContain('2 buyback exits from 1 Oct 2024 to 31 Mar 2026 were left out: in that period buyback money was taxed as dividend income.');
  });

  it('leaves out an exit before 1 Oct 2024 and says the company paid the tax', () => {
    const r = parseZerodhaTaxPnl(book(row('2020-01-10', '2024-06-10')));
    expect(r.txns).toHaveLength(0);
    expect(r.warnings).toContain('1 buyback exit before 1 Oct 2024 was left out: the company paid the tax on those.');
    expect(r.warnings.join(' ')).not.toMatch(/dividend/);
  });

  it('pluralises the before-Oct-2024 warning', () => {
    const r = parseZerodhaTaxPnl(book(row('2020-01-10', '2024-06-10'), row('2020-01-10', '2024-09-30')));
    expect(r.warnings).toContain('2 buyback exits before 1 Oct 2024 were left out: the company paid the tax on those.');
  });

  it('counts an unreadable exit date as skipped, with no dividend warning', () => {
    const r = parseZerodhaTaxPnl(book(row('2022-01-10', 'n/a')));
    expect(r.txns).toHaveLength(0);
    expect(r.skipped).toBe(1);
    expect(r.warnings.join(' ')).not.toMatch(/buyback/i);
  });
});
