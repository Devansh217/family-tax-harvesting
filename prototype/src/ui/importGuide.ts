import { addMonths } from '../engine/dates';
import { countingSummaries, type FamilyView } from '../engine/family';
import { accountKey, isOld, newestEvidence } from '../engine/freshness';
import { APPROX_MARGIN, decidingFiles, isTradebook, normAccount, TRIMMING_HOLDINGS_SOURCES, type DecidingFile } from '../engine/openingLots';
import { QTY_SCALE, type ISODate, type Paise } from '../engine/types';
import type { AppState } from '../store';
import { dateLabel, inr, inrShort } from './format';
import { planGaps, unexplainedValue, type PlanGap } from './plan';

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
  if (normAccount(label) === normAccount('MF folios') || formats.some(isFundFormat)) return 'Mutual funds';
  return 'Other';
}

/**
 * One entry per distinct account (whatever its spaces and case) a member has rows in, in section order. Its label is
 * the spelling most rows use, ties going to the first in sorted order, so the import order never changes it.
 */
export function memberAccounts(state: GuideState, memberId: string): AccountRef[] {
  const formatOf = new Map(state.imports.map((i) => [i.id, i.format]));
  const found = new Map<string, { spellings: Map<string, number>; formats: Set<string> }>();
  const see = (account: string | undefined, importId: string | undefined) => {
    const key = normAccount(account);
    const e = found.get(key) ?? { spellings: new Map<string, number>(), formats: new Set<string>() };
    const label = (account ?? '').trim();
    e.spellings.set(label, (e.spellings.get(label) ?? 0) + 1);
    const f = importId ? formatOf.get(importId) : undefined;
    if (f) e.formats.add(f);
    found.set(key, e);
  };
  for (const t of state.txns) if (t.memberId === memberId) see(t.account, t.importId);
  for (const p of state.positions) if (p.memberId === memberId) see(p.account, p.importId);
  for (const b of state.brokerSummaries) if (b.memberId === memberId) see(b.account, b.importId);
  const labelOf = (spellings: Map<string, number>) =>
    [...spellings].sort(([a, n], [b, m]) => m - n || (a < b ? -1 : a > b ? 1 : 0))[0]![0];
  return [...found].map(([key, e]) => {
    const label = labelOf(e.spellings);
    return { label, key, broker: brokerOf(label, [...e.formats]) };
  })
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
  /** Tradebook steps: the tax years whose trades are in, newest first, e.g. ['FY 2026-27', 'FY 2025-26']. */
  years?: string[];
  /** Holdings and fund-statement steps: the date of the file that ticked it. */
  asOf?: ISODate;
  /** A done holdings step reopened because the account's newest data is old. */
  refresh?: boolean;
  /** A hint for a password-locked file. */
  password?: string;
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
/** 'FY 2026-27, 2025-26': "FY" written once. */
const fyList = (years: string[]) => years.map((y, i) => (i === 0 ? y : y.replace(/^FY /, ''))).join(', ');

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
  /** The account keys this section covers: one, or every fund folio for the Mutual funds section. */
  keys: Set<string>;
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
    unlocks: "What's held today, long-term units and average cost: enough for a first plan.", ...(holdingsDone && file ? { doneLine: holdingsDone, asOf: file.asOf } : {}),
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
  // Fund (Coin) trades date only funds: they feed the fund tradebook step below, never the equity years.
  const tradeYears = [...new Set(trades.filter((t) => !isFund(t.isin)).map((t) => fyStart(t.date)))].sort((a, b) => b - a);
  const oldest = tradeYears.length ? tradeYears[tradeYears.length - 1]! : null;
  // A year is in when a trade falls in it or in an older year: tradebooks are asked newest first.
  const missing = window.find((y) => oldest == null || y < oldest);
  const years = tradeYears.map(fyFromStart);
  const tradebooksIn = tradeYears.length ? { doneLine: `Tradebooks · ${fyList(years)}`, years } : {};
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
    notes.push(`${plural(gap.n, 'share')} (${inr(gap.v)}) ${gap.n === 1 ? "isn't" : "aren't"} in your tradebooks: possibly a bonus, IPO allotment or transfer in. They get no moves.`);
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

/** This section's positions, and its tradebook years newest first. */
const positionsOf = (c: Ctx) => c.state.positions.filter((p) => p.memberId === c.memberId && c.keys.has(normAccount(p.account)));
const tradeYearsOf = (c: Ctx) => [...new Set(c.trades.map((t) => fyStart(t.date)))].sort((a, b) => b - a).map(fyFromStart);
const newestAsOf = (ps: Array<{ asOf?: ISODate }>) => ps.reduce<ISODate | undefined>((a, p) => (p.asOf && (!a || p.asOf > a) ? p.asOf : a), undefined);

/** Brokers without a long-term count to bound the history: trade history is a suggestion that never blocks done. */
function historySuggestion(c: Ctx, where: string): Draft {
  const years = tradeYearsOf(c);
  return {
    kind: 'tradebook', status: 'suggestion', title: 'Trade history, every year', where,
    unlocks: `Back to the year of your first purchase.${years.length ? ` In: ${fyList(years)}.` : ''}`, ...(years.length ? { years } : {}),
  };
}

const ANGEL_FUNDS = 'Angel One fund holdings';

function angelSteps(c: Ctx): Draft[] {
  const funds = positionsOf(c).filter((p) => p.source === ANGEL_FUNDS);
  const asOf = newestAsOf(funds);
  const shares = c.state.txns.some((t) => t.memberId === c.memberId && c.keys.has(normAccount(t.account)) && !isFund(t.isin));
  if (shares) c.notes.push("Angel shares are counted from your tradebooks only until Angel's holdings file can be read.");
  return [
    {
      kind: 'holdings', status: funds.length ? 'done' : 'open', title: 'Holdings file',
      where: 'Open "Your Holding Details" with its password, save a copy as .xlsx, import the copy.',
      unlocks: 'The funds held today, so they can get moves.',
      ...(funds.length ? { doneLine: "Funds read. Shares and SGBs in this file aren't read yet: they come from your tradebooks for now.", ...(asOf ? { asOf } : {}) } : {}),
    },
    {
      kind: 'pnl', status: 'unreadable', title: `Tax P&L, ${c.fam.rules.label}`, where: '',
      unlocks: "Angel One's tax P&L can't be read yet. Sales with unknown buy dates are counted the safe way.",
    },
    historySuggestion(c, 'Reports → Trade history (Excel), one per tax year'),
  ];
}

function otherSteps(c: Ctx): Draft[] {
  const held = positionsOf(c);
  const asOf = newestAsOf(held);
  return [
    {
      kind: 'holdings', status: held.length ? 'done' : 'open', title: 'Holdings file', where: "Your broker's holdings export, or the NSDL / CDSL CAS.",
      unlocks: "What's held today, so the plan can check your trade history against it.",
      ...(held.length ? { doneLine: asOf ? `Holdings · as on ${dateLabel(asOf)}` : 'Holdings read', ...(asOf ? { asOf } : {}) } : {}),
    },
    historySuggestion(c, "Your broker's trade history, one per tax year"),
  ];
}

function fundSteps(c: Ctx): Draft[] {
  const casTxns = c.state.txns.filter((t) => t.memberId === c.memberId && isFundFormat(t.source));
  const imported = c.state.imports.some((i) => i.memberId === c.memberId && isFundFormat(i.format));
  const asOf = casTxns.reduce<ISODate | undefined>((a, t) => (!a || t.date > a ? t.date : a), undefined);
  const funds = new Set(casTxns.map((t) => t.isin)).size;
  return [{
    kind: 'cas', status: imported ? 'done' : 'open', title: 'Mutual fund statement (CAS)',
    where: 'MF Central, CAMS or KFintech: the detailed statement from your first purchase to today. It comes by email as a PDF.',
    unlocks: 'Every fund purchase with its date, so your funds can get moves.',
    password: 'Use the password you chose when you asked for the statement.',
    ...(imported ? { doneLine: `Fund statement · ${plural(funds, 'fund')}, ${plural(casTxns.length, 'transaction')}`, ...(asOf ? { asOf } : {}) } : {}),
  }];
}

/** Step builders per broker section. */
const STEPS: Record<Broker, (c: Ctx) => Draft[]> = {
  Zerodha: zerodhaSteps,
  'Angel One': angelSteps,
  Other: otherSteps,
  'Mutual funds': fundSteps,
};

/**
 * The checklist for one account: its broker's steps in order, each done, unreadable or a suggestion by its own test,
 * the first remaining one next and the rest later. When the account's newest data is old (`isOld`), its holdings step
 * (the statement step for funds) reopens, titled as a refresh when it was done (its done line kept), and a "Newest data
 * from" note is added.
 */
export function accountGuide(state: GuideState, fam: FamilyView, memberId: string, acct: AccountRef, today: ISODate): AccountGuide {
  return sectionGuide(state, fam, memberId, acct, [acct.key], today);
}

function sectionGuide(state: GuideState, fam: FamilyView, memberId: string, acct: AccountRef, accountKeys: string[], today: ISODate): AccountGuide {
  const keys = new Set(accountKeys);
  const view = fam.members.find((m) => m.member.id === memberId);
  const lots = (view?.holdings ?? []).flatMap((h) => h.lots.filter((l) => keys.has(normAccount(l.account))).map((l) => ({ ...l, isin: h.isin })));
  const trades = state.txns.filter((t) => t.memberId === memberId && isTradebook(t) && keys.has(normAccount(t.account)));
  const notes: string[] = [];
  const file = accountKeys.length === 1 ? decidingFiles(fam.positions).get(accountKey(memberId, accountKeys[0])) : undefined;
  const drafts = STEPS[acct.broker]({ state, fam, memberId, acct, today, file, lots, trades, keys, notes });

  const newest = accountKeys.map((k) => evidenceDate(state, memberId, k)).reduce<ISODate | null>((a, d) => (d && (!a || d > a) ? d : a), null);
  const stale = newest != null && isOld(newest, today);
  if (stale) {
    const h = drafts.find((d) => d.kind === 'holdings' || d.kind === 'cas');
    if (h) {
      const wasDone = h.status === 'done';
      Object.assign(h, {
        status: 'open', unlocks: `Download today's: your newest data is from ${dateLabel(newest)}.`,
        ...(wasDone ? { refresh: true, title: h.kind === 'holdings' ? 'Holdings file: refresh' : `${h.title}: refresh` } : {}),
      });
    }
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

export interface MemberGuide {
  memberId: string; name: string;
  /** Nothing imported: show the first-step card (Zerodha, Angel One and other brokers' instructions). */
  first: boolean;
  accounts: AccountGuide[];
  usable: { usable: Paise; total: Paise }; pct: number | null;
  /** Every step is done, can't be read yet or a suggestion, and no account's data is old. */
  done: boolean;
  /** Room kept spare on moves sized from average cost, per account: only when done and the member's total is ₹4,000 or more. */
  cushion: Array<{ account: string; broker: Broker; fy: string | null; rupees: Paise }>;
  /** `planGaps` for this member that no step covers. */
  otherGaps: PlanGap[];
}
export interface FamilyGuide { members: MemberGuide[]; pct: number | null }

/** The cushion line shows only from this total. */
const CUSHION_MIN: Paise = 4_000_00;
/** Gaps the steps already ask for. */
const STEP_GAPS: Array<PlanGap['key']> = ['no_holdings', 'shares_no_dates', 'funds_no_dates'];
const MUTUAL_FUNDS: AccountRef = { label: 'Mutual funds', key: 'mutual funds', broker: 'Mutual funds' };
const to100 = (p: Paise) => Math.round(p / 10_000) * 10_000;

/** One member's checklist: a section per account (every fund folio in one Mutual funds section), completeness, done, cushion. */
export function memberGuide(state: GuideState, fam: FamilyView, memberId: string, today: ISODate): MemberGuide {
  const name = state.members.find((m) => m.id === memberId)?.name ?? '';
  const refs = memberAccounts(state, memberId);
  const folios = refs.filter((a) => a.broker === 'Mutual funds');
  const accounts = refs.filter((a) => a.broker !== 'Mutual funds').map((a) => accountGuide(state, fam, memberId, a, today));
  if (folios.length) accounts.push(sectionGuide(state, fam, memberId, MUTUAL_FUNDS, folios.map((a) => a.key), today));
  const first = accounts.length === 0;
  const done = !first && accounts.every((a) => !a.stale && a.steps.every((st) => st.status !== 'next' && st.status !== 'later'));

  const usable = usableShare(fam, memberId);
  return {
    memberId, name, first, accounts, usable, pct: pct(usable), done,
    cushion: done ? cushionOf(fam, memberId, refs) : [],
    otherGaps: planGaps(fam, state.positions, state.brokerSummaries, state.imports).filter((g) => g.memberId === memberId && !STEP_GAPS.includes(g.key)),
  };
}

/** Room kept spare over every open move sized from average cost, per account, with the year `cushionNudge` would name. */
function cushionOf(fam: FamilyView, memberId: string, refs: AccountRef[]): MemberGuide['cushion'] {
  const sums = new Map<string, Paise>();
  for (const m of fam.moves) {
    if (!m.approx || m.noRoom || (m.kind === 'gift' ? m.fromId : m.memberId) !== memberId) continue;
    const gain = m.kind === 'harvest_loss' ? m.loss : m.gain;
    const k = normAccount(m.account);
    sums.set(k, (sums.get(k) ?? 0) + Math.abs(gain) * APPROX_MARGIN);
  }
  const total = [...sums.values()].reduce((a, v) => a + v, 0);
  if (to100(total) < CUSHION_MIN) return [];
  return [...sums].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => {
    const ref = refs.find((r) => r.key === k);
    const oldest = fam.tradebookFrom[accountKey(memberId, k)];
    return { account: ref?.label ?? k, broker: ref?.broker ?? 'Other', fy: oldest ? fyFromStart(fyStart(oldest) - 1) : null, rupees: to100(v) };
  });
}

/** Every member's guide, and the family's completeness. */
export function familyGuide(state: GuideState, fam: FamilyView, today: ISODate): FamilyGuide {
  const members = state.members.map((m) => memberGuide(state, fam, m.id, today));
  const sum = members.reduce((a, g) => ({ usable: a.usable + g.usable.usable, total: a.total + g.usable.total }), { usable: 0, total: 0 });
  return { members, pct: pct(sum) };
}

export interface FamilyRow { holdings: string; pnl: string; tradebooks: string; usable: string }

/** One cell: of the steps of these kinds across accounts, the word for the one that needs the most. */
function cell(g: MemberGuide, kinds: StepKind[], word: (a: AccountGuide, st: GuideStep) => [rank: number, text: string]): string {
  let best: [number, string] | null = null;
  for (const a of g.accounts) {
    for (const st of a.steps) {
      if (!kinds.includes(st.kind)) continue;
      const w = word(a, st);
      if (!best || w[0] > best[0]) best = w;
    }
  }
  return best?.[1] ?? '—';
}

const open = (st: GuideStep) => st.status === 'next' || st.status === 'later';

/** The family table's words for one member: next > refresh > can't read yet / optional > done. */
export function familyRow(g: MemberGuide): FamilyRow {
  const holdings = g.first ? 'Start' : cell(g, ['holdings', 'cas'], (a, st) => {
    if (st.refresh) return [2, 'Refresh'];
    if (open(st)) return [3, 'Next'];
    if (a.broker === 'Angel One') return [1, 'Funds only'];
    const d = st.asOf ?? a.newest;
    return [0, d ? `✓ ${dateLabel(d, false)}` : '✓'];
  });
  const pnl = cell(g, ['pnl'], (_a, st) => (open(st) ? [3, 'Next'] : st.status === 'unreadable' ? [1, "Can't read yet"] : [0, '✓']));
  const tradebooks = cell(g, ['tradebook', 'fund_tradebook'], (_a, st) =>
    open(st) ? [3, 'Next'] : st.status === 'suggestion' ? [1, 'Optional'] : [0, `✓ ${plural(st.years?.length ?? 0, 'year')}`]);
  return { holdings, pnl, tradebooks, usable: g.pct == null ? '—' : `${g.pct}%` };
}
