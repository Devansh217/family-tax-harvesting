import type { ISODate, Paise } from '../engine/types';
import { parseCSV, parseDate } from '../parsers/common';

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
