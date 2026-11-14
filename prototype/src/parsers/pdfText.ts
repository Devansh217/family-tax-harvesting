/** The slice of the pdf.js API used here, so the same code runs with the browser build and the Node legacy build. */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; password?: string; verbosity?: number }): { promise: Promise<PdfDoc> };
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

/** Rebuilds visual lines: items with the same baseline (within 2pt) are joined left to right. */
export async function extractLines(pdfjs: PdfJsLike, data: Uint8Array, password?: string): Promise<string[]> {
  let doc: PdfDoc;
  try {
    doc = await pdfjs.getDocument({ data, password, verbosity: 0 }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw e;
  }
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((i) => typeof i.str === 'string' && i.str.trim() !== '');
    const rows: { y: number; parts: TextItem[] }[] = [];
    for (const it of items) {
      const y = it.transform[5]!;
      const row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (row) row.parts.push(it);
      else rows.push({ y, parts: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.transform[4]! - b.transform[4]!);
      let text = '', lastEnd = -Infinity;
      for (const it of r.parts) {
        const x = it.transform[4]!;
        text += text && x - lastEnd > 1 ? '  ' : '';
        text += it.str;
        lastEnd = x + it.width;
      }
      lines.push(text.trim());
    }
  }
  return lines;
}
