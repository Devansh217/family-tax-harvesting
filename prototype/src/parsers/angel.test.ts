import { describe, expect, it } from 'vitest';
import { isAngelFundHoldings, isAngelTrades, parseAngelFundHoldings, parseAngelTrades } from './angel';
import { isEncryptedOffice, resolveNames } from './names';
import type { ParseResult } from './common';

// Made-up rows in Angel One's layouts (no real account data).
const trades = {
  sheet: 'TradesAndCharges',
  data: [
    ['ClientCode', 'X000000'], ['Charges Summary', null], ['Brokerage', 120.5], ['TradeBook And Charges', null],
    ['Scrip/Contract', 'Buy/Sell', 'Buy Price', 'Sell Price', 'Quantity', 'Brokerage', 'GST', 'STT', 'Sebi Tax', 'Exchange Turnover Charges', 'Stamp Duty', 'Other Charges', 'IPFT Charges', 'Order Type', 'Segment', 'Exchange', 'Order ID', 'Trade ID', 'Date'],
    ['EXAMPLE INDUSTRIES LTD', 'Buy', 1039.05, null, 5, 14.55, 2.65, 5.2, 0.01, 0.16, 0.38, 0, 0, 'Delivery', 'CAPITAL', 'NSE', '1', '1', new Date('2026-05-04T00:00:00Z')],
    ['SAMPLE SYSTEMS LTD', 'Sell', null, 5980, 1, 20, 3.63, 5.98, 0.01, 0.18, 0, 0, 0, 'Delivery', 'CAPITAL', 'NSE', '2', '2', '2026-11-09T00:00:00.000Z'],
    ['NIFTY 25NOV FUT', 'Buy', 24000, null, 75, 20, 0, 0, 0, 0, 0, 0, 0, 'Carryforward', 'FUTURES', 'NSE', '3', '3', new Date('2026-11-01T00:00:00Z')],
  ],
};
const funds = {
  sheet: 'Fund Holdings',
  data: [
    ['Angel One'], ['Client ID', 'X000000'], ['Holdings as on 20/11/2026'],
    ['Fund Name', 'ISIN', 'Category', 'Sub Category', 'Folio No', 'Source', 'Units', 'Invested Value', 'Value as on 20/11/2026', 'Average NAV', 'NAV as on 20/11/2026', 'Unrealized P&L', 'Unrealized P&L %'],
    ['Example Flexi Cap Fund', 'INF000A01AB1', 'Equity', 'Flexi Cap Fund', '123, 456', 'Angel One', 2289.856, 80418.8, 89395.98, 35.12, 39.04, 8977.18, 11.16],
  ],
};

describe('Angel One trade history', () => {
  it('is recognised and read: delivery trades of shares, by company name, priced by side', () => {
    expect(isAngelTrades([trades])).toBe(true);
    const r = parseAngelTrades([trades]);
    expect(r.format).toMatch(/^Angel One trade history/);
    expect(r.txns).toEqual([
      { date: '2026-05-04', isin: 'SYM:EXAMPLE INDUSTRIES LTD', name: 'EXAMPLE INDUSTRIES LTD', side: 'buy', qty: 50_000, amount: 5_195_25 },
      { date: '2026-11-09', isin: 'SYM:SAMPLE SYSTEMS LTD', name: 'SAMPLE SYSTEMS LTD', side: 'sell', qty: 10_000, amount: 5_980_00 },
    ]);
    expect(r.skipped).toBe(1); // the futures row
  });
  it('is not mistaken for another file', () => expect(isAngelTrades([funds])).toBe(false));
});

describe('Angel One fund holdings', () => {
  it('reads units, invested amount and the NAV on the statement date', () => {
    expect(isAngelFundHoldings([funds])).toBe(true);
    const r = parseAngelFundHoldings([funds]);
    expect(r.prices).toEqual([{ isin: 'INF000A01AB1', name: 'Example Flexi Cap Fund', price: 39_04, priceDate: '2026-11-20', qty: 22_898_560, cost: 80_418_80 }]);
    expect(r.warnings.join(' ')).toMatch(/CAS/);
  });
});

describe('matching company names to ISINs', () => {
  const shares = { date: '2026-11-20', byName: { EXAMPLEINDUSTRIESLTD: 'INE000A01011', OLDNAMELIMITED: 'INE000B01011' }, bySymbol: { SAMPLE: 'INE000C01011' } };
  const result = (isins: string[]): ParseResult => ({
    format: 'x', skipped: 0, warnings: [], prices: [],
    txns: isins.map((isin) => ({ date: '2026-05-04', isin, name: isin.slice(4), side: 'buy' as const, qty: 1, amount: 1 })),
  });

  it('matches current names, former names and symbols, ignoring punctuation', () => {
    const r = resolveNames(result(['SYM:EXAMPLE INDUSTRIES LTD', 'SYM:Old Name Limited', 'SYM:SAMPLE', 'INE999Z01011']), shares);
    expect(r.txns.map((t) => t.isin)).toEqual(['INE000A01011', 'INE000B01011', 'INE000C01011', 'INE999Z01011']);
    expect(r.warnings).toEqual([]);
  });

  it('lists names it could not match and keeps them by name', () => {
    const r = resolveNames(result(['SYM:UNKNOWN CO LTD']), shares);
    expect(r.txns[0]!.isin).toBe('SYM:UNKNOWN CO LTD');
    expect(r.warnings.join(' ')).toMatch(/UNKNOWN CO LTD/);
  });

  it('works without the names list', () => {
    expect(resolveNames(result(['SYM:EXAMPLE INDUSTRIES LTD']), null).txns[0]!.isin).toBe('SYM:EXAMPLE INDUSTRIES LTD');
  });
});

describe('password-protected spreadsheets', () => {
  it('spots the encrypted Office container that Excel saves with a password', () => {
    expect(isEncryptedOffice(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe(true);
    expect(isEncryptedOffice(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false); // a normal .xlsx (zip)
  });
});
