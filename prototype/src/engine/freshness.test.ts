import { describe, expect, it } from 'vitest';
import { QTY_SCALE, type Txn } from './types';
import type { HeldPosition } from './openingLots';
import { OLD_DATA_DAYS, accountKey, isOld, newestEvidence } from './freshness';

const buy = (date: string, source: string, account: string): Txn => ({
  id: `${source}|${date}`, memberId: 'a', isin: 'INE000A01010', date, side: 'buy', qty: QTY_SCALE, amount: 100_00, source, account,
});
const held = (asOf: string | undefined, account = ' zerodha '): HeldPosition => ({
  memberId: 'a', isin: 'INE000A01010', account, qty: QTY_SCALE, asOf, source: 'Zerodha holdings',
});
const pnl = (from: string | null, to: string | null, account = 'Zerodha') => ({ memberId: 'a', account, importId: `${from}${to}`, summary: { from, to } });

describe('newest evidence per account', () => {
  it('takes the latest of holdings file, last tradebook trade and P&L end', () => {
    const m = newestEvidence({
      txns: [buy('2026-03-31', 'Trade history (Zerodha)', 'Zerodha')],
      positions: [held('2026-04-15')],
      brokerSummaries: [pnl('2026-04-01', '2026-06-30')],
    });
    expect(m.get('a|zerodha')).toBe('2026-06-30');
    expect(m.size).toBe(1);
  });

  it('ignores undated holdings, non-tradebook txns and P&Ls with no end', () => {
    const m = newestEvidence({
      txns: [buy('2026-05-01', 'test', 'Zerodha')],
      positions: [held(undefined)],
      brokerSummaries: [pnl('2026-04-01', null)],
    });
    expect(m.size).toBe(0);
  });

  it('ignores a superseded P&L and an older holdings file', () => {
    const pnls = newestEvidence({ txns: [], brokerSummaries: [pnl('2026-04-01', '2026-09-30'), pnl('2026-04-01', '2026-06-30')] });
    expect(pnls.get('a|zerodha')).toBe('2026-09-30');
    const files = newestEvidence({ txns: [], positions: [held('2026-05-01'), held('2026-03-01')] });
    expect(files.get('a|zerodha')).toBe('2026-05-01');
  });

  it('a fund CAS alone dates its account', () => {
    const m = newestEvidence({ txns: [buy('2026-01-15', 'Mutual fund CAS (CAMS / KFintech)', 'Folio 123/45'), buy('2026-03-31', 'Mutual fund CAS (CAMS / KFintech)', 'Folio 123/45')] });
    expect(m.get(accountKey('a', 'Folio 123/45'))).toBe('2026-03-31');
    expect(isOld('2026-03-31', '2026-11-24')).toBe(true);
  });

  it('a combined CAS dates its folio accounts too', () => {
    const m = newestEvidence({ txns: [buy('2026-03-31', 'Combined CAS', 'Folio 123/45')] });
    expect(m.get(accountKey('a', 'Folio 123/45'))).toBe('2026-03-31');
  });

  it('isOld: 29 days is not old, 30 is', () => {
    expect(OLD_DATA_DAYS).toBe(30);
    expect(isOld('2026-10-16', '2026-11-14')).toBe(false);
    expect(isOld('2026-10-15', '2026-11-14')).toBe(true);
  });
});
