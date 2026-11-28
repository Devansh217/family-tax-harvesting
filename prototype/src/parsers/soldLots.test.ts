import { describe, expect, it } from 'vitest';
import { parseCSV, toPaise } from './common';
import { readSoldLots, soldLotsFromTable, type CellSheet } from './soldLots';
import { detectKind, fieldsFor, guessMapping } from './table';
import { TAX_PNL_PREFIX } from '../engine/openingLots';

// Made-up figures; headers and section titles copy a real Angel One Tax P&L layout.
const DELIVERY_HEAD = ['ISIN', 'Scrip Name', 'Qty', 'Buy Date', 'Sell Date', 'Avg Buy Price', 'Buy Value', 'Avg Sell Price', 'Sell Value',
  'Cost Of Acquisition', 'Charges and Statutory Levies', 'STT', 'Net Profit/Loss', 'Long term taxable income', 'Short term taxable income',
  'Purchase Type', 'Type of instrument'];
const INTRADAY_HEAD = ['ISIN', 'Scrip Name', 'Qty', 'Transaction Date', 'Avg Buy Price', 'Buy Value', 'Avg Sell Price', 'Sell Value',
  'Charges and Statutory Levies', 'STT', 'Taxable P&L'];
const BUYBACK_HEAD = ['ISIN', 'Scrip Name', 'Qty', 'Buy Date', 'Buyback Date', 'Avg Buy Price', 'Buy Value', 'Buyback Price', 'Buyback Value',
  'Cost Of Acquisition', 'Charges and Statutory Levies', 'STT', 'Net Profit/Loss', 'Long term taxable income', 'Short term taxable income'];
const TRANSFER_HEAD = ['ISIN', 'Scrip Name', 'Qty', 'Buy Date', 'Transfer Date', 'Avg Buy Price', 'Buy Value', 'Transfer Price', 'Transfer Value'];
const OPTIONS_HEAD = ['Scrip Name', 'Segment', 'Expiry date', 'Strike Price', 'Option Type', 'Qty', 'Buy Date', 'Sell date', 'Buy Value', 'Sell Value', 'Taxable P&L'];

/** A delivery row: gain = sell − buy − charges in the long-term or short-term column; Net P&L also takes off STT. */
function lot(isin: string, name: string, qty: number, buyDate: string, sellDate: string, buy: number, sell: number, charges: number, lt: boolean): string[] {
  const gain = sell - buy - charges;
  return [isin, name, String(qty), buyDate, sellDate, String(buy / qty), String(buy), String(sell / qty), String(sell), String(buy * 0.9),
    String(charges), '7', String(gain - 7), lt ? String(gain) : '0', lt ? '0' : String(gain), 'Normal', 'Equity/Corporate Bonds'];
}

function angelWorkbook(): CellSheet[] {
  return [
    { sheet: 'Summary', rows: [
      ['Angel One Limited'], ['Financial Year', '2026-27'], ['From Date', '01/04/2026'], ['To Date', '31/03/2027'],
      ['Taxable Delivery P&L (LTCG) Excluding Buyback', '0'],
    ] },
    { sheet: 'Equity+Bonds+SGB Trade Details', rows: [
      ['Intraday (Speculation)'],
      INTRADAY_HEAD,
      ['INE000A01011', 'ALPHA', '10', '05/05/2026', '100', '1000', '110', '1100', '10', '2', '88'],
      ['Sub total', '', '', '', '', '1000', '', '1100', '10', '2', '88'],
      ['Delivery P&L'],
      DELIVERY_HEAD,
      lot('INE000B01012', 'BETA', 20, '10/01/2025', '15/06/2026', 20_000, 30_000, 50, true),
      lot('INE000C01013', 'GAMMA', 5, '01/02/2026', '20/07/2026', 5_000, 4_000, 20, false),
      ['Sub total', '', '', '', '', '', '25000', '', '34000'],
      ['Buyback Transactions'],
      BUYBACK_HEAD,
      ['INE000D01014', 'DELTA', '4', '01/01/2026', '10/08/2026', '100', '400', '150', '600', '360', '0', '0', '200', '0', '200'],
      ['Transfer Transactions'],
      TRANSFER_HEAD,
      ['INE000E01015', 'EPSILON', '3', '01/01/2024', '01/09/2026', '100', '300', '120', '360'],
      ['Open Sell'],
      ['ISIN', 'Scrip Name', 'Quantity', 'Sell Date', 'Sell Value'],
      ['INE000F01016', 'ZETA', '1', '02/09/2026', '50'],
      ['Open Holdings as of 31/03/2027'],
      ['ISIN', 'Scrip Name', 'Qty', 'Buy Value', 'Closing rate'],
      ['INE000B01012', 'BETA', '2', '2000', '150'],
      ['Qty Breakup'],
      ['ISIN', 'Scrip Name', 'Long term quantity', 'Short term quantity'],
    ] },
    { sheet: 'Derivatives Trade Details', rows: [
      ['Options'],
      OPTIONS_HEAD,
      ['NIFTY', 'NFO', '26/06/2026', '25000', 'CE', '75', '01/06/2026', '20/06/2026', '7500', '9000', '1500'],
    ] },
    { sheet: 'Dividend Report', rows: [['Scrip Name', 'Dividend Amount'], ['BETA', '100']] },
  ];
}

const high = (sheets: CellSheet[]) => {
  const r = readSoldLots(sheets);
  if (r.confidence !== 'high') throw new Error(`expected high, got ${r.confidence}`);
  return r.result;
};

describe('readSoldLots', () => {
  it('reads an Angel-shaped workbook on its own', () => {
    const r = high(angelWorkbook());
    expect(r.format).toBe('Tax P&L · Angel One · 2026-04-01 to 2027-03-31');
    // Intraday, two delivery lots and one buyback: a buy and a sell each.
    expect(r.txns).toHaveLength(8);
    expect(r.skipped).toBe(0);
    expect(r.brokerSummary).toMatchObject({ broker: 'Angel One', from: '2026-04-01', to: '2027-03-31', intraday: toPaise(88), fno: null });
    expect(r.warnings[0]).toBe('4 sold lots read.');
    expect(r.warnings.some((w) => w.startsWith('F&O rows were not read'))).toBe(true);
  });

  it('never reads a transfer as a sale', () => {
    const r = high(angelWorkbook());
    expect(r.txns.some((t) => t.isin === 'INE000E01015')).toBe(false);
    expect(r.txns.some((t) => t.isin === 'INE000F01016')).toBe(false);
    expect(guessMapping(TRANSFER_HEAD)).toMatchObject({ sellDate: -1, sellValue: -1 });
  });

  it('skips options rows by sheet, section and expiry columns', () => {
    expect(high(angelWorkbook()).txns.some((t) => t.name === 'NIFTY')).toBe(false);
    // The same options table on a plainly named sheet with no section title is still skipped by its columns.
    expect(readSoldLots([{ sheet: 'Sheet1', rows: [OPTIONS_HEAD, ['NIFTY', 'NFO', '26/06/2026', '25000', 'CE', '75', '01/06/2026', '20/06/2026', '7500', '9000', '1500']] }]).confidence).toBe('low');
  });

  it('uses the taxable column, not net profit, and folds charges into the cost', () => {
    const r = high(angelWorkbook());
    const beta = r.txns.filter((t) => t.isin === 'INE000B01012');
    expect(beta.find((t) => t.side === 'buy')!.amount).toBe(toPaise(20_050));
    expect(beta.find((t) => t.side === 'sell')!.amount).toBe(toPaise(30_000));
    // BETA long-term 9,950 plus the buyback DELTA (short-term, 1 Apr 2026 or later: a capital gain) 200.
    expect(r.brokerSummary!.equityLongTerm).toBe(toPaise(9_950));
    expect(r.brokerSummary!.equityShortTerm).toBe(toPaise(-1_020 + 200));
    expect(r.txns.filter((t) => t.isin === 'INE000D01014').every((t) => t.buyback)).toBe(true);
  });

  it('summary terms come from the engine, not the broker column', () => {
    const sheets = angelWorkbook();
    const delivery = sheets[1]!.rows;
    // Held 13 months but placed in the short-term column; held 5 months but placed in the long-term column.
    const i = delivery.findIndex((r) => r[0] === 'INE000B01012');
    delivery[i] = lot('INE000B01012', 'BETA', 20, '10/05/2025', '15/06/2026', 20_000, 30_000, 50, false);
    const j = delivery.findIndex((r) => r[0] === 'INE000C01013');
    delivery[j] = lot('INE000C01013', 'GAMMA', 5, '01/02/2026', '20/07/2026', 5_000, 4_000, 20, true);
    const r = high(sheets);
    expect(r.brokerSummary!.equityLongTerm).toBe(toPaise(9_950));
    expect(r.brokerSummary!.equityShortTerm).toBe(toPaise(-1_020 + 200));
  });

  it('leaves out buybacks taxed as dividends, with the shared warning', () => {
    const sheets = angelWorkbook();
    const rows = sheets[1]!.rows;
    const bb = rows.findIndex((r) => r[0] === 'INE000D01014');
    rows[bb]![3] = '01/01/2025';
    rows[bb]![4] = '10/08/2025';
    const r = readSoldLots(sheets);
    if (r.confidence !== 'high') throw new Error(JSON.stringify(r).slice(0, 300));
    const result = r.result;
    expect(result?.txns.some((t) => t.isin === 'INE000D01014')).toBe(false);
    expect(result?.warnings.some((w) => w.startsWith('1 buyback exit from 1 Oct 2024 to 31 Mar 2026 was left out'))).toBe(true);
  });

  /** Ten more clean long-term lots, so one odd row stays under the one-in-ten limit. */
  const withMoreLots = () => {
    const sheets = angelWorkbook();
    const rows = sheets[1]!.rows;
    const at = rows.findIndex((r) => r[0] === 'INE000C01013') + 1;
    rows.splice(at, 0, ...Array.from({ length: 10 }, (_, k) => lot(`INE00${k}K01010`, `LOT${k}`, 1, '01/01/2025', '01/06/2026', 100, 150, 1, true)));
    return sheets;
  };

  it('a row failing the check still imports and counts as a mismatch', () => {
    const sheets = withMoreLots();
    const rows = sheets[1]!.rows;
    rows[rows.findIndex((r) => r[0] === 'INE000C01013')]![14] = '-500';
    const r = high(sheets);
    expect(r.warnings[0]).toBe("14 sold lots read, 1 with a gain that doesn't add up (check it in the report).");
    expect(r.txns.some((t) => t.isin === 'INE000C01013')).toBe(true);
  });

  it('accepts STT taken off an intraday gain only', () => {
    // The intraday row's 88 is 1,100 − 1,000 − 10 charges − 2 STT, and reads clean (see the first test).
    const sheets = withMoreLots();
    const rows = sheets[1]!.rows;
    // A delivery gain with STT taken off (7) doesn't add up: STT is not deductible from capital gains.
    rows[rows.findIndex((r) => r[0] === 'INE000C01013')]![14] = String(4_000 - 5_000 - 20 - 7);
    expect(high(sheets).warnings[0]).toMatch(/^14 sold lots read, 1 with a gain/);
  });

  it('too many mismatches drop to the column screen', () => {
    const sheets = angelWorkbook();
    for (const r of sheets[1]!.rows) if (r[0]?.startsWith('INE000') && r.length === DELIVERY_HEAD.length) r[13] = r[14] = '12345';
    const r = readSoldLots(sheets);
    expect(r.confidence).toBe('medium');
    if (r.confidence === 'medium') expect(r.preview.kind).toBe('pnl');
  });

  it('sales in two tax years drop to the column screen', () => {
    const sheets = angelWorkbook();
    const rows = sheets[1]!.rows;
    rows[rows.findIndex((r) => r[0] === 'INE000C01013')] = lot('INE000C01013', 'GAMMA', 5, '01/02/2025', '20/07/2025', 5_000, 4_000, 20, false);
    expect(readSoldLots(sheets).confidence).toBe('medium');
  });

  it('a trade history is not sold lots', () => {
    const rows = [['Scrip/Contract', 'Buy/Sell', 'Buy Price', 'Sell Price', 'Quantity', 'Date'], ['ALPHA', 'Buy', '10', '', '5', '01/04/2026']];
    expect(readSoldLots([{ sheet: 'TradesAndCharges', rows }]).confidence).toBe('low');
  });

  it('reads a fund capital gains report as plain trades, without broker totals', () => {
    const head = ['Type of Mutual Fund', 'ISIN', 'Description of Mutual Fund sold', 'Number of Units', 'Date of Purchase (DD/MM/YYYY)', 'Purchase NAV',
      'Purchase Value', 'Date of Sale (DD/MM/YYYY)', 'Sale Price per Unit', 'Sale Value', 'FMV per Unit as on 31 Jan. 2018', 'FMV as on 31 Jan. 2018',
      'Transfer Expenses (Stamp Duty, brokerage etc)', 'Realized short term Capital gains', 'Realized long term Capital gains', 'Net capital gain (auto-calculated)'];
    const sheets: CellSheet[] = [{ sheet: 'Capital Gains', rows: [
      ['Capital gains statement from 01/04/2025 to 31/03/2026'],
      ['Short Term Gains (Equity)', 'Long Term Gains (Equity)', 'Short Term Gains (Other than Equity)', 'Long Term Gains (Other than Equity)'],
      ['0', '1400', '0', '0'],
      head,
      // Grandfathered: bought 2017, the 31 Jan 2018 value (1,200) stands in for the cost.
      ['MF (Equity)', 'INF000A01011', 'Alpha Equity Fund', '100', '01/06/2017', '10', '1000', '01/06/2025', '26', '2600', '12', '1200', '0', '0', '1400', '1400'],
    ] }];
    const r = high(sheets);
    expect(r.format).toBe('Fund capital gains · Broker · 2025-04-01 to 2026-03-31');
    expect(r.brokerSummary).toBeUndefined();
    expect(r.warnings[0]).toBe('1 sold lot read.');
    expect(r.fmv2018).toEqual({ INF000A01011: 1200 });
  });

  it('a lot that cannot be read sends the report to the column screen: it would be missing from booked gains', () => {
    const lots = Array.from({ length: 20 }, (_, i) => lot(`INE00${String(i).padStart(2, '0')}B0101`, 'BETA', 1, '10/01/2025', '15/06/2026', 100, 200, 0, true));
    const broken = lot('INE000Z01019', 'ZED', 1, '15/06/2026', '10/01/2025', 100, 200, 0, true); // sold before bought
    expect(readSoldLots([{ sheet: '', rows: [DELIVERY_HEAD, ...lots] }]).confidence).toBe('high');
    expect(readSoldLots([{ sheet: '', rows: [DELIVERY_HEAD, ...lots, broken] }]).confidence).toBe('medium');
  });

  it('a fund-only report whose sales span tax years still reads with high confidence: it has no totals', () => {
    const head = ['ISIN', 'Description of Mutual Fund sold', 'Number of Units', 'Date of Purchase', 'Purchase Value', 'Date of Sale', 'Sale Value'];
    const r = high([{ sheet: 'Capital Gains', rows: [head,
      ['INF000A01011', 'Alpha Equity Fund', '10', '01/06/2020', '1000', '01/06/2024', '1500'],
      ['INF000B01012', 'Beta Equity Fund', '10', '01/06/2020', '1000', '01/06/2025', '1500']] }]);
    expect(r.format).toMatch(/^Fund capital gains · /);
    expect(r.brokerSummary).toBeUndefined();
  });

  it('a share report whose sales span tax years goes to the column screen, marked partial when it has more tables', () => {
    const sheets = angelWorkbook();
    sheets[1]!.rows.splice(7, 0, lot('INE000G01017', 'ETA', 1, '10/01/2024', '15/06/2025', 100, 200, 0, true));
    const r = readSoldLots(sheets);
    expect(r.confidence).toBe('medium');
    if (r.confidence !== 'medium') return;
    expect(r.preview.partial).toBe(true);
    expect(r.preview.kind).toBe('pnl');
  });

  it('a CSV with the same columns reads the same', () => {
    const csv = [DELIVERY_HEAD, lot('INE000B01012', 'BETA', 20, '10/01/2025', '15/06/2026', 20_000, 30_000, 50, true)]
      .map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')).join('\n');
    const r = high([{ sheet: 'csv', rows: parseCSV(csv) }]);
    expect(r.format).toBe('Tax P&L · Broker · 2026-04-01 to 2026-06-15');
    expect(r.brokerSummary!.equityLongTerm).toBe(toPaise(9_950));
  });

  it('a scrip named after a broker does not name the broker', () => {
    const r = high([{ sheet: 'csv', rows: [DELIVERY_HEAD, lot('INE000Z01019', 'ANGEL ONE LTD', 1, '10/01/2025', '15/06/2026', 100, 200, 0, true)] }]);
    expect(r.brokerSummary!.broker).toBe('Broker');
  });
});

describe('soldLotsFromTable', () => {
  it('reads the column screen table with the picked columns', () => {
    const rows = [['Stock', 'Units', 'Bought on', 'Sold on', 'Cost', 'Proceeds'], ['INE000B01012', '20', '10/01/2025', '15/06/2026', '20000', '30000']];
    const m = guessMapping(rows[0]!);
    Object.assign(m, { isin: 0, qty: 1, buyDate: 2, sellDate: 3, buyValue: 4, sellValue: 5 });
    const r = soldLotsFromTable(rows, 0, m, 'gains.csv');
    expect(r.format).toBe('Tax P&L · Broker · gains.csv · 2026-04-01 to 2026-06-15');
    expect(r.txns).toHaveLength(2);
    expect(r.brokerSummary!.equityLongTerm).toBe(toPaise(10_000));
  });

  const ROWS = [['ISIN', 'Qty', 'Buy Date', 'Sell Date', 'Buy Value', 'Sell Value'], ['INE000B01012', '20', '10/01/2025', '15/06/2026', '20000', '30000']];
  const MAP = () => Object.assign(guessMapping(ROWS[0]!), { isin: 0, qty: 1, buyDate: 2, sellDate: 3, buyValue: 4, sellValue: 5 });

  // Each of these would carry totals that miss sales, or drop exits beside a tradebook that doesn't hold them.
  const turnedAway = (r: ReturnType<typeof soldLotsFromTable>, why: RegExp) => {
    expect(r.txns).toHaveLength(0);
    expect(r.brokerSummary).toBeUndefined();
    expect(r.format.startsWith(TAX_PNL_PREFIX)).toBe(false);
    expect(r.warnings[0]).toMatch(why);
    expect(r.warnings[0]).toMatch(/full report for one tax year/);
  };

  it('one table of a bigger report is turned away', () => {
    turnedAway(soldLotsFromTable(ROWS, 0, MAP(), 'gains.csv', true), /only one of its tables could be read/);
  });

  it('share sales that span tax years are turned away: one set of totals covers one year', () => {
    turnedAway(soldLotsFromTable([...ROWS, ['INE000C01013', '5', '10/01/2024', '15/06/2025', '5000', '6000']], 0, MAP(), 'gains.csv'), /more than one tax year/);
  });

  it('a stated period that crosses 1 April turns the table away: its totals mix two years', () => {
    turnedAway(soldLotsFromTable([['From Date', '01/01/2026'], ['To Date', '28/11/2026'], ...ROWS], 2, MAP(), 'gains.csv'), /more than one tax year/);
  });

  it('a lot with a quantity and a sale date but no name turns the table away', () => {
    turnedAway(soldLotsFromTable([...ROWS, ['', '100', '10/01/2024', '15/06/2026', '100000', '200000']], 0, MAP(), 'gains.csv'), /1 row could not be read/);
  });

  it('a lot that does not read turns the table away, even one with no quantity', () => {
    turnedAway(soldLotsFromTable([...ROWS, ['INE000C01013', '100', '10/01/2024', 'n/a', '100000', '200000']], 0, MAP(), 'gains.csv'), /1 row could not be read/);
    turnedAway(soldLotsFromTable([...ROWS, ['INE000C01013', '', '10/01/2024', '15/06/2026', '100000', '200000']], 0, MAP(), 'gains.csv'), /could not be read/);
  });
});

describe('TAX_PNL_PREFIX', () => {
  it('stays the literal saved families hold, so their exits are still dropped beside a tradebook', () => {
    expect(TAX_PNL_PREFIX).toBe('Tax P&L · ');
  });
});

describe('sold-lots columns', () => {
  it('maps the Angel delivery header and ignores net profit and cost of acquisition', () => {
    const m = guessMapping(DELIVERY_HEAD);
    expect(m).toMatchObject({ isin: 0, symbol: 1, qty: 2, buyDate: 3, sellDate: 4, buyValue: 6, sellValue: 8, charges: 10, gainLt: 13, gain: 14 });
    expect(detectKind(m)).toBe('pnl');
  });

  it('strips bracketed notes from headers', () => {
    const m = guessMapping(['Description of Mutual Fund sold', 'Number of Units', 'Date of Purchase (DD/MM/YYYY)', 'Purchase Value', 'Date of Sale (DD/MM/YYYY)', 'Sale Value', 'FMV as on 31 Jan. 2018']);
    expect(m).toMatchObject({ symbol: 0, qty: 1, buyDate: 2, buyValue: 3, sellDate: 4, sellValue: 5, fmv2018: 6 });
  });

  it('never takes cost of acquisition as the buy value (it may be the indexed or grandfathered cost)', () => {
    expect(guessMapping(['Cost Of Acquisition', 'Buy Value']).buyValue).toBe(1);
    expect(guessMapping(['Cost Of Acquisition', 'Sale Value']).buyValue).toBe(-1);
  });

  it('trade and holdings files keep their kind', () => {
    expect(detectKind(guessMapping(['Symbol', 'ISIN', 'Trade Date', 'Trade Type', 'Quantity', 'Price']))).toBe('trades');
    expect(detectKind(guessMapping(['Instrument', 'Qty.', 'Avg. cost', 'LTP']))).toBe('holdings');
    expect(fieldsFor('trades')).not.toContain('buyDate');
    expect(fieldsFor('pnl')).toContain('sellValue');
  });
});

describe('what ends a sold-lots table', () => {
  const sheet = (rows: string[][]): CellSheet[] => [{ sheet: 'Trades', rows: [['From Date', '01/04/2026'], ['To Date', '31/03/2027'], ...rows] }];
  const delivery = [['Delivery P&L'], DELIVERY_HEAD, lot('INE000B01012', 'BETA', 20, '10/01/2025', '15/06/2026', 20_000, 30_000, 50, true)];

  it('a transfer header ends the table even when its title has two cells, so transfers are not read as sales', () => {
    const r = readSoldLots(sheet([...delivery, ['Transfer Transactions', 'Off-market'], TRANSFER_HEAD,
      ['INE000E01015', 'EPSILON', '3', '01/01/2024', '01/09/2026', '100', '300', '120', '360']]));
    expect(r.confidence).toBe('high');
    if (r.confidence !== 'high') return;
    expect(r.result.txns.some((t) => t.isin === 'INE000E01015')).toBe(false);
  });

  it('an F&O header ends the table the same way', () => {
    const r = readSoldLots(sheet([...delivery, ['Options', 'NFO'], OPTIONS_HEAD,
      ['NIFTY', 'NFO', '26/06/2026', '25000', 'CE', '75', '01/06/2026', '20/06/2026', '7500', '9000', '1500']]));
    if (r.confidence !== 'high') throw new Error('not read');
    expect(r.result.txns.some((t) => t.name === 'NIFTY')).toBe(false);
  });

  it('a row in a table that does not read counts as skipped, and so do lots under a note with no header', () => {
    expect(readSoldLots(sheet([...delivery, ['INE000C01013', 'GAMMA', '', '01/02/2026', '20/07/2026']])).confidence).toBe('medium');
    const orphan = lot('INE000C01013', 'GAMMA', 5, '01/02/2026', '20/07/2026', 5_000, 4_000, 20, false);
    expect(readSoldLots(sheet([...delivery, ['Continued'], orphan])).confidence).toBe('medium');
  });

  it('with no stated period, the report runs to its last sale, not to 31 March', () => {
    const r = readSoldLots([{ sheet: 'Trades', rows: delivery }]);
    if (r.confidence !== 'high') throw new Error('not read');
    expect(r.result.brokerSummary).toMatchObject({ from: '2026-04-01', to: '2026-06-15' });
  });
});

describe('the row check', () => {
  it('a gain that leaves out charges does not fit when the file has a charges column', () => {
    const row = lot('INE000B01012', 'BETA', 20, '10/01/2025', '15/06/2026', 20_000, 30_000, 50, true);
    row[13] = '10000'; // the long-term gain without the 50 of charges
    expect(readSoldLots([{ sheet: '', rows: [DELIVERY_HEAD, row] }]).confidence).toBe('medium');
  });
});

describe('a sales table whose header does not read', () => {
  it('counts its lots as skipped instead of dropping them, so the report is not high confidence', () => {
    const funds = [['Mutual Funds'], ['Scheme Name', 'ISIN', 'Units', 'Purchase Date', 'Cost of Acquisition', 'Redemption Date', 'Redemption Value', 'Short Term Gain', 'Long Term Gain'],
      ['Alpha Fund', 'INF000A01011', '10', '01/01/2024', '1000', '10/07/2026', '1500', '0', '500']];
    const rows = [['From Date', '01/04/2026'], ['To Date', '31/03/2027'], ['Equity Delivery'], DELIVERY_HEAD,
      lot('INE000B01012', 'BETA', 20, '10/01/2025', '15/06/2026', 20_000, 30_000, 50, true), ...funds];
    expect(readSoldLots([{ sheet: 'Trades', rows }]).confidence).toBe('medium');
  });

  it('when it is the only sales table, the file is not read as sold lots: the column screen would get a header with no rows', () => {
    const rows = [['From Date', '01/04/2026'], ['To Date', '31/03/2027'], ['Mutual Funds'],
      ['Scheme Name', 'ISIN', 'Units', 'Purchase Date', 'Cost of Acquisition', 'Redemption Date', 'Redemption Value', 'Short Term Gain', 'Long Term Gain'],
      ['Alpha Fund', 'INF000A01011', '10', '01/01/2024', '1000', '10/07/2026', '1500', '0', '500'],
      ['Beta Fund', 'INF000B01012', '10', '01/01/2024', '1000', '11/07/2026', '1600', '0', '600']];
    expect(readSoldLots([{ sheet: 'Capital Gains', rows }]).confidence).toBe('low');
  });

  it('an empty share table it cannot read does not stop a fund report reading as fund capital gains', () => {
    const head = ['ISIN', 'Description of Mutual Fund sold', 'Number of Units', 'Date of Purchase', 'Purchase Value', 'Date of Sale', 'Sale Value'];
    const rows = [['Equity'], ['Scrip', 'ISIN', 'Quantity', 'Buy Date', 'Cost of Acquisition', 'Sell Date', 'Sell Value'],
      ['Mutual Funds'], head, ['INF000A01011', 'Alpha Equity Fund', '10', '01/06/2020', '1000', '01/06/2025', '1500']];
    const r = readSoldLots([{ sheet: 'Capital Gains', rows }]);
    if (r.confidence !== 'high') throw new Error(`read ${r.confidence}`);
    expect(r.result.format).toMatch(/^Fund capital gains · /);
    expect(r.result.brokerSummary).toBeUndefined();
  });

  it('the column screen gets a table it can read, not the one whose header does not read', () => {
    const rows = [['Equity Delivery'], DELIVERY_HEAD,
      lot('INE000B01012', 'BETA', 20, '10/01/2025', '15/06/2026', 20_000, 30_000, 50, true),
      ['Mutual Funds'], ['Scheme Name', 'ISIN', 'Units', 'Purchase Date', 'Cost of Acquisition', 'Redemption Date', 'Redemption Value'],
      ['Alpha Fund', 'INF000A01011', '10', '01/01/2024', '1000', '10/07/2026', '1500'],
      ['Beta Fund', 'INF000B01012', '10', '01/01/2024', '1000', '11/07/2026', '1600']];
    const r = readSoldLots([{ sheet: 'Trades', rows }]);
    if (r.confidence !== 'medium') throw new Error(`read ${r.confidence}`);
    expect(r.preview.header).toEqual(DELIVERY_HEAD);
    expect(r.preview.partial).toBe(true);
  });
});

// Made-up figures; sheet names, group titles and headers copy an ET Money capital gains report (.xls).
describe('ET Money capital gains report', () => {
  const head = ['Fund', 'Fund Name', 'Folio Number', 'Scheme Name', 'Trxn.Type', 'Date', 'Current Units', 'Grandfathered NAV as on31/01/2018',
    'GrandFathered Cost Value', 'Trxn.Type', 'Date', 'Units', 'Amount', 'Price', 'Tax Perc', 'Tax', 'Short Term', 'Indexed Cost',
    'Long Term With Index', 'Long Term Without Index'];
  const groups = Array<string>(20).fill('');
  groups[4] = 'Section A : Purchase'; groups[9] = 'Section B : Redemption'; groups[16] = 'Section C : Capital Gains/Losses';
  /** One redemption: the report gives units, price, amount and the gain, but no purchase value. */
  const sale = (scheme: string, bought: string, sold: string, units: number, price: number, amount: number, st: number, lt: number) =>
    ['101', 'Alpha Mutual Fund', '1234567890', scheme, 'Purchase', bought, String(units), '0', '0', 'Redemption', sold, String(units),
      String(amount), String(price), '0.00', '0.00', String(st), '0', '0.00', String(lt)];
  const workbook = (rows: string[][]): CellSheet[] => [
    { sheet: 'Summary', rows: [['', '', '', '', '', '', 'Total'], ['Short Term Capital Gain/Loss', '', '', '', '', '', '500']] },
    { sheet: 'Schemes Summary', rows: [['Scheme Name', 'Count', 'Outflow Amount', 'Net Value', 'Short Gain', 'Long Gain Without Index'], ['Alpha Flexi Cap Fund', '1', '1500', '1500', '500', '0']] },
    { sheet: 'Transactions Summary', rows: [groups, [], head, ...rows] },
  ];
  const short = sale('Alpha Flexi Cap Fund - Direct Growth INF000A01011', '05-Jan-2026', '10-Jul-2026', 100, 15, 1500, 500, 0);
  const long = sale('Beta Index Fund - Direct Growth INF000B01012', '05-Jan-2024', '10-Jul-2026', 10, 200, 2000, 0, 800);

  it('reads the repeated Date and Trxn.Type columns by their group, and takes the ISIN from the scheme name', () => {
    const r = readSoldLots(workbook([short, long]));
    expect(r.confidence).toBe('high');
    if (r.confidence !== 'high') return;
    expect(r.result.format).toMatch(/^Fund capital gains · ET Money/);
    expect(r.result.brokerSummary).toBeUndefined();
    expect(r.result.txns.map((t) => [t.isin, t.side, t.date])).toEqual([
      ['INF000A01011', 'buy', '2026-01-05'], ['INF000A01011', 'sell', '2026-07-10'],
      ['INF000B01012', 'buy', '2024-01-05'], ['INF000B01012', 'sell', '2026-07-10'],
    ]);
  });

  it('works the cost out as the amount less the gain, from the short-term or the long-term-without-index column', () => {
    const r = readSoldLots(workbook([short, long]));
    if (r.confidence !== 'high') throw new Error('not read');
    // 1,500 sold with a 500 short-term gain cost 1,000; 2,000 sold with an 800 long-term gain cost 1,200.
    expect(r.result.txns.map((t) => t.amount)).toEqual([toPaise(1000), toPaise(1500), toPaise(1200), toPaise(2000)]);
  });

  it('flags a sale whose units times price is not its amount', () => {
    const off = sale('Alpha Flexi Cap Fund - Direct Growth INF000A01011', '05-Jan-2026', '10-Jul-2026', 100, 12, 1500, 500, 0);
    const r = readSoldLots(workbook([off, ...Array<string[]>(9).fill(long)]));
    expect(r.confidence).toBe('high');
    if (r.confidence !== 'high') return;
    expect(r.result.warnings[0]).toMatch(/1 with a gain that doesn't add up/);
  });

  it('a gain larger than the sale (a negative cost) does not read', () => {
    const bad = sale('Alpha Flexi Cap Fund - Direct Growth INF000A01011', '05-Jan-2026', '10-Jul-2026', 100, 15, 1500, 2000, 0);
    expect(readSoldLots(workbook([bad, long])).confidence).toBe('medium');
  });

  it('a gain stated only with indexation does not read: the cost without it is unknown', () => {
    const indexed = [...long]; indexed[18] = '900'; indexed[19] = '0';
    expect(readSoldLots(workbook([indexed, short])).confidence).toBe('medium');
  });

  it('the 31 Jan 2018 value is the per-unit grandfathered NAV, not the grandfathered cost value', () => {
    // Bought 2017: NAV 150 on 31 Jan 2018; the cost value column holds the grandfathered cost (1,800), not 10 x 150.
    const old = sale('Beta Index Fund - Direct Growth INF000B01012', '05-Jan-2017', '10-Jul-2026', 10, 200, 2000, 0, 200);
    old[7] = '150'; old[8] = '1800';
    const r = readSoldLots(workbook([old, short]));
    if (r.confidence !== 'high') throw new Error('not read');
    expect(r.result.fmv2018).toEqual({ INF000B01012: toPaise(150) });
  });
});
