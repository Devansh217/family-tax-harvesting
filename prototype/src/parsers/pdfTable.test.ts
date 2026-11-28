import { describe, expect, it } from 'vitest';
import { pdfRows, type PdfWord } from './pdfTable';
import { readSoldLots } from './soldLots';

// Column left edges of a made-up Angel-shaped PDF table.
const X = { isin: 40, name: 110, qty: 220, buyDate: 260, sellDate: 320, buy: 380, sell: 440, charges: 500, lt: 560, st: 620 };
const w = (str: string, x: number, y: number): PdfWord => ({ str, x, y, width: str.length * 4 });
const at = (y: number, cells: [keyof typeof X, string][]) => cells.map(([k, s]) => w(s, X[k], y));

const HEADER = (y: number) => [
  ...at(y, [['isin', 'ISIN'], ['name', 'Scrip Name'], ['qty', 'Qty'], ['buyDate', 'Buy Date'], ['sellDate', 'Sell Date'], ['buy', 'Buy'], ['sell', 'Sell'], ['charges', 'Charges'], ['lt', 'Long term'], ['st', 'Short term']]),
  // The second line of wrapped header cells.
  ...at(y - 10, [['buy', 'Value'], ['sell', 'Value'], ['lt', 'taxable income'], ['st', 'taxable income']]),
];
const lot = (y: number, isin: string, name: string, lt: string, st: string) =>
  at(y, [['isin', isin], ['name', name], ['qty', '10'], ['buyDate', '01-05-2023'], ['sellDate', '02-06-2024'], ['buy', '1,000.00'], ['sell', '1,500.00'], ['charges', '20.00'], ['lt', lt], ['st', st]]);

describe('pdfRows', () => {
  it('joins a wrapped header and places each cell under its column', () => {
    const rows = pdfRows([[w('Delivery P&L', 20, 700), ...HEADER(680), ...lot(660, 'INE000A01011', 'ALPHA', '480.00', '0.00')]]);
    expect(rows[0]).toEqual(['Delivery P&L']);
    expect(rows[1]).toEqual(['ISIN', 'Scrip Name', 'Qty', 'Buy Date', 'Sell Date', 'Buy Value', 'Sell Value', 'Charges', 'Long term taxable income', 'Short term taxable income']);
    expect(rows[2]).toEqual(['INE000A01011', 'ALPHA', '10', '01-05-2023', '02-06-2024', '1,000.00', '1,500.00', '20.00', '480.00', '0.00']);
  });

  it('a second header line that itself names columns still joins the first', () => {
    const head = [
      ...at(680, [['isin', 'ISIN'], ['name', 'Scrip'], ['qty', 'Qty'], ['buyDate', 'Buy'], ['sellDate', 'Sell'], ['buy', 'Buy'], ['sell', 'Sell'], ['charges', 'Charges']]),
      ...at(670, [['name', 'Name'], ['buyDate', 'Date'], ['sellDate', 'Date'], ['buy', 'Value'], ['sell', 'Value']]),
    ];
    const rows = pdfRows([[...head, ...lot(660, 'INE000A01011', 'ALPHA', '480.00', '0.00')]]);
    expect(rows[0]!.slice(0, 7)).toEqual(['ISIN', 'Scrip Name', 'Qty', 'Buy Date', 'Sell Date', 'Buy Value', 'Sell Value']);
    expect(rows).toHaveLength(2);
  });

  it('joins a wrapped cell to the row above it', () => {
    const rows = pdfRows([[...HEADER(680), ...lot(660, 'INE000A01011', 'ALPHA', '480.00', '0.00'), w('Bonds', X.name, 650)]]);
    expect(rows[1]![1]).toBe('ALPHA Bonds');
    expect(rows).toHaveLength(2);
  });

  it('a margin title starts a new section, and a header repeated on the next page starts a new table', () => {
    const rows = pdfRows([
      [w('Delivery P&L', 20, 700), ...HEADER(680), ...lot(660, 'INE000A01011', 'ALPHA', '480.00', '0.00')],
      [...HEADER(780), ...lot(760, 'INE000B01012', 'BETA', '0.00', '480.00'), w('Sub Total', X.isin, 750), w('960.00', X.lt, 750), w('Intraday P&L', 20, 720)],
    ]);
    expect(rows.map((r) => r[0])).toEqual(['Delivery P&L', 'ISIN', 'INE000A01011', 'ISIN', 'INE000B01012', 'Sub Total', 'Intraday P&L']);
  });

  it('a one-word line right above a header is a title even when it lines up with the first column', () => {
    const rows = pdfRows([[...HEADER(780), ...lot(760, 'INE000A01011', 'ALPHA', '480.00', '0.00'), w('Buyback', X.isin, 740), ...HEADER(720)]]);
    expect(rows[2]).toEqual(['Buyback']);
  });

  it('touching runs make one word, and lines outside a table are kept word by word', () => {
    const rows = pdfRows([[w('From Date', 20, 800), w('01-04-2024', 100, 800), w('Scrip', 110, 700), w(' Name', 130, 700), ...at(700, [['isin', 'ISIN'], ['qty', 'Qty'], ['buyDate', 'Buy Date'], ['sellDate', 'Sell Date']])]]);
    expect(rows[0]).toEqual(['From Date', '01-04-2024']);
    expect(rows[1]).toContain('Scrip Name');
  });

  it('the rows read like the Excel version', () => {
    const lots = Array.from({ length: 4 }, (_, i) => lot(660 - i * 20, `INE00${i}A01011`, `CO${i}`, '480.00', '0.00')).flat();
    const r = readSoldLots([{ sheet: 'pdf', rows: pdfRows([[w('Angel One', 20, 760), w('Delivery P&L', 20, 700), ...HEADER(680), ...lots]]) }]);
    expect(r.confidence).toBe('high');
    if (r.confidence !== 'high') return;
    expect(r.result.brokerSummary?.equityLongTerm).toBe(4 * 48000);
    expect(r.result.brokerSummary?.broker).toBe('Angel One');
  });
});
