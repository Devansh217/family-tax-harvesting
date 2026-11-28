/**
 * Runs the statement parsers over every file in ../data/private (git-ignored) and prints a privacy-safe summary:
 * formats, counts, date ranges and warnings. It never prints names, PANs, folio numbers or amounts.
 *
 *   npm run check:private                  # all files
 *   PDF_PASSWORD=ABCDE1234F npm run check:private
 *   SHOW_SHAPES=1 npm run check:private    # also print unparsed line shapes (digits→9, letters→a) to debug layouts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import readXlsxFile from 'read-excel-file/node';
import { cellText, extractItems, linesOf, parseCSV, parsePdfStatement, readSoldLots, type CellSheet, isAngelFundHoldings, isAngelTrades, parseAngelFundHoldings, parseAngelTrades, resolveNames, isZerodhaHoldings, isZerodhaTaxPnl, parseZerodhaHoldings, parseTablePreview, parseZerodhaTaxPnl, PdfPasswordError, previewRows, previewTable, type PdfJsLike } from '../src/parsers';
import { addDays, addMonths, inRange } from '../src/engine/dates';
import { computeFamily, countingSummaries, pnlGroups } from '../src/engine/family';
import { FY_2026_27 } from '../src/engine/rules';
import { reconcile } from '../src/reconcile';
import { normAccount } from '../src/engine/ledger';
import { applyImport, emptyState, guessAccount, type AppState } from '../src/store';
import { decidingFiles, effectiveTxnsWithNotes, isTradebook } from '../src/engine/openingLots';
import { pnlCoverage, unknownTermSales, visibleOversells } from '../src/ui/warnings';
import { planGaps } from '../src/ui/plan';
import type { ParseResult } from '../src/parsers';

const dir = resolve(process.argv[2] ?? join(import.meta.dirname, '../../data/private'));
const shape = (l: string) => l.replace(/[A-Za-z]/g, 'a').replace(/\d/g, '9').replace(/a{2,}/g, 'aa').replace(/9{2,}/g, '99');

const entries = readdirSync(dir).filter((f) => !f.startsWith('.'));
// Folders are members (replayed below, by index only); only loose files are described one by one.
const files = entries.filter((f) => statSync(join(dir, f)).isFile());
if (entries.length === 0) console.log(`No files in ${dir}. Put your statements there (it is git-ignored).`);

/** Rebuilds gains from a Tax P&L's exits and compares them with the broker's own totals. Prints match / % only. */
function reconcileTaxPnl(f: string, r: ParseResult, account: string) {
  let st: AppState = { ...emptyState(), members: [{ id: 'm', name: 'Member', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: 20_00_000_00, from: 'manual' as const }] }] };
  st = applyImport(st, 'm', f, r, { account });
  const fam = computeFamily(st, r.brokerSummary!.to ?? FY_2026_27.end, FY_2026_27);
  for (const l of reconcile(fam, st.brokerSummaries[0]!)) {
    const pct = l.broker === 0 ? (l.ours === 0 ? 0 : 100) : (Math.abs(l.diff) / Math.abs(l.broker)) * 100;
    console.log(`  ${l.ok ? 'MATCH   ' : 'MISMATCH'} ${l.label}${l.ok ? '' : ` (off by ${pct.toFixed(2)}%)`}`);
  }
  // With no fund list here, ETFs and funds sold in a shares section stay "check" and fall outside the shares lines;
  // the app classifies them. All sales together still have to land on the broker's figures.
  const s = r.brokerSummary!;
  const from = s.from ?? fam.rules.start, to = s.to ?? fam.rules.end;
  const sold = fam.ledger.realised.filter((x) => inRange(x.sellDate, from, to));
  const unsorted = new Set(sold.filter((x) => x.taxType === 'check').map((x) => x.isin)).size;
  if (unsorted) {
    const ours = sold.reduce((a, x) => a + x.gain, 0) + fam.ledger.intraday.filter((t) => inRange(t.date, from, to)).reduce((a, t) => a + t.pnl, 0);
    const theirs = (s.intraday ?? 0) + (s.equityShortTerm ?? 0) + (s.equityLongTerm ?? 0) + (s.mfShortTerm ?? 0) + (s.mfLongTerm ?? 0);
    console.log(`  ${Math.abs(ours - theirs) <= Math.max(100, Math.abs(theirs) * 0.0005) ? 'MATCH   ' : 'MISMATCH'} All sales together (${unsorted} ETFs or funds unclassified without the fund list)`);
  }
  return fam;
}

/** The generic sold-lots reader, as the Import screen runs it after the known readers. */
function soldLots(f: string, sheets: CellSheet[]): ParseResult | null {
  const read = readSoldLots(sheets);
  console.log(`\n${f}: sold-lots reader, ${read.confidence} confidence`);
  if (read.confidence !== 'high') return null;
  if (read.result.brokerSummary) reconcileTaxPnl(f, read.result, read.result.brokerSummary.broker ?? 'Broker');
  return read.result;
}

const pdfOf = async (path: string) => {
  const words = await extractItems(pdfjs as unknown as PdfJsLike, new Uint8Array(readFileSync(path)), process.env.PDF_PASSWORD);
  return { lines: linesOf(words), words };
};

for (const f of files) {
  const path = join(dir, f);
  const lower = f.toLowerCase();
  try {
    let r;
    let lines: string[] = [];
    if (lower.endsWith('.pdf')) {
      try {
        const pdf = await pdfOf(path);
        lines = pdf.lines;
        r = parsePdfStatement(pdf.lines, pdf.words);
        console.log(`\n${f}:`);
        if (r.brokerSummary) reconcileTaxPnl(f, r, r.brokerSummary.broker ?? 'Broker');
      } catch (e) {
        if (e instanceof PdfPasswordError) { console.log(`\n${f}: locked. Run with PDF_PASSWORD=<password>.`); continue; }
        throw e;
      }
    } else if (lower.endsWith('.xlsx')) {
      const sheets = await readXlsxFile(path);
      const asSheets = sheets.map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] }));
      if (isZerodhaHoldings(asSheets)) {
        r = parseZerodhaHoldings(asSheets);
        console.log(`\n${f}: Zerodha holdings, ${r.prices.filter((p) => p.ltQty != null).length} with long-term quantity`);
      } else if (isZerodhaTaxPnl(asSheets)) {
        r = parseZerodhaTaxPnl(asSheets);
        console.log(`\n${f}: Zerodha Tax P&L, ${r.brokerSummary!.from} to ${r.brokerSummary!.to}`);
        const fam = reconcileTaxPnl(f, r, 'Zerodha');
        console.log(`  F&O from report totals: ${r.brokerSummary!.fno == null ? 'none' : r.brokerSummary!.fno < 0 ? 'loss' : 'profit'}; 2018 values for ${Object.keys(r.fmv2018 ?? {}).length} securities; ${fam.ledger.warnings.length} unmatched sells`);
      } else if (isAngelTrades(asSheets)) {
        r = parseAngelTrades(asSheets);
        console.log(`\n${f}: Angel One trades`);
      } else if (isAngelFundHoldings(asSheets)) {
        r = parseAngelFundHoldings(asSheets);
        console.log(`\n${f}: Angel One fund holdings`);
      } else {
        r = soldLots(f, asSheets.map((s) => ({ sheet: s.sheet, rows: s.data.map((row) => row.map(cellText)) })));
        if (!r) {
          const p = sheets.map((s) => previewRows(s.data as unknown[][])).find((x) => x.kind !== 'unknown') ?? previewRows(sheets[0]?.data as unknown[][] ?? []);
          console.log(`  header row ${p.headerIdx + 1}: [${p.header.join(' | ')}] → ${p.kind}`);
          r = parseTablePreview(p, p.mapping, f);
        }
      }
    } else {
      const text = readFileSync(path, 'utf8');
      r = soldLots(f, [{ sheet: f, rows: parseCSV(text) }]);
      if (r) { /* read */ } else {
      const p = previewTable(text);
      console.log(`  header row ${p.headerIdx + 1}: [${p.header.join(' | ')}] → ${p.kind}`);
      r = parseTablePreview(p, p.mapping, f);
      }
    }
    const dates = r.txns.map((t) => t.date).sort();
    const secs = new Set([...r.txns.map((t) => t.isin), ...r.prices.map((p) => p.isin)]);
    console.log(`${r.format}`);
    console.log(`  ${r.txns.length} transactions (${r.txns.filter((t) => t.side === 'buy').length} buys, ${r.txns.filter((t) => t.side === 'sell').length} sells)${dates.length ? `, ${dates[0]} → ${dates.at(-1)}` : ''}`);
    console.log(`  ${r.prices.length} prices, ${secs.size} securities, ${r.skipped} rows skipped`);
    for (const w of r.warnings) console.log(`  ! ${w.replace(/^[^:]{3,80}: statement/, '<scheme>: statement')}`);
    if (process.env.SHOW_SHAPES && lines.length) {
      const counts = new Map<string, number>();
      for (const l of lines) counts.set(shape(l), (counts.get(shape(l)) ?? 0) + 1);
      console.log('  Most common line shapes:');
      [...counts].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([s, n]) => console.log(`    ${String(n).padStart(4)} × ${s}`));
    }
  } catch (e) {
    console.log(`\n${f}: could not read (${(e as Error).message})`);
  }
}

/**
 * Holdings-first proof: replays each member folder (one subfolder per member) the way the app would, and prints counts
 * only, by member index. No names, ISINs, amounts or per-holding units are ever printed.
 */
const memberDirs = entries.filter((f) => statSync(join(dir, f)).isDirectory()).sort();
if (memberDirs.length) {
  const sharesPath = resolve(import.meta.dirname, '../public/prices/shares.json');
  const shares = existsSync(sharesPath) ? JSON.parse(readFileSync(sharesPath, 'utf8')) : null;

  async function readStatement(path: string): Promise<ParseResult | 'locked' | null> {
    const lower = path.toLowerCase();
    if (lower.endsWith('.pdf')) {
      try { const pdf = await pdfOf(path); return parsePdfStatement(pdf.lines, pdf.words); }
      catch (e) { return e instanceof PdfPasswordError ? 'locked' : null; }
    }
    if (lower.endsWith('.xlsx')) {
      try {
        const sheets = (await readXlsxFile(path)).map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] }));
        if (isZerodhaTaxPnl(sheets)) return parseZerodhaTaxPnl(sheets);
        if (isZerodhaHoldings(sheets)) return parseZerodhaHoldings(sheets);
        if (isAngelTrades(sheets)) return resolveNames(parseAngelTrades(sheets), shares);
        if (isAngelFundHoldings(sheets)) return parseAngelFundHoldings(sheets);
        const read = readSoldLots(sheets.map((s) => ({ sheet: s.sheet, rows: s.data.map((row) => row.map(cellText)) })));
        if (read.confidence === 'high') return read.result;
        const p = sheets.map((s) => previewRows(s.data)).find((x) => x.kind !== 'unknown');
        return p ? parseTablePreview(p, p.mapping, 'file.xlsx') : null;
      } catch { return null; } // password-protected or unreadable
    }
    if (lower.endsWith('.csv')) {
      const text = readFileSync(path, 'utf8');
      const read = readSoldLots([{ sheet: 'file.csv', rows: parseCSV(text) }]);
      if (read.confidence === 'high') return read.result;
      const p = previewTable(text);
      return parseTablePreview(p, p.mapping, 'file.csv');
    }
    return null;
  }

  let st: AppState = emptyState();
  let unreadable = 0;
  for (const [i, d] of memberDirs.entries()) {
    const id = `m${i + 1}`;
    st = { ...st, members: [...st.members, { id, name: `Member ${i + 1}`, relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: 20_00_000_00, from: 'manual' as const }] }] };
    for (const f of readdirSync(join(dir, d)).filter((x) => !x.startsWith('.') && statSync(join(dir, d, x)).isFile()).sort()) {
      const r = await readStatement(join(dir, d, f));
      if (!r || r === 'locked') { unreadable++; continue; }
      // As the Import screen does by default: holdings with no history get an opening lot dated 13 months back.
      st = applyImport(st, id, f, r, { account: guessAccount(f, r.format) || undefined, openingDate: addMonths(new Date().toISOString().slice(0, 10), -13) });
    }
  }
  const asOf = FY_2026_27.end > new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : FY_2026_27.end;
  const fam = computeFamily(st, asOf, FY_2026_27);
  const covered = pnlCoverage(st.brokerSummaries, FY_2026_27);
  // Counts per kind of source only: a source string can carry letters from a file name.
  const sourceKinds = (ps: Array<{ source: string }>) => {
    const kind = (src: string) => (src === 'Zerodha holdings' ? 'holdings file' : src.startsWith('Demat CAS') ? 'demat CAS'
      : src.startsWith('Combined CAS') ? 'combined CAS' : src.startsWith('Mutual fund CAS') ? 'fund CAS' : src.startsWith('Angel One fund holdings') ? 'fund holdings' : 'other');
    const n = new Map<string, number>();
    for (const p of ps) n.set(kind(p.source), (n.get(kind(p.source)) ?? 0) + 1);
    return [...n].map(([k, c]) => `${k} ${c}`).join(', ') || 'none';
  };
  const isFund = (isin: string) => isin.startsWith('INF') && !(st.securities.find((x) => x.isin === isin)?.listed);

  console.log(`\nHoldings-first replay: ${memberDirs.length} members, ${unreadable} files unreadable or locked, ${st.txns.length} transactions, ${st.positions.length} positions`);
  console.log(`  securities with no ISIN yet (SYM rows): ${st.securities.filter((x) => x.isin.startsWith('SYM:')).length}`);
  for (const [i] of memberDirs.entries()) {
    const id = `m${i + 1}`;
    const trimmed = fam.holdingsNotes.trimmed.filter((t) => t.memberId === id).reduce((a, t) => a + t.isins.length, 0);
    const stale = fam.holdingsNotes.staleFiles.filter((t) => t.memberId === id).length;
    const corp = fam.holdingsNotes.corporateActions.filter((t) => t.memberId === id).length;
    // Funds: the newest position per account and fund against the units the ledger holds for the member.
    const latest = new Map<string, { isin: string; qty: number; asOf: string }>();
    // Only the positions that count (the deciding holdings file per account), as the app reads them.
    for (const p of fam.positions.filter((x) => x.memberId === id && isFund(x.isin))) {
      const k = `${p.isin}|${p.account ?? ''}`;
      const b = latest.get(k);
      if (!b || (p.asOf ?? '') >= b.asOf) latest.set(k, { isin: p.isin, qty: p.qty, asOf: p.asOf ?? '' });
    }
    const fileUnits = new Map<string, number>();
    for (const v of latest.values()) fileUnits.set(v.isin, (fileUnits.get(v.isin) ?? 0) + v.qty);
    let fundMismatch = 0;
    for (const [isin, q] of fileUnits) {
      let held = 0;
      for (const [k, lots] of fam.ledger.lots) if (k.startsWith(`${id}|${isin}|`)) held += lots.reduce((a, l) => a + l.qty, 0);
      if (held !== q) {
        fundMismatch++;
        if (process.env.DIAG) console.log(`    diag fund: ${held === 0 ? 'held none' : held > q ? 'held more' : 'held fewer'}; positions by source kind ${sourceKinds(st.positions.filter((p) => p.memberId === id && p.isin === isin))}; txns ${st.txns.filter((t) => t.memberId === id && t.isin === isin).length}; |diff| ratio ${(Math.abs(held - q) / q).toFixed(3)}`);
      }
    }
    const unknown = unknownTermSales(fam.booked, id, FY_2026_27, covered).length;
    const over = visibleOversells(fam.ledger.warnings.filter((w) => w.memberId === id), FY_2026_27, covered);
    const gaps = planGaps(fam, fam.positions, st.brokerSummaries, st.imports).filter((g) => g.memberId === id).length;
    console.log(`  member ${i + 1}: trimmed shares ${trimmed}; stale holdings files ${stale}; corporate-action notes ${corp}; funds with file units: ${fileUnits.size}, held units differ from file: ${fundMismatch}; unknown-term sales ${unknown}; visible oversells now ${over.now.length} (older ${over.older.length}); Plan gaps ${gaps}`);
    // After the broker correction, booked gains per Tax P&L and category against the broker's own total: match / no match.
    const isEq = (isin: string) => st.securities.find((x) => x.isin === isin)?.listed ?? true;
    // One line per group of partly overlapping P&Ls (a single P&L is a group of one), as the correction works.
    for (const b of pnlGroups(st.brokerSummaries).filter((x) => x.memberId === id)) {
      const from = b.summary.from ?? FY_2026_27.start, to = b.summary.to ?? FY_2026_27.end;
      const cats: Array<[string, number | null, 'st' | 'lt', boolean]> = [
        ['Shares, short-term', b.summary.equityShortTerm, 'st', true], ['Shares, long-term', b.summary.equityLongTerm, 'lt', true],
        ['Mutual funds, short-term', b.summary.mfShortTerm, 'st', false], ['Mutual funds, long-term', b.summary.mfLongTerm, 'lt', false],
      ];
      const out: string[] = [];
      for (const [label, broker, term, eq] of cats) {
        if (broker == null) continue;
        const ours = fam.ledger.realised.filter((r) => r.memberId === id && b.group.some((x) => (r.account ?? '') === x.account) && inRange(r.sellDate, from, to) && r.term === term && isEq(r.isin) === eq).reduce((a, r) => a + r.gain, 0)
          + fam.brokerAdjustments.filter((a) => a.memberId === id && a.account === b.account && a.label === label).reduce((a, x) => a + x.gain, 0);
        out.push(`${label} ${Math.abs(ours - broker) <= Math.max(100, Math.abs(broker) * 0.0005) ? 'match' : 'no match'}`);
      }
      console.log(`    after adjustment vs broker Tax P&L: ${out.join('; ') || 'no totals'}`);
    }
    // Why trims may be off: holdings files that cannot trim, by reason. Counts only.
    const files = [...decidingFiles(st.positions.filter((p) => p.memberId === id)).values()];
    const no = files.filter((f) => !f.canTrim);
    if (files.length) {
      const noDate = st.positions.filter((p) => p.memberId === id && p.source === 'Zerodha holdings' && !p.asOf).length;
      const flagged = st.positions.filter((p) => p.memberId === id && p.source === 'Zerodha holdings' && p.canTrim === false).length;
      console.log(`    deciding holdings files ${files.length}, cannot trim ${no.length}; positions with canTrim false ${flagged}, without date ${noDate}`);
    }
  }

  // Diagnostics, counts only (by member index).
  const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  const rel = (a: string, b: string) => `${a === b ? 'same day' : a < b ? 'earlier' : 'later'} by ${Math.abs(monthsBetween(a, b))} months`;
  const allDeciding = [...decidingFiles(st.positions).entries()];
  const eff = effectiveTxnsWithNotes(st.txns, st.positions, asOf, st.securities);
  for (const [i] of memberDirs.entries()) {
    const id = `m${i + 1}`;
    // 1. Trimmed shares by cause.
    const notes = eff.trimmed.filter((n) => n.memberId === id);
    if (notes.length) {
      const b = { otherMember: 0, soldAfterLastBuy: 0, neither: 0, neitherWithPnlExit: 0, lastBuyWithin3Days: 0 };
      for (const n of notes) {
        const acct = normAccount(n.account);
        for (const isin of n.isins) {
          const hist = st.txns.filter((t) => t.memberId === id && t.isin === isin && normAccount(t.account) === acct && !t.id.includes('|opening') && !t.left);
          const lastBuy = hist.filter((t) => t.side === 'buy').map((t) => t.date).sort().at(-1) ?? '';
          if (lastBuy && lastBuy >= addDays(n.asOf, -3) && lastBuy <= n.asOf) b.lastBuyWithin3Days++;
          const otherHolds = allDeciding.some(([k, f]) => !k.startsWith(`${id}|`) && f.positions.some((p) => p.isin === isin && p.qty > 0));
          const soldBetween = hist.some((t) => t.side === 'sell' && t.date >= lastBuy && t.date <= n.asOf && !t.source.startsWith('Zerodha Tax P&L'));
          if (otherHolds) b.otherMember++;
          else if (soldBetween) b.soldAfterLastBuy++;
          else {
            b.neither++;
            if (st.txns.some((t) => t.memberId === id && t.isin === isin && t.source.startsWith('Zerodha Tax P&L') && t.side === 'sell' && t.date >= FY_2026_27.start && t.date <= FY_2026_27.end)) b.neitherWithPnlExit++;
          }
        }
      }
      console.log(`  diag trims member ${i + 1}: (a) held by another member ${b.otherMember}; (b) sold after last buy, before file ${b.soldAfterLastBuy}; (c) neither ${b.neither}, of which with a Tax P&L exit this year ${b.neitherWithPnlExit}; last buy within 3 days of the file date ${b.lastBuyWithin3Days}`);
    }
    for (const [k, f] of allDeciding.filter(([k]) => k.startsWith(`${id}|`))) {
      const tb = st.txns.filter((t) => t.memberId === id && normAccount(t.account) === k.slice(id.length + 1) && isTradebook(t)).map((t) => t.date).sort().at(-1);
      console.log(`  diag member ${i + 1} deciding file: latest tradebook ${tb ? `${rel(tb, f.asOf)} than the file date (tradebook ${tb < f.asOf ? 'before' : 'after'} file)` : 'none in this account'}`);
    }
    // 2. This year's realised rows by the lot they came from.
    const kinds = new Map<string, number>();
    const bump = (k: string) => kinds.set(k, (kinds.get(k) ?? 0) + 1);
    for (const r of fam.ledger.realised.filter((x) => x.memberId === id && x.sellDate >= FY_2026_27.start && x.sellDate <= FY_2026_27.end)) {
      const cands = eff.txns.filter((t) => t.memberId === id && t.isin === r.isin && t.side === 'buy' && normAccount(t.account) === normAccount(r.account) && t.date === r.buyDate && !!t.estimated === !!r.termUnknown);
      const c = cands[0];
      if (!c) { bump('unmatched'); continue; }
      const kind = /\|(opening-[a-z]+)$/.exec(c.id)?.[1];
      if (c.source.startsWith('Zerodha Tax P&L')) bump('tax-pnl pair');
      else if (kind) bump(kind);
      else if (c.estimated) bump('other estimated');
      else bump('real tradebook/history lot');
    }
    console.log(`  diag realised this year member ${i + 1}: ${[...kinds].sort().map(([k, n]) => `${k} ${n}`).join('; ') || 'none'}`);
    // 3. Visible oversell groups against Tax P&L files.
    const groups = visibleOversells(fam.ledger.warnings.filter((w) => w.memberId === id), FY_2026_27, covered).now;
    const mine = countingSummaries(st.brokerSummaries).filter((b) => b.memberId === id);
    for (const g of groups) {
      const inYearPnl = mine.filter((b) => (b.summary.from ?? FY_2026_27.start) <= FY_2026_27.end && (b.summary.to ?? FY_2026_27.end) >= FY_2026_27.start);
      const label = inYearPnl.length === 0 ? 'no label to compare' : inYearPnl.some((b) => b.account === g.account) ? 'label matches exactly' : inYearPnl.some((b) => normAccount(b.account) === normAccount(g.account)) ? 'label matches after normAccount only' : 'label does not match';
      const range = inYearPnl.some((b) => g.from >= (b.summary.from ?? FY_2026_27.start) && g.to <= (b.summary.to ?? FY_2026_27.end)) ? 'sale dates inside a P&L range' : inYearPnl.length ? 'sale dates outside the P&L range' : 'n/a';
      const sameAcct = st.txns.filter((t) => t.memberId === id && t.isin === g.isin && normAccount(t.account) === normAccount(g.account));
      const extra = `account label ${g.account.trim() ? 'set' : 'blank'}; buys of it in that account ${sameAcct.filter((t) => t.side === 'buy' && !t.id.includes('|opening')).length}; buys of it in another account ${st.txns.filter((t) => t.memberId === id && t.isin === g.isin && t.side === 'buy' && normAccount(t.account) !== normAccount(g.account)).length}; held by another member's file ${allDeciding.some(([k, f]) => !k.startsWith(`${id}|`) && f.positions.some((p) => p.isin === g.isin)) ? 'yes' : 'no'}; deciding holdings file for the account ${allDeciding.some(([k]) => k === `${id}|${normAccount(g.account)}`) ? 'yes' : 'no'}`;
      console.log(`  diag oversell member ${i + 1}: Tax P&L this year for member: ${inYearPnl.length ? `yes (${inYearPnl.length})` : 'no'}; ${label}; ${range}; ${extra}`);
    }
  }
}
