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
  /** True when the file may trim lots: it had a readable date and no row was skipped or left without an ISIN. */
  canTrim?: boolean;
}

/** Holdings files that list every unit held, so the engine may trim lots to match them. */
export const TRIMMING_HOLDINGS_SOURCES = ['Zerodha holdings'];

/**
 * Lots built from a holdings file's average cost are sized so their gain times (1 + this) fits the room: the average
 * can differ from the first-in-first-out cost the tax uses, and the cushion keeps an error from pushing gains past it.
 */
export const APPROX_MARGIN = 0.1;

const isTradebook = (t: Txn) => t.source.startsWith('Trade history');
const isTaxPnl = (t: Txn) => t.source.startsWith('Zerodha Tax P&L');
const key = (memberId: string, isin: string, account = '') => `${memberId}|${isin}|${account}`;

/** Account labels are free text: one account matches whatever the spaces and case. */
export const normAccount = (a?: string): string => (a ?? '').trim().toLowerCase();

/** The holdings file that decides what a member holds in one account. */
export interface DecidingFile { importId: string; asOf: ISODate; canTrim: boolean; positions: HeldPosition[] }

/**
 * Per member and account (`member|normAccount(account)`), the holdings file that decides what is held there: the one
 * with the latest date, and on a tie the import that came last. Only that file's positions count for the account.
 * Undated files never decide. A blank account label never trims.
 */
export function decidingFiles(positions: HeldPosition[]): Map<string, DecidingFile> {
  const best = new Map<string, { importId: string; asOf: ISODate }>();
  for (const p of positions) {
    if (!TRIMMING_HOLDINGS_SOURCES.includes(p.source) || !p.asOf) continue;
    const k = `${p.memberId}|${normAccount(p.account)}`;
    const b = best.get(k);
    if (!b || p.asOf >= b.asOf) best.set(k, { importId: p.importId ?? '', asOf: p.asOf });
  }
  const out = new Map<string, DecidingFile>();
  for (const [k, b] of best) {
    const mine = positions.filter((p) => TRIMMING_HOLDINGS_SOURCES.includes(p.source) && `${p.memberId}|${normAccount(p.account)}` === k && (p.importId ?? '') === b.importId && p.asOf === b.asOf);
    out.set(k, { ...b, canTrim: !k.endsWith('|') && mine.every((p) => p.canTrim === true), positions: mine });
  }
  return out;
}

/** Shares in an account's history that its newest holdings file doesn't list (or lists fewer of): they left the account. */
export interface TrimNote { memberId: string; account: string; asOf: ISODate; isins: string[] }

/** The transactions the ledger should replay. See `effectiveTxnsWithNotes`. */
export function effectiveTxns(txns: Txn[], positions: HeldPosition[], asOf: ISODate): Txn[] {
  return effectiveTxnsWithNotes(txns, positions, asOf).txns;
}

/**
 * The transactions the ledger should replay, worked out fresh on every compute so import order never matters:
 *
 * 1. Tax P&L exits are dropped for an account that also has tradebooks (they would count each sale twice).
 * 2. Where a holdings file gives cost and long-term units, the units the history cannot explain (bought before the
 *    oldest tradebook) become an opening lot dated before that history: long-term units at average cost, marked
 *    `approx` (usable for moves, with a cushion), and any short-term rest as a guessed lot. A guessed opening lot
 *    saved at import for the same holding is replaced. Where an account has a deciding holdings file, only its
 *    positions fill in.
 * 3. Units the history holds on the deciding file's date beyond what the file lists left the account: a `left` sell
 *    removes them, oldest first, with no gain. Only when the file may trim and is not older than the account's last
 *    trade (Tax P&L exits aside); a file older than that is returned in `staleFiles` instead.
 */
export function effectiveTxnsWithNotes(
  txns: Txn[], positions: HeldPosition[], asOf: ISODate,
): { txns: Txn[]; trimmed: TrimNote[]; staleFiles: Array<{ memberId: string; account: string; asOf: ISODate }> } {
  const tradebookAccounts = new Set(txns.filter(isTradebook).map((t) => `${t.memberId}|${t.account ?? ''}`));
  let out = txns.filter((t) => !(isTaxPnl(t) && tradebookAccounts.has(`${t.memberId}|${t.account ?? ''}`)));

  const files = decidingFiles(positions);
  const acctKey = (memberId: string, account?: string) => `${memberId}|${normAccount(account)}`;
  // An older file's positions for an account with a newer dated file count for nothing.
  const counts = (p: HeldPosition) => {
    const f = TRIMMING_HOLDINGS_SOURCES.includes(p.source) ? files.get(acctKey(p.memberId, p.account)) : undefined;
    return !f || f.positions.includes(p);
  };
  const usable = positions.filter((p) => p.cost != null && p.ltQty != null && p.qty > 0 && counts(p));
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
  const filled = added.length ? [...out, ...added] : out;
  const { left, trimmed, staleFiles } = unitsThatLeft(out, filled, files);
  return { txns: withSnapshots(left.length ? [...filled, ...left] : filled, positions, asOf), trimmed, staleFiles };
}

/** A trade the family made: not a saved guess, not a Tax P&L exit. These date the account's last trade. */
const isRealTrade = (t: Txn) => !isTaxPnl(t) && !t.id.includes('|opening') && !t.left;

/**
 * The `left` sells that bring each account down to its deciding file. `trades` are the imported transactions (to
 * find the account's last trade), `held` the same plus the units filled in from holdings files.
 */
function unitsThatLeft(trades: Txn[], held: Txn[], files: Map<string, DecidingFile>) {
  const left: Txn[] = [];
  const trimmed: TrimNote[] = [];
  const staleFiles: Array<{ memberId: string; account: string; asOf: ISODate }> = [];
  for (const [k, f] of files) {
    if (!f.canTrim) continue;
    const memberId = f.positions[0]!.memberId;
    const account = f.positions[0]!.account ?? '';
    const inAccount = (t: Txn) => `${t.memberId}|${normAccount(t.account)}` === k;
    const last = trades.filter((t) => inAccount(t) && isRealTrade(t)).reduce<ISODate>((a, t) => (t.date > a ? t.date : a), '');
    if (last > f.asOf) { staleFiles.push({ memberId, account, asOf: f.asOf }); continue; }
    // Units held on the file's date, per security and exact account label (the ledger keeps one queue per label).
    const units = new Map<string, Map<string, { qty: Qty; first: ISODate }>>();
    for (const t of held) {
      if (!inAccount(t) || t.date > f.asOf) continue;
      const byLabel = units.get(t.isin) ?? new Map<string, { qty: Qty; first: ISODate }>();
      units.set(t.isin, byLabel);
      const label = t.account ?? '';
      const u = byLabel.get(label) ?? { qty: 0, first: t.date };
      u.qty += t.side === 'buy' ? t.qty : -t.qty;
      if (t.side === 'buy' && t.date < u.first) u.first = t.date;
      byLabel.set(label, u);
    }
    const isins: string[] = [];
    for (const [isin, byLabel] of units) {
      const listed = f.positions.filter((p) => p.isin === isin).reduce((a, p) => a + p.qty, 0);
      let extra = [...byLabel.values()].reduce((a, u) => a + u.qty, 0) - listed;
      if (extra <= 0) continue;
      isins.push(isin);
      // Oldest units first, across labels that differ only in spaces or case.
      for (const [label, u] of [...byLabel].sort((a, b) => a[1].first.localeCompare(b[1].first))) {
        const qty = Math.min(extra, u.qty);
        if (qty <= 0) continue;
        left.push({ id: `${memberId}|${isin}|${label}|left|${f.asOf}`, memberId, isin, account: label, side: 'sell', left: true, qty, amount: 0, date: f.asOf, source: 'Left the account' });
        extra -= qty;
        if (extra <= 0) break;
      }
    }
    if (isins.length) trimmed.push({ memberId, account, asOf: f.asOf, isins });
  }
  return { left, trimmed, staleFiles };
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
      .filter((t) => t.memberId === p.memberId && t.isin === p.isin && t.date <= ref && (isDematSnapshot(p) ? !isFolio(t) : isFolio(t)))
      .reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0);
    const keep = p.qty - Math.max(0, explained);
    const lot = saved.get(p);
    if (keep <= 0 || !lot) continue;
    added.push({ ...lot, qty: keep, amount: Math.round((lot.amount * keep) / lot.qty) });
  }
  return added.length ? [...rest, ...added] : rest;
}
