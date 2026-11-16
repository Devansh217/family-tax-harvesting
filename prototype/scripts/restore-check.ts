/** The pass/fail rule of the restore test, kept pure so it is tested (scripts/restore-check.test.ts). */
export function checkRestore(restoredCount: number, liveCount: number, opened: boolean): { ok: boolean; message: string } {
  if (restoredCount === 0) return { ok: false, message: 'the backup holds no families' };
  if (restoredCount !== liveCount) return { ok: false, message: `restored ${restoredCount} families but the live project has ${liveCount}` };
  if (!opened) return { ok: false, message: 'a restored family did not open with the family key' };
  return { ok: true, message: `families=${restoredCount}, one opened with the family key` };
}

/** Rows of a PostgreSQL COPY text block (tab-separated, backslash escapes), as `pg_restore --data-only` prints them. */
export function copyRows(text: string, table: string): string[][] {
  const start = text.indexOf(`COPY public.${table} `);
  if (start < 0) return [];
  const lines = text.slice(text.indexOf('\n', start) + 1).split('\n');
  const rows: string[][] = [];
  for (const line of lines) {
    if (line === '\\.') break;
    rows.push(line.split('\t').map((f) => f.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))));
  }
  return rows;
}
