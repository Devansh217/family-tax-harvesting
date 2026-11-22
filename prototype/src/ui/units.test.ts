import { describe, expect, it } from 'vitest';
import type { Txn } from '../engine/types';
import { unitMismatches } from './units';

const q = (n: number) => n * 10_000;
const t = (side: 'buy' | 'sell', date: string, units: number, over: Partial<Txn> = {}): Txn => ({
  id: `${side}${date}${units}`, memberId: 'a', isin: 'X', date, side, qty: q(units), amount: units * 100_00, source: 'Trade history · tb', ...over,
});
const held = (units: number, ltUnits = 0) => [{ isin: 'X', qty: q(units), ltQty: q(ltUnits) }];
const pos = (units: number, asOf?: string, ltUnits?: number) => ({ memberId: 'a', isin: 'X', qty: q(units), asOf, source: 'Demat CAS (NSDL / CDSL)', ...(ltUnits == null ? {} : { ltQty: q(ltUnits) }) });

describe('statement units against the history', () => {
  it('a sale after the statement date is not a mismatch', () => {
    expect(unitMismatches('a', held(0), [t('sell', '2026-11-05', 15)], [pos(15, '2026-10-31')])).toEqual([]);
  });

  it('a purchase after the statement date is not a mismatch', () => {
    expect(unitMismatches('a', held(73), [t('buy', '2026-11-10', 10)], [pos(63, '2026-10-31')])).toEqual([]);
  });

  it('still flags units the history does not explain, with the units held on the statement date', () => {
    expect(unitMismatches('a', held(41), [t('buy', '2026-11-10', 9)], [pos(50, '2026-10-31')])).toMatchObject([{ isin: 'X', statement: q(50), history: q(32) }]);
  });

  it('a statement without a date is compared with today', () => {
    expect(unitMismatches('a', held(40), [], [pos(50)])).toMatchObject([{ statement: q(50), history: q(40) }]);
  });

  it('checks long-term units only when nothing traded since the statement', () => {
    expect(unitMismatches('a', held(50, 20), [], [pos(50, undefined, 50)])).toMatchObject([{ statement: q(50), history: q(50), lt: { statement: q(50), history: q(20) } }]);
    expect(unitMismatches('a', held(60, 20), [t('buy', '2026-11-10', 10)], [pos(50, '2026-10-31', 50)])).toEqual([]);
  });

  it('ignores other members', () => {
    expect(unitMismatches('b', held(0), [], [pos(50)])).toEqual([]);
  });
});
