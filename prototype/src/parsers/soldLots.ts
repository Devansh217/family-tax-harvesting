import { isLongTerm } from '../engine/dates';
import { rulesFor } from '../engine/rules';
import type { ISODate, Paise } from '../engine/types';
import { buybackOutcome, buybackWarnings } from './buyback';
import { findIsin, parseDate, parseNumber, symbolKey, toPaise, toQty, type ParsedTxn, type ParseResult } from './common';
import { detectKind, guessMapping, normHeader, type Field, type Mapping, type TableKind } from './table';
import type { BrokerSummary } from './zerodhaTaxPnl';

/** A sheet (or a PDF, or a CSV) as rows of text cells. Dates are ISO or as printed. */
export interface CellSheet { sheet: string; rows: string[][] }

/** One table the column screen can show: rows with the header at `headerIdx`. */
export interface SoldLotsPreview { rows: string[][]; headerIdx: number; header: string[]; mapping: Mapping; kind: TableKind }

export type SoldLotsRead =
  | { confidence: 'high'; result: ParseResult }
  | { confidence: 'medium'; preview: SoldLotsPreview }
  | { confidence: 'low' };

type SectionKind = 'delivery' | 'intraday' | 'buyback' | 'skip' | 'derivatives';

// Sections that are never sales: shares moved out, sales of shares not bought here, holdings and their breakup,
// dividends and charges. F&O, currency and commodity are skipped too (the broker's F&O figure is entered by hand).
const NOT_SALES = /transfer|open[\s_-]?sell|open[\s_-]?holdings?|holdings?[\s_]+as[\s_]+o[nf]|qty[\s_-]?breakup|quantity[\s_-]?breakup|dividend|charges/i;
const DERIVATIVES = /f\s?&\s?o|futures?|options?|derivative|currency|commodit/i;
const DERIVATIVE_COLUMN = /^(expiry|expiry[\s_]?date|strike|strike[\s_]?price|option[\s_]?type|call\/put)$/i;
const TOTAL_ROW = /^(sub[\s_-]?total|total|grand[\s_-]?total)\b/i;
const FUND_TABLE = /mutual[\s_]?fund|\bnav\b|scheme/i;
const BROKER = /\b(angel\s?(one|broking)?|zerodha|groww|upstox|icici\s?direct|hdfc\s?securities|kotak\s?securities|dhan|5\s?paisa|motilal\s?oswal|sharekhan|paytm\s?money)\b/i;
const PERIOD = /from\s*:?\s*(\S+)\s+to\s*:?\s*(\S+)/i;
const FY_RE = /(?:fy|financial\s+year|assessment\s+year)?\s*(20\d{2})\s*[-/]\s*(\d{2,4})/i;

const fyStartOf = (d: ISODate) => (Number(d.slice(5, 7)) >= 4 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);

function classify(section: string, sheet: string, header: string[]): SectionKind {
  if (header.some((h) => DERIVATIVE_COLUMN.test(normHeader(h)))) return 'derivatives';
  if (DERIVATIVES.test(sheet) || DERIVATIVES.test(section)) return 'derivatives';
  if (NOT_SALES.test(section) || NOT_SALES.test(sheet)) return 'skip';
  if (/intraday|speculat/i.test(section)) return 'intraday';
  if (/buy[\s_-]?back/i.test(section)) return 'buyback';
  return 'delivery';
}

/** A sold-lots header: buy and sell dates and values, or (in an intraday section) one date with buy and sell values. */
function isHeader(m: Mapping, intraday: boolean): boolean {
  if (detectKind(m) === 'pnl') return true;
  return intraday && m.date >= 0 && m.qty >= 0 && m.buyValue >= 0 && m.sellValue >= 0 && (m.isin >= 0 || m.symbol >= 0);
}

interface Table {
  section: string;
  kind: SectionKind;
  fund: boolean;
  headerRow: string[];
  mapping: Mapping;
  /** STT column: deductible only from intraday (business) income, so only an intraday gain may take it off. */
  stt: number;
  rows: string[][];
}

const STT_COLUMN = /^(stt|securities[\s_]?transaction[\s_]?tax)$/i;
const sttIndex = (header: string[]) => header.findIndex((h) => STT_COLUMN.test(normHeader(h)));

interface RowTotals {
  txns: ParsedTxn[];
  fmv2018: Record<string, Paise>;
  read: number;
  skipped: number;
  mismatches: number;
  buybackDividend: number;
  buybackCompanyPaid: number;
  intraday: Paise;
  shares: { st: Paise; lt: Paise };
  buybacks: { st: Paise; lt: Paise };
  funds: { st: Paise; lt: Paise };
  fundRows: number;
  sellDates: ISODate[];
}

const emptyTotals = (): RowTotals => ({
  txns: [], fmv2018: {}, read: 0, skipped: 0, mismatches: 0, buybackDividend: 0, buybackCompanyPaid: 0,
  intraday: 0, shares: { st: 0, lt: 0 }, buybacks: { st: 0, lt: 0 }, funds: { st: 0, lt: 0 }, fundRows: 0, sellDates: [],
});

const near = (a: number, b: number) => Math.abs(a - b) <= 1;

/** Reads one table's rows into `t`. Each sold lot becomes a buy at its buy date and a sell at its sell date. */
function readTable(table: Table, t: RowTotals): void {
  const m = table.mapping;
  const cell = (r: string[], f: Field) => (m[f] >= 0 ? (r[m[f]] ?? '').trim() : '');
  const num = (r: string[], f: Field) => (m[f] >= 0 ? parseNumber(cell(r, f)) : null);
  for (const r of table.rows) {
    const name = cell(r, 'symbol');
    const isin = findIsin(cell(r, 'isin')) ?? findIsin(name) ?? (name ? symbolKey(name) : null);
    const qtyN = num(r, 'qty');
    // Not a lot at all (a wrapped cell, a note, a blank): passed over without counting.
    if (!isin || qtyN == null) continue;
    const oneDate = table.kind === 'intraday' && m.buyDate < 0 ? parseDate(cell(r, 'date')) : null;
    const buyDate = oneDate ?? parseDate(cell(r, 'buyDate'));
    const sellDate = oneDate ?? parseDate(cell(r, 'sellDate'));
    const buy = num(r, 'buyValue'), sell = num(r, 'sellValue');
    if (qtyN === 0 || !buyDate || !sellDate || sellDate < buyDate || buy == null || sell == null) { t.skipped++; continue; }

    if (table.kind === 'buyback') {
      const outcome = buybackOutcome(sellDate);
      if (outcome === 'dividend') { t.buybackDividend++; continue; }
      if (outcome === 'companyPaid') { t.buybackCompanyPaid++; continue; }
    }

    const units = Math.abs(qtyN);
    const charges = Math.abs(num(r, 'charges') ?? 0);
    const st = num(r, 'gain'), lt = num(r, 'gainLt');
    // A file that splits the gain into a long-term and a short-term column fills one of them per lot.
    const stated = lt != null && lt !== 0 ? lt : st != null && st !== 0 ? st : lt ?? st;
    const fmv = num(r, 'fmv2018');
    if (stated != null) {
      const costs = [Math.abs(buy)];
      if (fmv != null && fmv > 0 && buyDate <= '2018-01-31') costs.push(fmv, Math.max(Math.abs(buy), Math.min(fmv, Math.abs(sell))));
      const stt = table.kind === 'intraday' && table.stt >= 0 ? Math.abs(parseNumber(r[table.stt] ?? '') ?? 0) : 0;
      const fits = costs.some((c) => [charges, 0, charges + stt].some((x) => near(Math.abs(sell) - c - x, stated)));
      if (!fits) t.mismatches++;
    }

    const mark = table.kind === 'buyback' ? { buyback: true as const } : {};
    // Charges are part of the cost (sale expenses are deductible; STT is not, and is never added).
    t.txns.push({ date: buyDate, isin, name: name || isin, side: 'buy', qty: toQty(units), amount: toPaise(Math.abs(buy) + charges), ...mark });
    t.txns.push({ date: sellDate, isin, name: name || isin, side: 'sell', qty: toQty(units), amount: toPaise(Math.abs(sell)), ...mark });
    t.read++;
    t.sellDates.push(sellDate);
    if (fmv != null && fmv > 0 && buyDate <= '2018-01-31') t.fmv2018[isin] = Math.round((fmv / units) * 100);

    const gain = toPaise(stated ?? Math.abs(sell) - Math.abs(buy) - charges);
    if (table.kind === 'intraday') { t.intraday += gain; continue; }
    // The term is the engine's own, from the dates: a broker's long-term or short-term label never decides it.
    const term = isLongTerm(buyDate, sellDate, rulesFor(sellDate).longTermMonths) ? 'lt' : 'st';
    if (table.fund) { t.fundRows++; t.funds[term] += gain; continue; }
    if (table.kind === 'buyback') t.buybacks[term] += gain;
    else t.shares[term] += gain;
  }
}

/** Label and value pairs ("From Date | 01/04/2025"), title lines with a broker name or a period. */
interface Meta { broker: string | null; from: ISODate | null; to: ISODate | null; fyStart: number | null }

function readMeta(cells: string[], meta: Meta): void {
  const joined = cells.join(' ');
  if (!meta.broker) { const b = BROKER.exec(joined); if (b) meta.broker = brokerName(b[0]); }
  const p = PERIOD.exec(joined);
  if (p && !meta.from) { const f = parseDate(p[1]), to = parseDate(p[2]); if (f && to) { meta.from = f; meta.to = to; } }
  if (cells.length === 2) {
    const [label, value] = cells as [string, string];
    if (/^from[\s_]?date$/i.test(normHeader(label))) meta.from ??= parseDate(value);
    else if (/^to[\s_]?date$/i.test(normHeader(label))) meta.to ??= parseDate(value);
    else if (/financial[\s_]?year|^fy$/i.test(normHeader(label))) { const y = FY_RE.exec(value); if (y) meta.fyStart ??= Number(y[1]); }
  }
}

function brokerName(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, ' ');
  if (s.startsWith('angel')) return 'Angel One';
  if (s.startsWith('icici')) return 'ICICI Direct';
  if (s.startsWith('hdfc')) return 'HDFC Securities';
  if (s.startsWith('kotak')) return 'Kotak Securities';
  if (s.startsWith('motilal')) return 'Motilal Oswal';
  if (s.startsWith('paytm')) return 'Paytm Money';
  if (s.startsWith('5')) return '5paisa';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Finds every sold-lots table in every sheet, following the section title above each one. */
function findTables(sheets: CellSheet[], meta: Meta): { tables: Table[]; derivativeRows: number } {
  const tables: Table[] = [];
  let derivativeRows = 0;
  for (const s of sheets) {
    let section = '';
    let table: Table | null = null;
    for (const raw of s.rows) {
      const cells = raw.map((c) => (c ?? '').trim());
      const filled = cells.filter(Boolean);
      if (!filled.length) continue;
      // Only title lines and label pairs outside a table: a scrip named after a broker is not the broker.
      if (!table && filled.length <= 2) readMeta(filled, meta);
      if (filled.length === 1) { section = filled[0]!; table = null; continue; }
      const mapping = guessMapping(cells);
      const kind = classify(section, s.sheet, cells);
      if (isHeader(mapping, kind === 'intraday')) {
        table = { section, kind, fund: FUND_TABLE.test(cells.join(' ')) || FUND_TABLE.test(section), headerRow: cells, mapping, stt: sttIndex(cells), rows: [] };
        tables.push(table);
        continue;
      }
      if (!table || TOTAL_ROW.test(filled[0]!)) continue;
      table.rows.push(cells);
    }
  }
  for (const t of tables) if (t.kind === 'derivatives') derivativeRows += t.rows.length;
  return { tables, derivativeRows };
}

function summarise(t: RowTotals, meta: Meta, fileLabel: string | null, derivativeRows: number, fundOnly: boolean): ParseResult {
  const years = new Set(t.sellDates.map(fyStartOf));
  const fy = meta.fyStart ?? (years.size === 1 ? [...years][0]! : null);
  const from = meta.from ?? (fy != null ? `${fy}-04-01` : null);
  const to = meta.to ?? (fy != null ? `${fy + 1}-03-31` : null);
  const broker = meta.broker ?? 'Broker';
  const anyShares = t.read > t.fundRows;
  const summary: BrokerSummary = {
    broker, from, to,
    intraday: t.intraday !== 0 ? t.intraday : null,
    // Built from the same lots the engine books, so buybacks booked as capital gains are already in.
    equityShortTerm: anyShares ? t.shares.st + t.buybacks.st : null,
    equityLongTerm: anyShares ? t.shares.lt + t.buybacks.lt : null,
    // Only a report that also has shares gets here with funds (a fund-only report has no totals, see below). Its fund
    // sales are dropped beside a tradebook like the rest, so their gains must be in the totals. The listed-equity term
    // is used: a debt fund's term may differ, which shifts gain between the two, but none is lost.
    mfShortTerm: t.fundRows ? t.funds.st : null, mfLongTerm: t.fundRows ? t.funds.lt : null, fno: null, fnoTurnover: null,
  };
  const warnings: string[] = [];
  const parts = [`${t.read} sold ${t.read === 1 ? 'lot' : 'lots'} read`];
  if (t.skipped) parts.push(`${t.skipped} ${t.skipped === 1 ? 'row' : 'rows'} skipped`);
  if (t.mismatches) parts.push(`${t.mismatches} with a gain that doesn't add up (check ${t.mismatches === 1 ? 'it' : 'them'} in the report)`);
  warnings.push(`${parts.join(', ')}.`);
  warnings.push(...buybackWarnings(t.buybackDividend, t.buybackCompanyPaid));
  if (derivativeRows) warnings.push("F&O rows were not read. Enter the F&O profit or loss from this report on the Family page.");
  warnings.push('This report covers sales only. Import holdings or the tradebooks as well to see what is still held.');
  const period = from && to ? ` · ${from} to ${to}` : '';
  if (fundOnly) {
    // A fund-only report is read as plain trades with no broker totals: a share tradebook in the same account doesn't
    // cover funds, so its sales must not be dropped, and the engine works out each fund's gain from its tax type.
    return { format: `Fund capital gains · ${broker}${fileLabel ? ` · ${fileLabel}` : ''}${period}`, txns: t.txns, prices: [], warnings, skipped: t.skipped, fmv2018: t.fmv2018 };
  }
  return {
    format: `Tax P&L · ${broker}${fileLabel ? ` · ${fileLabel}` : ''}${period}`,
    txns: t.txns, prices: [], warnings, skipped: t.skipped, brokerSummary: summary, fmv2018: t.fmv2018,
  };
}

/**
 * Any broker's report of sold lots (a Tax P&L or a capital gains statement), from Excel, CSV or PDF rows. High
 * confidence reads on its own; medium gives the largest table for the column screen; low means no sold lots found.
 */
export function readSoldLots(sheets: CellSheet[]): SoldLotsRead {
  const meta: Meta = { broker: null, from: null, to: null, fyStart: null };
  const { tables, derivativeRows } = findTables(sheets, meta);
  const sales = tables.filter((t) => t.kind !== 'skip' && t.kind !== 'derivatives');
  if (!sales.length) return { confidence: 'low' };
  const totals = emptyTotals();
  for (const table of sales) readTable(table, totals);
  const tried = totals.read + totals.skipped;
  const passing = totals.read - totals.mismatches;
  const oneYear = new Set(totals.sellDates.map(fyStartOf)).size === 1;
  // A report with clear headers and no lots says nothing was sold in its period: that is read too.
  const empty = tried === 0 && (meta.from != null || meta.fyStart != null);
  if (empty || (totals.read > 0 && passing >= 0.9 * tried && oneYear)) {
    return { confidence: 'high', result: summarise(totals, meta, null, derivativeRows, sales.every((t) => t.fund)) };
  }
  const biggest = sales.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
  const rows = [biggest.headerRow, ...biggest.rows];
  return { confidence: 'medium', preview: { rows, headerIdx: 0, header: biggest.headerRow, mapping: biggest.mapping, kind: detectKind(biggest.mapping) } };
}

/** The column screen's sold-lots table, with the columns the person picked: one table, no sections. */
export function soldLotsFromTable(rows: string[][], headerIdx: number, mapping: Mapping, fileName: string): ParseResult {
  const meta: Meta = { broker: null, from: null, to: null, fyStart: null };
  rows.slice(0, headerIdx).map((r) => r.filter(Boolean)).filter((r) => r.length <= 2).forEach((r) => readMeta(r, meta));
  const header = rows[headerIdx] ?? [];
  const table: Table = {
    section: '', kind: 'delivery', fund: FUND_TABLE.test(header.join(' ')), headerRow: header, mapping, stt: -1,
    rows: rows.slice(headerIdx + 1).filter((r) => !TOTAL_ROW.test(r.find(Boolean) ?? '')),
  };
  const totals = emptyTotals();
  readTable(table, totals);
  return summarise(totals, meta, fileName, 0, table.fund);
}

/** Excel cells as text: dates as ISO, numbers as plain strings. */
export function cellText(c: unknown): string {
  if (c == null) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}
