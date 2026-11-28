import { addDays, addMonths, isLongTerm } from './dates';
import { normAccount, prorate } from './ledger';
import { rulesFor } from './rules';
import { QTY_SCALE, type ISODate, type Paise, type Qty, type Txn } from './types';

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

/** Holdings files that list every unit held: the engine fills in every row on each compute and may trim lots to match. */
export const TRIMMING_HOLDINGS_SOURCES = ['Zerodha holdings'];

/**
 * Lots built from a holdings file's average cost are sized so their gain times (1 + this) fits the room: the average
 * can differ from the first-in-first-out cost the tax uses, and the cushion keeps an error from pushing gains past it.
 */
export const APPROX_MARGIN = 0.1;

export const isTradebook = (t: Txn) => t.source.startsWith('Trade history');
/** A broker Tax P&L's sold lots: Zerodha's own reader, or the generic one for any broker (`Tax P&L · <broker> …`). */
const isTaxPnl = (t: Txn) => t.source.startsWith('Zerodha Tax P&L') || t.source.startsWith('Tax P&L · ');
const key = (memberId: string, isin: string, account = '') => `${memberId}|${isin}|${account}`;

/** Account labels are free text: one account matches whatever the spaces and case (defined in ledger.ts). */
export { normAccount };

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

/**
 * The positions that count: every statement's rows, but of the holdings files kept per import only the deciding file's
 * for each account (`decidingFiles`). A row from another file of that account counts only when it is that share's
 * newest row and the deciding file neither may trim nor lists the share (a file drops units only when it may trim).
 * Every consumer of saved positions (fill-in, unit checks, Plan gaps) uses these, never every stored import's rows.
 */
export function countingPositions<P extends HeldPosition>(positions: P[], files: Map<string, DecidingFile> = decidingFiles(positions)): P[] {
  const acctKey = (p: HeldPosition) => `${p.memberId}|${normAccount(p.account)}`;
  const isHoldingsFile = (p: HeldPosition) => TRIMMING_HOLDINGS_SOURCES.includes(p.source);
  // Per share and account, one holdings-file position at most: the newest (latest date, undated oldest; on a tie the
  // last import), so several files listing the same share never fill it in twice.
  const newest = new Map<string, HeldPosition>();
  for (const p of positions) {
    if (!isHoldingsFile(p)) continue;
    const k = `${acctKey(p)}|${p.isin}`;
    const b = newest.get(k);
    if (!b || (p.asOf ?? '') >= (b.asOf ?? '')) newest.set(k, p);
  }
  return positions.filter((p) => {
    if (!isHoldingsFile(p)) return true;
    const f = files.get(acctKey(p));
    if (f?.positions.includes(p)) return true;
    const onlyOne = newest.get(`${acctKey(p)}|${p.isin}`) === p;
    return onlyOne && (!f || (!f.canTrim && !f.positions.some((x) => x.isin === p.isin)));
  });
}

/** Shares in an account's history that its newest holdings file doesn't list (or lists fewer of): they left the account. */
export interface TrimNote { memberId: string; account: string; asOf: ISODate; isins: string[] }

/**
 * A share the history and its holdings file disagree on without a trade: `units` when the fill-in added or rescaled
 * units (a bonus, split or demerger credit), `cost` when only the history's cost was lowered to the file's.
 */
export interface CorporateActionNote { memberId: string; isin: string; account: string; kind: 'units' | 'cost' }

/** The transactions the ledger should replay. See `effectiveTxnsWithNotes`. */
export function effectiveTxns(txns: Txn[], positions: HeldPosition[], asOf: ISODate, securities: PricedSecurity[] = []): Txn[] {
  return effectiveTxnsWithNotes(txns, positions, asOf, securities).txns;
}

/** The latest price of a security, for guessed lots from a holdings row with no cost. */
export type PricedSecurity = { isin: string; price?: Paise };

/**
 * The transactions the ledger should replay, worked out fresh on every compute so import order never matters:
 *
 * 1. Tax P&L exits are dropped for an account that also has tradebooks (they would count each sale twice), except the
 *    sale of a buyback exit: a tender never shows in a tradebook.
 * 2. Units a holdings file lists that the history cannot explain on the file's date are filled in (`fillIn`). Where
 *    an account has a deciding holdings file, only its positions fill in; a holdings file with no date fills in as of
 *    today and never trims. Guessed lots saved at import for a holdings file, or for a holding filled in here, are
 *    dropped: the fill-in replaces them.
 * 3. Units the history holds on the deciding file's date beyond what the file lists left the account: a `left` sell
 *    removes them, oldest first, with no gain. Only when the file may trim and is not older than the account's last
 *    trade (Tax P&L exits aside); a file older than that is returned in `staleFiles` instead.
 */
export function effectiveTxnsWithNotes(
  txns: Txn[], positions: HeldPosition[], asOf: ISODate, securities: PricedSecurity[] = [],
): {
  txns: Txn[]; trimmed: TrimNote[]; staleFiles: Array<{ memberId: string; account: string; asOf: ISODate }>; corporateActions: CorporateActionNote[];
} {
  const tradebookAccounts = new Set(txns.filter(isTradebook).map((t) => `${t.memberId}|${t.account ?? ''}`));
  // A buyback tender never shows in a tradebook: its sale stays and takes the tradebook's lots first in first out
  // (its buy leg would count the units twice).
  let out = txns.filter((t) => !(isTaxPnl(t) && tradebookAccounts.has(`${t.memberId}|${t.account ?? ''}`) && !(t.buyback && t.side === 'sell')));

  const files = decidingFiles(positions);
  const isHoldingsFile = (p: HeldPosition) => TRIMMING_HOLDINGS_SOURCES.includes(p.source);
  const counting = countingPositions(positions, files);
  // Holdings files fill in every row; other statements only rows with cost and long-term units.
  const fills = counting.filter((p) => p.qty > 0 && (isHoldingsFile(p) || (p.cost != null && p.ltQty != null)));
  const holdingKey = (memberId: string, isin: string, account?: string) => `${memberId}|${isin}|${normAccount(account)}`;
  const replaced = new Set(fills.map((p) => holdingKey(p.memberId, p.isin, p.account)));
  const holdingsImports = new Set(positions.filter((p) => isHoldingsFile(p) && p.importId).map((p) => p.importId!));
  const savedByHoldingsFile = (t: Txn) => [...holdingsImports].some((id) => t.id === `${t.memberId}|${t.isin}|opening|${id}`);
  out = out.filter((t) => !(t.estimated && (replaced.has(holdingKey(t.memberId, t.isin, t.account)) || savedByHoldingsFile(t))));

  const prices = new Map(securities.map((x) => [x.isin, x.price]));
  const added: Txn[] = [];
  const corporateActions: CorporateActionNote[] = [];
  for (const p of fills) {
    const r = fillIn(out, p, p.asOf ?? asOf, prices.get(p.isin));
    if (r.scaled) out = out.map((t) => r.scaled!.get(t) ?? t);
    added.push(...r.lots);
    if (r.corporateAction) corporateActions.push({ memberId: p.memberId, isin: p.isin, account: p.account ?? '', kind: r.corporateAction });
  }
  const filled = added.length ? [...out, ...added] : out;
  const { left, trimmed, staleFiles } = unitsThatLeft(out, filled, files);
  return { txns: withSnapshots(left.length ? [...filled, ...left] : filled, positions, asOf), trimmed, staleFiles, corporateActions };
}

/** A split or consolidation: the file's units are a whole multiple (or fraction) of the history's, at its cost within this. */
const SPLIT_COST_TOLERANCE = 0.01;

/**
 * What the history still holds on the file's date, first in first out, after `older` units bought before it took the
 * first sales. `unmatched` counts units sold that nothing held.
 */
function replayHeld(history: Txn[], older: Qty, ref: ISODate): { qty: Qty; cost: Paise; ltQty: Qty; unmatched: Qty; lots: HeldPart[] } {
  const queue: Array<HeldPart & { older?: true }> = older > 0 ? [{ qty: older, cost: 0, date: '', older: true }] : [];
  let unmatched = 0;
  const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date) || (a.side === 'sell' ? 0 : 1) - (b.side === 'sell' ? 0 : 1));
  for (const t of ordered) {
    if (t.side === 'buy') { queue.push({ qty: t.qty, cost: t.amount, date: t.date, txn: t }); continue; }
    let remaining = t.qty;
    while (remaining > 0 && queue.length) {
      const lot = queue[0]!;
      const take = Math.min(lot.qty, remaining);
      lot.cost -= take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
      lot.qty -= take;
      remaining -= take;
      if (lot.qty === 0) queue.shift();
    }
    unmatched += remaining;
  }
  const mine = queue.filter((l) => !l.older);
  // Long-term as a holdings file counts it: listed shares held past the equity holding period.
  const months = rulesFor(ref).longTermMonths;
  const ltQty = mine.filter((l) => isLongTerm(l.date, ref, months)).reduce((a, l) => a + l.qty, 0);
  return { qty: mine.reduce((a, l) => a + l.qty, 0), cost: mine.reduce((a, l) => a + l.cost, 0), ltQty, unmatched, lots: mine };
}

/** What is left of one history buy on the file's date. */
type HeldPart = { qty: Qty; cost: Paise; date: ISODate; txn?: Txn };

/**
 * Lowers the cost of the history's held buys so the newest `keep` units (what stays after the trim, which removes the
 * oldest first) cost no more than `fileCost`. Dates stay. Returns the buys to replace, or nothing when no cap is needed.
 * A buy partly sold earlier is lowered whole, so that sale's gain reads higher: the safe direction.
 */
function capHeldCost(lots: HeldPart[], keep: Qty, fileCost: Paise): Map<Txn, Paise> | undefined {
  const kept: HeldPart[] = [];
  let need = keep, cost = 0;
  for (const l of [...lots].reverse()) {
    if (need <= 0) break;
    const take = Math.min(need, l.qty);
    cost += take === l.qty ? l.cost : prorate(l.cost, take, l.qty);
    need -= take;
    kept.push(l);
  }
  if (cost <= fileCost) return undefined;
  return new Map(kept.map((l) => [l.txn!, Math.floor((l.txn!.amount * fileCost) / cost)]));
}

/**
 * Lots for the units one holdings row lists that the history can't explain on the file's date `ref`. The held lots
 * never cost more than the file's total cost (cost never stacks):
 *
 * - **Split or consolidation:** the file's units are a whole multiple or fraction of the history's held units and its
 *   cost matches theirs within 1%: when the held units all come from buys on one date, the history's units are
 *   rescaled (`scaled`), dates and costs kept, nothing filled in. From several dates (a later buy may postdate the
 *   split), nothing is rescaled: the held buys and the fill-in are guessed, so the share gets no moves.
 * - **No cost in the file:** one guessed lot at the latest price (0 without one).
 * - **No cost left** after the history's held lots (a bonus, a demerger credit): the held units come in at cost 0,
 *   guessed (`opening-ca`), and the share gets a corporate-action note. Units sold before the history then take the
 *   file's average (`perUnit`), an estimate of their real cost.
 * - **Otherwise** the cost left over, `file cost − history's held cost`, goes to the units held. With a long-term count:
 *   long-term units at that cost, marked `approx`, and any short-term rest guessed (`opening-lt` / `opening-st`).
 *   Without one (funds): one guessed lot (`opening-est`). Units sold from before the history take the lower of the
 *   file's average and that cost, an estimate (their real cost may differ either way); with a long-term count they get their own guessed lot (`opening-sold`), whose
 *   sales are term unknown (`buildLedger`).
 *
 * Fill-in lots take the account label of the history's trades in that account, so one account is one ledger queue.
 */
function fillIn(out: Txn[], p: HeldPosition, ref: ISODate, price: Paise | undefined): { lots: Txn[]; scaled?: Map<Txn, Txn>; corporateAction?: CorporateActionNote['kind'] } {
  const sameHolding = (t: Txn) => t.memberId === p.memberId && t.isin === p.isin && normAccount(t.account) === normAccount(p.account);
  const all = out.filter(sameHolding);
  const history = all.filter((t) => t.date <= ref);
  const bought = history.filter((t) => t.side === 'buy').reduce((a, t) => a + t.qty, 0);
  const sold = history.filter((t) => t.side === 'sell').reduce((a, t) => a + t.qty, 0);

  let scaled: Map<Txn, Txn> | undefined;
  let guessAll = false;
  let corporateAction: CorporateActionNote['kind'] | undefined;
  let hist = history;
  if (p.cost != null) {
    const h = replayHeld(history, 0, ref);
    const whole = (a: Qty, b: Qty) => a % b === 0;
    const rescale = (qty: Qty) => Math.round((qty * p.qty) / h.qty);
    // A 1:1 bonus looks like a 1:2 split, but its new units are short-term for a year. More units count as a split
    // only when the long-term count tells the two apart: the history has long-term units and the file's count matches
    // them rescaled. Otherwise the extra units go to the corporate-action path.
    const up = p.qty > h.qty;
    if (h.unmatched === 0 && h.qty > 0 && p.qty !== h.qty && (whole(p.qty, h.qty) || whole(h.qty, p.qty))
      && Math.abs(p.cost - h.cost) <= h.cost * SPLIT_COST_TOLERANCE
      && (up ? p.ltQty != null && h.ltQty > 0 && rescale(h.ltQty) === p.ltQty : p.ltQty == null || rescale(h.ltQty) === p.ltQty)) {
      if (new Set(h.lots.map((l) => l.date)).size === 1) {
        scaled = new Map(history.map((t) => [t, { ...t, qty: rescale(t.qty) }]));
        hist = history.map((t) => scaled!.get(t)!);
      } else {
        // Held units from buys on several dates: a buy after the real split would be rescaled too, at the wrong cost.
        // Nothing is rescaled; the held buys and the fill-in are guessed, so the share gets no moves.
        guessAll = true;
        const held = new Set(h.lots.map((l) => l.txn!));
        scaled = new Map(history.filter((t) => held.has(t)).map((t) => [t, { ...t, estimated: true }]));
        hist = history.map((t) => scaled!.get(t) ?? t);
      }
      corporateAction = 'units';
    }
  }

  const opening = scaled && !guessAll ? 0 : p.qty - bought + sold;
  if (p.cost != null) {
    // Cost never stacks: the history units still held after the trim cost no more than the file says.
    const h = replayHeld(hist, Math.max(0, opening), ref);
    const cap = capHeldCost(h.lots, Math.min(h.qty, p.qty), p.cost);
    if (cap) {
      const orig = new Map(hist.map((t, i) => [t, history[i]!]));
      scaled ??= new Map();
      for (const [t, amount] of cap) scaled.set(orig.get(t)!, { ...t, amount });
      hist = hist.map((t) => (cap.has(t) ? { ...t, amount: cap.get(t)! } : t));
      corporateAction ??= 'cost';
    }
  }
  if (opening <= 0) return { lots: [], scaled, corporateAction };
  // First in, first out: this year's sales took the opening units first.
  const soldFromOpening = Math.min(sold, opening);
  const heldOpening = opening - soldFromOpening;
  const first = history.reduce<ISODate | null>((a, t) => (a == null || t.date < a ? t.date : a), null);
  const before = first ? addDays(first, -1) : addDays(ref, -1);
  const account = all.length ? [...all].sort((a, b) => a.date.localeCompare(b.date))[0]!.account ?? '' : p.account ?? '';
  const id = (kind: string) => `${p.memberId}|${p.isin}|${account}|${kind}`;
  const base = { memberId: p.memberId, isin: p.isin, side: 'buy' as const, account, source: 'Holdings file (bought before your trade history)' };
  const guessed = (kind: string, qty: Qty, amount: Paise): Txn => ({ ...base, id: id(kind), date: before, qty, amount, estimated: true });

  if (p.cost == null) return { lots: [guessed('opening-est', opening, price != null ? Math.round((price * opening) / QTY_SCALE) : 0)] };

  const perUnit = p.cost / p.qty;
  const leftover = p.cost - replayHeld(hist, opening, ref).cost;
  const lots: Txn[] = [];
  // Units held: the cost the file has left after the history's held lots, so the held cost is never overstated.
  // Units sold before the file: the lower of that and the file's average. That is an estimate: the file only knows
  // what is held now, so a past sale's real cost can be higher or lower than this (a Tax P&L covering it wins).
  let held = heldOpening;
  let sale = soldFromOpening;
  let unit = heldOpening > 0 ? Math.min(perUnit, Math.max(0, leftover) / heldOpening) : perUnit;
  let total = soldFromOpening > 0 ? Math.floor(unit * opening) : Math.max(0, leftover);
  if (heldOpening > 0 && leftover <= 0) {
    // Nothing explains these units' cost: a bonus or demerger credit. Cost 0, term unknown.
    lots.push(guessed('opening-ca', heldOpening, 0));
    corporateAction = 'units';
    held = 0;
    unit = perUnit;
    total = Math.floor(unit * sale);
  }
  const units = sale + held;
  if (units > 0) {
    if (p.ltQty == null) {
      lots.unshift(guessed('opening-est', units, total));
    } else {
      const ltHeld = Math.min(held, p.ltQty);
      const ltQty = sale + ltHeld;
      const stQty = held - ltHeld;
      const ltDate = [addMonths(ref, -13), before].sort()[0]!;
      const ltAmount = prorate(total, ltQty, units);
      const soldAmount = prorate(total, sale, units);
      if (ltHeld > 0) lots.unshift({ ...base, id: id('opening-lt'), date: ltDate, qty: ltHeld, amount: ltAmount - soldAmount, approx: true });
      // Units sold before the file: it proves what is long-term now, not at that sale, so their term is unknown
      // (`estimated`). First in the queue, so the sales take them and never the held long-term units: dated with the
      // long-term part (the day before the history, or earlier when that is under 13 months before the file).
      if (sale > 0) lots.unshift({ ...guessed('opening-sold', sale, soldAmount), date: ltDate, approx: true });
      if (stQty > 0) lots.push(guessed('opening-st', stQty, total - ltAmount));
    }
  }
  // A share whose units changed in a way no single split explains: every fill-in lot is guessed too (no moves).
  return { lots: guessAll ? lots.map(({ approx: _a, ...l }) => ({ ...l, estimated: true })) : lots, scaled, corporateAction };
}

/** A trade the family made: not a saved guess, not a Tax P&L exit. These date the account's last trade. */
const isRealTrade = (t: Txn) => !isTaxPnl(t) && !t.id.includes('|opening') && !t.left;

/** Units from buys dated this many calendar days before a holdings file's date, or later up to it, are never trimmed (T+1). */
export const UNSETTLED_DAYS = 3;

/**
 * The `left` sells that bring each account down to its deciding file, except units from buys that may not have
 * settled into it (`UNSETTLED_DAYS`). `trades` are the imported transactions (to
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
    // Buys in the last days up to the file's date may not have settled into it (T+1): they are never the units
    // trimmed. The count stays the full extra; it comes from older units only, oldest first, as far as they reach.
    const settledBy = addDays(f.asOf, -UNSETTLED_DAYS);
    const recent = new Map<string, Qty>();
    for (const t of trades) {
      if (!inAccount(t) || t.side !== 'buy' || !isRealTrade(t) || t.date < settledBy || t.date > f.asOf) continue;
      const k = `${t.isin}|${t.account ?? ''}`;
      recent.set(k, (recent.get(k) ?? 0) + t.qty);
    }
    const isins: string[] = [];
    for (const [isin, byLabel] of units) {
      const listed = f.positions.filter((p) => p.isin === isin).reduce((a, p) => a + p.qty, 0);
      // Per label: the ledger keeps one queue each, so a label with more sold than bought holds nothing to net off.
      let extra = [...byLabel.values()].reduce((a, u) => a + Math.max(0, u.qty), 0) - listed;
      if (extra <= 0) continue;
      let any = false;
      // Oldest units first, across labels that differ only in spaces or case. First in, first out takes a label's
      // oldest units, so leaving its recent buys' units untouched caps what it can lose.
      for (const [label, u] of [...byLabel].sort((a, b) => a[1].first.localeCompare(b[1].first))) {
        const qty = Math.min(extra, u.qty - Math.min(u.qty, recent.get(`${isin}|${label}`) ?? 0));
        if (qty <= 0) continue;
        any = true;
        left.push({ id: `${memberId}|${isin}|${label}|left|${f.asOf}`, memberId, isin, account: label, side: 'sell', left: true, qty, amount: 0, date: f.asOf, source: 'Left the account' });
        extra -= qty;
        if (extra <= 0) break;
      }
      if (any) isins.push(isin);
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
