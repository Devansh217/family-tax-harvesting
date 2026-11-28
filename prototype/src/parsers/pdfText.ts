import type { PdfWord } from './pdfTable';

/** The slice of the pdf.js API used here, so the same code runs with the browser build and the Node legacy build. */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; password?: string; verbosity?: number; isEvalSupported?: boolean }): { promise: Promise<PdfDoc> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}
interface TextItem { str: string; transform: number[]; width: number }

export class PdfPasswordError extends Error {
  constructor(public readonly wrong: boolean) {
    super(wrong ? 'That password did not open the PDF.' : 'This PDF is password protected.');
  }
}

/** Every page's text items as positioned words, from one open of the document. */
export async function extractItems(pdfjs: PdfJsLike, data: Uint8Array, password?: string): Promise<PdfWord[][]> {
  let doc: PdfDoc;
  try {
    // A statement PDF is untrusted input: never let pdf.js compile code from it (CVE-2024-4367 was this path).
    doc = await pdfjs.getDocument({ data, password, verbosity: 0, isEvalSupported: false }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw e;
  }
  const pages: PdfWord[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push((content.items as TextItem[])
      .filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
      .map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]!, width: i.width })));
  }
  return pages;
}

/** Rebuilds visual lines: items with the same baseline (within 2pt) are joined left to right. */
export function linesOf(pages: PdfWord[][]): string[] {
  const lines: string[] = [];
  for (const items of pages) {
    const rows: { y: number; parts: PdfWord[] }[] = [];
    for (const it of items) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
      if (row) row.parts.push(it);
      else rows.push({ y: it.y, parts: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      let text = '', lastEnd = -Infinity;
      for (const it of r.parts) {
        text += text && it.x - lastEnd > 1 ? '  ' : '';
        text += it.str;
        lastEnd = it.x + it.width;
      }
      lines.push(text.trim());
    }
  }
  return lines;
}

export async function extractLines(pdfjs: PdfJsLike, data: Uint8Array, password?: string): Promise<string[]> {
  return linesOf(await extractItems(pdfjs, data, password));
}
