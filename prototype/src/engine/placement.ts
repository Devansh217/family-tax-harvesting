import { addMonths } from './dates';
import { finalYearIncome, PLACEMENT_YEARS, tenYearTaxDetail, type ProjectionStart, type Slice, type TaxClass } from './placementTax';
import { canGift } from './relations';
import { basicExemption, rulesFor } from './rules';
import { taxForYear } from './tax';
import type { ISODate, Member, Paise } from './types';

/**
 * Family placement (spec 2026-11-24 §5.2–5.3, placement note §3.3): whose name each fund or SIP should sit in so the
 * family's tax over the horizon is lowest, with the family's mix fixed (D7). Gifts go only where `canGift` allows
 * (D6), only from individuals with income entered (D8), and each member either gives or receives, never both (D11).
 */

export interface PlaceAsset {
  id: string;
  ownerId: string;
  kind: 'sip' | 'holding';
  /** False for anything that can't be placed (estimated lots, unsettled tax type): it stays with its owner but still counts. */
  movable: boolean;
  taxClass: TaxClass;
  annualReturn: number;
  value: Paise;
  gain: Paise;
  /** Yearly SIP money (0 for a holding). */
  yearlyAdd: Paise;
}

export interface PlacementProblem {
  members: Member[];
  /** A `null` start means the income was not entered: never a receiver (and never a giver: their tax is unknown). */
  starts: Record<string, ProjectionStart | null>;
  assets: PlaceAsset[];
  asOf: ISODate;
  /** Horizon in tax years; `PLACEMENT_YEARS` when absent. */
  years?: number;
  /** Members who already give this season (a season gift): they may only give here too (D11). */
  fixedGivers?: string[];
  /** Members who already receive this season (a season gift): they may only receive here too (D11). */
  fixedReceivers?: string[];
}

export interface Placement {
  assetId: string;
  fromId: string;
  toId: string;
  /** Fraction of the asset moved (of its value, or of its yearly add for a SIP), between 0 and 1. */
  share: number;
  /** `saving10y` over the horizon's years, rounded to the rupee. */
  savingPerYear: Paise;
  /** Family tax saved over the horizon by this placement alone: the plan's tax with it undone, minus the plan's tax. */
  saving10y: Paise;
}

export interface PlacementResult { placements: Placement[]; baselineTax: Paise; planTax: Paise }

// Tuning constants (placement note §3.3; spec §8 leaves step sizes and the stop rule to the builder).
/** Greedy step: at least this much of an asset's value (or of a SIP's yearly add)… */
export const PLACEMENT_STEP_MIN: Paise = 10_000_00;
/** …or the asset's total split in this many steps, whichever is larger. */
export const PLACEMENT_STEP_PARTS = 400;
/** The swap pass halves its step down to this for a holding… */
export const SWAP_FLOOR_HOLDING: Paise = 5_000_00;
/** …and to this a month for a SIP. */
export const SWAP_FLOOR_SIP_MONTHLY: Paise = 500_00;
/** A swap-pass move is kept only when it cuts family tax by more than this. */
export const SWAP_KEEP_MIN: Paise = 100_00;
/** Cliff snap looks at members whose final-year income is at most this far above the rebate line. */
export const CLIFF_WINDOW: Paise = 2_00_000_00;
/** Placements saving less than this a year are dropped. */
export const MIN_SAVING_PER_YEAR: Paise = 1_000_00;
/** Amounts are rounded to this for a holding… */
export const ROUND_HOLDING: Paise = 1_000_00;
/** …and to this a month for a SIP. */
export const ROUND_SIP_MONTHLY: Paise = 500_00;

/** Most sizes tried on each side of a pair swap. */
export const PAIR_SIZES = 6;
/** Most rounds of the role search. */
export const ROLE_ROUNDS = 3;
/**
 * Added to a member's tax when a state puts them in the marginal-relief band (see `tenYearTaxDetail`) and they were
 * not in it at baseline, so every pass rejects such a state. Issue #49
 * (https://github.com/Devansh217/family-tax-harvesting/issues/49): remove this guard if #49 settles that the relief
 * does cover special-rate tax.
 */
const BAND_REJECT: Paise = 1e13;

const MONTHS = 12;
const NONE = { equitySt: 0, equityLt: 0, otherLt: 0, slab: 0 };

/**
 * Working state. Assets and members are sorted by id so the result never depends on input order. `amt[a][m]` is how
 * much of asset a member m holds, in paise of the asset's base (value, or yearly add for a SIP); the column sums to
 * the base. Member taxes are cached by the member's holdings, shared between copies of the same problem.
 */
interface Ctx {
  p: PlacementProblem;
  years: number;
  members: Member[];
  starts: Array<ProjectionStart | null>;
  assets: PlaceAsset[];
  base: Paise[];
  owner: number[];
  /** Allowed receivers per asset (empty when the asset can't move). */
  receivers: number[][];
  amt: number[][];
  /** Per member, by holdings: the tax and whether the final year is in the marginal-relief band. */
  cache: Array<Map<string, { tax: Paise; band: boolean }>>;
  /** Who is in the band at baseline (they may stay there; nobody else may enter it). */
  baseBand: boolean[];
  lines: Map<number, Paise>;
  /** When set, only these members may give and only the others may receive (the role search below). */
  allow: boolean[] | null;
  /** Roles this season's gifts already set: a season giver counts as having given, a season receiver as having received. */
  fixedGave: boolean[];
  fixedGot: boolean[];
}

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
/** What `share` is a fraction of: a SIP's yearly add (its value when it has none), or a holding's value. */
const baseOf = (a: PlaceAsset) => (a.kind === 'sip' && a.yearlyAdd > 0 ? a.yearlyAdd : a.value);

function build(p: PlacementProblem): Ctx {
  const members = byId(p.members);
  const idx = new Map(members.map((m, i) => [m.id, i]));
  for (const a of p.assets) if (!idx.has(a.ownerId)) throw new Error(`Placement: asset ${a.id} belongs to ${a.ownerId}, who is not a member`);
  const assets = byId(p.assets);
  const starts = members.map((m) => p.starts[m.id] ?? null);
  const owner = assets.map((a) => idx.get(a.ownerId)!);
  const base = assets.map((a) => Math.max(0, baseOf(a)));
  const receivers = assets.map((a, i) => {
    const g = members[owner[i]!]!;
    if (!a.movable || base[i]! <= 0 || g.type === 'huf' || starts[owner[i]!] == null) return [];
    return members.flatMap((m, j) => (j !== owner[i] && starts[j] != null && canGift(g, m, p.members, p.asOf) ? [j] : []));
  });
  const amt = assets.map((_, i) => members.map((_, j) => (j === owner[i] ? base[i]! : 0)));
  const fixedGave = members.map((m) => !!p.fixedGivers?.includes(m.id));
  const fixedGot = members.map((m) => !!p.fixedReceivers?.includes(m.id));
  const c: Ctx = { p, years: p.years ?? PLACEMENT_YEARS, members, starts, assets, base, owner, receivers, amt, cache: members.map(() => new Map()), baseBand: [], lines: new Map(), allow: null, fixedGave, fixedGot };
  c.baseBand = members.map((_, m) => detailOf(c, m).band);
  return c;
}

const clone = (c: Ctx): Ctx => ({ ...c, amt: c.amt.map((row) => [...row]) });

function slicesOf(c: Ctx, m: number): Slice[] {
  const out: Slice[] = [];
  c.assets.forEach((a, i) => {
    const x = c.amt[i]![m]!;
    if (x <= 0) return;
    const whole = x === c.base[i];
    const scale = (v: Paise) => (whole ? v : Math.round((v * x) / c.base[i]!));
    out.push({ assetId: a.id, taxClass: a.taxClass, annualReturn: a.annualReturn, value: scale(a.value), gain: scale(a.gain), yearlyAdd: scale(a.yearlyAdd) });
  });
  return out;
}

function detailOf(c: Ctx, m: number): { tax: Paise; band: boolean } {
  const s = c.starts[m];
  if (s == null) return { tax: 0, band: false };
  let key = '';
  for (let i = 0; i < c.assets.length; i++) { const x = c.amt[i]![m]!; if (x > 0) key += `${i}:${x},`; }
  const hit = c.cache[m]!.get(key);
  if (hit !== undefined) return hit;
  const d = tenYearTaxDetail(c.members[m]!, s, slicesOf(c, m), c.p.asOf, c.years);
  const out = { tax: d.tax, band: d.reliefBand };
  c.cache[m]!.set(key, out);
  return out;
}

/** The member's ten-year tax, plus `BAND_REJECT` when this state newly puts them in the marginal-relief band (#49). */
function taxOf(c: Ctx, m: number): Paise {
  const d = detailOf(c, m);
  return d.band && !c.baseBand[m] ? d.tax + BAND_REJECT : d.tax;
}
/** The family's tax without the band guard: the figure shown. */
const realTax = (c: Ctx) => c.members.reduce((sum, _, m) => sum + detailOf(c, m).tax, 0);

const familyTax = (c: Ctx) => c.members.reduce((sum, _, m) => sum + taxOf(c, m), 0);

/** Who has given (an own asset partly held by someone else, or a season gift) and who has received. */
function roles(c: Ctx) {
  const pGave = c.members.map(() => false), pGot = c.members.map(() => false);
  c.amt.forEach((row, i) => row.forEach((x, m) => { if (x > 0 && m !== c.owner[i]) { pGave[c.owner[i]!] = true; pGot[m] = true; } }));
  return { gave: pGave.map((g, m) => g || c.fixedGave[m]!), got: pGot.map((g, m) => g || c.fixedGot[m]!), pGave, pGot };
}
/**
 * The role lock (D11): nobody both gives and receives, counting this season's gifts. A member the season already has
 * on both sides takes no part in placement at all. The role search's `allow` applies to placement's own gifts.
 */
function lockOk(c: Ctx): boolean {
  const { gave, got, pGave, pGot } = roles(c);
  return c.members.every((_, m) => (c.fixedGave[m] && c.fixedGot[m] ? !pGave[m] && !pGot[m] : !(gave[m] && got[m]))
    && (!c.allow || ((!pGave[m] || c.allow[m]!) && (!pGot[m] || !c.allow[m]))));
}

/** Change in family tax from moving `x` of asset i from member f to member t (negative = saves). */
function trial(c: Ctx, i: number, f: number, t: number, x: Paise): Paise {
  const before = taxOf(c, f) + taxOf(c, t);
  c.amt[i]![f]! -= x; c.amt[i]![t]! += x;
  const after = taxOf(c, f) + taxOf(c, t);
  c.amt[i]![f]! += x; c.amt[i]![t]! -= x;
  return after - before;
}
const apply = (c: Ctx, i: number, f: number, t: number, x: Paise) => { c.amt[i]![f]! -= x; c.amt[i]![t]! += x; };

const stepOf = (c: Ctx, i: number) => Math.max(PLACEMENT_STEP_MIN, Math.round(c.base[i]! / PLACEMENT_STEP_PARTS));
const floorOf = (c: Ctx, i: number) => (c.assets[i]!.kind === 'sip' ? SWAP_FLOOR_SIP_MONTHLY * MONTHS : SWAP_FLOOR_HOLDING);
const unitOf = (c: Ctx, i: number) => (c.assets[i]!.kind === 'sip' ? ROUND_SIP_MONTHLY * MONTHS : ROUND_HOLDING);

/**
 * Greedy fill with regret: each round, for every asset its owner still holds, the family-tax drop of moving one step
 * to each allowed receiver, with staying as an option worth 0. The asset whose best receiver beats its runner-up by
 * the most moves one step there, if that saves anything. Ties: first asset id, then first member id.
 */
function greedy(c: Ctx) {
  for (;;) {
    const { gave, got } = roles(c);
    let pick: { i: number; r: number; step: Paise; regret: Paise } | null = null;
    for (let i = 0; i < c.assets.length; i++) {
      const o = c.owner[i]!, held = c.amt[i]![o]!;
      if (c.receivers[i]!.length === 0 || held <= 0 || got[o] || (c.allow && !c.allow[o])) continue;
      const step = Math.min(stepOf(c, i), held);
      const ownerBefore = taxOf(c, o);
      c.amt[i]![o]! -= step;
      const ownerAfter = taxOf(c, o);
      let best = 0, second = -Infinity, bestR = -1;
      for (const r of c.receivers[i]!) {
        if (gave[r] || (c.allow && c.allow[r])) continue;
        const rBefore = taxOf(c, r);
        c.amt[i]![r]! += step;
        const drop = ownerBefore - ownerAfter + rBefore - taxOf(c, r);
        c.amt[i]![r]! -= step;
        if (drop > best) { second = Math.max(second, best); best = drop; bestR = r; } else second = Math.max(second, drop);
      }
      c.amt[i]![o]! += step;
      if (bestR < 0) continue;
      second = Math.max(second, 0); // staying is always an option
      const regret = best - second;
      if (!pick || regret > pick.regret) pick = { i, r: bestR, step, regret };
    }
    if (!pick) return;
    apply(c, pick.i, c.owner[pick.i]!, pick.r, pick.step);
  }
}

/** Sizes to try when moving from a holder with `held`: all of it, three quarters, half, then halving down to the floor. */
function sizes(held: Paise, floor: Paise): Paise[] {
  const out = new Set<Paise>([held, Math.round((held * 3) / 4)]);
  for (let k = 2; Math.round(held / k) >= floor; k *= 2) out.add(Math.round(held / k));
  if (held < floor) out.add(held);
  return [...out].filter((x) => x > 0);
}

/** The highest income on which this member pays no tax: the rebate line (₹12 L in the new regime), from the rules. */
function rebateLine(c: Ctx, m: number): Paise {
  const hit = c.lines.get(m);
  if (hit !== undefined) return hit;
  const date = addMonths(c.p.asOf, MONTHS * (c.years - 1));
  const r = rulesFor(date), who = c.members[m]!;
  const free = (rupees: number) => taxForYear(who, rupees * 100, NONE, r, date).tax === 0;
  let lo = 0, hi = Math.max(1, Math.round(basicExemption(who, r) / 100));
  for (let k = 0; k < 40 && free(hi); k++) { lo = hi; hi *= 2; }
  while (lo < hi - 1) { const mid = Math.floor((lo + hi) / 2); if (free(mid)) lo = mid; else hi = mid; }
  const line = lo * 100;
  c.lines.set(m, line);
  return line;
}

const incomeOf = (c: Ctx, m: number) => finalYearIncome(c.members[m]!, c.starts[m]!, slicesOf(c, m), c.p.asOf, c.years);

/**
 * Cliff snap: a receiver whose final-year income is just over the rebate line gives back the least of a received
 * fund that takes them under it, slab funds first. Kept only if the family pays less.
 */
function cliffSnap(c: Ctx): boolean {
  let changed = false;
  const { got } = roles(c);
  const order: TaxClass[] = ['slab', 'other_lt', 'equity'];
  for (let m = 0; m < c.members.length; m++) {
    if (!got[m] || c.starts[m] == null) continue;
    const line = rebateLine(c, m);
    for (const cls of order) {
      for (let i = 0; i < c.assets.length; i++) {
        const o = c.owner[i]!, held = c.amt[i]![m]!;
        if (o === m || held <= 0 || c.assets[i]!.taxClass !== cls) continue;
        const y = incomeOf(c, m);
        if (y <= line || y > line + CLIFF_WINDOW) continue;
        // Least returned (to the rupee) that brings the income to the line; all of it if even that isn't enough.
        const under = (x: Paise) => { apply(c, i, m, o, x); const ok = incomeOf(c, m) <= line; apply(c, i, o, m, x); return ok; };
        let x = held;
        if (under(held)) {
          let lo = 0, hi = Math.ceil(held / 100);
          while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (under(Math.min(held, mid * 100))) hi = mid; else lo = mid + 1; }
          x = Math.min(held, lo * 100);
        }
        if (x > 0 && trial(c, i, m, o, x) < 0) { apply(c, i, m, o, x); changed = true; }
      }
    }
  }
  return changed;
}

/**
 * Pair swaps: two funds of the same tax class competing for one member's room trade places, part of one going from
 * f to t while part of the other comes back from t to f. Sizes as in the swap pass, at most `PAIR_SIZES` each side.
 * The best pair that cuts family tax by more than `SWAP_KEEP_MIN` within the role lock is kept.
 */
function pairSwap(c: Ctx): boolean {
  let changed = false;
  for (let i = 0; i < c.assets.length; i++) for (let j = 0; j < c.assets.length; j++) {
    if (i === j || c.assets[i]!.taxClass !== c.assets[j]!.taxClass) continue;
    const hi = [c.owner[i]!, ...c.receivers[i]!], hj = [c.owner[j]!, ...c.receivers[j]!];
    for (const f of hi) for (const t of hi) {
      if (f === t || !hj.includes(f) || !hj.includes(t) || c.amt[i]![f]! <= 0 || c.amt[j]![t]! <= 0) continue;
      const xs = sizes(c.amt[i]![f]!, floorOf(c, i)).slice(0, PAIR_SIZES), ys = sizes(c.amt[j]![t]!, floorOf(c, j)).slice(0, PAIR_SIZES);
      const t0 = familyTax(c);
      let best = -SWAP_KEEP_MIN, bx = 0, by = 0;
      for (const x of xs) {
        apply(c, i, f, t, x);
        for (const y of ys) {
          apply(c, j, t, f, y);
          const d = familyTax(c) - t0;
          if (d < best && lockOk(c)) { best = d; bx = x; by = y; }
          apply(c, j, f, t, y);
        }
        apply(c, i, t, f, x);
      }
      if (bx > 0) { apply(c, i, f, t, bx); apply(c, j, t, f, by); changed = true; }
    }
  }
  return changed;
}

/**
 * Swap pass: single moves between any two holders of the same asset (owner and allowed receivers, either way),
 * trying all of the holder's share, three quarters, then halves down to the floor; the size that cuts family tax most
 * is kept, if by more than `SWAP_KEEP_MIN` and within the role lock. Then the cliff snap. Repeats until nothing changes;
 * with `pairs`, pair swaps are tried once single moves run out (only on the final candidates, to keep within time).
 */
function improve(c: Ctx, pairs = false) {
  for (let sweep = 0; sweep < 50; sweep++) {
    let changed = false;
    for (let i = 0; i < c.assets.length; i++) {
      if (c.receivers[i]!.length === 0) continue;
      const hs = [c.owner[i]!, ...c.receivers[i]!];
      for (const f of hs) for (const t of hs) {
        if (f === t || c.amt[i]![f]! <= 0) continue;
        let best = -SWAP_KEEP_MIN, bestX = 0;
        for (const x of sizes(c.amt[i]![f]!, floorOf(c, i))) {
          const d = trial(c, i, f, t, x);
          if (d >= best) continue;
          apply(c, i, f, t, x);
          if (lockOk(c)) { best = d; bestX = x; }
          apply(c, i, t, f, x);
        }
        if (bestX > 0) { apply(c, i, f, t, bestX); changed = true; }
      }
    }
    if (cliffSnap(c)) changed = true;
    if (!changed && !(pairs && pairSwap(c))) return;
  }
}

/**
 * Role search. Under the role lock (D11) the greedy's first gifts decide who gives, which can shut out a better plan
 * where gifts run the other way. For each member who could either give or receive, and each pair of them, flip their
 * side, undo the gifts the flip forbids, refill with the greedy and polish with the swap pass; keep the flip if family tax falls by more
 * than `SWAP_KEEP_MIN`. Repeats, up to `ROLE_ROUNDS` times, while a flip helps.
 */
function roleSearch(start: Ctx): Ctx {
  const n = start.members.length;
  // A season giver never receives and a season receiver never gives, so neither side is theirs to flip.
  const canGive = start.members.map((_, m) => !start.fixedGot[m] && start.assets.some((_, i) => start.owner[i] === m && start.receivers[i]!.length > 0));
  const canGet = start.members.map((_, m) => !start.fixedGave[m] && start.receivers.some((rs) => rs.includes(m)));
  let best = start, bestTax = familyTax(start);
  for (let round = 0; round < ROLE_ROUNDS; round++) {
    const { gave } = roles(best);
    const side = best.members.map((_, m) => (canGive[m]! && !canGet[m]!) || gave[m]!);
    let better = false;
    const contested = best.members.flatMap((_, m) => (canGive[m] && canGet[m] ? [m] : []));
    const flips = [...contested.map((x) => [x]), ...contested.flatMap((x, k) => contested.slice(k + 1).map((y) => [x, y]))];
    for (const flip of flips) {
      const s = clone(best);
      s.allow = side.map((v, m) => (flip.includes(m) ? !v : v));
      for (let i = 0; i < s.assets.length; i++) {
        const o = s.owner[i]!;
        for (let m = 0; m < n; m++) if (m !== o && s.amt[i]![m]! > 0 && (!s.allow[o] || s.allow[m])) apply(s, i, m, o, s.amt[i]![m]!);
      }
      greedy(s); improve(s);
      const t = familyTax(s);
      if (t < bestTax - SWAP_KEEP_MIN) { best = s; bestTax = t; better = true; }
    }
    if (!better) break;
  }
  return { ...best, allow: null };
}

/**
 * Headroom buckets (placement note §3.6), with the exact tax function in place of estimated capacities: slab funds
 * first (highest return first), then equity, then other long-term; each goes, as far as it adds no tax, to receivers
 * in order of lowest income. Higher-income owners give first; the role lock holds throughout.
 */
function bucketFill(c: Ctx) {
  const normal = (m: number) => c.starts[m]?.normal ?? Infinity;
  const rank: Record<TaxClass, number> = { slab: 0, equity: 1, other_lt: 2 };
  const order = c.assets.map((_, i) => i).sort((a, b) => {
    const x = c.assets[a]!, y = c.assets[b]!;
    return rank[x.taxClass] - rank[y.taxClass] || y.annualReturn - x.annualReturn || normal(c.owner[b]!) - normal(c.owner[a]!) || a - b;
  });
  for (const i of order) {
    const o = c.owner[i]!, unit = unitOf(c, i);
    const rs = [...c.receivers[i]!].sort((a, b) => normal(a) - normal(b) || a - b);
    for (const r of rs) {
      const { gave, got } = roles(c);
      const held = c.amt[i]![o]!;
      if (held <= 0 || got[o]) break;
      if (gave[r]) continue;
      const t0 = taxOf(c, r);
      const free = (x: Paise) => { apply(c, i, o, r, x); const ok = taxOf(c, r) <= t0; apply(c, i, r, o, x); return ok; };
      let x: Paise;
      if (free(held)) x = held;
      else {
        let lo = 0, hi = Math.floor(held / unit);
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (free(mid * unit)) lo = mid; else hi = mid - 1; }
        x = lo * unit;
      }
      if (x > 0 && trial(c, i, o, r, x) < 0) apply(c, i, o, r, x);
    }
  }
}

/** Round each receiver's amount to the unit; an owner's leftover under one unit goes to the largest receiver. */
function roundAll(c: Ctx) {
  for (let i = 0; i < c.assets.length; i++) {
    const o = c.owner[i]!, unit = unitOf(c, i), row = c.amt[i]!;
    let left = c.base[i]!, top = -1;
    for (let m = 0; m < row.length; m++) {
      if (m === o || row[m]! <= 0) continue;
      row[m] = Math.min(left, Math.round(row[m]! / unit) * unit);
      left -= row[m]!;
      if (row[m]! > 0 && (top < 0 || row[m]! > row[top]!)) top = m;
    }
    if (top >= 0 && left > 0 && left < unit) { row[top]! += left; left = 0; }
    row[o] = left;
  }
}

/** Each placement with the family-tax drop of undoing it alone. */
function credits(c: Ctx, plan: Paise) {
  const out: Array<{ i: number; r: number; saving: Paise }> = [];
  for (let i = 0; i < c.assets.length; i++) {
    const o = c.owner[i]!;
    for (let r = 0; r < c.members.length; r++) {
      const x = c.amt[i]![r]!;
      if (r === o || x <= 0) continue;
      apply(c, i, r, o, x);
      out.push({ i, r, saving: realTax(c) - plan });
      apply(c, i, o, r, x);
    }
  }
  return out;
}

/** Rounding, one placement per (asset, receiver), credits, and dropping the smallest under the yearly floor, one at a time. */
function finish(c: Ctx, baselineTax: Paise): PlacementResult {
  for (;;) {
    roundAll(c);
    const plan = realTax(c);
    const list = credits(c, plan).map((x) => ({ ...x, perYear: Math.round(x.saving / c.years / 100) * 100 }));
    const worst = list.reduce<(typeof list)[number] | null>((w, x) => (!w || x.perYear < w.perYear ? x : w), null);
    if (worst && worst.perYear < MIN_SAVING_PER_YEAR) { apply(c, worst.i, worst.r, c.owner[worst.i]!, c.amt[worst.i]![worst.r]!); continue; }
    // familyTax carries the band guard (#49): a rounded plan that newly puts someone in the band is not returned.
    if (familyTax(c) > baselineTax) return { placements: [], baselineTax, planTax: baselineTax };
    const placements = list.map(({ i, r, saving, perYear }) => ({
      assetId: c.assets[i]!.id, fromId: c.members[c.owner[i]!]!.id, toId: c.members[r]!.id,
      share: c.amt[i]![r]! / c.base[i]!, savingPerYear: perYear, saving10y: saving,
    }));
    return { placements, baselineTax, planTax: plan };
  }
}

/** The headroom-bucket cross-check (placement note §3.6). Exported for tests. */
export function bucketCheck(p: PlacementProblem): PlacementResult {
  const c = build(p);
  const baselineTax = familyTax(c);
  bucketFill(c);
  return finish(c, baselineTax);
}

/**
 * Greedy with regret, then the swap pass and cliff snap, then clean-up (spec §5.3). The bucket fill, polished by the
 * same swap pass, and the plain bucket check are also tried, and the lowest family tax wins (ties keep the greedy),
 * so the plan is never worse than the fallback or than doing nothing.
 */
export function solvePlacement(p: PlacementProblem): PlacementResult {
  const c = build(p);
  const baselineTax = familyTax(c);
  const g = clone(c);
  greedy(g); improve(g); const gr = roleSearch(g); improve(gr, true);
  const b = clone(c);
  bucketFill(b);
  const bPlain = clone(b);
  improve(b, true);
  let best = finish(gr, baselineTax);
  for (const x of [finish(b, baselineTax), finish(bPlain, baselineTax)]) if (x.planTax < best.planTax) best = x;
  return best;
}
