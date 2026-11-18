import { classifyByIsin } from './parsers/common';
import type { DatedMove, PlannedSale } from './engine/family';
import type { Snapshot } from './ui/market';
import type { RecommendationRecord } from './engine/records';
import { FY_2026_27 } from './engine/rules';
import type { ISODate, Member, Paise, Qty, Security, TaxType, Txn } from './engine/types';
import type { BrokerSummary, ParsedPrice, ParseResult } from './parsers';

export interface ImportRecord {
  id: string;
  memberId: string;
  fileName: string;
  format: string;
  at: string;
  txns: number;
  prices: number;
  warnings: string[];
}

/** Units a statement says a member holds, to check the trade history against. */
export interface Position { memberId: string; isin: string; qty: Qty; ltQty?: Qty; asOf?: ISODate; source: string }

export interface AppState {
  version: 1;
  isSample: boolean;
  members: Member[];
  securities: Security[];
  txns: (Txn & { importId: string })[];
  positions: (Position & { importId: string })[];
  imports: ImportRecord[];
  done: Record<string, boolean>;
  plannedSales: PlannedSale[];
  /** Broker tax P&L totals from imported reports, to reconcile the engine against. */
  brokerSummaries: Array<{ importId: string; memberId: string; account: string; summary: BrokerSummary }>;
  /** One row per closing date: family value, gains and room, for the daily "since last close" view. */
  history: Snapshot[];
  /** The person confirmed they read that suggestions are tax arithmetic, not buy or sell advice. */
  ackGuidance?: boolean;
  /** `${memberId}|${isin}` → money needed within 12 months. */
  needSoon: Record<string, boolean>;
  /** ISIN → tax type the person chose for a fund, overriding AMFI's category. */
  taxTypeOverrides: Record<string, TaxType>;
  /** Every move shown and every status change, append-only (kept 5 years once registered as an adviser). */
  recommendations: RecommendationRecord[];
  /** Moves the family picked a day for; sized first on every recompute so they hold their room. */
  datedMoves: DatedMove[];
  /** Harvest season help: the server may read this family on email days, 1 Feb to 31 Mar, to email what is left to do. Off until switched on. */
  alerts?: { seasonHelp: boolean; chosen?: boolean };
}


export const emptyState = (): AppState => ({
  version: 1, isSample: false, members: [], securities: [], txns: [], positions: [], imports: [], done: {}, plannedSales: [], needSoon: {}, history: [], brokerSummaries: [], taxTypeOverrides: {}, recommendations: [], datedMoves: [], alerts: { seasonHelp: false, chosen: false },
});

/** Shapes saved before the member profile and tax-type changes (Nov 2026). */
type LegacyMember = Member & { otherIncome?: Paise; incomeBand?: string };
type LegacySecurity = Security & { kind?: 'equity' | 'equity_mf' | 'other' };

/** Moves ticked before ticks carried their tax year belong to the year they were made in. */
const TICK_YEAR = FY_2026_27.label;

function migrateMember(m: LegacyMember): Member {
  const { otherIncome, incomeBand, ...rest } = m;
  const out: Member = { ...rest, type: rest.type ?? 'person' };
  if (out.income === undefined && otherIncome != null) {
    out.income = [incomeBand ? { kind: 'other', amount: otherIncome, from: 'band', band: incomeBand } : { kind: 'other', amount: otherIncome, from: 'manual' }];
  }
  return out;
}

/** Spouse, parent and child links from relations to the manager, for families saved before links existed. */
function linkFamily(members: Member[]): Member[] {
  if (members.some((m) => m.spouseId || m.parentIds)) return members;
  const self = members.find((m) => m.relation === 'self');
  if (!self) return members;
  const spouse = members.filter((m) => m.relation === 'spouse');
  const parents = members.filter((m) => m.relation === 'parent');
  const children = members.filter((m) => m.relation === 'child_adult' || m.relation === 'child_minor');
  const wife = spouse.length === 1 ? spouse[0]! : null;
  return members.map((m) => {
    const out = { ...m };
    if (m === self) {
      if (wife) out.spouseId = wife.id;
      if (parents.length) out.parentIds = parents.map((p) => p.id);
    }
    if (m === wife) out.spouseId = self.id;
    if (parents.length === 2 && parents.includes(m)) out.spouseId = parents.find((p) => p !== m)!.id;
    if (children.includes(m)) out.parentIds = wife ? [self.id, wife.id] : [self.id];
    return out;
  });
}

function migrateSecurity(x: LegacySecurity): Security {
  if (x.taxType) return x;
  const { kind, ...rest } = x;
  if (kind === 'equity_mf') return { ...rest, taxType: 'equity', listed: false };
  if (kind === 'other') return { ...rest, taxType: 'check', listed: false };
  return { ...rest, ...classifyByIsin(rest.isin) };
}

/** Fills fields added after a copy was saved (older browser data or an account copy). Null if unusable. */
export function normalizeState(s: AppState | null | undefined): AppState | null {
  if (!s || s.version !== 1 || !Array.isArray(s.members)) return null;
  const done = Object.fromEntries(Object.entries(s.done ?? {}).map(([k, v]) => [k.startsWith('FY ') ? k : `${TICK_YEAR}|${k}`, v]));
  return {
    ...s,
    members: linkFamily((s.members as LegacyMember[]).map(migrateMember)),
    securities: ((s.securities ?? []) as LegacySecurity[]).map(migrateSecurity),
    plannedSales: s.plannedSales ?? [], needSoon: s.needSoon ?? {}, history: s.history ?? [], done, positions: s.positions ?? [],
    brokerSummaries: s.brokerSummaries ?? [], taxTypeOverrides: s.taxTypeOverrides ?? {}, recommendations: s.recommendations ?? [], datedMoves: s.datedMoves ?? [],
    alerts: { seasonHelp: s.alerts?.seasonHelp === true, chosen: s.alerts?.chosen === true },
  };
}

/** A backup file's text as a family, migrated like any saved copy; null when it is not a backup. */
export function parseBackup(text: string): AppState | null {
  try {
    const s = normalizeState(JSON.parse(text) as AppState);
    // Consent is not carried in a file: after a restore the family chooses again.
    return s && { ...s, alerts: { seasonHelp: false, chosen: false } };
  } catch {
    return null;
  }
}

export const RESTORE_ALERTS_NOTE = 'Harvest season help is off after a restore; turn it on in Account.';

/** True when the backup file had harvest season help switched on (so the restore switches it off). */
export function backupHadSeasonHelp(text: string): boolean {
  try {
    return (JSON.parse(text) as AppState).alerts?.seasonHelp === true;
  } catch {
    return false;
  }
}

/** True when the state holds a real family worth keeping, not the sample or an untouched start. */
export const hasRealData = (s: AppState) => !s.isSample && s.members.length > 0 && (s.txns.length > 0 || s.members.length > 1);

export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Statements without ISINs (holdings exports) name securities by symbol; match them to known securities. */
function resolveIsin(isin: string, name: string, securities: Security[]): string {
  if (!isin.startsWith('SYM:')) return isin;
  const sym = norm(isin.slice(4));
  const hit = securities.find((s) => !s.isin.startsWith('SYM:') && (norm(s.name) === sym || (s.symbols ?? []).some((x) => norm(x) === sym)));
  return hit?.isin ?? isin;
}

function upsertSecurity(list: Security[], p: { isin: string; name: string }, price?: ParsedPrice) {
  let s = list.find((x) => x.isin === p.isin);
  if (!s) {
    s = { isin: p.isin, name: p.name, ...classifyByIsin(p.isin) };
    list.push(s);
  } else if ((s.name === s.isin || s.name.length < 3) && p.name) s.name = p.name;
  if (p.name && !p.isin.startsWith('SYM:') && p.name !== s.name) s.symbols = [...new Set([...(s.symbols ?? []), p.name])];
  if (price && (!s.priceDate || !price.priceDate || price.priceDate >= s.priceDate)) {
    s.price = price.price;
    s.priceDate = price.priceDate ?? s.priceDate;
  }
  // Plan, option and distributor from a fund statement: kept for the regular-to-direct switch.
  if (price?.plan) s.plan = price.plan;
  if (price?.option) s.option = price.option;
  if (price?.plan === 'direct') delete s.distributor;
  else if (price?.distributor) s.distributor = price.distributor;
}

export interface ImportOptions {
  /** Demat account or platform for rows the file does not label, e.g. "Zerodha". */
  account?: string;
  /** Keep only the broker's totals and F&O figures, not the trades (when tradebooks cover the same dates). */
  checkOnly?: boolean;
  /** For holdings with no trade history: create an opening lot dated this, at the statement's cost if known. */
  openingDate?: ISODate;
}

/**
 * Adds a parsed file to a member. Re-importing the same file is harmless: each transaction's id is derived from its
 * content plus its occurrence count within the file, so identical fills stay separate but repeats merge.
 */
export function applyImport(state: AppState, memberId: string, fileName: string, r: ParseResult, opts: ImportOptions = {}): AppState {
  const s: AppState = structuredClone(state);
  const importId = uid('imp');
  const seen = new Map<string, number>();
  const existing = new Set(s.txns.map((t) => t.id));
  let added = 0;

  const txns = opts.checkOnly ? [] : r.txns;
  for (const t of r.txns) upsertSecurity(s.securities, t);
  for (const t of txns) {
    const isin = resolveIsin(t.isin, t.name, s.securities);
    const base = `${memberId}|${isin}|${t.date}|${t.side}|${t.qty}|${t.amount}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = `${base}|${n}`;
    if (existing.has(id)) continue;
    const account = t.account ?? opts.account ?? '';
    s.txns.push({ id, memberId, isin, date: t.date, side: t.side, qty: t.qty, amount: t.amount, source: r.format, importId, account });
    added++;
  }

  for (const p of r.prices) {
    const isin = resolveIsin(p.isin, p.name, s.securities);
    upsertSecurity(s.securities, { ...p, isin }, p);
    if (p.qty != null) {
      s.positions = s.positions.filter((x) => !(x.memberId === memberId && x.isin === isin && x.source === r.format));
      s.positions.push({ memberId, isin, qty: p.qty, ltQty: p.ltQty, asOf: p.priceDate, source: r.format, importId });
    }
    const hasHistory = s.txns.some((t) => t.memberId === memberId && t.isin === isin && (t.account ?? '') === (opts.account ?? ''));
    if (opts.openingDate && p.qty && p.qty > 0 && !hasHistory) {
      const cost = p.cost ?? Math.round((p.price * p.qty) / 10_000);
      s.txns.push({
        id: `${memberId}|${isin}|opening|${importId}`, memberId, isin, date: opts.openingDate, side: 'buy', qty: p.qty, amount: cost,
        source: 'Opening balance (estimated date)', importId, account: opts.account ?? '', estimated: true,
      });
      added++;
    }
  }

  for (const [rawIsin, v] of Object.entries(r.fmv2018 ?? {})) {
    const sec = s.securities.find((x) => x.isin === resolveIsin(rawIsin, '', s.securities));
    if (sec && !sec.fmv2018) sec.fmv2018 = v;
  }
  if (r.brokerSummary) {
    const b = r.brokerSummary;
    s.brokerSummaries.push({ importId, memberId, account: opts.account ?? '', summary: b });
    if (b.fno != null) {
      s.members = s.members.map((m) => (m.id === memberId ? { ...m, business: { ...m.business, fno: b.fno ?? undefined, fnoTurnover: b.fnoTurnover ?? m.business?.fnoTurnover } } : m));
    }
  }

  s.imports.push({
    id: importId, memberId, fileName, format: r.format, at: new Date().toISOString(), txns: added, prices: r.prices.length, warnings: r.warnings,
  });
  return s;
}

export function removeImport(state: AppState, importId: string): AppState {
  return {
    ...state,
    txns: state.txns.filter((t) => t.importId !== importId),
    positions: state.positions.filter((p) => p.importId !== importId),
    imports: state.imports.filter((i) => i.id !== importId),
    brokerSummaries: state.brokerSummaries.filter((b) => b.importId !== importId),
  };
}

export function removeMember(state: AppState, memberId: string): AppState {
  return {
    ...state,
    members: state.members.filter((m) => m.id !== memberId),
    plannedSales: state.plannedSales.filter((p) => p.memberId !== memberId),
    txns: state.txns.filter((t) => t.memberId !== memberId),
    positions: state.positions.filter((p) => p.memberId !== memberId),
    imports: state.imports.filter((i) => i.memberId !== memberId),
    brokerSummaries: state.brokerSummaries.filter((b) => b.memberId !== memberId),
  };
}

/** Clears the sample and starts a real family with just the owner. */
export const startOwnFamily = (): AppState => ({
  ...emptyState(),
  members: [{ id: 'me', name: 'You', relation: 'self', age: 35, regime: 'new' }],
});

/** A sensible account name from the file name or format; the user can change it before adding. */
export function guessAccount(fileName: string, format: string): string {
  const f = `${fileName} ${format}`.toLowerCase();
  if (/zerodha|console|kite|tradebook/.test(f)) return 'Zerodha';
  if (/groww/.test(f)) return 'Groww';
  if (/angel/.test(f)) return 'Angel One';
  if (/upstox/.test(f)) return 'Upstox';
  if (/et\s?money|etmoney/.test(f)) return 'ET Money';
  if (/nsdl|cdsl|demat cas/.test(f)) return 'Demat (CAS)';
  if (/mutual fund cas|cams|kfin/.test(f)) return 'MF folios';
  return '';
}
