import { daysBetween, isLongTerm, longTermFrom } from './dates';
import { buildLedger, effectiveCost, lotKey, prorate } from './ledger';
import { ltRate, stRate, type TaxRules } from './rules';
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
  date: ISODate;
  qty: Qty;
  cost: Paise;
  value: Paise | null;
  gain: Paise | null;
  term: Term;
  longTermOn: ISODate;
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
}

interface MoveBase { id: string; isin: string; name: string; qty: Qty; saving: Paise }
export type Move =
  | (MoveBase & { kind: 'harvest_gain'; memberId: string; gain: Paise })
  | (MoveBase & { kind: 'harvest_loss'; memberId: string; loss: Paise; term: Term })
  | (MoveBase & { kind: 'wait'; memberId: string; gain: Paise; until: ISODate; days: number })
  | (MoveBase & { kind: 'gift'; fromId: string; toId: string; gain: Paise });

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
  totals: { freeRoom: Paise; bonusFree: Paise; limit: Paise; savingAvailable: Paise; taxBooked: Paise };
}

const WAIT_WINDOW_DAYS = 90;
const MIN_MOVE: Paise = 1_000_00;

/** Smallest tradable step: whole shares, 0.001 MF units. */
const step = (kind: Security['kind']) => (kind === 'equity_mf' ? QTY_SCALE / 1000 : QTY_SCALE);

function lotGain(lot: Pick<Lot, 'date' | 'qty' | 'cost'>, qty: Qty, sec: Security, rules: TaxRules) {
  const value = Math.round(((sec.price ?? 0) * qty) / QTY_SCALE);
  const actual = qty === lot.qty ? lot.cost : prorate(lot.cost, qty, lot.qty);
  return value - effectiveCost(lot, actual, qty, value, sec, rules);
}

/** What selling `qty` units now would realise, first-in-first-out. Does not mutate the lots. */
export function previewSale(lots: Lot[], qty: Qty, sec: Security, saleDate: ISODate, rules: TaxRules): Realised[] {
  const out: Realised[] = [];
  let left = qty;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.qty, left);
    const value = Math.round(((sec.price ?? 0) * take) / QTY_SCALE);
    const actual = take === lot.qty ? lot.cost : prorate(lot.cost, take, lot.qty);
    const cost = effectiveCost(lot, actual, take, value, sec, rules);
    out.push({
      memberId: lot.memberId, isin: lot.isin, buyDate: lot.date, sellDate: saleDate, qty: take, proceeds: value, cost,
      gain: value - cost, term: isLongTerm(lot.date, saleDate, rules.longTermMonths) ? 'lt' : 'st',
    });
    left -= take;
  }
  return out;
}

/**
 * Largest quantity, after skipping `skip` units from the front, that can be sold using only long-term lots
 * without the cumulative gain exceeding `room`.
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
    if (!isLongTerm(lot.date, asOf, rules.longTermMonths)) break;
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

  const views: MemberView[] = state.members.map((member) => {
    const year = summariseYear(member, ledger.realised, rules);
    const holdings: Holding[] = [];
    for (const [key, lots] of ledger.lots) {
      if (!key.startsWith(`${member.id}|`) || lots.length === 0) continue;
      const sec = secs.get(lots[0]!.isin);
      if (!sec) continue;
      const priced = sec.price != null;
      const hl: HoldingLot[] = lots.map((l) => {
        const g = priced ? lotGain(l, l.qty, sec, rules) : null;
        return {
          date: l.date, qty: l.qty, cost: l.cost, value: priced ? Math.round((sec.price! * l.qty) / QTY_SCALE) : null, gain: g,
          term: isLongTerm(l.date, asOf, rules.longTermMonths) ? 'lt' : 'st', longTermOn: longTermFrom(l.date, rules.longTermMonths),
        };
      });
      const sum = (f: (x: HoldingLot) => number) => hl.reduce((a, x) => a + f(x), 0);
      holdings.push({
        memberId: member.id, isin: sec.isin, name: sec.name, kind: sec.kind,
        qty: sum((x) => x.qty), cost: sum((x) => x.cost), price: sec.price ?? null,
        value: priced ? sum((x) => x.value ?? 0) : null,
        ltGain: sum((x) => (x.term === 'lt' ? x.gain ?? 0 : 0)),
        stGain: sum((x) => (x.term === 'st' ? x.gain ?? 0 : 0)),
        lots: hl,
      });
    }
    holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return { member, year, holdings, roomAfterPlan: year.room.free + year.bonus.free };
  });

  const usedQty = new Map<string, Qty>();
  const LT = ltRate(rules), ST = stRate(rules);

  // 1. Each member fills their own room from their own long-term lots, biggest gains first.
  for (const v of views) {
    let room = v.roomAfterPlan;
    const cands = v.holdings
      .filter((h) => h.price != null)
      .map((h) => ({ h, ...harvestableQty(ledger.lots.get(lotKey(v.member.id, h.isin))!, secs.get(h.isin)!, asOf, rules, room, 0) }))
      .sort((a, b) => b.gain - a.gain);
    for (const c of cands) {
      if (room < MIN_MOVE) break;
      const r = harvestableQty(ledger.lots.get(lotKey(v.member.id, c.h.isin))!, secs.get(c.h.isin)!, asOf, rules, room, 0);
      if (r.gain < MIN_MOVE) continue;
      moves.push({ kind: 'harvest_gain', id: id(), memberId: v.member.id, isin: c.h.isin, name: c.h.name, qty: r.qty, gain: r.gain, saving: Math.round(r.gain * LT) });
      usedQty.set(lotKey(v.member.id, c.h.isin), r.qty);
      room -= r.gain;
    }
    v.roomAfterPlan = room;
  }

  // 2. Gifts of listed shares from members with gains left over to members with room left over.
  for (const giver of views) {
    for (const h of giver.holdings) {
      if (h.kind !== 'equity' || h.price == null) continue;
      const key = lotKey(giver.member.id, h.isin);
      const lots = ledger.lots.get(key)!;
      for (const rec of [...views].sort((a, b) => b.roomAfterPlan - a.roomAfterPlan)) {
        if (rec.roomAfterPlan < MIN_MOVE || !canGift(giver.member, rec.member)) continue;
        const r = harvestableQty(lots, secs.get(h.isin)!, asOf, rules, rec.roomAfterPlan, usedQty.get(key) ?? 0);
        if (r.gain < MIN_MOVE) continue;
        moves.push({ kind: 'gift', id: id(), fromId: giver.member.id, toId: rec.member.id, isin: h.isin, name: h.name, qty: r.qty, gain: r.gain, saving: Math.round(r.gain * LT) });
        usedQty.set(key, (usedQty.get(key) ?? 0) + r.qty);
        rec.roomAfterPlan -= r.gain;
      }
    }
  }

  // 3. Loss harvesting against tax already due this year, and 4. wait alerts.
  for (const v of views) {
    let stDue = v.year.stTaxable, ltDue = v.year.ltTaxable;
    for (const h of v.holdings) {
      if (h.price == null) continue;
      const sec = secs.get(h.isin)!;
      const lots = ledger.lots.get(lotKey(v.member.id, h.isin))!;

      if (stDue + ltDue > 0) {
        let qty = 0, saved = 0, lossTotal = 0, term: Term = 'st';
        for (const l of lots) {
          const g = lotGain(l, l.qty, sec, rules);
          if (g >= 0) break;
          term = isLongTerm(l.date, asOf, rules.longTermMonths) ? 'lt' : 'st';
          let loss = -g;
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
          loss = 0;
        }
        if (lossTotal >= MIN_MOVE) {
          moves.push({ kind: 'harvest_loss', id: id(), memberId: v.member.id, isin: h.isin, name: h.name, qty, loss: lossTotal, term, saving: Math.round(saved) });
        }
      }

      const front = h.lots[0];
      if (front && front.term === 'st' && (front.gain ?? 0) >= MIN_MOVE) {
        const days = daysBetween(asOf, front.longTermOn);
        if (days > 0 && days <= WAIT_WINDOW_DAYS) {
          moves.push({
            kind: 'wait', id: id(), memberId: v.member.id, isin: h.isin, name: h.name, qty: front.qty, gain: front.gain!,
            until: front.longTermOn, days, saving: Math.round(front.gain! * (ST - LT)),
          });
        }
      }
    }
  }

  const sum = (f: (v: MemberView) => number) => views.reduce((a, v) => a + f(v), 0);
  return {
    asOf, rules, members: views, moves, ledger, securities: secs,
    totals: {
      freeRoom: sum((v) => v.year.room.free),
      bonusFree: sum((v) => v.year.bonus.free),
      limit: sum((v) => v.year.room.limit),
      savingAvailable: moves.reduce((a, m) => a + m.saving, 0),
      taxBooked: sum((v) => v.year.tax),
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

/** Tax a member would add by selling `qty` units now, on top of what they have already booked this year. */
export function simulateSale(fam: FamilyView, memberId: string, isin: string, qty: Qty, asOf: ISODate, rules: TaxRules): SaleResult {
  const v = fam.members.find((m) => m.member.id === memberId)!;
  const sec = fam.securities.get(isin)!;
  const lots = fam.ledger.lots.get(lotKey(memberId, isin)) ?? [];
  const available = lots.reduce((a, l) => a + l.qty, 0);
  const sold = previewSale(lots, Math.min(qty, available), sec, asOf, rules);
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
