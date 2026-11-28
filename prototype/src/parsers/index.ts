import { isDematCAS, isMutualFundCAS, parseDematCAS, parseMutualFundCAS } from './cas';
import { parseCSV, type ParseResult } from './common';
import { pdfRows, type PdfWord } from './pdfTable';
import { readSoldLots, soldLotsFromTable } from './soldLots';
import { detectKind, findHeaderRow, guessMapping, parseTable, type Mapping, type TablePreview } from './table';

export * from './common';
export { FIELDS, FIELD_LABELS, PNL_FIELDS, detectKind, fieldsFor, guessMapping, normHeader, parseTable, type Field, type Mapping, type TableKind, type TablePreview } from './table';
export { readSoldLots, soldLotsFromTable, type CellSheet, type SoldLotsRead } from './soldLots';
export { extractItems, extractLines, linesOf, PdfPasswordError, type PdfJsLike } from './pdfText';
export { pdfRows, type PdfWord } from './pdfTable';
export { isAngelFundHoldings, isAngelTrades, parseAngelFundHoldings, parseAngelTrades } from './angel';
export { isEncryptedOffice, resolveNames } from './names';
export { isZerodhaHoldings, isZerodhaTaxPnl, parseZerodhaHoldings, parseZerodhaTaxPnl, type BrokerSummary } from './zerodhaTaxPnl';

/** Spreadsheet-like text (CSV/TSV, or rows pasted from Excel) → header guess the user can correct. */
export function previewTable(text: string): TablePreview {
  return previewRows(parseCSV(text));
}

/** Rows already split into cells (from an Excel sheet). Dates become ISO strings, numbers plain strings. */
export function previewRows(raw: unknown[][]): TablePreview {
  const rows = raw
    .map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())))
    .filter((r) => r.some((c) => c !== ''));
  const headerIdx = findHeaderRow(rows);
  const header = rows[headerIdx] ?? [];
  const mapping = guessMapping(header);
  return { rows, headerIdx, header, mapping, kind: detectKind(mapping) };
}

export function parseTablePreview(p: TablePreview, mapping: Mapping, fileName: string): ParseResult {
  const kind = detectKind(mapping);
  if (kind === 'pnl' || p.kind === 'pnl') return soldLotsFromTable(p.rows, p.headerIdx, mapping, fileName, p.partial);
  const label = kind === 'trades' ? 'Trade history' : kind === 'holdings' ? 'Holdings' : 'Table';
  return parseTable(p.rows, p.headerIdx, mapping, `${label} · ${fileName}`);
}

/** Text lines from a statement PDF → the right CAS parser. */
export function parseStatementLines(lines: string[]): ParseResult {
  const text = lines.join('\n');
  if (isMutualFundCAS(text)) {
    const mf = parseMutualFundCAS(lines);
    if (isDematCAS(text)) {
      const demat = parseDematCAS(lines);
      return { ...mf, format: 'Combined CAS', prices: [...mf.prices, ...demat.prices.filter((p) => !mf.prices.some((q) => q.isin === p.isin))], warnings: [...mf.warnings, ...demat.warnings] };
    }
    return mf;
  }
  if (isDematCAS(text)) return parseDematCAS(lines);
  return {
    format: 'Unrecognised PDF', txns: [], prices: [], skipped: 0,
    warnings: ['This PDF does not look like a CAS from CAMS, KFintech, NSDL or CDSL. For broker statements, download the CSV or Excel version.'],
  };
}

/** A PDF's text that the sold-lots reader turns away, in the words of the import card. */
export const PDF_NOT_RELIABLE = 'This PDF could not be read reliably. Download the Excel or CSV version of the report and import that.';

/**
 * A statement PDF: a CAS first, else a broker's report of sold lots (a Tax P&L) rebuilt from word positions. A sold-lots
 * PDF that isn't read with high confidence is turned away: the founder's policy is to accept a PDF only at high
 * confidence and point people to the Excel or CSV version otherwise.
 */
export function parsePdfStatement(lines: string[], words: PdfWord[][]): ParseResult {
  const cas = parseStatementLines(lines);
  if (cas.format !== 'Unrecognised PDF') return cas;
  const read = readSoldLots([{ sheet: 'pdf', rows: pdfRows(words) }]);
  if (read.confidence === 'high') return read.result;
  if (read.confidence === 'medium') return { ...cas, warnings: [PDF_NOT_RELIABLE] };
  return cas;
}
