import { guessMapping } from './table';

/** One pdf.js text item: its text, left edge, baseline and width, in PDF points. */
export interface PdfWord { str: string; x: number; y: number; width: number }

interface Word { s: string; x: number; end: number }

const NUMBER = /^[-(]?₹?\s?[\d,]+(\.\d+)?\)?%?$/;
const DATE = /^\d{1,2}[-/ ](\d{1,2}|[A-Za-z]{3})[-/ ]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/;
const ISIN = /\bIN[A-Z0-9]{10}\b/;
const isNumberish = (s: string) => NUMBER.test(s) || DATE.test(s);

/** Words on one baseline (within 2pt) make a line, top to bottom, pages in order; touching items join into one word. */
function lines(pages: PdfWord[][]): Word[][] {
  const out: Word[][] = [];
  for (const page of pages) {
    const rows: { y: number; words: PdfWord[] }[] = [];
    for (const w of page) {
      if (!w.str.trim()) continue;
      const row = rows.find((r) => Math.abs(r.y - w.y) <= 2);
      if (row) row.words.push(w);
      else rows.push({ y: w.y, words: [w] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.words.sort((a, b) => a.x - b.x);
      const line: Word[] = [];
      for (const w of r.words) {
        const last = line[line.length - 1];
        // pdf.js may split one cell into runs that touch; a visible gap means a new cell.
        if (last && w.x - last.end <= 1) { last.s += w.str; last.end = w.x + w.width; }
        else line.push({ s: w.str, x: w.x, end: w.x + w.width });
      }
      for (const w of line) w.s = w.s.trim();
      out.push(line.filter((w) => w.s));
    }
  }
  return out.filter((l) => l.length);
}

/** A header line: no numbers, and its words name a name or ISIN column plus at least two other known columns. */
function looksLikeHeader(line: Word[]): boolean {
  if (line.length < 3 || line.some((w) => isNumberish(w.s))) return false;
  const m = guessMapping(line.map((w) => w.s));
  const mapped = Object.values(m).filter((i) => i >= 0).length;
  return (m.isin >= 0 || m.symbol >= 0) && mapped >= 3;
}

/**
 * Positioned PDF words → rows of text cells, the same shape an Excel sheet gives, for the sold-lots reader. A header
 * line sets the columns at its words' left edges; header text wrapped onto the next lines joins it. Each later word
 * goes under the column that starts at or just left of it. A single word left of the columns (or any single word
 * outside a table) is a section title. A text-only line under a row is a wrapped cell and joins that row.
 */
export function pdfRows(pages: PdfWord[][]): string[][] {
  const out: string[][] = [];
  let cols: number[] | null = null;
  let header: string[] | null = null; // still open to wrapped header text
  let last: string[] | null = null; // the row a wrapped cell may join

  const place = (line: Word[]): string[] => {
    const cells = cols!.map(() => '');
    for (const w of line) {
      let k = 0;
      cols!.forEach((x, i) => { if (x <= w.x + 4) k = i; });
      cells[k] = cells[k] ? `${cells[k]} ${w.s}` : w.s;
    }
    return cells;
  };

  const all = lines(pages);
  all.forEach((line, n) => {
    const texts = line.map((w) => w.s);
    // The second line of a wrapped header can name columns too ("Name", "Date"): it joins the header, not replaces it.
    if (header && !texts.some(isNumberish) && !(line.length === 1 && line[0]!.x < cols![0]! - 5)) {
      place(line).forEach((c, i) => { if (c) header![i] = header![i] ? `${header![i]} ${c}` : c; });
      return;
    }
    if (looksLikeHeader(line)) {
      cols = line.map((w) => w.x);
      header = [...texts];
      out.push(header);
      last = null;
      return;
    }
    const title = line.length === 1 && !isNumberish(texts[0]!) && (!cols || line[0]!.x < cols[0]! - 5 || (all[n + 1] != null && looksLikeHeader(all[n + 1]!)));
    if (!cols || title) {
      // Outside a table every line is kept word by word: a title, or label and value pairs the reader looks at.
      if (cols) { cols = null; header = null; last = null; }
      out.push(texts);
      return;
    }
    const cells = place(line);
    const numbers = texts.some(isNumberish);
    header = null;
    // A wrapped cell: text only, no ISIN, and only under columns that hold text in the row above.
    if (last && !numbers && !ISIN.test(texts.join(' ')) && cells.every((c, i) => !c || !isNumberish(last![i] ?? ''))) {
      cells.forEach((c, i) => { if (c) last![i] = last![i] ? `${last![i]} ${c}` : c; });
      return;
    }
    out.push(cells);
    last = cells;
  });
  return out;
}
