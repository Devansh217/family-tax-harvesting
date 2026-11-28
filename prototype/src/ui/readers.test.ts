import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cellText } from '../parsers';
import { xlsRows } from './readers';

describe('xlsRows', () => {
  const tz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Asia/Kolkata'; }); // east of Greenwich, where a local-midnight date reads a day early
  afterAll(() => { process.env.TZ = tz; });

  it('reads a date cell as the date it shows, not the day before', async () => {
    // Serial 46213 is 10 Jul 2026.
    const ws: XLSX.WorkSheet = { A1: { t: 'n', v: 46213, z: 'dd-mmm-yyyy' }, '!ref': 'A1' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions Summary');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'biff8' }) as ArrayBuffer);
    const [sheet] = await xlsRows(bytes);
    expect(cellText(sheet!.data[0]![0])).toBe('2026-07-10');
  });
});
