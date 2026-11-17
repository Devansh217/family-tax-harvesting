import { isElss } from './categories';
import { addMonths, daysBetween, isLongTerm, longTermFrom } from './dates';
import { buildLedger, effectiveCost, lotKey, lotTerms, prorate } from './ledger';
import { giftTransferCost, ltRate, roundTripCost, stRate, type TaxRules } from './rules';
import { moveId, type MoveDraft } from './records';
import { canGift } from './relations';
import { longTermMonthsFor, lotTaxType, summariseYear, type BusinessIncome, type YearSummary } from './tax';
import { inRange } from './dates';
import {
  QTY_SCALE, type ISODate, type Ledger, type Lot, type Member, type Paise, type Qty, type Realised, type Security, type Term, type Txn,
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
}

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
}
export type Move =
  | (MoveBase & { kind: 'harvest_gain'; memberId: string; gain: Paise })
  | (MoveBase & { kind: 'harvest_loss'; memberId: string; loss: Paise; term: Term })
  | (MoveBase & { kind: 'wait'; memberId: string; gain: Paise; until: ISODate; days: number })
  | (MoveBase & { kind: 'gift'; fromId: string; toId: string; gain: Paise });

export const isLaterBenefit = (m: Move) => m.kind === 'harvest_gain' || m.kind === 'gift';

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
export function lockedUntil(lot: { date: ISODate }, sec: Pick<Security, 'category'>): ISODate | null {
  return isElss(sec.category) ? addMonths(lot.date, ELSS_LOCK_YEARS * 12) : null;
}
const isLocked = (lot: { date: ISODate }, sec: Pick<Security, 'category'>, asOf: ISODate) => {
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

/** What selling `qty` units now would realise, first-in-first-out. Does not mutate the lots. */
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
      gain: value - cost, ...lotTerms(sec, lot.date, saleDate, rules),
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
  let qty = 0, gain = 0, toSkip = skip;
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
    if (whole <= room - gain) {
      qty += avail;
      gain += whole;
      continue;
    }
    const perUnit = whole / avail;
    let take = Math.floor((room - gain) / perUnit / unit) * unit;
    while (take > 0 && lotGain(view, take, sec, rules) > room - gain) take -= unit;
    if (take > 0) {
      qty += take;
      gain += lotGain(view, take, sec, rules);
    }
    break;
  }
  return { qty, gain };
}

export function computeFamily(state: FamilyState, asOf: ISODate, rules: TaxRules): FamilyView {
  const ledger = buildLedger(state.txns, state.securities, rules);
  const secs = new Map(state.securities.map((s) => [s.isin, s]));
  const moves: Move[] = [];
  const push = (m: MoveDraft) => moves.push({ ...m, id: moveId(m, rules) } as Move);
  const nameOf = (memberId: string) => views.find((v) => v.member.id === memberId)?.member.name ?? 'This member';
  const rupees = (p: Paise) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
  const LT = ltRate(rules), ST = stRate(rules);

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

  // 1. Each member fills their own room from their own long-term lots, biggest gains first.
  for (const v of views) {
    let room = v.roomAfterPlan;
    const cands = v.holdings
      .filter((h) => h.taxType === 'equity' && h.price != null && !needSoon(v.member.id, h.isin))
      .flatMap((h) => queues(ledger, v.member.id, h.isin).map((q) => ({ h, q, ...harvestableQty(q.lots, secs.get(h.isin)!, asOf, rules, room, 0) })))
      .sort((a, b) => b.gain - a.gain);
    for (const c of cands) {
      if (room < MIN_GAIN) break;
      const sec = secs.get(c.h.isin)!;
      const r = harvestableQty(c.q.lots, sec, asOf, rules, room, 0);
      if (r.gain < MIN_GAIN) continue;
      const value = valueOf(sec, r.qty);
      const costs = roundTripCost(sec, value, rules);
      const taxAvoided = Math.round(r.gain * LT);
      if (taxAvoided - costs < MIN_NET_SAVING) continue;
      push({ kind: 'harvest_gain', memberId: v.member.id, isin: c.h.isin, name: c.h.name, account: c.q.account, qty: r.qty, value, gain: r.gain, taxAvoided, costs, saving: taxAvoided - costs,
        reasons: [`Uses ${rupees(r.gain)} of ${v.member.name}'s ${rupees(rules.ltcgExemption)} tax-free room for this year, which lapses on 31 March`, `Selling and buying back the next day resets the cost, so ${rupees(taxAvoided)} less tax when sold later`] });
      usedQty.set(lotKey(v.member.id, c.h.isin, c.q.account), r.qty);
      room -= r.gain;
    }
    v.roomAfterPlan = room;
  }

  // 2. Gifts of listed shares from members with gains left over to members with room left over.
  for (const giver of views) {
    for (const h of giver.holdings) {
      if (h.taxType !== 'equity' || !h.listed || h.price == null || needSoon(giver.member.id, h.isin)) continue;
      const sec = secs.get(h.isin)!;
      if (isElss(sec.category)) continue;
      for (const q of queues(ledger, giver.member.id, h.isin)) {
        const key = lotKey(giver.member.id, h.isin, q.account);
        for (const rec of [...views].sort((a, b) => b.roomAfterPlan - a.roomAfterPlan)) {
          if (rec.roomAfterPlan < MIN_GAIN || !canGift(giver.member, rec.member, state.members, asOf)) continue;
          const r = harvestableQty(q.lots, sec, asOf, rules, rec.roomAfterPlan, usedQty.get(key) ?? 0);
          if (r.gain < MIN_GAIN) continue;
          const value = valueOf(sec, r.qty);
          const costs = giftTransferCost(value, rules) + roundTripCost(sec, value, rules);
          const taxAvoided = Math.round(r.gain * LT);
          if (taxAvoided - costs < MIN_NET_SAVING) continue;
          push({ kind: 'gift', fromId: giver.member.id, toId: rec.member.id, isin: h.isin, name: h.name, account: q.account, qty: r.qty, value, gain: r.gain, taxAvoided, costs, saving: taxAvoided - costs,
            reasons: [`${giver.member.name} has no tax-free room left; ${rec.member.name} has ${rupees(rec.roomAfterPlan)} unused`, `A gift between these relatives is not taxed and is not added back to ${giver.member.name}'s income`, `It becomes ${rec.member.name}'s money for good`] });
          usedQty.set(key, (usedQty.get(key) ?? 0) + r.qty);
          rec.roomAfterPlan -= r.gain;
        }
      }
    }
  }

  // 3. Loss harvesting against tax already due this year, and 4. wait alerts. Known-data lots only.
  for (const v of views) {
    let stDue = v.plan.stTaxable, ltDue = v.plan.ltTaxable;
    for (const h of v.holdings) {
      if (h.taxType !== 'equity' || h.price == null) continue;
      const sec = secs.get(h.isin)!;
      for (const { account, lots } of queues(ledger, v.member.id, h.isin)) {
        if (stDue + ltDue > 0) {
          let qty = 0, saved = 0, lossTotal = 0, term: Term = 'st';
          for (const l of lots) {
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
          if (lossTotal >= MIN_GAIN) {
            const value = valueOf(sec, qty);
            const costs = roundTripCost(sec, value, rules);
            const taxAvoided = Math.round(saved);
            if (taxAvoided - costs >= MIN_NET_SAVING) {
              push({ kind: 'harvest_loss', memberId: v.member.id, isin: h.isin, name: h.name, account, qty, value, loss: lossTotal, term, taxAvoided, costs, saving: taxAvoided - costs,
                reasons: [`Books a ${rupees(lossTotal)} loss against gains ${nameOf(v.member.id)} is already paying tax on this year`] });
            }
          }
        }

        const front = lots[0];
        if (!front || !isCertain(front, sec, rules) || isLongTerm(front.date, asOf, rules.longTermMonths)) continue;
        const gain = lotGain(front, front.qty, sec, rules);
        const until = longTermFrom(front.date, rules.longTermMonths);
        const days = daysBetween(asOf, until);
        if (gain >= MIN_GAIN && days > 0 && days <= WAIT_WINDOW_DAYS) {
          const taxAvoided = Math.round(gain * (ST - LT));
          push({ kind: 'wait', memberId: v.member.id, isin: h.isin, name: h.name, account, qty: front.qty, value: valueOf(sec, front.qty), gain, until, days, taxAvoided, costs: 0, saving: taxAvoided,
            reasons: [`Turns long-term on ${until}: taxed at 12.5% instead of 20% if sold after that`] });
        }
      }
    }
  }

  const sum = (f: (v: MemberView) => number) => views.reduce((a, v) => a + f(v), 0);
  const later = moves.filter(isLaterBenefit);
  const now = moves.filter((m) => !isLaterBenefit(m));
  return {
    asOf, rules, members: views, moves, ledger, brokerAdjustments, booked, plannedRealised, securities: secs,
    totals: {
      freeRoom: sum((v) => v.plan.room.free),
      bonusFree: sum((v) => v.plan.bonus.free),
      limit: sum((v) => v.plan.room.limit),
      taxBooked: sum((v) => v.year.tax),
      plannedGain: sum((v) => v.planned.gain),
      taxFreeGains: later.reduce((a, m) => a + (m.kind === 'harvest_gain' || m.kind === 'gift' ? m.gain : 0), 0),
      laterSaving: later.reduce((a, m) => a + m.saving, 0),
      nowSaving: now.reduce((a, m) => a + m.saving, 0),
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
