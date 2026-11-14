import { daysBetween, isLongTerm, longTermFrom } from './dates';
import { buildLedger, effectiveCost, lotKey, prorate } from './ledger';
import { giftTransferCost, ltRate, roundTripCost, stRate, type TaxRules } from './rules';
import { summariseYear, type YearSummary } from './tax';
import {
  QTY_SCALE, type ISODate, type Ledger, type Lot, type Member, type Paise, type Qty, type Realised, type Security, type Term, type Txn,
} from './types';

export interface FamilyState {
  members: Member[];
  securities: Security[];
  txns: Txn[];
}

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
}

export interface Holding {
  memberId: string;
  isin: string;
  name: string;
  kind: Security['kind'];
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
interface MoveBase { id: string; isin: string; name: string; account: string; qty: Qty; value: Paise; taxAvoided: Paise; costs: Paise; saving: Paise }
export type Move =
  | (MoveBase & { kind: 'harvest_gain'; memberId: string; gain: Paise })
  | (MoveBase & { kind: 'harvest_loss'; memberId: string; loss: Paise; term: Term })
  | (MoveBase & { kind: 'wait'; memberId: string; gain: Paise; until: ISODate; days: number })
  | (MoveBase & { kind: 'gift'; fromId: string; toId: string; gain: Paise });

export const isLaterBenefit = (m: Move) => m.kind === 'harvest_gain' || m.kind === 'gift';

export interface MemberView {
  member: Member;
  year: YearSummary;
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
  securities: Map<string, Security>;
  totals: {
    freeRoom: Paise; bonusFree: Paise; limit: Paise; taxBooked: Paise;
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
const MIN_NET_SAVING: Paise = 500_00;

/** Smallest tradable step: whole shares, 0.001 MF units. */
const step = (kind: Security['kind']) => (kind === 'equity_mf' ? QTY_SCALE / 1000 : QTY_SCALE);
const valueOf = (sec: Security, qty: Qty) => Math.round(((sec.price ?? 0) * qty) / QTY_SCALE);

export function isCertain(lot: Pick<Lot, 'date' | 'estimated'>, sec: Security, rules: TaxRules) {
  if (lot.estimated) return false;
  return !(sec.kind !== 'other' && lot.date <= rules.grandfatherDate && !sec.fmv2018);
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
      gain: value - cost, term: isLongTerm(lot.date, saleDate, rules.longTermMonths) ? 'lt' : 'st',
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
  const unit = step(sec.kind);
  for (const lot of lots) {
    let avail = lot.qty;
    if (toSkip > 0) {
      const s = Math.min(avail, toSkip);
      avail -= s;
      toSkip -= s;
      if (avail === 0) continue;
    }
    if (!isLongTerm(lot.date, asOf, rules.longTermMonths) || !isCertain(lot, sec, rules)) break;
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

export function canGift(from: Member, to: Member): boolean {
  if (from.id === to.id || to.relation === 'child_minor') return false;
  // Relations are relative to the owner. Spouse gifts are clubbed both ways (old s.64(1)(iv)); a gift to a son's
  // wife is clubbed with the giver (s.64(1)(vi)). The owner's parents giving to the owner's spouse is treated as
  // that case, which is conservative when the owner is the daughter.
  const clubbedPairs: Array<[Member['relation'], Member['relation']]> = [
    ['self', 'spouse'], ['spouse', 'self'], ['self', 'daughter_in_law'], ['spouse', 'daughter_in_law'], ['parent', 'spouse'],
  ];
  return !clubbedPairs.some(([a, b]) => from.relation === a && to.relation === b);
}

export function computeFamily(state: FamilyState, asOf: ISODate, rules: TaxRules): FamilyView {
  const ledger = buildLedger(state.txns, state.securities, rules);
  const secs = new Map(state.securities.map((s) => [s.isin, s]));
  const moves: Move[] = [];
  let n = 0;
  const id = () => `mv${++n}`;
  const LT = ltRate(rules), ST = stRate(rules);

  const views: MemberView[] = state.members.map((member) => {
    const year = summariseYear(member, ledger.realised, rules);
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
        return {
          account: l.account, date: l.date, qty: l.qty, cost: l.cost, value: priced ? valueOf(sec, l.qty) : null, gain: g,
          term: isLongTerm(l.date, asOf, rules.longTermMonths) ? 'lt' : 'st', longTermOn: longTermFrom(l.date, rules.longTermMonths),
          certain: isCertain(l, sec, rules),
        } satisfies HoldingLot;
      }));
      const sum = (f: (x: HoldingLot) => number) => hl.reduce((a, x) => a + f(x), 0);
      holdings.push({
        memberId: member.id, isin, name: sec.name, kind: sec.kind,
        qty: sum((x) => x.qty), cost: sum((x) => x.cost), price: sec.price ?? null,
        value: priced ? sum((x) => x.value ?? 0) : null,
        ltGain: sum((x) => (x.term === 'lt' ? x.gain ?? 0 : 0)),
        stGain: sum((x) => (x.term === 'st' ? x.gain ?? 0 : 0)),
        lots: hl, accounts: qs.map((q) => q.account), uncertainLots: hl.filter((x) => !x.certain).length,
      });
    }
    holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return { member, year, holdings, roomAfterPlan: year.room.free + year.bonus.free };
  });

  const usedQty = new Map<string, Qty>();

  // 1. Each member fills their own room from their own long-term lots, biggest gains first.
  for (const v of views) {
    let room = v.roomAfterPlan;
    const cands = v.holdings
      .filter((h) => h.price != null)
      .flatMap((h) => queues(ledger, v.member.id, h.isin).map((q) => ({ h, q, ...harvestableQty(q.lots, secs.get(h.isin)!, asOf, rules, room, 0) })))
      .sort((a, b) => b.gain - a.gain);
    for (const c of cands) {
      if (room < MIN_GAIN) break;
      const sec = secs.get(c.h.isin)!;
      const r = harvestableQty(c.q.lots, sec, asOf, rules, room, 0);
      if (r.gain < MIN_GAIN) continue;
      const value = valueOf(sec, r.qty);
      const costs = roundTripCost(sec.kind, value, rules);
      const taxAvoided = Math.round(r.gain * LT);
      if (taxAvoided - costs < MIN_NET_SAVING) continue;
      moves.push({ kind: 'harvest_gain', id: id(), memberId: v.member.id, isin: c.h.isin, name: c.h.name, account: c.q.account, qty: r.qty, value, gain: r.gain, taxAvoided, costs, saving: taxAvoided - costs });
      usedQty.set(lotKey(v.member.id, c.h.isin, c.q.account), r.qty);
      room -= r.gain;
    }
    v.roomAfterPlan = room;
  }

  // 2. Gifts of listed shares from members with gains left over to members with room left over.
  for (const giver of views) {
    for (const h of giver.holdings) {
      if (h.kind !== 'equity' || h.price == null) continue;
      const sec = secs.get(h.isin)!;
      for (const q of queues(ledger, giver.member.id, h.isin)) {
        const key = lotKey(giver.member.id, h.isin, q.account);
        for (const rec of [...views].sort((a, b) => b.roomAfterPlan - a.roomAfterPlan)) {
          if (rec.roomAfterPlan < MIN_GAIN || !canGift(giver.member, rec.member)) continue;
          const r = harvestableQty(q.lots, sec, asOf, rules, rec.roomAfterPlan, usedQty.get(key) ?? 0);
          if (r.gain < MIN_GAIN) continue;
          const value = valueOf(sec, r.qty);
          const costs = giftTransferCost(value, rules) + roundTripCost(sec.kind, value, rules);
          const taxAvoided = Math.round(r.gain * LT);
          if (taxAvoided - costs < MIN_NET_SAVING) continue;
          moves.push({ kind: 'gift', id: id(), fromId: giver.member.id, toId: rec.member.id, isin: h.isin, name: h.name, account: q.account, qty: r.qty, value, gain: r.gain, taxAvoided, costs, saving: taxAvoided - costs });
          usedQty.set(key, (usedQty.get(key) ?? 0) + r.qty);
          rec.roomAfterPlan -= r.gain;
        }
      }
    }
  }

  // 3. Loss harvesting against tax already due this year, and 4. wait alerts. Known-data lots only.
  for (const v of views) {
    let stDue = v.year.stTaxable, ltDue = v.year.ltTaxable;
    for (const h of v.holdings) {
      if (h.price == null) continue;
      const sec = secs.get(h.isin)!;
      for (const { account, lots } of queues(ledger, v.member.id, h.isin)) {
        if (stDue + ltDue > 0) {
          let qty = 0, saved = 0, lossTotal = 0, term: Term = 'st';
          for (const l of lots) {
            if (!isCertain(l, sec, rules)) break;
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
            const take = used >= loss ? l.qty : Math.ceil((l.qty * used) / loss / step(sec.kind)) * step(sec.kind);
            qty += Math.min(take, l.qty);
            lossTotal += used;
            if (used < loss) break;
          }
          if (lossTotal >= MIN_GAIN) {
            const value = valueOf(sec, qty);
            const costs = roundTripCost(sec.kind, value, rules);
            const taxAvoided = Math.round(saved);
            if (taxAvoided - costs >= MIN_NET_SAVING) {
              moves.push({ kind: 'harvest_loss', id: id(), memberId: v.member.id, isin: h.isin, name: h.name, account, qty, value, loss: lossTotal, term, taxAvoided, costs, saving: taxAvoided - costs });
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
          moves.push({ kind: 'wait', id: id(), memberId: v.member.id, isin: h.isin, name: h.name, account, qty: front.qty, value: valueOf(sec, front.qty), gain, until, days, taxAvoided, costs: 0, saving: taxAvoided });
        }
      }
    }
  }

  const sum = (f: (v: MemberView) => number) => views.reduce((a, v) => a + f(v), 0);
  const later = moves.filter(isLaterBenefit);
  const now = moves.filter((m) => !isLaterBenefit(m));
  return {
    asOf, rules, members: views, moves, ledger, securities: secs,
    totals: {
      freeRoom: sum((v) => v.year.room.free),
      bonusFree: sum((v) => v.year.bonus.free),
      limit: sum((v) => v.year.room.limit),
      taxBooked: sum((v) => v.year.tax),
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
 * Tax a member would add by selling `qty` units now, on top of what they have already booked this year. With several
 * accounts, units come from the account holding the oldest lot first, oldest-first within each account.
 */
export function simulateSale(fam: FamilyView, memberId: string, isin: string, qty: Qty, asOf: ISODate, rules: TaxRules): SaleResult {
  const v = fam.members.find((m) => m.member.id === memberId)!;
  const sec = fam.securities.get(isin)!;
  const qs = queues(fam.ledger, memberId, isin).sort((a, b) => a.lots[0]!.date.localeCompare(b.lots[0]!.date));
  const available = qs.reduce((a, q) => a + q.lots.reduce((b, l) => b + l.qty, 0), 0);
  let left = Math.min(qty, available);
  const sold: Realised[] = [];
  for (const q of qs) {
    if (left <= 0) break;
    const inAcct = q.lots.reduce((a, l) => a + l.qty, 0);
    const take = Math.min(inAcct, left);
    sold.push(...previewSale(q.lots, take, sec, asOf, rules));
    left -= take;
  }
  const after = summariseYear(v.member, [...fam.ledger.realised, ...sold], rules);
  const s = (t: Term) => sold.filter((r) => r.term === t).reduce((a, r) => a + r.gain, 0);
  return {
    qty: Math.min(qty, available), available,
    proceeds: sold.reduce((a, r) => a + r.proceeds, 0),
    gain: sold.reduce((a, r) => a + r.gain, 0),
    stGain: s('st'), ltGain: s('lt'),
    extraTax: after.tax - v.year.tax,
    roomUsed: after.exemptionUsed + after.bonus.used - (v.year.exemptionUsed + v.year.bonus.used),
  };
}
