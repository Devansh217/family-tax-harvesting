import { addMonths } from '../engine/dates';
import { countingSummaries, type FamilyView } from '../engine/family';
import { accountKey, isOld, newestEvidence } from '../engine/freshness';
import { decidingFiles, isTradebook, normAccount, TRIMMING_HOLDINGS_SOURCES, type DecidingFile } from '../engine/openingLots';
import { QTY_SCALE, type ISODate, type Paise } from '../engine/types';
import type { AppState } from '../store';
import { dateLabel, inr, inrShort } from './format';
import { unexplainedValue } from './plan';

export type GuideState = Pick<AppState, 'members' | 'txns' | 'positions' | 'imports' | 'brokerSummaries'>;
export type Broker = 'Zerodha' | 'Angel One' | 'Other' | 'Mutual funds';
export interface AccountRef { label: string; key: string; broker: Broker }

const BROKER_ORDER: Broker[] = ['Zerodha', 'Angel One', 'Other', 'Mutual funds'];
const isFundFormat = (f: string) => f.startsWith('Mutual fund CAS') || f.startsWith('Combined CAS');

/** Which broker section an account belongs to, from its label and the formats of the files imported into it. */
export function brokerOf(label: string, formats: string[]): Broker {
  const text = `${label} ${formats.join(' ')}`.toLowerCase();
  if (/zerodha|console|kite/.test(text)) return 'Zerodha';
  if (/angel/.test(text)) return 'Angel One';
  if (label.trim() === 'MF folios' || formats.some(isFundFormat)) return 'Mutual funds';
  return 'Other';
}

/** One entry per distinct account (whatever its spaces and case) a member has rows in, in section order. */
export function memberAccounts(state: GuideState, memberId: string): AccountRef[] {
  const formatOf = new Map(state.imports.map((i) => [i.id, i.format]));
  const found = new Map<string, { label: string; formats: Set<string> }>();
  const see = (account: string | undefined, importId: string | undefined) => {
    const key = normAccount(account);
    const e = found.get(key) ?? { label: (account ?? '').trim(), formats: new Set<string>() };
    const f = importId ? formatOf.get(importId) : undefined;
    if (f) e.formats.add(f);
    found.set(key, e);
  };
  for (const t of state.txns) if (t.memberId === memberId) see(t.account, t.importId);
  for (const p of state.positions) if (p.memberId === memberId) see(p.account, p.importId);
  for (const b of state.brokerSummaries) if (b.memberId === memberId) see(b.account, b.importId);
  return [...found].map(([key, e]) => ({ label: e.label, key, broker: brokerOf(e.label, [...e.formats]) }))
    .sort((x, y) => BROKER_ORDER.indexOf(x.broker) - BROKER_ORDER.indexOf(y.broker) || x.label.localeCompare(y.label));
}

/** The newest date any evidence reaches for one account (`newestEvidence`), or null when it has none. */
export function evidenceDate(state: GuideState, memberId: string, accountKeyOf: string): ISODate | null {
  return newestEvidence(state).get(accountKey(memberId, accountKeyOf)) ?? null;
}

/**
 * How much of a member's holdings the moves can use: `usable` is the value of lots whose date and cost are certain
 * (funds with an unknown tax type aside); `total` adds the lots that are guessed or unknown-type, and units a holdings
 * row shows that no lot explains. Lots with no price are in neither.
 */
export function usableShare(fam: Pick<FamilyView, 'members' | 'positions' | 'securities'>, memberId: string): { usable: Paise; total: Paise } {
  const view = fam.members.find((m) => m.member.id === memberId);
  let usable = 0;
  let total = 0;
  for (const h of view?.holdings ?? []) {
    for (const l of h.lots) {
      if (l.value == null) continue;
      total += l.value;
      if (l.certain && h.taxType !== 'check') usable += l.value;
    }
  }
  const missing = new Map<string, number>();
  for (const p of fam.positions) {
    if (p.memberId !== memberId || p.qty == null || TRIMMING_HOLDINGS_SOURCES.includes(p.source)) continue;
    missing.set(p.isin, Math.max(missing.get(p.isin) ?? 0, p.qty));
  }
  for (const [isin, qty] of missing) total += unexplainedValue(fam, memberId, isin, qty);
  return { usable, total };
}

/** Whole percent usable, or null when there is nothing to measure. */
export const pct = (s: { usable: Paise; total: Paise }): number | null => (s.total === 0 ? null : Math.round((s.usable * 100) / s.total));

export type StepKind = 'holdings' | 'pnl' | 'tradebook' | 'fund_tradebook' | 'cas';
export type StepStatus = 'done' | 'next' | 'later' | 'unreadable' | 'suggestion';
export interface GuideStep {
  kind: StepKind;
  status: StepStatus;
  /** e.g. 'Holdings file', 'Tax P&L, FY 2026-27', 'Tradebook, FY 2025-26'. */
  title: string;
  /** Where to download it, per broker. */
  where: string;
  /** What it adds: shown while the step is next or later. */
  unlocks: string;
  /** What is in: shown when the step is done (and under a holdings step reopened because the data is old). */
  doneLine?: string;
  /** The tax year a tradebook step asks for, e.g. 'FY 2025-26'. */
  fy?: string;
}
export interface AccountGuide extends AccountRef { steps: GuideStep[]; newest: ISODate | null; stale: boolean; notes: string[] }

/** The tax year a date falls in: '2025-06-01' → 'FY 2025-26'. */
export const fyOf = (d: ISODate): string => {
  const y = fyStart(d);
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
const fyStart = (d: ISODate): number => {
  const y = Number(d.slice(0, 4));
  return Number(d.slice(5, 7)) >= 4 ? y : y - 1;
};
const fyFromStart = (y: number) => fyOf(`${y}-04-01`);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const isFund = (isin: string) => isin.startsWith('INF');

/** Equity bought from this date has a cost a tradebook can give (before it, the 31 Jan 2018 value decides). */
const GRANDFATHER_AFTER: ISODate = '2018-02-01';
/** Coin opened in 2017: no Zerodha fund purchase is older than this tax year. */
const OLDEST_COIN_FY = 2017;

/** A step before its place in the order is known: `open` ones become next (the first) or later. */
type Draft = Omit<GuideStep, 'status'> & { status: 'open' | 'done' | 'unreadable' | 'suggestion' };

interface Ctx {
  state: GuideState; fam: FamilyView; memberId: string; acct: AccountRef; today: ISODate;
  /** The holdings file that decides this account, if any. */
  file: DecidingFile | undefined;
  /** This member's holding lots in this account, with their ISIN. */
  lots: Array<FamilyView['members'][number]['holdings'][number]['lots'][number] & { isin: string }>;
  /** Trade-history trades in this account. */
  trades: AppState['txns'];
  notes: string[];
}

function zerodhaSteps(c: Ctx): Draft[] {
  const { fam, acct, file, lots, trades, today, notes } = c;
  const rules = fam.rules;
  const steps: Draft[] = [];

  // 1. Holdings file.
  let holdingsDone: string | undefined;
  if (file) {
    const held = file.positions.filter((p) => p.qty > 0);
    const shares = new Set(held.filter((p) => !isFund(p.isin)).map((p) => p.isin)).size;
    const funds = new Set(held.filter((p) => isFund(p.isin)).map((p) => p.isin)).size;
    const value = held.reduce((a, p) => a + Math.round(((fam.securities.get(p.isin)?.price ?? 0) * p.qty) / QTY_SCALE), 0);
    const parts = [shares ? plural(shares, 'share') : '', funds ? plural(funds, 'fund') : ''].filter(Boolean);
    holdingsDone = `Zerodha holdings · as on ${dateLabel(file.asOf)}${parts.length ? ` · ${parts.join(' and ')}, ${inrShort(value)}` : ''}`;
  }
  steps.push({
    kind: 'holdings', status: file ? 'done' : 'open', title: 'Holdings file', where: 'Console → Portfolio → Holdings → Download (.xlsx)',
    unlocks: "What's held today, long-term units and average cost: enough for a first plan.", ...(holdingsDone ? { doneLine: holdingsDone } : {}),
  });

  // 2. Tax P&L for this tax year.
  const pnl = countingSummaries(c.state.brokerSummaries)
    .filter((b) => b.memberId === c.memberId && normAccount(b.account) === acct.key)
    .filter((b) => (b.summary.from ?? '0000-00-00') <= rules.end && (b.summary.to ?? '9999-12-31') >= rules.start)
    .sort((x, y) => (y.summary.to ?? '').localeCompare(x.summary.to ?? ''))[0];
  steps.push({
    kind: 'pnl', status: pnl ? 'done' : 'open', title: `Tax P&L, ${rules.label}`,
    where: `Console → Reports → Tax P&L → ${rules.label} → Download (.xlsx)`,
    unlocks: "Exact gains booked this year, so the room matches Zerodha's figures.",
    ...(pnl ? { doneLine: `Tax P&L · ${dateLabel(pnl.summary.from ?? rules.start)} – ${dateLabel(pnl.summary.to ?? rules.end)}` } : {}),
  });

  // 3. Tradebooks: only the tax years of the 12 months before the holdings file can date its short-term rest.
  const corporate = new Set(fam.holdingsNotes.corporateActions
    .filter((n) => n.memberId === c.memberId && normAccount(n.account) === acct.key).map((n) => n.isin));
  const undatedShares = lots.filter((l) => !isFund(l.isin) && !l.certain && !l.approx && !corporate.has(l.isin) && l.date >= GRANDFATHER_AFTER);
  const gap = { n: new Set(undatedShares.map((l) => l.isin)).size, v: undatedShares.reduce((a, l) => a + (l.value ?? 0), 0) };
  const ref = file?.asOf ?? today;
  const window = [...new Set([fyStart(ref), fyStart(addMonths(ref, -12))])];
  const tradeYears = [...new Set(trades.map((t) => fyStart(t.date)))].sort((a, b) => b - a);
  const oldest = tradeYears.length ? tradeYears[tradeYears.length - 1]! : null;
  // A year is in when a trade falls in it or in an older year: tradebooks are asked newest first.
  const missing = window.find((y) => oldest == null || y < oldest);
  const tradebooksIn = tradeYears.length ? { doneLine: `Tradebooks · ${tradeYears.map(fyFromStart).join(', ')}` } : {};
  if (gap.n > 0 && missing != null) {
    const fy = fyFromStart(missing);
    steps.push({
      kind: 'tradebook', status: 'open', title: `Tradebook, ${fy}`, fy, where: `Console → Reports → Tradebook → segment Equity → ${fy}`,
      unlocks: `Could date up to ${plural(gap.n, 'share')} (${inr(gap.v)}) bought in the last year.`, ...tradebooksIn,
    });
  } else if (tradeYears.length) {
    steps.push({ kind: 'tradebook', status: 'done', title: 'Tradebooks', where: 'Console → Reports → Tradebook → segment Equity', unlocks: '', ...tradebooksIn });
  }
  if (gap.n > 0 && missing == null) {
    notes.push(`${plural(gap.n, 'share')} (${inr(gap.v)}) aren't in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves.`);
  }

  // 4. Fund tradebooks (Coin), back one year at a time while funds in the account are undated.
  const undatedFunds = lots.filter((l) => isFund(l.isin) && !l.certain);
  if (undatedFunds.length) {
    const fundYears = trades.filter((t) => isFund(t.isin)).map((t) => fyStart(t.date));
    const year = fundYears.length ? Math.min(...fundYears) - 1 : fyStart(today);
    if (year >= OLDEST_COIN_FY) {
      const fy = fyFromStart(year);
      const n = new Set(undatedFunds.map((l) => l.isin)).size;
      const v = undatedFunds.reduce((a, l) => a + (l.value ?? 0), 0);
      steps.push({
        kind: 'fund_tradebook', status: 'open', title: `Fund tradebook (Coin), ${fy}`, fy, where: `Console → Reports → Tradebook → segment MF → ${fy}`,
        unlocks: `Dates ${plural(n, 'fund')} (${inr(v)}) so they can get moves.`,
      });
    }
  }
  return steps;
}

/** Step builders per broker section. */
const STEPS: Record<Broker, (c: Ctx) => Draft[]> = {
  Zerodha: zerodhaSteps,
  'Angel One': () => [],
  Other: () => [],
  'Mutual funds': () => [],
};

/**
 * The checklist for one account: its broker's steps in order, each done, unreadable or a suggestion by its own test,
 * the first remaining one next and the rest later. When the account's newest data is old (`isOld`), its holdings step
 * reopens as a refresh (its done line kept) and a "Newest data from" note is added.
 */
export function accountGuide(state: GuideState, fam: FamilyView, memberId: string, acct: AccountRef, today: ISODate): AccountGuide {
  const view = fam.members.find((m) => m.member.id === memberId);
  const lots = (view?.holdings ?? []).flatMap((h) => h.lots.filter((l) => normAccount(l.account) === acct.key).map((l) => ({ ...l, isin: h.isin })));
  const trades = state.txns.filter((t) => t.memberId === memberId && isTradebook(t) && normAccount(t.account) === acct.key);
  const notes: string[] = [];
  const file = decidingFiles(fam.positions).get(accountKey(memberId, acct.key));
  const drafts = STEPS[acct.broker]({ state, fam, memberId, acct, today, file, lots, trades, notes });

  const newest = evidenceDate(state, memberId, acct.key);
  const stale = newest != null && isOld(newest, today);
  if (stale) {
    const h = drafts.find((d) => d.kind === 'holdings');
    if (h) Object.assign(h, { status: 'open', title: 'Holdings file: refresh', unlocks: `Download today's: your newest data is from ${dateLabel(newest)}.` });
    notes.push(`Newest data from ${dateLabel(newest)}.`);
  }

  let first = true;
  const steps = drafts.map((d): GuideStep => {
    if (d.status !== 'open') return { ...d, status: d.status };
    const status = first ? 'next' : 'later';
    first = false;
    return { ...d, status };
  });
  return { ...acct, steps, newest, stale, notes };
}
