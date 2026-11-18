import { QTY_SCALE, type Paise, type Qty } from '../engine/types';
import { isSaleRow, type CgSchedule } from '../engine/cgSchedule';

/** Rupees with 2 decimals and no grouping or symbol, so spreadsheets read it as a number. */
export const rupees2 = (p: Paise): string => {
  const a = Math.abs(p);
  return `${p < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};

/** Units with up to 3 decimals, no trailing zeros. */
export const units3 = (q: Qty): string => {
  const n = Math.round((q / QTY_SCALE) * 1000) / 1000;
  return String(n);
};

/** RFC 4180: quote a field that holds a comma, quote or line break; double any quote. */
export const csvField = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Text that starts with = + - @ would run as a formula in a spreadsheet: a leading quote makes it plain text. */
export const textCell = (s: string): string => (/^[=+\-@]/.test(s) ? `'${s}` : s);

export const CSV_HEADER = ['Section', 'ISIN', 'Name', 'Units', 'Sale date', 'Sale value (₹)', 'Cost for tax (₹)', '31 Jan 2018 value (₹)', 'Gain (₹)'];

export function scheduleCsv(s: CgSchedule): string {
  const lines = [CSV_HEADER.map(csvField).join(',')];
  for (const sec of s.sections) {
    for (const r of sec.rows) {
      const sale = isSaleRow(r);
      lines.push([
        textCell(sec.title), sale ? r.isin : '', textCell(r.name), sale ? units3(r.units) : '', sale ? r.saleDate : '', sale ? rupees2(r.saleValue) : '', sale ? rupees2(r.cost) : '',
        r.fmv2018 != null ? rupees2(r.fmv2018) : '', rupees2(r.gain),
      ].map(csvField).join(','));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

export const scheduleFileName = (memberName: string): string => {
  const slug = memberName.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'member';
  return `capital-gains-${slug}-2026-27.csv`;
};
