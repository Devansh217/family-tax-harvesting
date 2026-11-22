import type { ISODate, Paise } from '../engine/types';
import { nameKey, parseCSV, parseDate } from '../parsers/common';

/** Published nightly at `prices/latest.json` (and the day before at `prices/previous.json`). Prices in paise. */
export interface PriceFile {
  date: ISODate;
  source: string;
  prices: Record<string, Paise>;
}

const toPaise = (s: string | undefined) => {
  const n = Number((s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/** NSE or BSE cash-market bhavcopy in the common UDiFF layout: ISIN and closing price per security. */
export function parseBhavcopy(csv: string): { date: ISODate | null; prices: Map<string, Paise> } {
  const rows = parseCSV(csv);
  const head = rows[0] ?? [];
  const col = (name: string) => head.indexOf(name);
  const iIsin = col('ISIN'), iClose = col('ClsPric'), iDate = col('TradDt'), iSeg = col('Sgmt');
  const prices = new Map<string, Paise>();
  let date: ISODate | null = null;
  if (iIsin < 0 || iClose < 0) return { date, prices };
  for (const r of rows.slice(1)) {
    const isin = r[iIsin] ?? '';
    if (!/^IN[A-Z0-9]{10}$/.test(isin) || (iSeg >= 0 && r[iSeg] !== 'CM')) continue;
    const p = toPaise(r[iClose]);
    if (p == null) continue;
    date ??= parseDate(r[iDate]);
    if (!prices.has(isin)) prices.set(isin, p);
  }
  return { date, prices };
}

/** AMFI NAVAll.txt: semicolon rows of scheme code, one or two ISINs, name, NAV and date. Header decides the columns. */
export function parseAmfiNav(text: string): { date: ISODate | null; prices: Map<string, Paise> } {
  const prices = new Map<string, Paise>();
  const dates = new Map<ISODate, number>();
  const lines = text.split(/\r?\n/);
  const header = (lines.find((l) => /Net Asset Value/i.test(l)) ?? '').split(';').map((s) => s.trim());
  const iNav = header.findIndex((h) => /Net Asset Value/i.test(h));
  const iDate = header.findIndex((h) => /^Date$/i.test(h));
  if (iNav < 0) return { date: null, prices };
  for (const line of lines) {
    const f = line.split(';');
    if (f.length < iNav + 1 || !/^\d+$/.test((f[0] ?? '').trim())) continue;
    const nav = toPaise(f[iNav]);
    if (nav == null) continue;
    const d = parseDate(f[iDate]?.trim());
    if (d) dates.set(d, (dates.get(d) ?? 0) + 1);
    for (const isin of [f[1], f[2]].map((s) => (s ?? '').trim())) if (/^INF[A-Z0-9]{9}$/.test(isin)) prices.set(isin, nav);
  }
  // Most schemes carry the last business day; a few overnight funds post weekend dates. Use the commonest.
  const date = [...dates].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { date, prices };
}

/** Fund name and SEBI category heading per ISIN, published nightly at `prices/funds.json`. */
export interface FundsFile { date: ISODate; funds: Record<string, { n: string; c: string }> }

const HEADING = /^(?:Open Ended|Close Ended|Interval Fund) Schemes\s*\((.*)\)\s*$/;

/** Each fund's category heading from AMFI NAVAll.txt: the bracketed text of the last "… Schemes(…)" line above it. */
export function parseAmfiFunds(text: string): FundsFile['funds'] {
  const funds: FundsFile['funds'] = {};
  let heading: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.trim().match(HEADING);
    if (h) { heading = h[1]!.trim(); continue; }
    const f = line.split(';');
    if (!heading || f.length < 4 || !/^\d+$/.test((f[0] ?? '').trim())) continue;
    const name = (f[3] ?? '').trim();
    for (const isin of [f[1], f[2]].map((s) => (s ?? '').trim())) if (/^INF[A-Z0-9]{9}$/.test(isin)) funds[isin] = { n: name, c: heading };
  }
  return funds;
}

/** NSE first, then BSE for anything NSE lacks, then fund NAVs. The file's date is the exchanges' date when present. */
export function mergePriceFiles(parts: Array<{ date: ISODate | null; prices: Map<string, Paise> } | null>): PriceFile | null {
  const prices: Record<string, Paise> = {};
  let date: ISODate | null = null;
  const used: string[] = [];
  const names = ['NSE', 'BSE', 'AMFI'];
  parts.forEach((p, i) => {
    if (!p || p.prices.size === 0) return;
    used.push(names[i] ?? `source ${i + 1}`);
    if (p.date && (!date || (i < 2 && p.date > date))) date = p.date;
    for (const [isin, v] of p.prices) if (!(isin in prices)) prices[isin] = v;
  });
  return date ? { date, source: used.join(', '), prices } : null;
}

/**
 * Published nightly at `prices/shares.json`: listed shares by name and by symbol, for statements that name a company
 * but give no ISIN (Angel One's trade history). Names are `nameKey`s; former names come from NSE's name changes.
 */
export interface SharesFile { date: ISODate; byName: Record<string, string>; bySymbol: Record<string, string> }

/**
 * Names and symbols from NSE and BSE bhavcopies, plus former names from NSE's namechange.csv. Only shares and exchange
 * funds (INE / INF ISINs; partly-paid, bond and gold-bond lines are left out). A name or symbol that fits more than one
 * ISIN (a DVR or rights entitlement named like its parent, a former name now used by another company) is left out, so
 * it stays unmatched rather than landing on the wrong security.
 */
export function parseShareNames(bhavcopies: string[], nameChanges?: string): Pick<SharesFile, 'byName' | 'bySymbol'> {
  const names = new Map<string, Set<string>>(), symbols = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, isin: string) => { if (k) m.set(k, (m.get(k) ?? new Set()).add(isin)); };
  for (const csv of bhavcopies) {
    const rows = parseCSV(csv);
    const head = rows[0] ?? [];
    const iIsin = head.indexOf('ISIN'), iSym = head.indexOf('TckrSymb'), iName = head.indexOf('FinInstrmNm'), iSeg = head.indexOf('Sgmt');
    if (iIsin < 0) continue;
    for (const r of rows.slice(1)) {
      const isin = r[iIsin] ?? '';
      if (!/^IN[EF][A-Z0-9]{9}$/.test(isin) || (iSeg >= 0 && r[iSeg] !== 'CM')) continue;
      add(symbols, nameKey(r[iSym] ?? ''), isin);
      add(names, nameKey(r[iName] ?? ''), isin);
    }
  }
  const unique = (m: Map<string, Set<string>>) => new Map([...m].filter(([, v]) => v.size === 1).map(([k, v]) => [k, [...v][0]!]));
  const bySymbolMap = unique(symbols);
  if (nameChanges) {
    for (const r of parseCSV(nameChanges).slice(1)) {
      const sym = nameKey(r[0] ?? '');
      const isins = symbols.get(sym);
      // A former name joins the same pool, so one that is now another company's name becomes ambiguous and drops out.
      for (const isin of isins ?? []) add(names, nameKey(r[1] ?? ''), isin);
    }
  }
  return { byName: Object.fromEntries(unique(names)), bySymbol: Object.fromEntries(bySymbolMap) };
}
