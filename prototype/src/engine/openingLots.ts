import { addDays, addMonths } from './dates';
import type { ISODate, Paise, Qty, Txn } from './types';

/**
 * Units a holdings file says a member holds in one account. `ltQty` is the long-term part and `cost` the total at the
 * broker's average price; both come from a Zerodha holdings export.
 */
export interface HeldPosition {
  memberId: string; isin: string; account?: string; qty: Qty; ltQty?: Qty; cost?: Paise; asOf?: ISODate; source: string;
}

/**
 * Lots built from a holdings file's average cost are sized so their gain times (1 + this) fits the room: the average
 * can differ from the first-in-first-out cost the tax uses, and the cushion keeps an error from pushing gains past it.
 */
export const APPROX_MARGIN = 0.1;

const isTradebook = (t: Txn) => t.source.startsWith('Trade history');
const isTaxPnl = (t: Txn) => t.source.startsWith('Zerodha Tax P&L');
const key = (memberId: string, isin: string, account = '') => `${memberId}|${isin}|${account}`;

/**
 * The transactions the ledger should replay, worked out fresh on every compute so import order never matters:
 *
 * 1. Tax P&L exits are dropped for an account that also has tradebooks (they would count each sale twice).
 * 2. Where a holdings file gives cost and long-term units, the units the history cannot explain (bought before the
 *    oldest tradebook) become an opening lot dated before that history: long-term units at average cost, marked
 *    `approx` (usable for moves, with a cushion), and any short-term rest as a guessed lot. A guessed opening lot
 *    saved at import for the same holding is replaced.
 */
export function effectiveTxns(txns: Txn[], positions: HeldPosition[], asOf: ISODate): Txn[] {
  const tradebookAccounts = new Set(txns.filter(isTradebook).map((t) => `${t.memberId}|${t.account ?? ''}`));
  let out = txns.filter((t) => !(isTaxPnl(t) && tradebookAccounts.has(`${t.memberId}|${t.account ?? ''}`)));

  const usable = positions.filter((p) => p.cost != null && p.ltQty != null && p.qty > 0);
  const replaced = new Set(usable.map((p) => key(p.memberId, p.isin, p.account)));
  out = out.filter((t) => !(t.estimated && replaced.has(key(t.memberId, t.isin, t.account))));

  const added: Txn[] = [];
  for (const p of usable) {
    const ref = p.asOf ?? asOf;
    const history = out.filter((t) => t.memberId === p.memberId && t.isin === p.isin && (t.account ?? '') === (p.account ?? '') && t.date <= ref);
    const bought = history.filter((t) => t.side === 'buy').reduce((a, t) => a + t.qty, 0);
    const sold = history.filter((t) => t.side === 'sell').reduce((a, t) => a + t.qty, 0);
    const opening = p.qty - bought + sold;
    if (opening <= 0) continue;
    // First in, first out: this year's sales took the opening units first; of those still held, the file's
    // long-term count says how many are long-term. Sold units were older still, so long-term too.
    const soldFromOpening = Math.min(sold, opening);
    const heldOpening = opening - soldFromOpening;
    const ltHeld = Math.min(heldOpening, p.ltQty!);
    const ltQty = soldFromOpening + ltHeld;
    const stQty = heldOpening - ltHeld;
    const first = history.reduce<ISODate | null>((a, t) => (a == null || t.date < a ? t.date : a), null);
    const before = first ? addDays(first, -1) : addDays(ref, -1);
    const ltDate = [addMonths(ref, -13), before].sort()[0]!;
    const perUnit = p.cost! / p.qty;
    const base = { memberId: p.memberId, isin: p.isin, side: 'buy' as const, account: p.account ?? '', source: 'Holdings file (bought before your trade history)' };
    if (ltQty > 0) added.push({ ...base, id: `${key(p.memberId, p.isin, p.account)}|opening-lt`, date: ltDate, qty: ltQty, amount: Math.round(perUnit * ltQty), approx: true });
    if (stQty > 0) added.push({ ...base, id: `${key(p.memberId, p.isin, p.account)}|opening-st`, date: before, qty: stQty, amount: Math.round(perUnit * stQty), estimated: true });
  }
  const all = added.length ? [...out, ...added] : out;
  return withoutCounted(all);
}

const isGuessedOpening = (t: Txn) => !!t.estimated && t.source.startsWith('Opening balance');

/**
 * A guessed opening lot (a statement of current units, such as a demat CAS, with no history) for units another account
 * already explains: a demat CAS lists the same shares the broker files do, under its own account name. Each guessed lot
 * keeps only the units the member's other accounts do not hold, so they are not counted twice.
 */
function withoutCounted(txns: Txn[]): Txn[] {
  const guessed = txns.filter(isGuessedOpening);
  if (!guessed.length) return txns;
  const net = new Map<string, Qty>();
  for (const t of txns) {
    if (isGuessedOpening(t)) continue;
    const k = key(t.memberId, t.isin, t.account);
    net.set(k, (net.get(k) ?? 0) + (t.side === 'buy' ? t.qty : -t.qty));
  }
  const elsewhere = (t: Txn) => [...net].reduce((a, [k, q]) => (k.startsWith(`${t.memberId}|${t.isin}|`) && k !== key(t.memberId, t.isin, t.account) ? a + Math.max(0, q) : a), 0);
  const out: Txn[] = [];
  for (const t of txns) {
    if (!isGuessedOpening(t)) { out.push(t); continue; }
    const keep = t.qty - elsewhere(t);
    if (keep <= 0) continue;
    out.push(keep === t.qty ? t : { ...t, qty: keep, amount: Math.round((t.amount * keep) / t.qty) });
  }
  return out;
}
