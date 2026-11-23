import { normAccount, TRIMMING_HOLDINGS_SOURCES } from '../engine/openingLots';
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
 * A holding with a sale after the statement that the history could not match is skipped: the ledger never applied that
 * sale, so the count would be wrong, and its own warning already says older purchases are missing.
 * A broker holdings file lists one account: with the holding's `lots`, it is checked against that account's units only.
 * Pass the positions that count (`FamilyView.positions`), not every stored import's rows.
 */
export function unitMismatches(
  memberId: string,
  holdings: Array<{ isin: string; qty: Qty; ltQty: Qty; lots?: Array<{ account: string; qty: Qty; term: 'st' | 'lt' }> }>,
  txns: Txn[],
  positions: Array<{ memberId: string; isin: string; qty: Qty; ltQty?: Qty; asOf?: ISODate; source?: string; account?: string }>,
  oversold: Array<{ memberId: string; isin: string; date: ISODate }> = [],
): UnitMismatch[] {
  const out: UnitMismatch[] = [];
  for (const p of positions) {
    if (p.memberId !== memberId) continue;
    if (p.asOf && oversold.some((w) => w.memberId === memberId && w.isin === p.isin && w.date > p.asOf!)) continue;
    const whole = holdings.find((x) => x.isin === p.isin);
    const oneAccount = p.source != null && TRIMMING_HOLDINGS_SOURCES.includes(p.source) && whole?.lots != null;
    const inAccount = (a?: string) => !oneAccount || normAccount(a) === normAccount(p.account);
    const lots = whole?.lots?.filter((l) => inAccount(l.account)) ?? [];
    const h = oneAccount
      ? { qty: lots.reduce((a, l) => a + l.qty, 0), ltQty: lots.filter((l) => l.term === 'lt').reduce((a, l) => a + l.qty, 0) }
      : whole;
    const since = p.asOf
      ? txns.filter((t) => t.memberId === memberId && t.isin === p.isin && t.date > p.asOf! && inAccount(t.account)).reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0)
      : 0;
    const history = (h?.qty ?? 0) - since;
    const ltOff = since === 0 && p.ltQty != null && Math.abs((h?.ltQty ?? 0) - p.ltQty) > TOLERANCE;
    if (Math.abs(history - p.qty) > TOLERANCE) out.push({ isin: p.isin, statement: p.qty, history, asOf: p.asOf });
    else if (ltOff) out.push({ isin: p.isin, statement: p.qty, history, asOf: p.asOf, lt: { statement: p.ltQty!, history: h?.ltQty ?? 0 } });
  }
  return out;
}
