import { isDematCAS, isMutualFundCAS, parseDematCAS, parseMutualFundCAS } from './cas';
import { parseCSV, type ParseResult } from './common';
import { detectKind, findHeaderRow, guessMapping, parseTable, type Mapping } from './table';

export * from './common';
export { FIELDS, FIELD_LABELS, detectKind, guessMapping, parseTable, type Field, type Mapping } from './table';
export { extractLines, PdfPasswordError, type PdfJsLike } from './pdfText';

export interface TablePreview {
  rows: string[][];
  headerIdx: number;
  header: string[];
  mapping: Mapping;
  kind: ReturnType<typeof detectKind>;
}

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
