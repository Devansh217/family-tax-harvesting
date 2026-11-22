import { BUYBACK_DIVIDEND_FROM, rulesFor } from '../engine/rules';
import type { ISODate, Paise } from '../engine/types';
import { findIsin, parseDate, parseNumber, toPaise, toQty, type ParsedTxn, type ParseResult } from './common';

/** Zerodha Console's own totals for the period, to check the engine against. Rupee figures in paise. */
export interface BrokerSummary {
  broker: string;
  from: ISODate | null;
  to: ISODate | null;
  intraday: Paise | null;
  equityShortTerm: Paise | null;
  equityLongTerm: Paise | null;
  mfShortTerm: Paise | null;
  mfLongTerm: Paise | null;
  fno: Paise | null;
  fnoTurnover: Paise | null;
}

export interface TaxPnlResult extends ParseResult {
  brokerSummary: BrokerSummary;
  fmv2018: Record<string, Paise>;
}

type Sheet = { sheet: string; data: unknown[][] };

const text = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const num = (v: unknown) => (typeof v === 'number' ? v : parseNumber(text(v)));
const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : parseDate(text(v)));

export const isZerodhaTaxPnl = (sheets: Sheet[]) =>
  sheets.some((s) => /^Tradewise Exits/i.test(s.sheet)) && sheets.some((s) => /Equity and Non Equity/i.test(s.sheet));

/** "Label | value" rows on the summary sheets. */
function labelled(sheet: Sheet | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of sheet?.data ?? []) {
    const cells = r.filter((c) => text(c) !== '');
    if (cells.length !== 2) continue;
    const n = num(cells[1]);
    if (n != null) m.set(text(cells[0]).toLowerCase(), n);
  }
  return m;
}

const SECTION = /^(Equity - Intraday|Equity - Short Term|Equity - Long Term|Equity - Buyback|Mutual Funds|F&O|Currency|Commodity)$/i;

/**
 * Zerodha Console "Tax P&L" workbook. Each exit becomes a buy at its entry date and a sell at its exit date, so the
 * engine recomputes the same gains (intraday exits share a date, so they are detected as intraday). F&O is taken from
 * the broker's totals; currency and commodity are skipped; buybacks are booked like other exits only when the exit date is a capital gain under that year's rules, else left out.
 */
export function parseZerodhaTaxPnl(sheets: Sheet[]): TaxPnlResult {
  const tradewise = sheets.find((s) => /^Tradewise Exits/i.test(s.sheet))!;
  const txns: ParsedTxn[] = [];
  const warnings: string[] = [];
  const fmv2018: Record<string, Paise> = {};
  let skipped = 0, from: ISODate | null = null, to: ISODate | null = null;
  let section = '', cols: Record<string, number> | null = null;
  const counts: Record<string, number> = {};

  for (const r of tradewise.data) {
    const nonEmpty = r.map(text).filter(Boolean);
    const period = nonEmpty.length === 1 && nonEmpty[0]!.match(/from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i);
    if (period) { from = period[1]!; to = period[2]!; continue; }
    if (nonEmpty.length === 1 && SECTION.test(nonEmpty[0]!)) { section = nonEmpty[0]!; cols = null; continue; }
    if (nonEmpty.includes('Symbol') && nonEmpty.includes('Exit Date')) {
      cols = {};
      r.forEach((c, i) => { if (text(c)) cols![text(c)] = i; });
      continue;
    }
    if (!cols || !section) continue;
    const symbol = text(r[cols['Symbol']!]);
    const qty = num(r[cols['Quantity']!]);
    if (!symbol || qty == null || qty === 0) continue;
    if (/^(F&O|Currency|Commodity)$/i.test(section)) continue;
    const isin = findIsin(text(r[cols['ISIN']!])) ?? `SYM:${symbol.toUpperCase()}`;
    const entry = date(r[cols['Entry Date']!]), exit = date(r[cols['Exit Date']!]);
    if (/Buyback/i.test(section) && exit) {
      const rules = rulesFor(exit);
      // rulesFor falls back to the oldest known year for earlier dates, so the exit must also fall inside that year.
      if (!(rules.buybackIsCapitalGain && exit >= rules.start)) {
        const key = exit < BUYBACK_DIVIDEND_FROM ? 'buybackBefore' : 'buyback';
        counts[key] = (counts[key] ?? 0) + 1;
        continue;
      }
    }
    const buy = num(r[cols['Buy Value']!]), sell = num(r[cols['Sell Value']!]);
    if (!entry || !exit || buy == null || sell == null) { skipped++; continue; }
    const units = Math.abs(qty);
    txns.push({ date: entry, isin, name: symbol, side: 'buy', qty: toQty(units), amount: toPaise(Math.abs(buy)) });
    txns.push({ date: exit, isin, name: symbol, side: 'sell', qty: toQty(units), amount: toPaise(Math.abs(sell)) });
    counts[section] = (counts[section] ?? 0) + 1;

    const fmvCol = cols['Fair Market Value'];
    const fmv = fmvCol == null ? null : num(r[fmvCol]);
    if (fmv && fmv > 0 && entry <= '2018-01-31') fmv2018[isin] = Math.round((fmv / units) * 100);
  }

  const eq = labelled(sheets.find((s) => /Equity and Non Equity/i.test(s.sheet)));
  const mf = labelled(sheets.find((s) => /^Mutual Funds$/i.test(s.sheet)));
  const fo = labelled(sheets.find((s) => /^F&O$/i.test(s.sheet)));
  const p = (v: number | undefined) => (v == null ? null : toPaise(v));
  const sum = (...v: Array<number | undefined>) => (v.every((x) => x == null) ? null : toPaise(v.reduce<number>((a, x) => a + (x ?? 0), 0)));

  const summary: BrokerSummary = {
    broker: 'Zerodha', from, to,
    intraday: p(eq.get('equity intraday/speculative profit')),
    equityShortTerm: p(eq.get('equity short term profit')),
    equityLongTerm: p(eq.get('equity long term profit')),
    mfShortTerm: p(mf.get('equity short term profit')),
    mfLongTerm: p(mf.get('equity long term profit')),
    fno: sum(fo.get('options realized profit'), fo.get('futures realized profit')),
    fnoTurnover: sum(fo.get('options turnover'), fo.get('futures turnover')),
  };

  const nb = counts.buyback, nbb = counts.buybackBefore;
  if (nb) warnings.push(`${nb} buyback ${nb === 1 ? 'exit' : 'exits'} from 1 Oct 2024 to 31 Mar 2026 ${nb === 1 ? 'was' : 'were'} left out: in that period buyback money was taxed as dividend income.`);
  if (nbb) warnings.push(`${nbb} buyback ${nbb === 1 ? 'exit' : 'exits'} before 1 Oct 2024 ${nbb === 1 ? 'was' : 'were'} left out: the company paid the tax on those.`);
  if (summary.fno != null) warnings.push('F&O profit or loss and turnover were taken from the report totals and set on this member.');
  warnings.push('This report covers exits only. Import holdings or the full tradebook as well to see what is still held and suggest moves.');

  return {
    format: `Zerodha Tax P&L${from && to ? ` · ${from} to ${to}` : ''}`,
    txns, prices: [], warnings, skipped, brokerSummary: summary, fmv2018,
  };
}

/** Zerodha Console holdings workbook: "Equity" and "Mutual Funds" sheets ("Combined" repeats them and is skipped). */
export const isZerodhaHoldings = (sheets: Sheet[]) =>
  sheets.some((s) => s.data.some((r) => r.map(text).includes('Quantity Available') && r.map(text).includes('Previous Closing Price')));

export function parseZerodhaHoldings(sheets: Sheet[]): ParseResult {
  const named = sheets.filter((s) => !/^Combined$/i.test(s.sheet));
  const use = named.length ? named : sheets;
  const prices: ParseResult['prices'] = [];
  let skipped = 0;
  for (const s of use) {
    const hi = s.data.findIndex((r) => r.map(text).includes('Quantity Available'));
    if (hi < 0) continue;
    const head = s.data[hi]!.map(text);
    const col = (name: string) => head.indexOf(name);
    const priceDate = s.data.flat().map((c) => /as on (\d{4}-\d{2}-\d{2})/i.exec(text(c))?.[1]).find(Boolean);
    const qtyCols = head.map((h, i) => (/^Quantity (Available|Discrepant|Pledged)/i.test(h) ? i : -1)).filter((i) => i >= 0);
    for (const r of s.data.slice(hi + 1)) {
      const symbol = text(r[col('Symbol')]);
      const isin = findIsin(text(r[col('ISIN')])) ?? (symbol ? `SYM:${symbol.toUpperCase()}` : null);
      const units = qtyCols.reduce((a, i) => a + (num(r[i]) ?? 0), 0);
      const avg = num(r[col('Average Price')]);
      const close = num(r[col('Previous Closing Price')]);
      if (!isin || !symbol || units <= 0 || close == null) { if (symbol) skipped++; continue; }
      const lt = col('Quantity Long Term') >= 0 ? num(r[col('Quantity Long Term')]) : null;
      prices.push({
        isin, name: symbol, 
        price: toPaise(close), ...(priceDate ? { priceDate } : {}), qty: toQty(units), cost: avg != null ? toPaise(avg * units) : undefined,
        ltQty: lt != null ? toQty(lt) : undefined,
      });
    }
  }
  return {
    format: 'Zerodha holdings', txns: [], prices, skipped,
    warnings: ['Holdings give current units, average cost and the previous close. Buy dates come from the tradebooks.'],
  };
}
