import type { ISODate, Qty, Txn } from '../engine/types';

export interface UnitMismatch {
  isin: string; statement: Qty; history: Qty; asOf?: ISODate;
  /** Set when only the long-term count differs: the statement's and the history's long-term units. */
  lt?: { statement: Qty; history: Qty };
}

/** Small gaps (under 0.001 unit) are rounding in the statements. */
const TOLERANCE = 10;

/**
 * Statements whose units differ from what the history gives. A statement is a snapshot on its date, so trades after
 * that date are taken off today's units before comparing: a sale or purchase since then is not a mismatch.
 * Long-term units are compared only when nothing has traded since (the history cannot say which lots a later trade took).
 */
export function unitMismatches(
  memberId: string,
  holdings: Array<{ isin: string; qty: Qty; ltQty: Qty }>,
  txns: Txn[],
  positions: Array<{ memberId: string; isin: string; qty: Qty; ltQty?: Qty; asOf?: ISODate }>,
): UnitMismatch[] {
  const out: UnitMismatch[] = [];
  for (const p of positions) {
    if (p.memberId !== memberId) continue;
    const h = holdings.find((x) => x.isin === p.isin);
    const since = p.asOf
      ? txns.filter((t) => t.memberId === memberId && t.isin === p.isin && t.date > p.asOf!).reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0)
      : 0;
    const history = (h?.qty ?? 0) - since;
    const ltOff = since === 0 && p.ltQty != null && Math.abs((h?.ltQty ?? 0) - p.ltQty) > TOLERANCE;
    if (Math.abs(history - p.qty) > TOLERANCE) out.push({ isin: p.isin, statement: p.qty, history, asOf: p.asOf });
    else if (ltOff) out.push({ isin: p.isin, statement: p.qty, history, asOf: p.asOf, lt: { statement: p.ltQty!, history: h?.ltQty ?? 0 } });
  }
  return out;
}
