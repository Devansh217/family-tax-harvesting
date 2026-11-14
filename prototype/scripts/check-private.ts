/**
 * Runs the statement parsers over every file in ../data/private (git-ignored) and prints a privacy-safe summary:
 * formats, counts, date ranges and warnings. It never prints names, PANs, folio numbers or amounts.
 *
 *   npm run check:private                  # all files
 *   PDF_PASSWORD=ABCDE1234F npm run check:private
 *   SHOW_SHAPES=1 npm run check:private    # also print unparsed line shapes (digits→9, letters→a) to debug layouts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import readXlsxFile from 'read-excel-file/node';
import { extractLines, isZerodhaTaxPnl, parseStatementLines, parseTablePreview, parseZerodhaTaxPnl, PdfPasswordError, previewRows, previewTable, type PdfJsLike } from '../src/parsers';
import { computeFamily } from '../src/engine/family';
import { FY_2026_27 } from '../src/engine/rules';
import { reconcile } from '../src/reconcile';
import { applyImport, emptyState, type AppState } from '../src/store';

const dir = resolve(process.argv[2] ?? join(import.meta.dirname, '../../data/private'));
const shape = (l: string) => l.replace(/[A-Za-z]/g, 'a').replace(/\d/g, '9').replace(/a{2,}/g, 'aa').replace(/9{2,}/g, '99');

const files = readdirSync(dir).filter((f) => !f.startsWith('.'));
if (files.length === 0) console.log(`No files in ${dir}. Put your statements there (it is git-ignored).`);

for (const f of files) {
  const path = join(dir, f);
  const lower = f.toLowerCase();
  try {
    let r;
    let lines: string[] = [];
    if (lower.endsWith('.pdf')) {
      try {
        lines = await extractLines(pdfjs as unknown as PdfJsLike, new Uint8Array(readFileSync(path)), process.env.PDF_PASSWORD);
      } catch (e) {
        if (e instanceof PdfPasswordError) { console.log(`\n${f}: locked. Run with PDF_PASSWORD=<password>.`); continue; }
        throw e;
      }
      r = parseStatementLines(lines);
    } else if (lower.endsWith('.xlsx')) {
      const sheets = await readXlsxFile(path);
      const asSheets = sheets.map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] }));
      if (isZerodhaTaxPnl(asSheets)) {
        r = parseZerodhaTaxPnl(asSheets);
        // Reconcile: rebuild gains from the exits and compare with Zerodha's own totals. Prints match / % only.
        let st: AppState = { ...emptyState(), members: [{ id: 'm', name: 'Member', relation: 'self', age: 40, regime: 'new', otherIncome: 20_00_000_00 }] };
        st = applyImport(st, 'm', f, r, { account: 'Zerodha' });
        const fam = computeFamily(st, r.brokerSummary!.to ?? FY_2026_27.end, FY_2026_27);
        console.log(`\n${f}: Zerodha Tax P&L, ${r.brokerSummary!.from} to ${r.brokerSummary!.to}`);
        for (const l of reconcile(fam, st.brokerSummaries[0]!)) {
          const pct = l.broker === 0 ? (l.ours === 0 ? 0 : 100) : (Math.abs(l.diff) / Math.abs(l.broker)) * 100;
          console.log(`  ${l.ok ? 'MATCH   ' : 'MISMATCH'} ${l.label}${l.ok ? '' : ` (off by ${pct.toFixed(2)}%)`}`);
        }
        console.log(`  F&O from report totals: ${r.brokerSummary!.fno == null ? 'none' : r.brokerSummary!.fno < 0 ? 'loss' : 'profit'}; 2018 values for ${Object.keys(r.fmv2018 ?? {}).length} securities; ${fam.ledger.warnings.length} unmatched sells`);
      } else {
      const p = sheets.map((s) => previewRows(s.data as unknown[][])).find((x) => x.kind !== 'unknown') ?? previewRows(sheets[0]?.data as unknown[][] ?? []);
      console.log(`\n${f}: header row ${p.headerIdx + 1}: [${p.header.join(' | ')}] → ${p.kind}`);
      r = parseTablePreview(p, p.mapping, f);
      }
    } else {
      const p = previewTable(readFileSync(path, 'utf8'));
      console.log(`\n${f}: header row ${p.headerIdx + 1}: [${p.header.join(' | ')}] → ${p.kind}`);
      r = parseTablePreview(p, p.mapping, f);
    }
    const dates = r.txns.map((t) => t.date).sort();
    const secs = new Set([...r.txns.map((t) => t.isin), ...r.prices.map((p) => p.isin)]);
    console.log(`${lower.endsWith('.pdf') ? `\n${f}: ` : ''}${r.format}`);
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
