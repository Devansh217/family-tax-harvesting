import { parseDate, parseNumber, toPaise, toQty, type ParseResult } from './common';

type Sheet = { sheet: string; data: unknown[][] };

const text = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const num = (v: unknown) => (typeof v === 'number' ? v : parseNumber(text(v)));
const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : parseDate(text(v)));
const headerRow = (s: Sheet, need: string[]) => s.data.findIndex((r) => { const t = r.map(text); return need.every((n) => t.includes(n)); });

const TRADE_HEAD = ['Scrip/Contract', 'Buy/Sell', 'Buy Price', 'Sell Price', 'Quantity'];
export const isAngelTrades = (sheets: Sheet[]) => sheets.some((s) => headerRow(s, TRADE_HEAD) >= 0);

/**
 * Angel One "Trades History" workbook: a charges summary, then the trade table. Shares (segment CAPITAL) only; F&O and
 * currency rows are skipped. Companies are named, not identified by ISIN: the import matches names to ISINs
 * (`resolveNames`). The amount is price × quantity, as for other tradebooks; charges are left out.
 */
export function parseAngelTrades(sheets: Sheet[]): ParseResult {
  const txns: ParseResult['txns'] = [];
  let skipped = 0;
  for (const s of sheets) {
    const hi = headerRow(s, TRADE_HEAD);
    if (hi < 0) continue;
    const head = s.data[hi]!.map(text);
    const col = (n: string) => head.indexOf(n);
    for (const r of s.data.slice(hi + 1)) {
      const name = text(r[col('Scrip/Contract')]);
      if (!name) continue;
      const side = text(r[col('Buy/Sell')]).toLowerCase();
      const segment = col('Segment') >= 0 ? text(r[col('Segment')]).toUpperCase() : 'CAPITAL';
      const qty = num(r[col('Quantity')]);
      const price = num(r[col(side === 'sell' ? 'Sell Price' : 'Buy Price')]);
      const d = date(r[col('Date')]);
      if ((side !== 'buy' && side !== 'sell') || segment !== 'CAPITAL' || !qty || qty <= 0 || price == null || price <= 0 || !d) { skipped++; continue; }
      txns.push({ date: d, isin: `SYM:${name.toUpperCase()}`, name, side, qty: toQty(qty), amount: toPaise(price * qty) });
    }
  }
  const dates = txns.map((t) => t.date).sort();
  return {
    format: `Angel One trade history${dates.length ? ` · ${dates[0]} to ${dates.at(-1)}` : ''}`, txns, prices: [], skipped,
    warnings: txns.length ? [] : ['No share trades found in this Angel One file.'],
  };
}

const FUND_HEAD = ['Fund Name', 'ISIN', 'Units', 'Invested Value'];
export const isAngelFundHoldings = (sheets: Sheet[]) => sheets.some((s) => headerRow(s, FUND_HEAD) >= 0);

/** Angel One mutual fund holdings statement: units, amount invested and NAV per fund on the statement date. */
export function parseAngelFundHoldings(sheets: Sheet[]): ParseResult {
  const prices: ParseResult['prices'] = [];
  let skipped = 0;
  for (const s of sheets) {
    const hi = headerRow(s, FUND_HEAD);
    if (hi < 0) continue;
    const head = s.data[hi]!.map(text);
    const col = (n: string) => head.indexOf(n);
    const iNav = head.findIndex((h) => /^NAV as on/i.test(h));
    const asOf = parseDate(head[iNav]?.replace(/^NAV as on\s*/i, '')) ?? undefined;
    for (const r of s.data.slice(hi + 1)) {
      const isin = text(r[col('ISIN')]).toUpperCase();
      const name = text(r[col('Fund Name')]);
      const units = num(r[col('Units')]), invested = num(r[col('Invested Value')]), nav = iNav >= 0 ? num(r[iNav]) : null;
      if (!/^INF[A-Z0-9]{9}$/.test(isin) || !units || units <= 0 || nav == null) { if (name) skipped++; continue; }
      prices.push({ isin, name, price: toPaise(nav), priceDate: asOf, qty: toQty(units), ...(invested != null ? { cost: toPaise(invested) } : {}) });
    }
  }
  return {
    format: 'Angel One fund holdings', txns: [], prices, skipped,
    warnings: ['Fund holdings give units and the amount invested, but no purchase dates. Import the CAS from CAMS or KFintech for every purchase.'],
  };
}
