import type { SharesFile } from '../prices/parse';
import { cellText, extractItems, isAngelFundHoldings, linesOf, parseCSV, readSoldLots, isAngelTrades, isEncryptedOffice, parseAngelFundHoldings, parseAngelTrades, resolveNames, isZerodhaHoldings, isZerodhaTaxPnl, parseZerodhaHoldings, parseZerodhaTaxPnl, previewRows, previewTable, type ParseResult, type CellSheet, type PdfJsLike, type PdfWord, type TablePreview } from '../parsers';

let pdfjsPromise: Promise<PdfJsLike> | null = null;

/** pdf.js is loaded only when a PDF is opened, with its worker bundled locally (no CDN). */
function loadPdfJs(): Promise<PdfJsLike> {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfJsLike;
  });
  return pdfjsPromise;
}

/** A PDF's text lines (for a CAS) and its positioned words (for a table), from one open of the file. */
export async function readPdf(file: File, password?: string): Promise<{ lines: string[]; words: PdfWord[][] }> {
  const pdfjs = await loadPdfJs();
  const words = await extractItems(pdfjs, new Uint8Array(await file.arrayBuffer()), password);
  return { lines: linesOf(words), words };
}

/** A spreadsheet is either a table to map column by column, or a known broker report read in full. */
export type SheetRead = { kind: 'table'; preview: TablePreview } | { kind: 'statement'; result: ParseResult };

let sharesPromise: Promise<SharesFile | null> | null = null;

/** The published share names list, fetched once and only when a statement names companies without ISINs. */
function loadShares(): Promise<SharesFile | null> {
  sharesPromise ??= fetch('./prices/shares.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: SharesFile | null) => (j && j.byName && j.bySymbol ? j : null))
    .catch(() => null)
    .then((j) => { if (!j) sharesPromise = null; return j; }); // a failed fetch is tried again on the next file
  return sharesPromise;
}

const LOCKED = 'This spreadsheet is password-protected, so it cannot be read here. Open it in Excel or Numbers with its password, save a copy as .xlsx, and import that copy.';

const LOCKED_XLS = 'This .xls file could not be read: it may be password-protected or damaged. Open it in Excel or Numbers, save a copy as .xlsx, and import that copy.';

/**
 * An old binary .xls workbook as rows of cells, read with SheetJS (pinned to the build from cdn.sheetjs.com, since the
 * npm copy is out of date and has known flaws). Loaded only when a .xls file is opened. Formulas, styles and HTML are
 * not read; a merged cell's value sits in its first cell, as in an .xlsx.
 */
async function readXls(file: File): Promise<{ sheet: string; data: unknown[][] }[]> {
  try {
    return await xlsRows(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error(LOCKED_XLS);
  }
}

/**
 * A .xls workbook's sheets as rows. Dates come back at midnight UTC: the cells' text takes the date with toISOString,
 * so a local-midnight date would read a day early east of Greenwich (in India, 18:30 the day before).
 */
export async function xlsRows(bytes: Uint8Array): Promise<{ sheet: string; data: unknown[][] }[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false, UTC: true });
  return wb.SheetNames.map((n) => ({ sheet: n, data: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n]!, { header: 1, raw: true, defval: '', UTC: true }) }));
}

export async function readSpreadsheet(file: File): Promise<SheetRead> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    let sheets: { sheet: string; data: unknown[][] }[];
    if (name.endsWith('.xls')) sheets = await readXls(file);
    else {
      if (isEncryptedOffice(new Uint8Array(await file.slice(0, 8).arrayBuffer()))) throw new Error(LOCKED);
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      sheets = (await readXlsxFile(file)).map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] }));
    }
    if (isZerodhaTaxPnl(sheets)) return { kind: 'statement', result: parseZerodhaTaxPnl(sheets) };
    if (isZerodhaHoldings(sheets)) return { kind: 'statement', result: parseZerodhaHoldings(sheets) };
    if (isAngelTrades(sheets)) return { kind: 'statement', result: resolveNames(parseAngelTrades(sheets), await loadShares()) };
    if (isAngelFundHoldings(sheets)) return { kind: 'statement', result: parseAngelFundHoldings(sheets) };
    const sold = soldLots(sheets.map((s) => ({ sheet: s.sheet, rows: s.data.map((r) => r.map(cellText)) })));
    if (sold) return sold;
    const previews = sheets.map((s) => previewRows(s.data));
    return { kind: 'table', preview: previews.find((p) => p.kind !== 'unknown') ?? previews[0] ?? previewRows([]) };
  }
  const text = await file.text();
  return soldLots([{ sheet: '', rows: parseCSV(text) }]) ?? { kind: 'table', preview: previewTable(text) };
}

/** Any broker's Tax P&L: read on its own when sure, else its table on the column screen; null when it isn't one. */
function soldLots(sheets: CellSheet[]): SheetRead | null {
  const read = readSoldLots(sheets);
  if (read.confidence === 'high') return { kind: 'statement', result: read.result };
  if (read.confidence === 'medium') return { kind: 'table', preview: read.preview };
  return null;
}

export const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
