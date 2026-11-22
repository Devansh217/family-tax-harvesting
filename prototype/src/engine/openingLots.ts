import { addDays, addMonths } from './dates';
import type { ISODate, Paise, Qty, Txn } from './types';

/**
 * Units a holdings file says a member holds in one account. `ltQty` is the long-term part and `cost` the total at the
 * broker's average price; both come from a Zerodha holdings export.
 */
export interface HeldPosition {
  memberId: string; isin: string; account?: string; qty: Qty; ltQty?: Qty; cost?: Paise; asOf?: ISODate; source: string;
  /** The import it came from: ties a statement to the guessed lots it saved. */
  importId?: string;
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
  return withSnapshots(all, positions, asOf);
}

/** A demat CAS (NSDL / CDSL) lists every demat holding of the PAN, across brokers: a snapshot, not one more account. */
// Shares (INE…) saved from a combined CAS before its demat rows were marked are demat rows too: a fund folio holds no shares.
const isDematSnapshot = (p: HeldPosition) => p.source.startsWith('Demat CAS') || (p.source.startsWith('Combined CAS') && p.isin.startsWith('INE'));
/** A platform's fund statement (Angel One) lists units held in folios; the fund CAS's folio purchases explain them. */
const isFundSnapshot = (p: HeldPosition) => p.source.startsWith('Angel One fund holdings');
const isSnapshot = (p: HeldPosition) => isDematSnapshot(p) || isFundSnapshot(p);
const SNAPSHOT_ACCOUNT = 'Demat (CAS)';
/** Units in a fund folio (from a fund CAS): a demat CAS never lists them, so they explain none of its units. */
const isFolio = (t: Txn) => t.source.startsWith('Mutual fund CAS') || t.source.startsWith('Combined CAS');

/**
 * Units a demat CAS shows that no other account explains on the statement's date. Its guessed lots saved at import
 * (ids `member|isin|opening|importId`) are dropped, older statements' too, and replaced by one guessed lot of the
 * difference. Everything else held then counts: trades, holdings-file lots, other files' guessed lots.
 */
function withSnapshots(txns: Txn[], positions: HeldPosition[], asOf: ISODate): Txn[] {
  const snaps = positions.filter((p) => isSnapshot(p) && p.qty > 0);
  if (!snaps.length) return txns;
  const snapOf = (t: Txn) => (t.estimated && t.id.includes('|opening|')
    ? snaps.find((p) => p.memberId === t.memberId && p.isin === t.isin && ((t.account ?? '') === (p.account || SNAPSHOT_ACCOUNT) || t.id.endsWith(`|opening|${p.importId}`)))
    : undefined);
  const saved = new Map<HeldPosition, Txn>();
  const rest: Txn[] = [];
  for (const t of txns) {
    const p = snapOf(t);
    if (!p) { rest.push(t); continue; }
    if (!saved.has(p) || t.id.endsWith(`|opening|${p.importId}`)) saved.set(p, t);
  }
  const added: Txn[] = [];
  for (const p of snaps) {
    const ref = p.asOf ?? asOf;
    const explained = rest
      .filter((t) => t.memberId === p.memberId && t.isin === p.isin && t.date <= ref && !(isDematSnapshot(p) && isFolio(t)))
      .reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0);
    const keep = p.qty - Math.max(0, explained);
    const lot = saved.get(p);
    if (keep <= 0 || !lot) continue;
    added.push({ ...lot, qty: keep, amount: Math.round((lot.amount * keep) / lot.qty) });
  }
  return added.length ? [...rest, ...added] : rest;
}
