import { describe, expect, it } from 'vitest';
import { QTY_SCALE, type Txn } from './types';
import type { HeldPosition } from './openingLots';
import { OLD_DATA_DAYS, accountKey, isOld, newestEvidence, newestRoomEvidence } from './freshness';

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

  it('room evidence leaves out holdings files: they date the units, not gains booked since', () => {
    const state = {
      txns: [buy('2026-03-31', 'Trade history (Zerodha)', 'Zerodha'), buy('2026-02-01', 'Mutual fund CAS (CAMS / KFintech)', 'Folio 123/45')],
      positions: [held('2026-11-20'), held('2026-11-20', 'Angel One')],
      brokerSummaries: [pnl('2026-04-01', '2026-06-30', 'Upstox')],
    };
    const room = newestRoomEvidence(state);
    expect(room.get('a|zerodha')).toBe('2026-03-31');
    expect(room.get(accountKey('a', 'Folio 123/45'))).toBe('2026-02-01');
    expect(room.get('a|upstox')).toBe('2026-06-30');
    expect(room.has('a|angel one')).toBe(false);
    expect(newestEvidence(state).get('a|zerodha')).toBe('2026-11-20');
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

describe('a fund statement is dated by its period end', () => {
  const F = 'Folio 1234567/89';
  const fundBuy = buy('2025-06-01', 'Mutual fund CAS (CAMS / KFintech)', F);
  const st = (statementFrom: string, statementTo: string, accounts = [F, 'Folio 7654321']) => ({ memberId: 'a', statementFrom, statementTo, accounts });
  const at = (m: Map<string, string>, folio = F) => m.get(accountKey('a', folio));

  it('a statement from before the first trade dates the folio in both maps', () => {
    const imports = [st('2020-04-01', '2026-11-15')];
    for (const m of [newestEvidence({ txns: [fundBuy], imports }), newestRoomEvidence({ txns: [fundBuy], imports })]) expect(at(m)).toBe('2026-11-15');
  });

  it('a folio with no trades in any file is not dated by a statement alone', () => {
    expect(at(newestEvidence({ txns: [fundBuy], imports: [st('2020-04-01', '2026-11-15')] }), 'Folio 7654321')).toBeUndefined();
  });

  it('a statement that leaves a gap after the earlier evidence does not date the folio', () => {
    for (const imports of [[st('2020-04-01', '2026-06-30'), st('2026-11-01', '2026-11-15')], [st('2026-11-01', '2026-11-15'), st('2020-04-01', '2026-06-30')]]) {
      expect(at(newestRoomEvidence({ txns: [fundBuy], imports }))).toBe('2026-06-30');
    }
  });

  it('back-to-back monthly statements carry the date forward, in any import order', () => {
    const chain = [st('2020-04-01', '2026-09-30'), st('2026-10-01', '2026-10-31'), st('2026-11-01', '2026-11-30')];
    expect(at(newestRoomEvidence({ txns: [fundBuy], imports: chain }))).toBe('2026-11-30');
    expect(at(newestRoomEvidence({ txns: [fundBuy], imports: [...chain].reverse() }))).toBe('2026-11-30');
  });

  it('an import saved before the period was read dates by its transactions as before', () => {
    expect(at(newestEvidence({ txns: [fundBuy], imports: [{ memberId: 'a' }] }))).toBe('2025-06-01');
  });
});
