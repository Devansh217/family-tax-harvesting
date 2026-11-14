import { extractLines, previewRows, previewTable, type PdfJsLike, type TablePreview } from '../parsers';

let pdfjsPromise: Promise<PdfJsLike> | null = null;

/** pdf.js is loaded only when a PDF is opened, with its worker bundled locally (no CDN). */
function loadPdfJs(): Promise<PdfJsLike> {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfJsLike;
  });
  return pdfjsPromise;
}

export async function readPdfLines(file: File, password?: string): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  return extractLines(pdfjs, data, password);
}

export async function readSpreadsheet(file: File): Promise<TablePreview> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. Open it and save as .xlsx or CSV.');
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    const previews = sheets.map((s) => previewRows(s.data as unknown[][]));
    return previews.find((p) => p.kind !== 'unknown') ?? previews[0] ?? previewRows([]);
  }
  return previewTable(await file.text());
}

export const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
