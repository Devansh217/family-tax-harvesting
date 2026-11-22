import { isElssFund } from './categories';
import { addMonths, daysBetween, isLongTerm, longTermFrom } from './dates';
import { buildLedger, effectiveCost, lotKey, lotTerms, prorate, saleTerms } from './ledger';
import { APPROX_MARGIN, effectiveTxnsWithNotes, type CorporateActionNote, type HeldPosition, type TrimNote } from './openingLots';
import { terGapFor } from './data/ter-gap';
import { directTwin, type FundsMap } from './directTwin';
import { giftTransferCost, ltRate, roundTripCost, slabRate, stRate, type TaxRules } from './rules';
import { switchDecision } from './switch';
import { moveId, retiredMoveIds, type MoveDraft, type RecommendationRecord } from './records';
import { canGift } from './relations';
import { NSE_HOLIDAYS_2027, buybackDate } from './season';
import { longTermMonthsFor, lotTaxType, summariseYear, type BusinessIncome, type YearSummary } from './tax';
import { inRange } from './dates';
import {
  QTY_SCALE, type ISODate, type Ledger, type Lot, type Member, type Paise, type Qty, type Realised, type Security, type Term, type TermAnswer, type Txn,
} from './types';

export interface PlannedSale { id: string; memberId: string; isin: string; qty: Qty }

export interface FamilyState {
  members: Member[];
  securities: Security[];
  txns: Txn[];
  /** Sales the family intends to make this tax year. They use room and lots before any move is suggested. */
  plannedSales?: PlannedSale[];
  /** `${memberId}|${isin}` → the money is needed within 12 months, so no sell-and-buy-back or gift is suggested. */
  needSoon?: Record<string, boolean>;
  /** Broker tax P&L totals. Where the engine's own gains for that account and period differ, the broker's are used. */
  brokerSummaries?: Array<{ memberId: string; account: string; summary: BrokerTotals }>;
  /** Nightly funds.json (ISIN → name and category), used to find the direct twin of a regular plan. */
  funds?: FundsMap;
  /** Units holdings files say each member holds: fill in lots bought before the trade history (openingLots.ts). */
  positions?: HeldPosition[];
  /** Moves the family picked a day for. They are sized first, in date order, and hold their room. */
  datedMoves?: DatedMove[];
  /** The family's records. A dated move that is done (marked or seen in a statement) is retired: no longer sized first. */
  recommendations?: RecommendationRecord[];
  /** The family's answers for sales whose buy date is unknown (see `Realised.termUnknown`). */
  termAnswers?: TermAnswer[];
}

export interface DatedMove { moveId: string; date: ISODate }

export interface BrokerTotals {
  broker: string;
  from: ISODate | null;
  to: ISODate | null;
  equityShortTerm: Paise | null;
  equityLongTerm: Paise | null;
  mfShortTerm: Paise | null;
  mfLongTerm: Paise | null;
}

/** One booked-gain correction per category where the broker's total and the engine's differ. */
export interface BrokerAdjustment { memberId: string; account: string; broker: string; label: string; term: Term; gain: Paise }

export interface HoldingLot {
  account: string;
  date: ISODate;
  qty: Qty;
  cost: Paise;
  value: Paise | null;
  gain: Paise | null;
  term: Term;
  longTermOn: ISODate;
  /** False when the date or cost was guessed, or the 31 Jan 2018 value is missing. Such lots get no moves. */
  certain: boolean;
  /** ELSS only: the date the three-year lock-in ends. Shown even after it has passed. */
  lockedUntil?: ISODate;
  /** Bought before the trade history: long-term, at the broker's average cost. */
  approx?: boolean;
}

export interface Holding {
  memberId: string;
  isin: string;
  name: string;
  taxType: Security['taxType'];
  listed: boolean;
  qty: Qty;
  cost: Paise;
  price: Paise | null;
  value: Paise | null;
  ltGain: Paise;
  stGain: Paise;
  lots: HoldingLot[];
  accounts: string[];
  uncertainLots: number;
}

/**
 * `gain` moves into tax-free room; `taxAvoided` is that gain at today's rate (paid only on a future sale, and only if
 * that year's gains go past the exemption). For losses and waits it is tax cut this year. `saving` is net of `costs`.
 */
interface MoveBase {
  id: string; isin: string; name: string; account: string; qty: Qty; value: Paise; taxAvoided: Paise; costs: Paise; saving: Paise;
  /** One plain-English line per reason, e.g. "Uses ₹40,000 of Asha's ₹1,25,000 tax-free room". */
  reasons: string[];
  /** The day the family picked to make this move. */
  date?: ISODate;
  /** The day to buy back (or buy the direct plan) after the sale: the next trading day. */
  buyOn?: ISODate;
  /** A dated move whose room or units are gone: shown with nothing to do. */
  noRoom?: boolean;
  /** Sized from lots at the broker's average cost (bought before the trade history), with a cushion left in the room. */
  approx?: boolean;
}
export type Move =
  | (MoveBase & { kind: 'harvest_gain'; memberId: string; gain: Paise })
  | (MoveBase & { kind: 'harvest_loss'; memberId: string; loss: Paise; term: Term })
  | (MoveBase & { kind: 'wait'; memberId: string; gain: Paise; until: ISODate; days: number })
  | (MoveBase & { kind: 'gift'; fromId: string; toId: string; gain: Paise })
  | (MoveBase & {
    kind: 'switch_direct'; memberId: string; toIsin?: string; gain: Paise; tax: Paise; feeSavedPerYear: Paise;
    /** The part of `gain` booked inside the member's tax-free room: made tax-free, like a harvest. */
    taxFreeGain: Paise;
    when: 'now' | 'wait' | 'next_year'; until?: ISODate;
  });

export const isLaterBenefit = (m: Move) => m.kind === 'harvest_gain' || m.kind === 'gift';

/** Gain a move makes tax-free: a harvest's or gift's whole gain, and the in-room part of a switch to direct. */
export const taxFreeGainOf = (m: Move): Paise =>
  m.kind === 'harvest_gain' || m.kind === 'gift' ? m.gain : m.kind === 'switch_direct' ? m.taxFreeGain ?? 0 : 0;

export interface HoldingsNotes {
  trimmed: TrimNote[];
  staleFiles: Array<{ memberId: string; account: string; asOf: ISODate }>;
  corporateActions: CorporateActionNote[];
}

export interface MemberView {
  member: Member;
  /** Intraday and F&O income used in the tax figures; `intradayDetected` is what the tradebooks show. */
  business: BusinessIncome & { intradayDetected: Paise };
  /** Booked so far. */
  year: YearSummary;
  /** Booked plus planned sales: what moves and room are worked out from. */
  plan: YearSummary;
  planned: { gain: Paise; tax: Paise; roomUsed: Paise };
  holdings: Holding[];
  /** Free room left after this member's own suggested harvests. */
  roomAfterPlan: Paise;
}

export interface FamilyView {
  asOf: ISODate;
  rules: TaxRules;
  members: MemberView[];
  moves: Move[];
  ledger: Ledger;
  /** Corrections that make booked gains equal the broker's tax P&L where trade history is incomplete. */
  brokerAdjustments: BrokerAdjustment[];
  /** What the holdings files changed: units that left, files older than the trades, units changed without a trade. */
  holdingsNotes: HoldingsNotes;
  /** Realised gains used for tax: the ledger's plus any broker adjustments. */
  booked: Realised[];
  /** Gains the planned sales would realise. Their lots are already removed from `ledger.lots`. */
  plannedRealised: Realised[];
  securities: Map<string, Security>;
  totals: {
    /** Free room after booked and planned sales. */
    freeRoom: Paise; bonusFree: Paise; limit: Paise; taxBooked: Paise; plannedGain: Paise;
    /** Gains the moves make tax-free (harvest + gift). */
    taxFreeGains: Paise;
    /** Future tax those gains avoid, net of costs. */
    laterSaving: Paise;
    /** Tax cut this year from losses and waiting, net of costs. */
    nowSaving: Paise;
    costs: Paise;
    uncertainLots: number;
  };
}

const WAIT_WINDOW_DAYS = 90;
const MIN_GAIN: Paise = 1_000_00;
export const MIN_NET_SAVING: Paise = 1_000_00;
const ELSS_LOCK_YEARS = 3;

/** Date an ELSS lot can first be sold (same calendar date three years on); null for anything else. */
export function lockedUntil(lot: { date: ISODate }, sec: Pick<Security, 'category' | 'name'>): ISODate | null {
  return isElssFund(sec) ? addMonths(lot.date, ELSS_LOCK_YEARS * 12) : null;
}
const isLocked = (lot: { date: ISODate }, sec: Pick<Security, 'category' | 'name'>, asOf: ISODate) => {
  const until = lockedUntil(lot, sec);
  return until != null && until > asOf;
};

/** Smallest tradable step: 0.001 units for mutual funds (INF…), whole shares otherwise. */
export const unitStep = (sec: Pick<Security, 'isin'>): Qty => (sec.isin.startsWith('INF') ? QTY_SCALE / 1000 : QTY_SCALE);
const valueOf = (sec: Security, qty: Qty) => Math.round(((sec.price ?? 0) * qty) / QTY_SCALE);

export function isCertain(lot: Pick<Lot, 'date' | 'estimated'>, sec: Security, rules: TaxRules) {
  if (lot.estimated) return false;
  return !(sec.taxType === 'equity' && lot.date <= rules.grandfatherDate && !sec.fmv2018);
}

function lotGain(lot: Pick<Lot, 'date' | 'qty' | 'cost'>, qty: Qty, sec: Security, rules: TaxRules) {
  const value = valueOf(sec, qty);
  const actual = qty === lot.qty ? lot.cost : prorate(lot.cost, qty, lot.qty);
  return value - effectiveCost(lot, actual, qty, value, sec, rules);
}

/** Every account's lot queue for one member and security. */
function queues(ledger: Ledger, memberId: string, isin: string): Array<{ account: string; lots: Lot[] }> {
  const prefix = `${memberId}|${isin}|`;
  const out: Array<{ account: string; lots: Lot[] }> = [];
  for (const [key, lots] of ledger.lots) if (key.startsWith(prefix) && lots.length) out.push({ account: key.slice(prefix.length), lots });
  return out;
}

/** The lots left after skipping `skip` units from the front (copies; the queue is not changed). */
function remainingLots(lots: Lot[], skip: Qty): Lot[] {
  const out: Lot[] = [];
  let left = skip;
  for (const l of lots) {
    if (left >= l.qty) { left -= l.qty; continue; }
    out.push(left > 0 ? { ...l, qty: l.qty - left, cost: l.cost - prorate(l.cost, left, l.qty) } : l);
    left = 0;
  }
  return out;
}

/** Removes `qty` units from the front of a lot queue (mutates it). */
function consumeFront(lots: Lot[], qty: Qty) {
  let left = qty;
  while (left > 0 && lots.length) {
    const lot = lots[0]!;
    const take = Math.min(lot.qty, left);
    lot.cost -= take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
    lot.qty -= take;
    left -= take;
    if (lot.qty === 0) lots.shift();
  }
}

/** Sells `qty` from a member's accounts, the account holding the oldest lot first. */
function sellAcrossAccounts(ledger: Ledger, memberId: string, sec: Security, qty: Qty, date: ISODate, rules: TaxRules, mutate: boolean): Realised[] {
  const qs = queues(ledger, memberId, sec.isin).sort((a, b) => a.lots[0]!.date.localeCompare(b.lots[0]!.date));
  const out: Realised[] = [];
  let left = qty;
  for (const q of qs) {
    if (left <= 0) break;
    const take = Math.min(q.lots.reduce((a, l) => a + l.qty, 0), left);
    out.push(...previewSale(q.lots, take, sec, date, rules));
    if (mutate) consumeFront(q.lots, take);
    left -= take;
  }
  return out;
}

/** What selling `qty` units now would realise, first-in-first-out. Does not mutate the lots. Guessed lots get the unknown-term rule. */
export function previewSale(lots: Lot[], qty: Qty, sec: Security, saleDate: ISODate, rules: TaxRules): Realised[] {
  const out: Realised[] = [];
  let left = qty;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.qty, left);
    const value = valueOf(sec, take);
    const actual = take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
    const cost = effectiveCost(lot, actual, take, value, sec, rules);
    out.push({
      memberId: lot.memberId, isin: lot.isin, account: lot.account, buyDate: lot.date, sellDate: saleDate, qty: take, proceeds: value, cost,
      gain: value - cost, ...saleTerms(sec, lot, saleDate, value - cost, rules),
    });
    left -= take;
  }
  return out;
}

/**
 * Largest quantity, after skipping `skip` units from the front of one account's queue, that can be sold using only
 * long-term lots with known data, without the cumulative gain exceeding `room`.
 */
function harvestableQty(lots: Lot[], sec: Security, asOf: ISODate, rules: TaxRules, room: Paise, skip: Qty) {
  // `used` is the room the gain takes: an approx lot's gain counts (1 + margin) times, a loss on one (1 − margin) times.
  let qty = 0, gain = 0, used = 0, approx = false, toSkip = skip;
  const weight = (lot: Lot, g: Paise) => (lot.approx ? (g > 0 ? 1 + APPROX_MARGIN : 1 - APPROX_MARGIN) : 1);
  const unit = unitStep(sec);
  for (const lot of lots) {
    let avail = lot.qty;
    if (toSkip > 0) {
      const s = Math.min(avail, toSkip);
      avail -= s;
      toSkip -= s;
      if (avail === 0) continue;
    }
    if (!isLongTerm(lot.date, asOf, rules.longTermMonths) || !isCertain(lot, sec, rules) || isLocked(lot, sec, asOf)) break;
    const view = { date: lot.date, qty: avail, cost: avail === lot.qty ? lot.cost : prorate(lot.cost, avail, lot.qty) };
    const whole = lotGain(view, avail, sec, rules);
    const w = weight(lot, whole);
    if (whole * w <= room - used) {
      qty += avail;
      gain += whole;
      used += whole * w;
      approx ||= !!lot.approx;
      continue;
    }
    const perUnit = (whole * w) / avail;
    let take = Math.floor((room - used) / perUnit / unit) * unit;
    while (take > 0 && lotGain(view, take, sec, rules) * w > room - used) take -= unit;
    if (take > 0) {
      const g = lotGain(view, take, sec, rules);
      qty += take;
      gain += g;
      used += g * w;
      approx ||= !!lot.approx;
    }
    break;
  }
  return { qty, gain, used: Math.round(used), approx };
}

export function computeFamily(state: FamilyState, asOf: ISODate, rules: TaxRules): FamilyView {
  const { txns: effective, ...holdingsNotes } = effectiveTxnsWithNotes(state.txns, state.positions ?? [], asOf, state.securities);
  const ledger = buildLedger(effective, state.securities, rules, state.termAnswers);
  const secs = new Map(state.securities.map((s) => [s.isin, s]));
  const moves: Move[] = [];
  // Dated moves: the family's picked days, by move id. Later entries for the same id win.
  const dated = new Map<string, ISODate>();
  const retired = retiredMoveIds(state.recommendations ?? []);
  for (const d of state.datedMoves ?? []) if (!retired.has(d.moveId)) dated.set(d.moveId, d.date);
  const made = new Set<string>();
  const push = (m: MoveDraft) => {
    const id = moveId(m, rules);
    const date = m.kind === 'wait' ? undefined : dated.get(id);
    made.add(id);
    moves.push({ ...m, id, ...(date ? { date, buyOn: buybackDate(date, secs.get(m.isin)?.listed ?? true, NSE_HOLIDAYS_2027.dates) } : {}) } as Move);
  };
  const idFor = (kind: Move['kind'], memberId: string, isin: string, account: string, toId?: string) =>
    `${rules.label}|${kind === 'gift' ? `gift|${memberId}>${toId}` : `${kind}|${memberId}`}|${isin}|${account}`;
  /** Earlier picked day first; a dated move always before an undated one; 0 when neither is dated. */
  const dateCmp = (a?: ISODate, b?: ISODate) => (a && b ? a.localeCompare(b) : a ? -1 : b ? 1 : 0);
  const DATABLE = new Set<string>(['harvest_gain', 'switch_direct', 'gift', 'harvest_loss']);
  const parseDated = (id: string) => {
    const pre = `${rules.label}|`;
    if (!id.startsWith(pre)) return null;
    const [kind, who, isin, ...acct] = id.slice(pre.length).split('|');
    return kind && who && isin && DATABLE.has(kind) ? { kind: kind as Move['kind'], who, isin, account: acct.join('|') } : null;
  };
  const nameOf = (memberId: string) => views.find((v) => v.member.id === memberId)?.member.name ?? 'This member';
  const rupees = (p: Paise) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
  const LT = ltRate(rules), ST = stRate(rules);
  const approxOf = (r: { approx: boolean }) => (r.approx ? { approx: true as const } : {});
  const approxWhy = (r: { approx: boolean }) => (r.approx
    ? [`Some units were bought before your trade history, so their cost is the broker's average cost: this leaves ${Math.round(APPROX_MARGIN * 100)}% of the room spare in case the real gain is higher. After selling, check the gain in your broker's tax P&L; import the full tradebook or a CAS for exact figures`]
    : []);

  // Where history is incomplete, trust the broker's booked totals so room and tax are right.
  const brokerAdjustments: BrokerAdjustment[] = [];
  for (const b of state.brokerSummaries ?? []) {
    const s = b.summary;
    const from = s.from ?? rules.start, to = s.to ?? rules.end;
    const mine = ledger.realised.filter((r) => r.memberId === b.memberId && (r.account ?? '') === b.account && inRange(r.sellDate, from, to));
    const isEq = (isin: string) => secs.get(isin)?.listed ?? true;
    const cats: Array<[string, Paise | null, Term, boolean]> = [
      ['Shares, short-term', s.equityShortTerm, 'st', true], ['Shares, long-term', s.equityLongTerm, 'lt', true],
      ['Mutual funds, short-term', s.mfShortTerm, 'st', false], ['Mutual funds, long-term', s.mfLongTerm, 'lt', false],
    ];
    for (const [label, broker, term, eq] of cats) {
      if (broker == null) continue;
      const ours = mine.filter((r) => r.term === term && isEq(r.isin) === eq).reduce((a, r) => a + r.gain, 0);
      const diff = broker - ours;
      if (Math.abs(diff) > Math.max(100, Math.abs(broker) * 0.0005)) brokerAdjustments.push({ memberId: b.memberId, account: b.account, broker: s.broker, label, term, gain: diff });
    }
  }
  const adjRealised: Realised[] = brokerAdjustments.map((a) => ({
    memberId: a.memberId, isin: `ADJ:${a.label}`, account: a.account, buyDate: rules.start, sellDate: rules.start,
    qty: 0, proceeds: 0, cost: 0, gain: a.gain, term: a.term, taxType: 'equity',
  }));
  const booked = [...ledger.realised, ...adjRealised];

  const views: MemberView[] = state.members.map((member) => {
    const intradayDetected = ledger.intraday
      .filter((t) => t.memberId === member.id && inRange(t.date, rules.start, rules.end))
      .reduce((a, t) => a + t.pnl, 0);
    const business = {
      speculative: member.business?.intraday ?? intradayDetected,
      nonSpeculative: member.business?.fno ?? 0,
      intradayDetected,
    };
    const year = summariseYear(member, booked, rules, business);
    const plan = year;
    const isins = new Set<string>();
    for (const [key, lots] of ledger.lots) if (key.startsWith(`${member.id}|`) && lots.length) isins.add(lots[0]!.isin);
    const holdings: Holding[] = [];
    for (const isin of isins) {
      const sec = secs.get(isin);
      if (!sec) continue;
      const priced = sec.price != null;
      const qs = queues(ledger, member.id, isin);
      const hl: HoldingLot[] = qs.flatMap(({ lots }) => lots.map((l) => {
        const g = priced ? lotGain(l, l.qty, sec, rules) : null;
        const locked = lockedUntil(l, sec);
        return {
          account: l.account, date: l.date, qty: l.qty, cost: l.cost, value: priced ? valueOf(sec, l.qty) : null, gain: g,
          // Term per lot and type: slab-taxed funds never turn long-term (longTermOn then shows the equity date, unused).
          term: lotTerms(sec, l.date, asOf, rules).term,
          longTermOn: longTermFrom(l.date, longTermMonthsFor(lotTaxType(sec, l.date, rules), sec.listed, rules) ?? rules.longTermMonths),
          certain: isCertain(l, sec, rules),
          ...(l.approx ? { approx: true } : {}),
          ...(locked ? { lockedUntil: locked } : {}),
        } satisfies HoldingLot;
      }));
      const sum = (f: (x: HoldingLot) => number) => hl.reduce((a, x) => a + f(x), 0);
      holdings.push({
        memberId: member.id, isin, name: sec.name, taxType: sec.taxType, listed: sec.listed,
        qty: sum((x) => x.qty), cost: sum((x) => x.cost), price: sec.price ?? null,
        value: priced ? sum((x) => x.value ?? 0) : null,
        ltGain: sum((x) => (x.term === 'lt' ? x.gain ?? 0 : 0)),
        stGain: sum((x) => (x.term === 'st' ? x.gain ?? 0 : 0)),
        lots: hl, accounts: qs.map((q) => q.account), uncertainLots: hl.filter((x) => !x.certain).length,
      });
    }
    holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return { member, business, year, plan, planned: { gain: 0, tax: 0, roomUsed: 0 }, holdings, roomAfterPlan: 0 };
  });

  // Planned sales come first: they take their lots out of the queues and use room before any move is suggested.
  const plannedRealised: Realised[] = [];
  for (const p of state.plannedSales ?? []) {
    const sec = secs.get(p.isin);
    if (!sec || sec.price == null) continue;
    plannedRealised.push(...sellAcrossAccounts(ledger, p.memberId, sec, p.qty, asOf, rules, true));
  }
  for (const v of views) {
    const mine = plannedRealised.filter((r) => r.memberId === v.member.id);
    v.plan = mine.length ? summariseYear(v.member, [...booked, ...mine], rules, v.business) : v.year;
    v.planned = {
      gain: mine.reduce((a, r) => a + r.gain, 0),
      tax: v.plan.tax - v.year.tax,
      roomUsed: v.plan.exemptionUsed + v.plan.bonus.used - (v.year.exemptionUsed + v.year.bonus.used),
    };
    v.roomAfterPlan = v.plan.room.free + v.plan.bonus.free;
  }
  const needSoon = (memberId: string, isin: string) => !!state.needSoon?.[`${memberId}|${isin}`];

  const usedQty = new Map<string, Qty>();
  // Gains the moves sized so far would book, per member, so a later move's tax is what doing all of them costs.
  const saleDay = inRange(asOf, rules.start, rules.end) ? asOf : rules.end;
  const moveGains = new Map<string, Realised[]>();
  const bookLt = (memberId: string, isin: string, gain: Paise) => {
    const rows = moveGains.get(memberId) ?? [];
    rows.push({ memberId, isin, account: '', buyDate: rules.start, sellDate: saleDay, qty: 0, proceeds: 0, cost: 0, gain, term: 'lt', taxType: 'equity' });
    moveGains.set(memberId, rows);
  };
  const summaryWith = (v: MemberView, rows: Realised[]) => summariseYear(
    v.member, [...booked, ...plannedRealised.filter((r) => r.memberId === v.member.id), ...(moveGains.get(v.member.id) ?? []), ...rows], rules, v.business);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const plainDate = (d: ISODate) => { const [y, m, day] = d.split('-').map(Number) as [number, number, number]; return `${day} ${MON[m - 1]} ${y}`; };
  const isRegular = (sec: Security) => sec.plan === 'regular' && !isElssFund(sec);
  const feeSaved = (sec: Security, value: Paise): Paise => Math.round((value * terGapFor(sec.category, sec.name)) / 100);
  const switchWaits = new Set<string>();
  // Switching sells and buys again, so ELSS (a fresh three-year lock) is left out; the caller has checked isRegular.
  const pushSwitch = (member: Member, sec: Security, account: string, qty: Qty, value: Paise, gain: Paise, tax: Paise, fee: Paise, taxAvoided: Paise, taxFreeGain: Paise, when: 'now' | 'wait' | 'next_year', until: ISODate | undefined, why: string[]) => {
    const toIsin = state.funds ? directTwin(sec, state.funds) : undefined;
    if (when === 'wait') switchWaits.add(`${member.id}|${sec.isin}|${account}`);
    push({
      kind: 'switch_direct', memberId: member.id, isin: sec.isin, name: sec.name, account, qty, value, gain, tax, feeSavedPerYear: fee, taxFreeGain, when, toIsin,
      ...(until ? { until } : {}), taxAvoided, costs: 0, saving: taxAvoided + fee,
      reasons: [
        `Moves to the direct plan of the same fund: saves about ${rupees(fee)} a year in fees (estimate)`,
        ...why,
        ...(toIsin ? [] : ['Find the direct plan of this fund at the fund house']),
        'Check the exit load in your fund statement before selling',
      ],
    });
  };

  // Gifts. A dated gift is sized before step 1 so the receiver's own harvests cannot take its room.
  const sizeGift = (giver: MemberView, h: Holding, q: { account: string; lots: Lot[] }, rec: MemberView) => {
    const sec = secs.get(h.isin)!;
    const id = idFor('gift', giver.member.id, h.isin, q.account, rec.member.id);
    const isDated = dated.has(id);
    if (made.has(id) || h.taxType !== 'equity' || !h.listed || h.price == null || needSoon(giver.member.id, h.isin) || isElssFund(sec)) return;
    if ((rec.roomAfterPlan < MIN_GAIN && !isDated) || !canGift(giver.member, rec.member, state.members, asOf)) return;
    const key = lotKey(giver.member.id, h.isin, q.account);
    const r = harvestableQty(q.lots, sec, asOf, rules, rec.roomAfterPlan, usedQty.get(key) ?? 0);
    if (isDated ? r.qty === 0 : r.gain < MIN_GAIN) return;
    const value = valueOf(sec, r.qty);
    const costs = giftTransferCost(value, rules) + roundTripCost(sec, value, rules);
    const taxAvoided = Math.round(r.gain * LT);
    if (!isDated && taxAvoided - costs < MIN_NET_SAVING) return;
    push({ kind: 'gift', fromId: giver.member.id, toId: rec.member.id, isin: h.isin, name: h.name, account: q.account, qty: r.qty, value, gain: r.gain, taxAvoided, costs, saving: taxAvoided - costs, ...approxOf(r),
      reasons: [...approxWhy(r), `${giver.member.name} has no tax-free room left; ${rec.member.name} has ${rupees(rec.roomAfterPlan)} unused`, `A gift between these relatives is not taxed and is not added back to ${giver.member.name}'s income`, `It becomes ${rec.member.name}'s money for good`] });
    usedQty.set(key, (usedQty.get(key) ?? 0) + r.qty);
    rec.roomAfterPlan -= r.used;
    bookLt(rec.member.id, h.isin, r.gain);
  };
  for (const [id] of [...dated].sort((a, b) => a[1].localeCompare(b[1]))) {
    const p = parseDated(id);
    if (p?.kind !== 'gift') continue;
    const [fromId, toId] = p.who.split('>');
    const giver = views.find((v) => v.member.id === fromId), rec = views.find((v) => v.member.id === toId);
    const h = giver?.holdings.find((x) => x.isin === p.isin);
    const q = giver && h ? queues(ledger, giver.member.id, p.isin).find((x) => x.account === p.account) : undefined;
    if (giver && rec && h && q) sizeGift(giver, h, q, rec);
  }

  // 1. Each member fills their own room from their own long-term lots, biggest gains first.
  for (const v of views) {
    let room = v.roomAfterPlan;
    // Regular-plan lots inside the room switch to direct first: the same room also stops a fee.
    const switched = new Set<string>();
    type Q = { account: string; lots: Lot[] };
    const takenKey = (isin: string, account: string) => lotKey(v.member.id, isin, account);
    const trySwitch = (h: Holding, q: Q) => {
      const id = idFor('switch_direct', v.member.id, h.isin, q.account);
      const isDated = dated.has(id);
      if (made.has(id) || (room < MIN_GAIN && !isDated)) return;
      const sec = secs.get(h.isin)!;
      const r = harvestableQty(q.lots, sec, asOf, rules, room, usedQty.get(takenKey(h.isin, q.account)) ?? 0);
      if (isDated ? r.qty === 0 : r.gain < MIN_GAIN) return;
      const value = valueOf(sec, r.qty);
      const taxAvoided = Math.round(r.gain * LT);
      const fee = feeSaved(sec, value);
      if (!isDated && taxAvoided + fee < MIN_NET_SAVING) return;
      pushSwitch(v.member, sec, q.account, r.qty, value, r.gain, 0, fee, taxAvoided, r.gain, 'now', undefined,
        [`Uses ${rupees(r.gain)} of ${v.member.name}'s ${rupees(rules.ltcgExemption)} tax-free room, which lapses on 31 March`]);
      usedQty.set(takenKey(h.isin, q.account), (usedQty.get(takenKey(h.isin, q.account)) ?? 0) + r.qty);
      switched.add(`${h.isin}|${q.account}`);
      room -= r.used;
      bookLt(v.member.id, h.isin, r.gain);
    };
    const tryHarvest = (h: Holding, q: Q) => {
      const id = idFor('harvest_gain', v.member.id, h.isin, q.account);
      const isDated = dated.has(id);
      if (made.has(id) || switched.has(`${h.isin}|${q.account}`) || (room < MIN_GAIN && !isDated)) return;
      const sec = secs.get(h.isin)!;
      const r = harvestableQty(q.lots, sec, asOf, rules, room, usedQty.get(takenKey(h.isin, q.account)) ?? 0);
      if (isDated ? r.qty === 0 : r.gain < MIN_GAIN) return;
      const value = valueOf(sec, r.qty);
      const costs = roundTripCost(sec, value, rules);
      const taxAvoided = Math.round(r.gain * LT);
      if (!isDated && taxAvoided - costs < MIN_NET_SAVING) return;
      push({ kind: 'harvest_gain', memberId: v.member.id, isin: h.isin, name: h.name, account: q.account, qty: r.qty, value, gain: r.gain, taxAvoided, costs, saving: taxAvoided - costs, ...approxOf(r),
        reasons: [`Uses ${rupees(r.gain)} of ${v.member.name}'s ${rupees(rules.ltcgExemption)} tax-free room for this year, which lapses on 31 March`, `Selling and buying back the next day resets the cost, so ${rupees(taxAvoided)} less tax when sold later`, ...approxWhy(r)] });
      usedQty.set(takenKey(h.isin, q.account), (usedQty.get(takenKey(h.isin, q.account)) ?? 0) + r.qty);
      room -= r.used;
      bookLt(v.member.id, h.isin, r.gain);
    };
    const regularQs = v.holdings
      .filter((h) => h.taxType === 'equity' && h.price != null && isRegular(secs.get(h.isin)!) && !needSoon(v.member.id, h.isin))
      .flatMap((h) => queues(ledger, v.member.id, h.isin).map((q) => ({ h, q })));
    const harvestQs = v.holdings
      .filter((h) => h.taxType === 'equity' && h.price != null && !needSoon(v.member.id, h.isin))
      .flatMap((h) => queues(ledger, v.member.id, h.isin).map((q) => ({ h, q })));
    // Dated moves first, whichever kind, in date order: they hold their room before any undated one.
    const datedPass = [
      ...regularQs.map((c) => ({ ...c, kind: 'switch_direct' as const })),
      ...harvestQs.map((c) => ({ ...c, kind: 'harvest_gain' as const })),
    ].map((c) => ({ ...c, date: dated.get(idFor(c.kind, v.member.id, c.h.isin, c.q.account)) })).filter((c) => c.date)
      .sort((a, b) => a.date!.localeCompare(b.date!));
    for (const c of datedPass) (c.kind === 'switch_direct' ? trySwitch : tryHarvest)(c.h, c.q);
    const biggest = (kind: 'switch_direct' | 'harvest_gain', list: Array<{ h: Holding; q: Q }>) => list
      .filter((c) => !dated.has(idFor(kind, v.member.id, c.h.isin, c.q.account)))
      .map((c) => ({ ...c, gain: harvestableQty(c.q.lots, secs.get(c.h.isin)!, asOf, rules, room, usedQty.get(takenKey(c.h.isin, c.q.account)) ?? 0).gain }))
      .sort((x, y) => y.gain - x.gain);
    for (const c of biggest('switch_direct', regularQs)) trySwitch(c.h, c.q);
    for (const c of biggest('harvest_gain', harvestQs)) tryHarvest(c.h, c.q);

    // Regular-plan units beyond the room: switch now (paying tax), wait, or next tax year.
    const slabNow = (slabRate(v.member, rules) ?? 0.3) * (1 + rules.cess);
    for (const h of v.holdings) {
      const sec = secs.get(h.isin)!;
      if (h.price == null || !isRegular(sec) || needSoon(v.member.id, h.isin) || (sec.taxType !== 'equity' && sec.taxType !== 'slab')) continue;
      for (const { account, lots } of queues(ledger, v.member.id, h.isin)) {
        if (switched.has(`${h.isin}|${account}`)) continue;
        const swId = idFor('switch_direct', v.member.id, h.isin, account);
        const isDatedSw = dated.has(swId);
        let skip = usedQty.get(lotKey(v.member.id, h.isin, account)) ?? 0;
        let qty = 0, gain = 0, allLt = true, longTermOn = '', newest = '';
        const rows: Realised[] = [];
        // Equity: the leading long-term run decides (newer short-term lots wait their turn); only with none is it a wait.
        let ltRun = false;
        for (const lot of lots) {
          if (!isCertain(lot, sec, rules)) break;
          if (skip >= lot.qty) { skip -= lot.qty; continue; }
          ltRun = isLongTerm(lot.date, asOf, rules.longTermMonths);
          break;
        }
        skip = usedQty.get(lotKey(v.member.id, h.isin, account)) ?? 0;
        for (const lot of lots) {
          let avail = lot.qty;
          if (skip > 0) { const t = Math.min(avail, skip); avail -= t; skip -= t; if (avail === 0) continue; }
          if (!isCertain(lot, sec, rules)) break;
          if (sec.taxType === 'equity' && ltRun && !isLongTerm(lot.date, asOf, rules.longTermMonths)) break;
          const view = { date: lot.date, qty: avail, cost: avail === lot.qty ? lot.cost : prorate(lot.cost, avail, lot.qty) };
          const row = previewSale([{ ...lot, qty: avail, cost: view.cost }], avail, sec, saleDay, rules);
          rows.push(...row);
          qty += avail;
          gain += row.reduce((a, r) => a + r.gain, 0);
          if (!isLongTerm(lot.date, asOf, rules.longTermMonths)) { allLt = false; const on = longTermFrom(lot.date, rules.longTermMonths); if (on > longTermOn) longTermOn = on; }
          if (lot.date > newest) newest = lot.date;
        }
        if (qty === 0) continue;
        const equity = sec.taxType === 'equity';
        const loadFree = newest ? addMonths(newest, 12) : asOf;
        const under12m = equity && asOf < loadFree;
        const value = valueOf(sec, qty);
        const gap = terGapFor(sec.category, sec.name);
        if (gap <= 0.1) continue;
        // Tax now is exact: what selling these lots adds on top of booked, planned and this member's earlier moves, so a slab
        // gain that eats the nil band a harvest relied on carries that harvest's tax too.
        const taxNow = Math.max(0, summaryWith(v, rows).tax - summaryWith(v, []).tax);
        const d = switchDecision({
          value, gain, term: allLt ? 'lt' : 'st', monthsToLongTerm: allLt ? 0 : Math.ceil(daysBetween(asOf, longTermOn) / 30.4375),
          equityUnitsUnder12m: under12m, taxType: sec.taxType, freeRoom: room, slabRate: slabNow, gap, taxNow,
        });
        // A picked day belongs to a tax-free switch: one that would now cost tax shows "No room left" instead (final pass).
        if (isDatedSw && !(d.when === 'now' && d.taxNow === 0)) continue;
        const fee = feeSaved(sec, value);
        const inRoom = d.when === 'now' && equity && allLt ? Math.max(0, Math.min(gain, room)) : 0;
        const taxAvoided = Math.round(inRoom * LT);
        if (taxAvoided + fee < MIN_NET_SAVING && !isDatedSw) continue;
        const until = d.when === 'wait' ? (under12m && loadFree > longTermOn ? loadFree : longTermOn) : undefined;
        const why = d.when === 'now'
          ? (d.taxNow > 0 ? [`Tax now: ${rupees(d.taxNow)}`]
            : equity ? [`Uses ${rupees(gain)} of ${v.member.name}'s tax-free room`]
              : [`No tax now: ${v.member.name}'s income is below the taxable limit`])
          : d.when === 'wait'
            ? [`Waiting until ${plainDate(until!)} avoids short-term tax and an exit load`]
            : [`Better done next tax year, inside the new tax-free room, than paying ${rupees(d.taxNow)} of tax now`];
        pushSwitch(v.member, sec, account, qty, value, gain, d.when === 'now' ? d.taxNow : 0, fee, taxAvoided, inRoom, d.when, until, why);
        if (d.when === 'now') {
          const rowsOf = moveGains.get(v.member.id) ?? [];
          rowsOf.push(...rows);
          moveGains.set(v.member.id, rowsOf);
          usedQty.set(lotKey(v.member.id, h.isin, account), (usedQty.get(lotKey(v.member.id, h.isin, account)) ?? 0) + qty);
          const after = summaryWith(v, []);
          room = Math.min(room - inRoom, after.room.free + after.bonus.free);
        }
      }
    }
    v.roomAfterPlan = room;
  }

  // 2. Gifts of listed shares from members with gains left over to members with room left over.
  for (const giver of views) {
    for (const h of giver.holdings) {
      for (const q of queues(ledger, giver.member.id, h.isin)) {
        for (const rec of [...views].sort((a, b) => b.roomAfterPlan - a.roomAfterPlan)) sizeGift(giver, h, q, rec);
      }
    }
  }

  // 3. Loss harvesting against tax already due this year, and 4. wait alerts. Known-data lots only.
  for (const v of views) {
    let stDue = v.plan.stTaxable, ltDue = v.plan.ltTaxable;
    const items = v.holdings
      .filter((h) => h.taxType === 'equity' && h.price != null)
      .flatMap((h) => queues(ledger, v.member.id, h.isin).map((q) => ({ h, ...q })))
      .sort((a, b) => dateCmp(dated.get(idFor('harvest_loss', v.member.id, a.h.isin, a.account)), dated.get(idFor('harvest_loss', v.member.id, b.h.isin, b.account))));
    for (const { h, account, lots } of items) {
      const sec = secs.get(h.isin)!;
      const isDated = dated.has(idFor('harvest_loss', v.member.id, h.isin, account));
      // Units already used by a harvest, switch or gift are not sold again.
      const rest = remainingLots(lots, usedQty.get(lotKey(v.member.id, h.isin, account)) ?? 0);
      if (stDue + ltDue > 0) {
        let qty = 0, saved = 0, lossTotal = 0, term: Term = 'st';
        for (const l of rest) {
          if (!isCertain(l, sec, rules) || isLocked(l, sec, asOf)) break;
          const g = lotGain(l, l.qty, sec, rules);
          if (g >= 0) break;
          term = isLongTerm(l.date, asOf, rules.longTermMonths) ? 'lt' : 'st';
          const loss = -g;
          const offsetSt = term === 'st' ? Math.min(loss, stDue) : 0;
          stDue -= offsetSt;
          const offsetLt = Math.min(loss - offsetSt, ltDue);
          ltDue -= offsetLt;
          const used = offsetSt + offsetLt;
          if (used === 0) break;
          saved += offsetSt * ST + offsetLt * LT;
          const take = used >= loss ? l.qty : Math.ceil((l.qty * used) / loss / unitStep(sec)) * unitStep(sec);
          qty += Math.min(take, l.qty);
          lossTotal += used;
          if (used < loss) break;
        }
        if (lossTotal >= MIN_GAIN || (isDated && qty > 0)) {
          const value = valueOf(sec, qty);
          const costs = roundTripCost(sec, value, rules);
          const taxAvoided = Math.round(saved);
          if (taxAvoided - costs >= MIN_NET_SAVING || isDated) {
            push({ kind: 'harvest_loss', memberId: v.member.id, isin: h.isin, name: h.name, account, qty, value, loss: lossTotal, term, taxAvoided, costs, saving: taxAvoided - costs,
              reasons: [`Books a ${rupees(lossTotal)} loss against gains ${nameOf(v.member.id)} is already paying tax on this year`] });
          }
        }
      }

      const front = rest[0];
      if (switchWaits.has(`${v.member.id}|${h.isin}|${account}`)) continue;
      if (!front || !isCertain(front, sec, rules) || isLongTerm(front.date, asOf, rules.longTermMonths)) continue;
      const gain = lotGain(front, front.qty, sec, rules);
      const until = longTermFrom(front.date, rules.longTermMonths);
      // Units still locked (ELSS) on the day they turn long-term can't be sold then either: waiting is not a move.
      if (isLocked(front, sec, until)) continue;
      const days = daysBetween(asOf, until);
      if (gain >= MIN_GAIN && days > 0 && days <= WAIT_WINDOW_DAYS) {
        const taxAvoided = Math.round(gain * (ST - LT));
        push({ kind: 'wait', memberId: v.member.id, isin: h.isin, name: h.name, account, qty: front.qty, value: valueOf(sec, front.qty), gain, until, days, taxAvoided, costs: 0, saving: taxAvoided,
          reasons: [`Turns long-term on ${plainDate(until)}: taxed at 12.5% instead of 20% if sold after that`] });
      }
    }
  }

  // A dated move with no room or units left still shows, with nothing to do. One matching no holding is dropped.
  for (const [id] of [...dated].sort((a, b) => a[1].localeCompare(b[1]))) {
    const p = parseDated(id);
    if (!p || made.has(id)) continue;
    const [first, toId] = p.kind === 'gift' ? p.who.split('>') : [p.who, undefined];
    const h = views.find((v) => v.member.id === first)?.holdings.find((x) => x.isin === p.isin && x.accounts.includes(p.account));
    if (!h || (p.kind === 'gift' && !views.some((v) => v.member.id === toId))) continue;
    const base = { isin: p.isin, name: h.name, account: p.account, qty: 0, value: 0, taxAvoided: 0, costs: 0, saving: 0, reasons: [p.kind === 'harvest_loss' ? 'Nothing left to do for this move' : 'No room left for this move'], noRoom: true };
    if (p.kind === 'gift') push({ ...base, kind: 'gift', fromId: first!, toId: toId!, gain: 0 });
    else if (p.kind === 'harvest_loss') push({ ...base, kind: 'harvest_loss', memberId: first!, loss: 0, term: 'st' });
    else if (p.kind === 'switch_direct') push({ ...base, kind: 'switch_direct', memberId: first!, gain: 0, tax: 0, feeSavedPerYear: 0, taxFreeGain: 0, when: 'now' });
    else push({ ...base, kind: 'harvest_gain', memberId: first!, gain: 0 });
  }

  const sum = (f: (v: MemberView) => number) => views.reduce((a, v) => a + f(v), 0);
  const later = moves.filter(isLaterBenefit);
  const now = moves.filter((m) => !isLaterBenefit(m));
  return {
    asOf, rules, members: views, moves, ledger, brokerAdjustments, holdingsNotes, booked, plannedRealised, securities: secs,
    totals: {
      freeRoom: sum((v) => v.plan.room.free),
      bonusFree: sum((v) => v.plan.bonus.free),
      limit: sum((v) => v.plan.room.limit),
      taxBooked: sum((v) => v.year.tax),
      plannedGain: sum((v) => v.planned.gain),
      taxFreeGains: moves.reduce((a, m) => a + taxFreeGainOf(m), 0),
      laterSaving: later.reduce((a, m) => a + m.saving, 0) + moves.reduce((a, m) => a + (m.kind === 'switch_direct' ? m.taxAvoided : 0), 0),
      nowSaving: now.filter((m) => m.kind !== 'switch_direct').reduce((a, m) => a + m.saving, 0),
      costs: moves.reduce((a, m) => a + m.costs, 0),
      uncertainLots: sum((v) => v.holdings.reduce((a, h) => a + h.uncertainLots, 0)),
    },
  };
}

export interface SaleResult {
  qty: Qty;
  proceeds: Paise;
  gain: Paise;
  stGain: Paise;
  ltGain: Paise;
  extraTax: Paise;
  roomUsed: Paise;
  available: Qty;
}

/**
 * Tax a member would add by selling `qty` units now, on top of what they have booked and planned this year. With several
 * accounts, units come from the account holding the oldest lot first, oldest-first within each account.
 */
export function simulateSale(fam: FamilyView, memberId: string, isin: string, qty: Qty, asOf: ISODate, rules: TaxRules): SaleResult {
  const v = fam.members.find((m) => m.member.id === memberId)!;
  const sec = fam.securities.get(isin)!;
  const available = queues(fam.ledger, memberId, isin).reduce((a, q) => a + q.lots.reduce((b, l) => b + l.qty, 0), 0);
  const sold = sellAcrossAccounts(fam.ledger, memberId, sec, Math.min(qty, available), asOf, rules, false);
  const plannedMine = fam.plannedRealised.filter((r) => r.memberId === memberId);
  const after = summariseYear(v.member, [...fam.booked, ...plannedMine, ...sold], rules, v.business);
  const s = (t: Term) => sold.filter((r) => r.term === t).reduce((a, r) => a + r.gain, 0);
  return {
    qty: Math.min(qty, available), available,
    proceeds: sold.reduce((a, r) => a + r.proceeds, 0),
    gain: sold.reduce((a, r) => a + r.gain, 0),
    stGain: s('st'), ltGain: s('lt'),
    extraTax: after.tax - v.plan.tax,
    roomUsed: after.exemptionUsed + after.bonus.used - (v.plan.exemptionUsed + v.plan.bonus.used),
  };
}
