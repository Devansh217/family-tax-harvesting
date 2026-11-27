import { classifyFund, type ReturnClass } from './categories';
import { unitStep, type FamilyState, type FamilyView, type HoldingLot, type Move } from './family';
import { accountKey, isOld, newestEvidence, newestRoomEvidence } from './freshness';
import { APPROX_MARGIN } from './openingLots';
import { solvePlacement, type PlaceAsset, type Placement, type PlacementProblem } from './placement';
import { PLACEMENT_YEARS, tenYearTax, type ProjectionStart, type Slice, type TaxClass } from './placementTax';
import { nominalReturn } from './planner';
import { moveId, type MoveDraft } from './records';
import { canGift, clubbing, isRelative } from './relations';
import { normalIncomeOf } from './rules';
import { activeSips, guessSips, type SipGuess } from './sips';
import { QTY_SCALE, type ISODate, type Paise, type Qty, type Security } from './types';

/**
 * From the family to placement moves (spec 2026-11-24 §5): builds the placement problem from this season's view and
 * turns the solver's placements into `place_sip` and `place_holding` moves.
 *
 * Year 1 starts after this season: each member's planned gains plus the room this season's moves used, cushion
 * included, so a placement never takes room a harvest or gift already uses. Only confirmed SIPs are placed.
 */
export interface PlacementView {
  moves: Move[];
  sipGuesses: SipGuess[];
  /** A guessed SIP the family has not confirmed (or changed, or stopped) yet. */
  unconfirmed: boolean;
  /** Member ids a giver's money would go to but for clubbing (spouse, minor child, son's wife, own HUF). Sorted. */
  clubbedLeftOut: string[];
  /** Member ids that would be allowed receivers but have no income entered. Sorted. */
  missingIncome: string[];
}

type AssetInfo =
  | { kind: 'holding'; memberId: string; sec: Security; account: string; lots: HoldingLot[] }
  | { kind: 'sip'; memberId: string; sec: Security; account: string; name: string; monthly: Paise };

const taxClassOf = (sec: Security): TaxClass | null =>
  sec.taxType === 'equity' ? 'equity'
    : sec.taxType === 'other_lt' ? 'other_lt'
      : sec.taxType === 'slab' || sec.taxType === 'interest' ? 'slab' : null; // `check` and `exempt` are left out

/** The fund's return class from its SEBI category, or equity for shares and equity funds with no category. */
const returnClassOf = (sec: Security): ReturnClass | null =>
  (sec.category ? classifyFund(sec.category, sec.name).returnClass : null) ?? (sec.taxType === 'equity' ? 'equity' : null);
/** Only for an unplaceable asset with no known return class, so its owner's tax still counts it. */
const FALLBACK: Record<TaxClass, ReturnClass> = { equity: 'equity', slab: 'debt', other_lt: 'balanced' };

/** A lot's gain as the room counts it: an approx lot's gain `1 + APPROX_MARGIN` times, a loss on one `1 − APPROX_MARGIN`. */
const roomGain = (l: HoldingLot) => {
  const g = l.gain ?? 0;
  return l.approx ? Math.round(g * (g > 0 ? 1 + APPROX_MARGIN : 1 - APPROX_MARGIN)) : g;
};

function build(state: FamilyState, fam: FamilyView) {
  const { asOf, rules } = fam;
  const members = fam.members.map((v) => v.member);
  const starts: Record<string, ProjectionStart | null> = {};
  for (const v of fam.members) {
    const normal = normalIncomeOf(v.member, rules, asOf);
    if (normal == null) { starts[v.member.id] = null; continue; }
    // Room this season's moves used, cushion included (`roomAfterPlan` drops by each move's `used`).
    const used = Math.max(0, v.plan.room.free + v.plan.bonus.free - v.roomAfterPlan);
    starts[v.member.id] = { normal, year1: { ...v.plan.buckets, equityLt: v.plan.buckets.equityLt + used } };
  }

  const assets: PlaceAsset[] = [];
  const info = new Map<string, AssetInfo>();
  const needSoon = (memberId: string, isin: string) => !!state.needSoon?.[`${memberId}|${isin}`];
  for (const v of fam.members) {
    for (const h of v.holdings) {
      const sec = fam.securities.get(h.isin);
      const taxClass = sec ? taxClassOf(sec) : null;
      if (!sec || !taxClass || h.price == null) continue;
      const rc = returnClassOf(sec);
      const annualReturn = nominalReturn(rc ?? FALLBACK[taxClass], 'base', rules);
      const canMove = rc != null && v.member.type !== 'huf' && !needSoon(v.member.id, h.isin);
      for (const account of [...new Set(h.lots.map((l) => l.account))].sort()) {
        const lots = h.lots.filter((l) => l.account === account);
        // Known lots only: never an estimated lot or an ELSS lot still locked (GUARDRAILS §1).
        const ok = (l: HoldingLot) => l.certain && !(l.lockedUntil && l.lockedUntil > asOf);
        const parts: Array<[string, HoldingLot[], boolean]> = [
          [`holding|${v.member.id}|${h.isin}|${account}`, lots.filter(ok), canMove],
          [`fixed|${v.member.id}|${h.isin}|${account}`, lots.filter((l) => !ok(l)), false],
        ];
        for (const [id, ls, movable] of parts) {
          const value = ls.reduce((a, l) => a + (l.value ?? 0), 0);
          if (!ls.length || value <= 0) continue;
          assets.push({ id, ownerId: v.member.id, kind: 'holding', movable, taxClass, annualReturn, value, gain: ls.reduce((a, l) => a + roomGain(l), 0), yearlyAdd: 0 });
          if (movable) info.set(id, { kind: 'holding', memberId: v.member.id, sec, account, lots: ls });
        }
      }
    }
  }

  const sipGuesses = guessSips(state.txns, state.securities, asOf);
  const confirmed = state.confirmedSips ?? [];
  for (const s of activeSips(sipGuesses, confirmed)) {
    const sec = fam.securities.get(s.isin);
    const taxClass = sec ? taxClassOf(sec) : null;
    if (!sec || !taxClass || !members.some((m) => m.id === s.memberId)) continue;
    const rc = returnClassOf(sec);
    const id = `sip|${s.memberId}|${s.isin}`;
    const guess = sipGuesses.filter((g) => g.memberId === s.memberId && g.isin === s.isin).sort((a, b) => a.account.localeCompare(b.account))[0];
    assets.push({ id, ownerId: s.memberId, kind: 'sip', movable: rc != null, taxClass, annualReturn: nominalReturn(rc ?? FALLBACK[taxClass], 'base', rules), value: 0, gain: 0, yearlyAdd: s.monthly * 12 });
    if (rc != null) info.set(id, { kind: 'sip', memberId: s.memberId, sec, account: guess?.account ?? '', name: guess?.name ?? sec.name, monthly: s.monthly });
  }

  const problem: PlacementProblem = { members, starts, assets, asOf };
  const unconfirmed = sipGuesses.some((g) => !confirmed.some((c) => c.memberId === g.memberId && c.isin === g.isin));

  // Who would give: individuals with income entered and something they could place.
  const givers = members.filter((g) => g.type !== 'huf' && starts[g.id] != null && assets.some((a) => a.movable && a.ownerId === g.id));
  const clubbed = new Set<string>(), missing = new Set<string>();
  for (const g of givers) for (const m of members) {
    if (m.id === g.id) continue;
    if (isRelative(g, m, members) && m.resident !== false && clubbing(g, m, members, asOf) !== null) clubbed.add(m.id);
    else if (canGift(g, m, members, asOf) && starts[m.id] == null) missing.add(m.id);
  }
  return { problem, info, sipGuesses, unconfirmed, clubbedLeftOut: [...clubbed].sort(), missingIncome: [...missing].sort() };
}

/** The placement problem `computePlacement` solves: starts after this season, assets, members. Exported for tests. */
export const placementProblem = (state: FamilyState, fam: FamilyView): PlacementProblem => build(state, fam).problem;

/** Placement moves for the family, after this season's moves (spec 2026-11-24 §5.3 step 5). */
export function computePlacement(state: FamilyState, fam: FamilyView): PlacementView {
  const { problem, info, sipGuesses, unconfirmed, clubbedLeftOut, missingIncome } = build(state, fam);
  const { asOf, rules } = fam;
  const result = problem.assets.some((a) => a.movable) ? solvePlacement(problem) : { placements: [] as Placement[] };
  const years = problem.years ?? PLACEMENT_YEARS;
  const byId = new Map(problem.members.map((m) => [m.id, m]));
  const nameOf = (id: string) => byId.get(id)?.name ?? 'This member';
  const rupees = (p: Paise) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

  // What a placement costs in tax in each name, against where everything sits today, averaged per year.
  const sliceOf = (a: PlaceAsset, k: number): Slice => ({
    assetId: a.id, taxClass: a.taxClass, annualReturn: a.annualReturn,
    value: Math.round(a.value * k), gain: Math.round(a.gain * k), yearlyAdd: Math.round(a.yearlyAdd * k),
  });
  const own = (id: string) => problem.assets.filter((a) => a.ownerId === id);
  const taxOf = (id: string, slices: Slice[]) => tenYearTax(byId.get(id)!, problem.starts[id]!, slices, asOf, years);
  const perYear = (p: Paise) => Math.round(p / years / 100) * 100;
  const inEachName = (p: Placement) => {
    const a = problem.assets.find((x) => x.id === p.assetId)!;
    const mine = own(p.fromId).map((x) => sliceOf(x, 1));
    const giver = taxOf(p.fromId, mine) - taxOf(p.fromId, own(p.fromId).map((x) => sliceOf(x, x.id === a.id ? 1 - p.share : 1)));
    const theirs = own(p.toId).map((x) => sliceOf(x, 1));
    const receiver = taxOf(p.toId, [...theirs, sliceOf(a, p.share)]) - taxOf(p.toId, theirs);
    return { giver: perYear(Math.max(0, giver)), receiver: perYear(Math.max(0, receiver)) };
  };

  const drafts: MoveDraft[] = [];
  for (const p of result.placements) {
    const x = info.get(p.assetId);
    if (!x) continue;
    const g = nameOf(p.fromId), r = nameOf(p.toId);
    const each = inEachName(p);
    const common = [
      `Could save about ${rupees(p.savingPerYear)} a year in tax, at assumed average returns: in ${g}'s name this would cost about ${rupees(each.giver)} a year in tax, in ${r}'s about ${rupees(each.receiver)}`,
      `A gift between these relatives is not taxed, and what it earns is not added back to ${g}'s income`,
      `It becomes ${r}'s money for good: it counts as ${r}'s income and passes by ${r}'s will or nominee`,
    ];
    const base = { fromId: p.fromId, toId: p.toId, isin: x.sec.isin, account: x.account, costs: 0, savingPerYear: p.savingPerYear, saving10y: p.saving10y, taxAvoided: p.savingPerYear, saving: p.savingPerYear };
    if (x.kind === 'sip') {
      const yearlyGift = Math.round(x.monthly * 12 * p.share);
      const monthly = Math.round(yearlyGift / 12);
      drafts.push({
        ...base, kind: 'place_sip', name: x.name, qty: 0, value: yearlyGift, monthly, yearlyGift,
        reasons: [...common, `Paperwork: each year ${g} sends ${r} ${rupees(yearlyGift)} by bank transfer from ${g}'s own account, with a signed gift letter. ${r} then runs the ${rupees(monthly)} a month SIP from their own bank account`],
      });
    } else {
      const step = unitStep(x.sec);
      const total = x.lots.reduce((a, l) => a + l.qty, 0);
      const qty: Qty = Math.floor((total * p.share) / step) * step;
      if (qty <= 0) continue;
      // The highest-gain lots go first; the move is approx if any of them is.
      const perUnit = (l: HoldingLot) => (l.gain ?? 0) / l.qty;
      let left = qty, approx = false;
      for (const l of [...x.lots].sort((a, b) => perUnit(b) - perUnit(a) || a.date.localeCompare(b.date))) {
        if (left <= 0) break;
        approx ||= !!l.approx;
        left -= Math.min(left, l.qty);
      }
      const demat = x.sec.listed || !x.sec.isin.startsWith('INF');
      drafts.push({
        ...base, kind: 'place_holding', name: x.sec.name, qty, value: Math.round(((x.sec.price ?? 0) * qty) / QTY_SCALE),
        ...(approx ? { approx: true as const } : {}),
        reasons: [
          ...(approx ? ['Some units were bought before your trade history, so their cost is the broker\'s average cost and this saving is an estimate. Import the full tradebook or a CAS for exact figures'] : []),
          ...common,
          demat
            ? `Paperwork: a signed gift letter, and an off-market transfer of the units from ${g}'s demat account to ${r}'s`
            : `Paperwork: a signed gift letter, and a transfer of the units to ${r}: off-market if they are in a demat account, or through the fund house (AMC) if they are in a folio`,
          `${r} takes over ${g}'s cost and holding period, as under the old Act; check with your CA how the new Act treats this`,
        ],
      });
    }
  }

  // Old-data marks, as computeFamily sets them: labels only; sizes, ids and totals are untouched.
  const evidence = newestEvidence(state);
  const roomEvidence = newestRoomEvidence(state);
  const oldFor = (memberId: string, account?: string) => {
    const d = evidence.get(accountKey(memberId, account));
    return d && isOld(d, asOf) ? d : undefined;
  };
  const oldestOldOf = (memberId: string) => {
    let oldest: ISODate | undefined;
    for (const [k, held] of evidence) {
      if (!k.startsWith(`${memberId}|`)) continue;
      const d = roomEvidence.get(k) ?? held;
      if (isOld(d, asOf) && (!oldest || d < oldest)) oldest = d;
    }
    return oldest;
  };
  const moves: Move[] = drafts.map((m) => {
    if (m.kind !== 'place_holding') return { ...m, id: moveId(m, rules) } as Move;
    const oldData = oldFor(m.fromId, m.account);
    const roomMayBeSmaller = oldestOldOf(m.toId);
    return { ...m, id: moveId(m, rules), ...(oldData ? { oldData } : {}), ...(roomMayBeSmaller ? { roomMayBeSmaller } : {}) };
  });
  moves.sort((a, b) => b.saving - a.saving || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { moves, sipGuesses, unconfirmed, clubbedLeftOut, missingIncome };
}
