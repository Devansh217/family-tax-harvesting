import {
  findIsin, kindFromIsin, parseDate, parseNumber, symbolKey, toPaise, toQty,
  type ParsedPrice, type ParsedTxn, type ParseResult,
} from './common';

/** Columns a trade or holdings file can have. Each maps to the header index in the file, or -1. */
export const FIELDS = ['date', 'symbol', 'isin', 'side', 'qty', 'price', 'amount', 'avgCost', 'ltp', 'segment'] as const;
export type Field = (typeof FIELDS)[number];
export type Mapping = Record<Field, number>;

export const FIELD_LABELS: Record<Field, string> = {
  date: 'Trade date', symbol: 'Name or symbol', isin: 'ISIN', side: 'Buy or sell', qty: 'Quantity', price: 'Price',
  amount: 'Amount', avgCost: 'Average cost', ltp: 'Current price', segment: 'Segment',
};

const ALIASES: Record<Field, RegExp> = {
  date: /^(trade[\s_]?date|date|order[\s_]?date|transaction[\s_]?date|txn[\s_]?date|execution[\s_]?(date|time)|order[\s_]?execution[\s_]?time|trade[\s_]?time)$/i,
  symbol: /^(symbol|trading[\s_]?symbol|tradingsymbol|scrip([\s_]?name)?|instrument|stock([\s_]?name)?|company([\s_]?name)?|security([\s_]?name)?|scheme([\s_]?name)?|fund([\s_]?name)?|name)$/i,
  isin: /^isin([\s_]?(code|no\.?))?$/i,
  side: /^(trade[\s_]?type|type|buy\/?sell|b\/s|side|action|transaction[\s_]?type|order[\s_]?side)$/i,
  qty: /^(quantity|qty\.?|units|no\.?[\s_]?of[\s_]?(shares|units)|shares)$/i,
  price: /^(price|rate|trade[\s_]?price|nav|execution[\s_]?price|avg\.?[\s_]?price|average[\s_]?price|purchase[\s_]?price)$/i,
  amount: /^(amount|value|net[\s_]?amount|trade[\s_]?value|total([\s_]?amount)?|order[\s_]?value|investment)$/i,
  avgCost: /^(avg\.?[\s_]?cost|average[\s_]?cost|buy[\s_]?avg\.?|average[\s_]?buy[\s_]?price|avg\.?[\s_]?buy[\s_]?price)$/i,
  ltp: /^(ltp|last[\s_]?price|current[\s_]?price|market[\s_]?price|closing[\s_]?price|cmp|current[\s_]?nav|last[\s_]?traded[\s_]?price)$/i,
  segment: /^(segment|exchange[\s_]?segment|product)$/i,
};

/** Many broker exports put a title block above the real header row; find the first row that looks like a header. */
export function findHeaderRow(rows: string[][]): number {
  let best = 0, bestScore = -1;
  rows.slice(0, 30).forEach((r, i) => {
    const score = FIELDS.filter((f) => r.some((c) => ALIASES[f].test(c))).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

export function guessMapping(header: string[]): Mapping {
  const m = Object.fromEntries(FIELDS.map((f) => [f, -1])) as Mapping;
  header.forEach((h, i) => {
    for (const f of FIELDS) if (m[f] === -1 && ALIASES[f].test(h.trim())) { m[f] = i; break; }
  });
  return m;
}

/** "Trades" when the file has a date and a buy/sell column, "Holdings" when it has current prices but no dates. */
export function detectKind(m: Mapping): 'trades' | 'holdings' | 'unknown' {
  if (m.date >= 0 && m.qty >= 0 && (m.price >= 0 || m.amount >= 0)) return 'trades';
  if (m.qty >= 0 && (m.ltp >= 0 || m.avgCost >= 0)) return 'holdings';
  return 'unknown';
}

const SELL_RE = /^(s|sell|sale|redeem|redemption|switch[\s-]?out|stp[\s-]?out|swp)/i;
const BUY_RE = /^(b|buy|purchase|sip|switch[\s-]?in|stp[\s-]?in|additional|new)/i;

function sideOf(raw: string, qty: number): 'buy' | 'sell' | null {
  if (SELL_RE.test(raw.trim())) return 'sell';
  if (BUY_RE.test(raw.trim())) return 'buy';
  if (!raw.trim()) return qty < 0 ? 'sell' : 'buy';
  return null;
}

const ALLOWED_SEGMENTS = /^(|eq|equity|cash|cnc|delivery|mf|nse|bse|nse_eq|bse_eq)$/i;

export function parseTable(rows: string[][], headerIdx: number, m: Mapping, format: string): ParseResult {
  const kind = detectKind(m);
  const txns: ParsedTxn[] = [];
  const prices: ParsedPrice[] = [];
  const warnings: string[] = [];
  let skipped = 0, segSkipped = 0;
  const cell = (r: string[], f: keyof Mapping) => (m[f] >= 0 ? r[m[f]] ?? '' : '');

  for (const r of rows.slice(headerIdx + 1)) {
    const name = cell(r, 'symbol');
    const isin = findIsin(cell(r, 'isin')) ?? findIsin(name) ?? (name ? symbolKey(name) : null);
    const qtyN = parseNumber(cell(r, 'qty'));
    if (!isin || qtyN == null || qtyN === 0) { skipped++; continue; }
    if (m.segment >= 0 && !ALLOWED_SEGMENTS.test(cell(r, 'segment'))) { segSkipped++; continue; }
    const k = isin.startsWith('SYM:') ? 'equity' : kindFromIsin(isin, name);

    if (kind === 'trades') {
      const date = parseDate(cell(r, 'date'));
      const side = sideOf(cell(r, 'side'), qtyN);
      const price = parseNumber(cell(r, 'price'));
      const amount = parseNumber(cell(r, 'amount'));
      const units = Math.abs(qtyN);
      const total = amount != null && amount !== 0 ? Math.abs(amount) : price != null ? price * units : null;
      if (!date || !side || total == null) { skipped++; continue; }
      txns.push({ date, isin, name: name || isin, kind: k, side, qty: toQty(units), amount: toPaise(total) });
    } else if (kind === 'holdings') {
      const ltp = parseNumber(cell(r, 'ltp'));
      const avg = parseNumber(cell(r, 'avgCost'));
      if (ltp == null) { skipped++; continue; }
      prices.push({ isin, name: name || isin, kind: k, price: toPaise(ltp), qty: toQty(qtyN), cost: avg != null ? toPaise(avg * qtyN) : undefined });
    }
  }
  if (kind === 'unknown') warnings.push('Could not tell whether this is a trade history or a holdings file. Pick the columns below.');
  if (segSkipped) warnings.push(`${segSkipped} F&O or other non-delivery rows were left out of share lots. Enter the F&O profit or loss from the broker's tax P&L on the Family page; intraday share trades are picked up automatically.`);
  if (txns.some((t) => t.isin.startsWith('SYM:')) || prices.some((p) => p.isin.startsWith('SYM:'))) {
    warnings.push('Some rows have no ISIN, so they are matched by symbol. Check names line up across files.');
  }
  return { format, txns, prices, warnings, skipped };
}
