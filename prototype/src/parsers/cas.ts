import {
  findIsin, kindFromIsin, parseDate, parseNumber, toPaise, toQty,
  type ParsedPrice, type ParsedTxn, type ParseResult,
} from './common';

const DATE = String.raw`(\d{2}-[A-Za-z]{3}-\d{4})`;
const NUM = String.raw`(\(?-?[\d,]+\.\d+\)?)`;
/** CAMS / KFintech detailed CAS: date, description, amount, units, NAV/price, unit balance. */
const MF_TXN = new RegExp(`^${DATE}\\s+(.+?)\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s*$`);
const NAV_LINE = /NAV\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+\.\d+)/i;
const CLOSING = /Closing\s+Unit\s+Balance\s*:?\s*([\d,]+\.\d+)/i;
const COST_VALUE = /Total\s+Cost\s+Value\s*:?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+\.\d+)/i;
const SKIP_DESC = /stamp\s+duty|\bstt\b|\btds\b|tax\s+deducted|securities\s+transaction/i;

export function isMutualFundCAS(text: string) {
  return /Folio\s*No/i.test(text) && /(CAMS|KFIN|Karvy|Consolidated\s+Account\s+Statement)/i.test(text);
}
export function isDematCAS(text: string) {
  return /(NSDL|CDSL)/.test(text) && /\bINE[A-Z0-9]{9}\b/.test(text);
}

function schemeName(line: string): string {
  return line
    .replace(/\(?\s*(Advisor|ARN|Registrar)\s*:.*$/i, '')
    .replace(/-?\s*ISIN\s*:\s*IN[EF][A-Z0-9]{9}.*$/i, '')
    .replace(/^[A-Z0-9]{2,8}-/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Mutual fund transactions from a CAMS or KFintech detailed CAS, one line of text per PDF row. */
export function parseMutualFundCAS(lines: string[]): ParseResult {
  const txns: ParsedTxn[] = [];
  const prices: ParsedPrice[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let cur: { isin: string; name: string; units: number; closing: number | null; cost: number | null } | null = null;

  const closeScheme = () => {
    if (cur && cur.closing != null && Math.abs(cur.closing - cur.units) > 0.002) {
      warnings.push(`${cur.name}: statement closes at ${cur.closing.toFixed(3)} units but its transactions add up to ${cur.units.toFixed(3)}. The statement period may not start from the first purchase.`);
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const isin = findIsin(line);
    if (isin && /ISIN/i.test(line) && isin.startsWith('INF')) {
      closeScheme();
      cur = { isin, name: schemeName(line), units: 0, closing: null, cost: null };
      continue;
    }
    if (!cur) continue;

    const nav = line.match(NAV_LINE);
    if (nav) {
      const price = parseNumber(nav[2]);
      if (price != null) {
        prices.push({ isin: cur.isin, name: cur.name, kind: kindFromIsin(cur.isin, cur.name), price: toPaise(price), priceDate: parseDate(nav[1]) ?? undefined });
      }
    }
    const closing = line.match(CLOSING);
    if (closing) cur.closing = parseNumber(closing[1]);
    const cost = line.match(COST_VALUE);
    if (cost) cur.cost = parseNumber(cost[1]);

    const t = line.match(MF_TXN);
    if (!t) continue;
    const [, d, desc, amountS, unitsS] = t;
    if (SKIP_DESC.test(desc!)) continue;
    const date = parseDate(d);
    const amount = parseNumber(amountS);
    const units = parseNumber(unitsS);
    if (!date || amount == null || units == null || units === 0) { skipped++; continue; }
    cur.units += units;
    txns.push({
      date, isin: cur.isin, name: cur.name, kind: kindFromIsin(cur.isin, cur.name),
      side: units < 0 ? 'sell' : 'buy', qty: toQty(Math.abs(units)), amount: toPaise(Math.abs(amount)),
    });
  }
  closeScheme();
  if (txns.length === 0) warnings.push('No mutual fund transactions found. Use the "Detailed" CAS from CAMS or KFintech, covering all years since the first purchase.');
  return { format: 'Mutual fund CAS (CAMS / KFintech)', txns, prices: dedupePrices(prices), warnings, skipped };
}

const DEMAT_ROW = /(IN[EF][A-Z0-9]{9})\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s*$/;
const STATEMENT_DATE = /(?:as\s+on|statement\s+for\s+the\s+period.*?to|holding\s+statement\s+as\s+on)\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})/i;

/**
 * Holdings from an NSDL or CDSL CAS: ISIN, name, units, price, value. These statements carry no buy dates or cost,
 * so they give current prices and units to reconcile against, not lots.
 */
export function parseDematCAS(lines: string[]): ParseResult {
  const prices: ParsedPrice[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let priceDate: string | undefined;
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const sd = line.match(STATEMENT_DATE);
    if (sd && !priceDate) priceDate = parseDate(sd[1]) ?? undefined;
    const m = line.match(DEMAT_ROW);
    if (!m) { if (findIsin(line)) skipped++; continue; }
    const [, isin, name, qtyS, priceS, valueS] = m;
    const qty = parseNumber(qtyS), price = parseNumber(priceS), value = parseNumber(valueS);
    if (qty == null || price == null || value == null || qty === 0) { skipped++; continue; }
    if (Math.abs(qty * price - value) > Math.max(1, value * 0.01)) { skipped++; continue; }
    const clean = name!.replace(/\s+(EQ|EQUITY SHARES?|#.*)$/i, '').trim();
    prices.push({ isin: isin!, name: clean, kind: kindFromIsin(isin!, clean), price: toPaise(price), priceDate, qty: toQty(qty) });
  }
  if (prices.length === 0) warnings.push('No holdings rows recognised in this demat statement.');
  else warnings.push('Demat CAS has current holdings but no buy dates or prices. Add the broker trade history for exact gains.');
  if (skipped) warnings.push(`${skipped} lines with an ISIN could not be read.`);
  return { format: 'Demat CAS (NSDL / CDSL)', txns: [], prices: dedupePrices(prices), warnings, skipped };
}

function dedupePrices(prices: ParsedPrice[]): ParsedPrice[] {
  const by = new Map<string, ParsedPrice>();
  for (const p of prices) {
    const prev = by.get(p.isin);
    if (!prev) by.set(p.isin, { ...p });
    else {
      if ((p.priceDate ?? '') >= (prev.priceDate ?? '')) { prev.price = p.price; prev.priceDate = p.priceDate; }
      if (p.qty != null) prev.qty = (prev.qty ?? 0) + p.qty;
    }
  }
  return [...by.values()];
}
