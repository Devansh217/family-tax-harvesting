import { addMonths } from '../engine/dates';
import { countingSummaries, giverOf, isPlacement, type FamilyView } from '../engine/family';
import { accountKey, isOld, newestEvidence } from '../engine/freshness';
import { APPROX_MARGIN, decidingFiles, isTradebook, normAccount, TRIMMING_HOLDINGS_SOURCES, type DecidingFile } from '../engine/openingLots';
import { QTY_SCALE, type ISODate, type Paise } from '../engine/types';
import type { ParseResult } from '../parsers';
import { DEMAT_SNAPSHOT_SOURCE, importAddedNothing, importTxnIds, type AppState, type ImportOptions } from '../store';
import { dateLabel, inr, inrShort } from './format';
import { fundsNoDatesGap, planGaps, sharesNoDatesGap, unexplainedValue, type PlanGap } from './plan';

export type GuideState = Pick<AppState, 'members' | 'securities' | 'txns' | 'positions' | 'imports' | 'brokerSummaries'>;
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
  const found = new Map<string, { spellings: Map<string, number>; formats: Set<string>; demat: boolean }>();
  const see = (account: string | undefined, importId: string | undefined, demat = false) => {
    const key = normAccount(account);
    const e = found.get(key) ?? { spellings: new Map<string, number>(), formats: new Set<string>(), demat: false };
    const label = (account ?? '').trim();
    e.spellings.set(label, (e.spellings.get(label) ?? 0) + 1);
    const f = importId ? formatOf.get(importId) : undefined;
    if (f) e.formats.add(f);
    if (demat) e.demat = true;
    found.set(key, e);
  };
  for (const t of state.txns) if (t.memberId === memberId) see(t.account, t.importId);
  for (const p of state.positions) if (p.memberId === memberId) see(p.account, p.importId, p.source === DEMAT_SNAPSHOT_SOURCE);
  for (const b of state.brokerSummaries) if (b.memberId === memberId) see(b.account, b.importId);
  const labelOf = (spellings: Map<string, number>) =>
    [...spellings].sort(([a, n], [b, m]) => m - n || (a < b ? -1 : a > b ? 1 : 0))[0]![0];
  return [...found].map(([key, e]) => {
    const label = labelOf(e.spellings);
    const broker = brokerOf(label, [...e.formats]);
    // Demat shares from a combined CAS are held at a broker, not in a fund folio.
    return { label, key, broker: e.demat && broker === 'Mutual funds' ? 'Other' : broker };
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
export type StepStatus = 'done' | 'next' | 'later' | 'suggestion';
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

/** A tax year is covered by tradebooks with trades in `years` when it lies between their oldest and newest, inclusive. */
const yearIn = (years: number[], y: number) => years.length > 0 && Math.min(...years) <= y && y <= Math.max(...years);

/** A step before its place in the order is known: `open` ones become next (the first) or later. */
type Draft = Omit<GuideStep, 'status'> & { status: 'open' | 'done' | 'suggestion' };

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

/** The Tax P&L step: done once a broker Tax P&L covering this tax year is in for the account. */
function pnlStep(c: Ctx, where: string, broker: string): Draft {
  const rules = c.fam.rules;
  const pnl = countingSummaries(c.state.brokerSummaries)
    .filter((b) => b.memberId === c.memberId && normAccount(b.account) === c.acct.key)
    .filter((b) => (b.summary.from ?? '0000-00-00') <= rules.end && (b.summary.to ?? '9999-12-31') >= rules.start)
    .sort((x, y) => (y.summary.to ?? '').localeCompare(x.summary.to ?? ''))[0];
  return {
    kind: 'pnl', status: pnl ? 'done' : 'open', title: `Tax P&L, ${rules.label}`, where,
    unlocks: `Exact gains booked this year, so the room matches ${broker}'s figures.`,
    ...(pnl ? { doneLine: `Tax P&L · ${dateLabel(pnl.summary.from ?? rules.start)} – ${dateLabel(pnl.summary.to ?? rules.end)}` } : {}),
  };
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
  steps.push(pnlStep(c, `Console → Reports → Tax P&L → ${rules.label} → Download (.xlsx)`, 'Zerodha'));

  // 3. Tradebooks: only the tax years of the 12 months before the holdings file can date its short-term rest.
  const corporate = new Set(fam.holdingsNotes.corporateActions
    .filter((n) => n.memberId === c.memberId && normAccount(n.account) === acct.key).map((n) => n.isin));
  const undatedShares = lots.filter((l) => !isFund(l.isin) && !l.certain && !l.approx && !corporate.has(l.isin) && l.date >= GRANDFATHER_AFTER);
  const gap = { n: new Set(undatedShares.map((l) => l.isin)).size, v: undatedShares.reduce((a, l) => a + (l.value ?? 0), 0) };
  const ref = file?.asOf ?? today;
  const window = [...new Set([fyStart(ref), fyStart(addMonths(ref, -12))])];
  // Fund (Coin) trades date only funds: they feed the fund tradebook step below, never the equity years.
  const tradeYears = [...new Set(trades.filter((t) => !isFund(t.isin)).map((t) => fyStart(t.date)))].sort((a, b) => b - a);
  // A year is in when a tradebook covers it: a trade falls in it, or it lies between the oldest and newest years with
  // trades (a year with no trades is possible). A lone older tradebook leaves the years after it out.
  const missing = window.find((y) => !yearIn(tradeYears, y));
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

  // 4. Fund tradebooks (Coin), while funds in the account are undated. Years between the oldest and newest fund
  // tradebook are in (a year with no trades is possible). The undated units were bought after the newest or before the
  // oldest, so up to two years are asked: this tax year when the newest is older, and the year before the oldest.
  const undatedFunds = lots.filter((l) => isFund(l.isin) && !l.certain);
  if (undatedFunds.length) {
    const fundYears = trades.filter((t) => isFund(t.isin)).map((t) => fyStart(t.date));
    const asks = fundYears.length
      ? [fyStart(today) > Math.max(...fundYears) ? fyStart(today) : null, Math.min(...fundYears) - 1]
      : [fyStart(today)];
    const years = asks.filter((y): y is number => y != null && y >= OLDEST_COIN_FY);
    const n = new Set(undatedFunds.map((l) => l.isin)).size;
    const v = undatedFunds.reduce((a, l) => a + (l.value ?? 0), 0);
    for (const year of years) {
      const fy = fyFromStart(year);
      steps.push({
        kind: 'fund_tradebook', status: 'open', title: `Fund tradebook (Coin), ${fy}`, fy, where: `Console → Reports → Tradebook → segment MF → ${fy}`,
        unlocks: years.length === 1 ? `Dates ${plural(n, 'fund')} (${inr(v)}) so they can get moves.` : `Could date up to ${plural(n, 'fund')} (${inr(v)}) so they can get moves.`,
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
  const txns = c.state.txns.filter((t) => t.memberId === c.memberId && c.keys.has(normAccount(t.account)));
  const shares = txns.some((t) => !isFund(t.isin));
  if (shares) c.notes.push("Angel shares are counted from your tradebooks only until Angel's holdings file can be read.");
  // Only the file's funds are read. With no fund units the app has seen (none bought in the trade history, all
  // redeemed, or bought before it), funds may still be held: the file is offered, optional, never blocking done.
  const noFundsSeen = !funds.length && !c.lots.some((l) => isFund(l.isin));
  return [
    {
      kind: 'holdings', status: funds.length ? 'done' : noFundsSeen ? 'suggestion' : 'open', title: 'Holdings file',
      where: 'Open "Your Holding Details" with its password, save a copy as .xlsx, import the copy.',
      unlocks: noFundsSeen
        ? 'Hold mutual funds at Angel? Add the holdings file: its funds are read. Shares come from your trade history for now.'
        : 'The funds held today, so the plan can see them.',
      ...(funds.length ? { doneLine: "Funds read. Shares and SGBs in this file aren't read yet: they come from your tradebooks for now.", ...(asOf ? { asOf } : {}) } : {}),
    },
    pnlStep(c, `Reports → Tax P&L → ${c.fam.rules.label} → download Excel (PDF also works)`, 'Angel One'),
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
 * The checklist for one account: its broker's steps in order, each done or a suggestion by its own test,
 * the first remaining one next and the rest later. When the account's newest data is old (`isOld`), its holdings step
 * reopens, titled as a refresh when it was done (its done line kept), and a "Newest data from" note is added. A
 * deciding holdings file 30 or more days old, or traded since, reopens its step as a refresh the same way. The
 * Mutual funds section never goes stale: a fresh CAS adds no newer transaction for a fund only held.
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
  // A fund CAS dates its folios by its period end, but one saved before that was read dates by its newest transaction,
  // which a buy-and-hold investor never moves: so the Mutual funds section never goes stale here (the Plan's marks
  // still use the date).
  // Where the holdings file can't move the date (Angel One shares only), today's trade history is asked instead: a
  // suggestion, as a buy-and-hold member's newer download has no new trades and can't clear the line.
  const h = drafts.find((d) => d.kind === 'holdings');
  const stale = acct.broker !== 'Mutual funds' && newest != null && isOld(newest, today);
  if (stale) {
    const history = drafts.find((d) => d.kind === 'tradebook' && d.status === 'suggestion');
    if (h && h.status !== 'done' && h.status !== 'open' && history) {
      Object.assign(history, {
        refresh: true, title: 'Trade history: refresh',
        unlocks: `Download today's: your newest data is from ${dateLabel(newest)}. Sales since then aren't counted until it's in.`,
      });
    } else if (h) {
      const wasDone = h.status === 'done';
      Object.assign(h, {
        status: 'open', unlocks: `Download today's: your newest data is from ${dateLabel(newest)}.`,
        ...(wasDone ? { refresh: true, title: 'Holdings file: refresh' } : {}),
      });
    }
    notes.push(`Newest data from ${dateLabel(newest)}.`);
  } else if (file) {
    // The deciding holdings file itself is old, or traded since, even when a newer tradebook or P&L is in (design §7).
    const traded = fam.holdingsNotes.staleFiles.some((f) => f.memberId === memberId && normAccount(f.account) === acct.key && f.asOf === file.asOf);
    if (h?.status === 'done' && (traded || isOld(file.asOf, today))) {
      const d = dateLabel(file.asOf);
      Object.assign(h, {
        status: 'open', refresh: true, title: 'Holdings file: refresh',
        unlocks: traded ? `Download today's: you've traded since the one you added (${d}).` : `Download today's: the one you added is from ${d}.`,
      });
    }
  }

  // Tradebook asks never block done: a year with no trades has no tradebook to add. Once the holdings file and this
  // year's P&L are in, any year still asked is a suggestion (design anti-goal: tradebooks never block the plan).
  const settled = (kind: StepKind) => drafts.some((d) => d.kind === kind && d.status === 'done');
  if (settled('holdings') && settled('pnl')) {
    for (const d of drafts) {
      if ((d.kind === 'tradebook' || d.kind === 'fund_tradebook') && d.status === 'open') {
        Object.assign(d, { status: 'suggestion', unlocks: `${d.unlocks} Made no trades that year? Skip it: your plan doesn't wait for it.` });
      }
    }
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
  /** Every step is done, can't be read yet or a suggestion, no account's old data waits on a file it must have, and no undated funds wait on a CAS. */
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
type Undated = Map<string, { shares: Paise; funds: Paise }>;

/**
 * Per account (`normAccount`) of a member, the value of units with no buy date, by kind: lots whose date or cost isn't
 * certain, and units the account's holdings rows show that the member's lots don't explain (as `planGaps` values them).
 */
function undatedUnits(fam: FamilyView, positions: GuideState['positions'], memberId: string): Undated {
  const out: Undated = new Map();
  const addTo = (account: string | undefined, isin: string, v: Paise) => {
    if (v <= 0) return;
    const k = normAccount(account);
    const e = out.get(k) ?? { shares: 0, funds: 0 };
    if (isFund(isin)) e.funds += v; else e.shares += v;
    out.set(k, e);
  };
  for (const h of fam.members.find((m) => m.member.id === memberId)?.holdings ?? []) {
    for (const l of h.lots) if (!l.certain) addTo(l.account, h.isin, l.value ?? 0);
  }
  const rows = new Map<string, { account: string | undefined; isin: string; qty: number }>();
  for (const p of positions) {
    if (p.memberId !== memberId || p.qty == null) continue;
    const k = `${normAccount(p.account)}|${p.isin}`;
    if (p.qty > (rows.get(k)?.qty ?? -1)) rows.set(k, { account: p.account, isin: p.isin, qty: p.qty });
  }
  for (const r of rows.values()) addTo(r.account, r.isin, unexplainedValue(fam, memberId, r.isin, r.qty));
  return out;
}

/**
 * A gap the steps already ask for. Undated shares are a step's only in Zerodha accounts (the tradebook step), so the
 * gap stays unless every account holding them is Zerodha. Undated funds are dated by the Mutual funds (CAS) section,
 * or by Zerodha's fund tradebook step when every account holding them is Zerodha.
 */
function coveredBySteps(g: PlanGap, undated: Undated, refs: AccountRef[]): boolean {
  if (!STEP_GAPS.includes(g.key)) return false;
  const onlyZerodha = (kind: 'shares' | 'funds') =>
    [...undated].filter(([, v]) => v[kind] > 0).every(([k]) => refs.find((r) => r.key === k)?.broker === 'Zerodha');
  if (g.key === 'shares_no_dates') return onlyZerodha('shares');
  if (g.key === 'funds_no_dates') return refs.some((a) => a.broker === 'Mutual funds') || onlyZerodha('funds');
  return true;
}

/** Value of the units of one kind this member's holdings rows show that no lot explains (as `planGaps` values them). */
function unexplainedOfKind(fam: FamilyView, positions: GuideState['positions'], memberId: string, fund: boolean): Paise {
  const missing = new Map<string, number>();
  for (const p of positions) {
    if (p.memberId !== memberId || p.qty == null || isFund(p.isin) !== fund) continue;
    missing.set(p.isin, Math.max(missing.get(p.isin) ?? 0, p.qty));
  }
  return [...missing].reduce((a, [isin, qty]) => a + unexplainedValue(fam, memberId, isin, qty), 0);
}
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
  const gaps = planGaps(fam, state.positions, state.brokerSummaries, state.imports).filter((g) => g.memberId === memberId);
  // A member with only holdings rows (Angel One funds, a Groww export) has no lots, so `planGaps` reads them as
  // "nothing imported"; their shares and funds still have no buy dates.
  if (!first && gaps.some((g) => g.key === 'no_holdings')) {
    const shares = unexplainedOfKind(fam, state.positions, memberId, false);
    if (shares > 0) gaps.push(sharesNoDatesGap(memberId, name, shares));
    const funds = unexplainedOfKind(fam, state.positions, memberId, true);
    if (funds > 0) gaps.push(fundsNoDatesGap(memberId, name, funds));
  }
  const undated = undatedUnits(fam, state.positions, memberId);
  const otherGaps = gaps.filter((g) => !coveredBySteps(g, undated, refs)).map((g) => {
    // Zerodha's own undated shares (a bonus credit, a pre-2018 buy) are its tradebook step's and notes': beside them,
    // the gap names only the other brokers' undated shares, in the plain wording.
    if (g.key !== 'shares_no_dates') return g;
    const isZerodha = (k: string) => refs.find((r) => r.key === k)?.broker === 'Zerodha';
    if (![...undated].some(([k, v]) => v.shares > 0 && isZerodha(k))) return g;
    const elsewhere = [...undated].filter(([k]) => !isZerodha(k)).reduce((a, [, v]) => a + v.shares, 0);
    return sharesNoDatesGap(memberId, name, elsewhere);
  });
  // Undated funds no step can date keep the member from done: the CAS is their file. Undated shares at another broker
  // don't: their trade history may be complete (an IPO allotment or bonus has no trade), so it never blocks (design §3).
  // Old data blocks done unless its only refresh is a suggestion (a trade-history download that may hold no trades).
  const staleBlocks = (a: AccountGuide) => a.stale && !a.steps.some((st) => st.refresh && st.status === 'suggestion');
  const done = !first && accounts.every((a) => !staleBlocks(a) && a.steps.every((st) => st.status !== 'next' && st.status !== 'later'))
    && !otherGaps.some((g) => g.key === 'funds_no_dates');

  const usable = usableShare(fam, memberId);
  return {
    memberId, name, first, accounts, usable, pct: pct(usable), done,
    cushion: done ? cushionOf(fam, memberId, refs) : [],
    otherGaps,
  };
}

/** Room kept spare over every open move sized from average cost, per account, with the year `cushionNudge` would name. */
function cushionOf(fam: FamilyView, memberId: string, refs: AccountRef[]): MemberGuide['cushion'] {
  const sums = new Map<string, Paise>();
  for (const m of fam.moves) {
    if (!m.approx || m.noRoom || isPlacement(m) || giverOf(m) !== memberId) continue;
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

/** The family table's words for one member: next > refresh > optional > done. */
export function familyRow(g: MemberGuide): FamilyRow {
  const holdings = g.first ? 'Start' : cell(g, ['holdings', 'cas'], (a, st) => {
    if (st.refresh) return [2, 'Refresh'];
    if (open(st)) return [3, 'Next'];
    if (st.status === 'suggestion') return [1, 'Optional'];
    if (a.broker === 'Angel One') return [1, 'Funds only'];
    const d = st.asOf ?? a.newest;
    return [0, d ? `✓ ${dateLabel(d, false)}` : '✓'];
  });
  const pnl = cell(g, ['pnl'], (_a, st) => (open(st) ? [3, 'Next'] : [0, '✓']));
  const tradebooks = cell(g, ['tradebook', 'fund_tradebook'], (_a, st) =>
    open(st) ? [3, 'Next'] : st.refresh ? [2, 'Refresh'] : st.status === 'suggestion' ? [1, 'Optional'] : [0, `✓ ${plural(st.years?.length ?? 0, 'year')}`]);
  return { holdings, pnl, tradebooks, usable: g.pct == null ? '—' : `${g.pct}%` };
}

/** What the success card compares before and after a file is added. */
export interface GuideSummary {
  pct: number | null;
  /** Tax-free room left, as the member page shows it (`roomAfterPlan`). */
  room: Paise;
  /** Gains booked this tax year, net of this year's losses. */
  bookedLt: Paise; bookedSt: Paise;
  /** Shares with a lot no date covers (not even an average-cost one), and funds with an uncertain lot. */
  undatedShares: number; undatedFunds: number;
  /** `${accountKey}:${kind}` for every done step. */
  stepsDone: string[];
}

export function guideSummary(state: GuideState, fam: FamilyView, memberId: string, today: ISODate): GuideSummary {
  const g = memberGuide(state, fam, memberId, today);
  const view = fam.members.find((m) => m.member.id === memberId);
  const holdings = view?.holdings ?? [];
  const count = (fund: boolean, undated: (l: (typeof holdings)[number]['lots'][number]) => boolean) =>
    holdings.filter((h) => isFund(h.isin) === fund && h.lots.some(undated)).length;
  return {
    pct: g.pct,
    room: view?.roomAfterPlan ?? 0,
    bookedLt: view ? view.year.ltGains - view.year.ltLosses : 0,
    bookedSt: view ? view.year.stGains - view.year.stLosses : 0,
    undatedShares: count(false, (l) => !l.certain && !l.approx),
    undatedFunds: count(true, (l) => !l.certain),
    stepsDone: g.accounts.flatMap((a) => a.steps.filter((st) => st.status === 'done').map((st) => `${accountKey(memberId, a.key)}:${st.kind}`)).sort(),
  };
}

export interface Success { read: string; changes: string[]; pctFrom: number | null; pctTo: number | null; unchanged: boolean }

/** The success card's line when a file changed nothing in the plan. */
export const UNCHANGED = 'Read. Your plan is unchanged by this file.';

/** What a file changed, in the card's order: completeness, room, then undated shares and funds now dated. */
export function successDiff(before: GuideSummary, after: GuideSummary, read: string, broker?: string): Success {
  const changes: string[] = [];
  if (after.pct != null && after.pct !== before.pct) {
    changes.push(before.pct == null ? `Moves use ${after.pct}%` : `Moves use ${before.pct}% → ${after.pct}%`);
  }
  if (after.room !== before.room) {
    // A P&L step that turned done is the broker of the file just read.
    const pnlDone = broker != null && after.stepsDone.some((k) => k.endsWith(':pnl') && !before.stepsDone.includes(k));
    changes.push(`Tax-free room left ${inrShort(before.room)} → ${inrShort(after.room)}${pnlDone ? `, now matching ${broker}'s figures` : ''}`);
  }
  const shares = before.undatedShares - after.undatedShares;
  if (shares > 0) changes.push(`${plural(shares, 'undated share')} now dated`);
  const funds = before.undatedFunds - after.undatedFunds;
  if (funds > 0) changes.push(`${plural(funds, 'undated fund')} now dated`);
  return { read, changes, pctFrom: before.pct, pctTo: after.pct, unchanged: changes.length === 0 };
}

/** One line saying what a file held, by kind: Tax P&L, fund statement, holdings or tradebook. */
export function readLine(r: ParseResult): string {
  const b = r.brokerSummary;
  if (b) {
    const lt = (b.equityLongTerm ?? 0) + (b.mfLongTerm ?? 0);
    const st = (b.equityShortTerm ?? 0) + (b.mfShortTerm ?? 0);
    const period = b.from && b.to ? `${dateLabel(b.from)} – ${dateLabel(b.to)} · ` : '';
    return `Tax P&L · ${period}booked ${inrShort(lt)} long-term, ${inrShort(st)} short-term`;
  }
  if (isFundFormat(r.format)) {
    return `Fund statement · ${plural(new Set(r.txns.map((t) => t.isin)).size, 'fund')}, ${plural(r.txns.length, 'transaction')}`;
  }
  const held = r.prices.filter((p) => p.qty != null && p.qty > 0);
  if (held.length) {
    const asOf = held.reduce<ISODate | undefined>((a, p) => (p.priceDate && (!a || p.priceDate > a) ? p.priceDate : a), undefined);
    const shares = new Set(held.filter((p) => !isFund(p.isin)).map((p) => p.isin)).size;
    const funds = new Set(held.filter((p) => isFund(p.isin)).map((p) => p.isin)).size;
    const value = held.reduce((a, p) => a + Math.round((p.price * (p.qty ?? 0)) / QTY_SCALE), 0);
    const parts = [shares ? plural(shares, 'share') : '', funds ? plural(funds, 'fund') : ''].filter(Boolean);
    return `Holdings${asOf ? ` · as on ${dateLabel(asOf)}` : ''} · ${parts.join(' and ')}, ${inrShort(value)}`;
  }
  const dates = r.txns.map((t) => t.date).sort();
  if (dates.length) return `Tradebook · ${plural(dates.length, 'trade')}, ${dateLabel(dates[0]!)} to ${dateLabel(dates[dates.length - 1]!)}`;
  return 'Nothing read from this file.';
}

/** Whole calendar months from `from` to `to`, at least 1. */
const monthsOld = (from: ISODate, to: ISODate) => {
  let n = 0;
  while (addMonths(from, n + 1) <= to) n++;
  return Math.max(1, n);
};

/** Position fields that make two saved rows the same holding, whichever import saved them. */
const sameRow = (p: AppState['positions'][number]) =>
  JSON.stringify([p.memberId, p.isin, p.qty, p.ltQty ?? null, p.asOf ?? null, p.source, p.cost ?? null, normAccount(p.account)]);

/**
 * The earlier import a file that added nothing repeats: the first in `before.imports` that saved one of the trades the
 * file holds (by the exact id `applyImport` gives it) or a holdings row its positions match. Undefined when none does.
 */
function repeatedImport(before: GuideState, after: GuideState, importId: string, memberId: string, parsed?: ParsedFile) {
  const ids = new Set(parsed ? importTxnIds(before, memberId, parsed.result, parsed.opts) : []);
  const rows = new Set(after.positions.filter((p) => p.importId === importId).map(sameRow));
  const owners = new Set([
    ...before.txns.filter((t) => ids.has(t.id)).map((t) => t.importId),
    ...before.positions.filter((p) => rows.has(sameRow(p))).map((p) => p.importId),
  ]);
  return before.imports.find((i) => owners.has(i.id));
}

/** The file as parsed and the options it was added with, so a repeat can be traced to the file that holds its trades. */
export interface ParsedFile { result: ParseResult; opts?: ImportOptions }

/**
 * Amber notes for a file just added (design §7), in order: the same file again (alone, as it changed nothing); an
 * older holdings file than the account's; an old or stale holdings file that decides the account; a Tax P&L of an
 * earlier tax year; tax years missing between a tradebook's oldest and newest; this year's tradebook missing.
 */
export function fileNotes(before: GuideState, after: GuideState, importId: string, famAfter: FamilyView, today: ISODate, parsed?: ParsedFile): string[] {
  const imp = after.imports.find((i) => i.id === importId);
  if (!imp) return [];
  const memberId = imp.memberId;
  const rules = famAfter.rules;
  const summaries = after.brokerSummaries.filter((b) => b.importId === importId);

  if (!summaries.length && importAddedNothing(before as AppState, after as AppState)) {
    const earlier = repeatedImport(before, after, importId, memberId, parsed);
    return [earlier
      ? `Same as ${earlier.fileName} you added on ${dateLabel(earlier.at.slice(0, 10))}. Nothing new was added.`
      : 'Nothing new: these trades are already in.'];
  }

  const out: string[] = [];
  const positions = after.positions.filter((p) => p.importId === importId);
  const txns = after.txns.filter((t) => t.importId === importId);
  const accounts = [...new Set([...positions.map((p) => p.account), ...txns.map((t) => t.account), ...summaries.map((b) => b.account)].map(normAccount))].sort();
  const deciding = decidingFiles(famAfter.positions);

  // Holdings files: older than the account's, or old (or traded since) while deciding it.
  const files = new Map<string, ISODate>();
  for (const p of positions) {
    if (!TRIMMING_HOLDINGS_SOURCES.includes(p.source) || !p.asOf) continue;
    const k = normAccount(p.account);
    if (!files.has(k) || p.asOf > files.get(k)!) files.set(k, p.asOf);
  }
  const older: string[] = [];
  const old: string[] = [];
  for (const k of [...files.keys()].sort()) {
    const asOf = files.get(k)!;
    const d = dateLabel(asOf);
    const dec = deciding.get(accountKey(memberId, k));
    if (!dec) continue;
    if (dec.importId !== importId) {
      if (asOf < dec.asOf) older.push(`This holdings file is from ${d}. You already have one from ${dateLabel(dec.asOf)}, so this one changes nothing. Shares sold since ${d} won't come back.`);
      continue;
    }
    const stale = famAfter.holdingsNotes.staleFiles.some((f) => f.memberId === memberId && normAccount(f.account) === k && f.asOf === asOf);
    if (!stale && !isOld(asOf, today)) continue;
    const where = memberGuide(after, famAfter, memberId, today).accounts.find((a) => a.key === k)?.steps.find((st) => st.kind === 'holdings')?.where ?? '';
    old.push(`This holdings file is from ${d} and ${stale ? "you've traded since" : `it's ${plural(monthsOld(asOf, today), 'month')} old`}. Download today's from ${where}.`);
  }
  out.push(...older, ...old);

  // A Tax P&L of an earlier tax year.
  const startYear = Number(rules.start.slice(0, 4));
  for (const b of summaries) {
    const to = b.summary.to;
    if (to && to < rules.start) {
      out.push(`This is the ${fyOf(to)} tax P&L. It's kept, but this year's room needs ${rules.label}, from 1 Apr ${startYear} to today.`);
    }
  }

  // Tradebook years per account this file touched.
  const yearsOf = (k: string) => [...new Set(after.txns
    .filter((t) => t.memberId === memberId && isTradebook(t) && normAccount(t.account) === k).map((t) => fyStart(t.date)))];
  if (txns.some(isTradebook)) {
    for (const k of accounts) {
      const years = yearsOf(k);
      if (!years.length) continue;
      for (let y = Math.max(...years) - 1; y > Math.min(...years); y--) {
        if (!years.includes(y)) out.push(`No trades from ${fyFromStart(y)} are in. If you traded that year, add its tradebook.`);
      }
    }
  }
  for (const k of accounts) {
    const years = yearsOf(k);
    if (!years.length || years.includes(startYear)) continue;
    const hasPnl = countingSummaries(after.brokerSummaries)
      .some((b) => b.memberId === memberId && normAccount(b.account) === k && (b.summary.to ?? '') >= rules.start);
    const hasHoldings = after.positions.some((p) => p.memberId === memberId && normAccount(p.account) === k && (p.asOf ?? '') >= rules.start);
    if (hasPnl || hasHoldings) {
      out.push(`This year's tradebook isn't in, so trades since 1 Apr come only from ${hasPnl ? 'the tax P&L' : 'the holdings file'}.`);
    }
  }
  return out;
}
