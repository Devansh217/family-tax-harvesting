import { QTY_SCALE, type ISODate, type Paise, type Qty, type Security } from '../engine/types';
import type { BrokerSummary } from './zerodhaTaxPnl';

/** RFC 4180-ish CSV: quoted fields, escaped quotes, CRLF, BOM. Also accepts tab- or semicolon-separated text. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', '\t', ';'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
  return rows;
}

/** "1,23,456.78", "₹ 1,000", "(250.00)", "-12" → number. Returns null when it is not a number. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.replace(/[₹,\s]|INR|Rs\.?/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s === '' || s === '-' || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** Indian statement dates: 2026-04-05, 05-04-2026, 05/04/2026, 05-Apr-2026, 5 Apr 2026, with or without a time. Day first. */
export function parseDate(raw: string | undefined): ISODate | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return `${y}-${pad(+m[2]!)}-${pad(+m[1]!)}`;
  }
  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    if (!mon) return null;
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return `${y}-${pad(mon)}-${pad(+m[1]!)}`;
  }
  return null;
}

export const toQty = (units: number): Qty => Math.round(units * QTY_SCALE);
export const toPaise = (rupees: number): Paise => Math.round(rupees * 100);

const ISIN_RE = /\b(IN[EF][A-Z0-9]{9})\b/;
export const findIsin = (s: string) => s.match(ISIN_RE)?.[1] ?? null;

/**
 * Tax type from the ISIN alone. INF… is a mutual fund or ETF: its tax type needs the AMFI category, so it is `check`
 * until the funds file classifies it. Anything else (INE… company securities, symbol-only rows) is a listed share.
 */
export function classifyByIsin(isin: string): Pick<Security, 'taxType' | 'listed' | 'taxTypeSource'> {
  if (isin.startsWith('INF')) return { taxType: 'check', listed: false };
  return { taxType: 'equity', listed: true, taxTypeSource: 'share' };
}

/** A stable key for securities that arrive without an ISIN, matched by symbol. */
export const symbolKey = (symbol: string) => `SYM:${symbol.trim().toUpperCase().replace(/[-\s]+(EQ|BE|BZ)$/, '')}`;

export interface ParsedTxn {
  date: ISODate;
  isin: string;
  name: string;
  side: 'buy' | 'sell';
  qty: Qty;
  amount: Paise;
  /** Folio or demat account when the statement says, e.g. "Folio 1234567/89". */
  account?: string;
}

export interface ParsedPrice {
  isin: string;
  name: string;
  price: Paise;
  priceDate?: ISODate;
  /** From a mutual fund CAS scheme line: direct or regular plan, growth or IDCW option, distributor (ARN) code. */
  plan?: 'direct' | 'regular';
  option?: 'growth' | 'idcw';
  distributor?: string;
  /** Units held per the statement, for reconciling and for opening lots. */
  qty?: Qty;
  /** Average or total cost if the statement shows it. */
  cost?: Paise;
  /** Units the broker counts as long-term, when it says (Zerodha holdings). */
  ltQty?: Qty;
  /** A row of a depository (NSDL / CDSL) statement: one line of the PAN's whole demat holdings, across brokers. */
  demat?: boolean;
}

export interface ParseResult {
  format: string;
  txns: ParsedTxn[];
  prices: ParsedPrice[];
  warnings: string[];
  /** Rows the parser could not read, for the review screen. */
  skipped: number;
  /** The broker's own totals, when the file is a tax P&L report. */
  brokerSummary?: BrokerSummary;
  /** 31 Jan 2018 value per whole unit, keyed by ISIN, when the file states it. */
  fmv2018?: Record<string, Paise>;
}
