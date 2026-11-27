import { describe, expect, it } from 'vitest';
import { bucketCheck, MIN_SAVING_PER_YEAR, solvePlacement, type PlaceAsset, type PlacementProblem, type PlacementResult } from './placement';
import { finalYearBuckets, tenYearTax, type ProjectionStart, type Slice } from './placementTax';
import { rulesFor } from './rules';
import { taxForYear } from './tax';
import { canGift } from './relations';
import type { Member, Paise } from './types';

const L = 1_00_000_00;
const ASOF = '2026-11-24';
const none = { equitySt: 0, equityLt: 0, otherLt: 0, slab: 0 };
const start = (normal: Paise): ProjectionStart => ({ normal, year1: none });
const member = (id: string, over: Partial<Member> = {}): Member => ({ id, name: id, relation: 'self', age: 40, regime: 'new', type: 'person', ...over });
const asset = (id: string, ownerId: string, over: Partial<PlaceAsset> = {}): PlaceAsset => ({
  id, ownerId, kind: 'holding', movable: true, taxClass: 'slab', annualReturn: 0.07, value: 10 * L, gain: 0, yearlyAdd: 0, ...over,
});

const earner = member('earner');
const parent = member('parent', { relation: 'parent', age: 65 });

describe('solvePlacement', () => {
  // A 10 L slab fund at 6% is worth 17,90,847.70 in year 10 (rounded each year), gain 7,90,847.70.
  // Earner, normal 30 L, all of it at 30%: with the sale the slab tax on 37,90,847.70 is 3,00,000 (bands to 24 L)
  // + 13,90,847.70 * 30% = 7,17,254.31, with cess 7,45,944; without, 4,80,000 * 1.04 = 4,99,200; extra 2,46,744.
  // Parent, normal 3 L: 10,90,847.70 is under 12 L, so the rebate leaves nil. Saving 2,46,744, 24,674 a year.
  it('moves a slab fund to the low-income parent', () => {
    const p: PlacementProblem = {
      members: [earner, parent], starts: { earner: start(30 * L), parent: start(3 * L) },
      assets: [asset('debt', 'earner', { annualReturn: 0.06 })], asOf: ASOF,
    };
    const r = solvePlacement(p);
    expect(r.baselineTax).toBe(2_46_744_00);
    expect(r.planTax).toBe(0);
    expect(r.placements).toEqual([{ assetId: 'debt', fromId: 'earner', toId: 'parent', share: 1, savingPerYear: 24_674_00, saving10y: 2_46_744_00 }]);
  });

  it('never places with a spouse, HUF or minor', () => {
    const spouse = member('spouse', { relation: 'spouse', spouseId: 'earner' });
    const huf = member('huf', { type: 'huf', relation: 'other', hufMemberIds: ['earner'] });
    const minor = member('minor', { relation: 'child_minor', age: 10, parentIds: ['earner'] });
    const p: PlacementProblem = {
      members: [earner, parent, spouse, huf, minor],
      starts: { earner: start(30 * L), parent: start(3 * L), spouse: start(0), huf: start(0), minor: start(0) },
      assets: [asset('debt', 'earner', { annualReturn: 0.06 }), asset('eq', 'earner', { taxClass: 'equity', value: 40 * L, annualReturn: 0.12 })],
      asOf: ASOF,
    };
    const r = solvePlacement(p);
    expect(r.placements.length).toBeGreaterThan(0);
    for (const x of r.placements) expect(['spouse', 'huf', 'minor']).not.toContain(x.toId);
  });

  it('the HUF never gives, on either path', () => {
    // A 30 L-income HUF with a slab fund and a parent at 3 L: moving it would save tax, but HUF money stays put (D8).
    const huf = member('huf', { type: 'huf', relation: 'other', hufMemberIds: ['earner'] });
    const p: PlacementProblem = {
      members: [earner, parent, huf],
      starts: { earner: start(30 * L), parent: start(3 * L), huf: start(30 * L) },
      assets: [asset('debt', 'huf', { annualReturn: 0.06 })],
      asOf: ASOF,
    };
    expect(solvePlacement(p).placements).toEqual([]);
    expect(bucketCheck(p).placements).toEqual([]);
  });

  it('member without income is never a receiver', () => {
    const p: PlacementProblem = {
      members: [earner, parent], starts: { earner: start(30 * L), parent: null },
      assets: [asset('debt', 'earner', { annualReturn: 0.06 })], asOf: ASOF,
    };
    const r = solvePlacement(p);
    expect(r.placements).toEqual([]);
    expect(r.planTax).toBe(r.baselineTax);
  });

  // Without the lock the best plan goes both ways: the earner's slab fund to the parent (30% to nil), and some of
  // the parent's big equity fund to the earner, whose 1.25 L yearly exemption is unused.
  it('no two-way gifts', () => {
    const p: PlacementProblem = {
      members: [earner, parent], starts: { earner: start(30 * L), parent: start(5 * L) },
      assets: [
        asset('debt', 'earner', { annualReturn: 0.06 }),
        asset('eq', 'parent', { taxClass: 'equity', value: 60 * L, annualReturn: 0.12 }),
      ],
      asOf: ASOF,
    };
    const r = solvePlacement(p);
    expect(r.placements.length).toBeGreaterThan(0);
    const from = new Set(r.placements.map((x) => x.fromId)), to = new Set(r.placements.map((x) => x.toId));
    for (const id of from) expect(to.has(id)).toBe(false);
  });

  // The parent (normal 6 L, so no unused basic exemption) holds 15 L of unmovable equity at 10%: its gain is at
  // least 1.5 L a year, more than the 1.25 L room. Equity moved to them is taxed at 12.5% at the final sale, the
  // same rate the earner pays on it, so moving saves nothing (any rupee of rounding is dropped by the 1,000 rule).
  // Without the unmovable fund, the parent's room would make moving some of the earner's 20 L worth it.
  it('includes unmovable holdings in each member\'s yearly room', () => {
    const base = {
      members: [earner, parent], starts: { earner: start(30 * L), parent: start(6 * L) }, asOf: ASOF,
    };
    const eq = asset('eq', 'earner', { taxClass: 'equity', value: 20 * L, annualReturn: 0.1 });
    const own = asset('own', 'parent', { taxClass: 'equity', value: 15 * L, annualReturn: 0.1, movable: false });
    expect(solvePlacement({ ...base, assets: [eq] }).placements.some((x) => x.assetId === 'eq')).toBe(true);
    const r = solvePlacement({ ...base, assets: [eq, own] });
    expect(r.placements.filter((x) => x.assetId === 'eq')).toEqual([]);
    expect(r.placements.filter((x) => x.assetId === 'own')).toEqual([]);
  });

  // Slab fund 10 L with a 4 L gain and no growth. Earner (30 L) pays 4 L * 30% * 1.04 = 1,24,800.
  // Parent normal 10 L: half the fund (2 L gain) takes them to exactly 12 L, where the rebate still applies: nil.
  // Moving all of it (14 L) costs the parent 20,000 + 40,000 + 2 L * 15% = 90,000, with cess 93,600, and saves the
  // earner only 1,24,800: net 31,200. Half saves 2 L * 31.2% = 62,400 (6,240 a year).
  it('stops before the 12 L line when the cliff costs more than it saves', () => {
    const p: PlacementProblem = {
      members: [earner, parent], starts: { earner: start(30 * L), parent: start(10 * L) },
      assets: [asset('debt', 'earner', { annualReturn: 0, gain: 4 * L })], asOf: ASOF,
    };
    const r = solvePlacement(p);
    expect(r.baselineTax).toBe(1_24_800_00);
    expect(r.placements).toHaveLength(1);
    const [x] = r.placements;
    expect(x!.share).toBeLessThan(1);
    expect(x!.share).toBeLessThanOrEqual(0.5);
    expect(r.planTax).toBe(62_400_00);
    expect(x!.saving10y).toBe(62_400_00);
    expect(x!.savingPerYear).toBe(6_240_00);
  });

  it('never worse than baseline or the bucket check', () => {
    const rnd = prng(20261124);
    for (let i = 0; i < 200; i++) {
      const p = randomFamily(rnd);
      const r = solvePlacement(p);
      expect(r.planTax).toBeLessThanOrEqual(r.baselineTax);
      expect(r.planTax).toBeLessThanOrEqual(bucketCheck(p).planTax);
      checkInvariants(p, r);
      // The bucket path can be the answer, so it keeps the same rules (role lock, canGift, clean-up and drop).
      checkInvariants(p, bucketCheck(p));
    }
  });

  it('matches brute force', () => {
    const rnd = prng(7);
    let equal = 0, n = 0, worst = 0, excepted = 0;
    for (let i = 0; i < 100; i++) {
      const p = randomFamily(rnd);
      const { best, choice } = bruteForce(p);
      const r = solvePlacement(p);
      n++;
      // Taxes are rounded to the rupee per member, and slices scale amounts with Math.round, so allow ₹1 a member.
      if (r.planTax <= best + p.members.length * 100) equal++;
      // Exception, issue #49 (https://github.com/Devansh217/family-tax-harvesting/issues/49): taxForYear's marginal relief above the 12 L line also cuts tax on special-rate gains, so
      // a member just over the line can pay far less than one under it. The oracle finds plans that sit in that band;
      // the solver must not chase a reading that is unconfirmed (an anti-goal), so such families skip the 0.5% bar.
      // They still count towards the 95% equal bar, and at most 2 of the 100 may be excepted. Only a family that
      // misses the bar is excepted (and counted): plans can sit in the band and still match.
      const bar = Math.max(best * 1.005, best + p.members.length * 100);
      if (r.planTax > bar && inReliefBand(p, choice)) { excepted++; continue; }
      const miss = best > 0 ? (r.planTax - best) / best : r.planTax > best + p.members.length * 100 ? Infinity : 0;
      worst = Math.max(worst, miss);
      expect(r.planTax, `family ${i}`).toBeLessThanOrEqual(bar);
    }
    expect(equal / n).toBeGreaterThanOrEqual(0.95);
    expect(worst).toBeLessThanOrEqual(0.005);
    expect(excepted).toBeLessThanOrEqual(2);
  });

  it('is deterministic', () => {
    const rnd = prng(99);
    for (let i = 0; i < 30; i++) {
      const p = randomFamily(rnd);
      const shuffled = { ...p, assets: shuffle([...p.assets], rnd), members: shuffle([...p.members], rnd) };
      expect(solvePlacement(shuffled)).toEqual(solvePlacement(p));
    }
  });

  // Placement note §4 with its overrides: 5 years, returns 11% / 7% / 9%, the 40 L as Rahul's movable holdings.
  // Our model (spec D12) harvests equity every year, where the note sells everything once at year 5, so its
  // figures (baseline 3,76,200, plan 1,02,200) can't match. Ours, hand-checked:
  // Baseline, all with Rahul (normal 24.25 L, 30% band):
  // - Equity 24 L at 11%: 1.25 L harvested free in each of years 1-4, so the year-5 sale is 40.44 L - 24 L - 5 L
  //   = 11.44 L; (11.44 L - 1.25 L) * 12.5% * 1.04 = 1,32,487.
  // - Debt 12 L at 7%: gain 4.83 L at 30% * 1.04 = 1,50,716. Gold 4 L at 9%: gain 2.15 L at 13% = 28,009.
  // - Together 3,11,210 (one tax call, so the rupee rounding falls once).
  // Plan: nil, and this is how each member's room absorbs it (equity grows 1.11x a year, so a slice worth V pays
  // yearly gains of 0.11V, 0.12V, 0.14V, 0.15V, 0.17V, each harvested):
  // - Aarav (no income, 4 L basic exemption): all of debt, gain 12 L * (1.07^5 - 1) = 4.83 L as slab income in year 5,
  //   under 12 L, so the rebate takes it to nil (the 4 L gap goes to it too). Equity 30.8% = 7.4 L: the largest yearly
  //   gain, year 5, is 7.4 L * 1.11^4 * 0.11 = 1.24 L, inside the 1.25 L exemption.
  // - Dad (2.25 L income, 1.75 L gap): equity 38.3% = 9.2 L, year-5 gain 9.2 L * 1.11^4 * 0.11 = 1.54 L: 1.25 L exempt
  //   and 0.29 L from the gap, which leaves 1.46 L. Gold 67.5% = 2.7 L, gain 2.7 L * (1.09^5 - 1) = 1.45 L, fits.
  // - Mum (no income, 4 L gap): gold 32.5% = 1.3 L, gain 0.70 L, inside the gap.
  // - Rahul keeps equity 30.8% = 7.4 L: same yearly gains as Aarav's slice, each under his 1.25 L exemption.
  // Priya (wife) is clubbed and never chosen.
  it('golden: note §4 example', () => {
    const rahul = member('rahul', { age: 42 });
    const priya = member('priya', { relation: 'spouse', spouseId: 'rahul' });
    const dad = member('dad', { relation: 'parent', age: 68 });
    const mum = member('mum', { relation: 'parent', age: 65 });
    const aarav = member('aarav', { relation: 'child_adult', age: 20, parentIds: ['rahul', 'priya'] });
    const p: PlacementProblem = {
      members: [rahul, priya, dad, mum, aarav],
      starts: { rahul: start(24_25_000_00), priya: start(8_25_000_00), dad: start(2_25_000_00), mum: start(0), aarav: start(0) },
      assets: [
        asset('equity', 'rahul', { taxClass: 'equity', value: 24 * L, annualReturn: 0.11 }),
        asset('debt', 'rahul', { taxClass: 'slab', value: 12 * L, annualReturn: 0.07 }),
        asset('gold', 'rahul', { taxClass: 'other_lt', value: 4 * L, annualReturn: 0.09 }),
      ],
      asOf: ASOF, years: 5,
    };
    const r = solvePlacement(p);
    expect(r.baselineTax).toBe(3_11_210_00);
    expect(r.planTax).toBe(0);
    expect(r.placements.some((x) => x.toId === 'priya')).toBe(false);
    expect(r.placements.filter((x) => x.assetId === 'debt').reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9);
    expect(r.placements.filter((x) => x.assetId === 'gold').reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9);
    for (const x of r.placements) expect(x.fromId).toBe('rahul');
  });

  it('finishes a 4-member, 38-asset family under 500 ms', () => {
    const p = bigFamily();
    expect(p.assets).toHaveLength(38);
    solvePlacement(p); // warm-up so the JIT is not timed
    const t0 = performance.now();
    const r = solvePlacement(p);
    const ms = performance.now() - t0;
    expect(r.planTax).toBeLessThanOrEqual(r.baselineTax);
    expect(ms).toBeLessThan(500);
  });
});

// ---------- helpers: made-up families only ----------

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(xs: T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length)]!;
function shuffle<T>(xs: T[], rnd: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [xs[i], xs[j]] = [xs[j]!, xs[i]!]; }
  return xs;
}

const INCOMES = [0, 2 * L, 3 * L, 5 * L, 8 * L, 10 * L, 11 * L, 15 * L, 20 * L, 30 * L, 45 * L];

function randomFamily(rnd: () => number): PlacementProblem {
  const n = 2 + Math.floor(rnd() * 2);
  const members: Member[] = [member('m0', { age: 45 })];
  const starts: Record<string, ProjectionStart | null> = { m0: start(pick([15 * L, 20 * L, 30 * L, 45 * L], rnd)) };
  for (let i = 1; i < n; i++) {
    const relation = pick(['parent', 'parent', 'sibling', 'child_adult', 'spouse'] as const, rnd);
    const id = `m${i}`;
    members.push(member(id, { relation, age: relation === 'parent' ? 70 : relation === 'child_adult' ? 22 : 40 }));
    starts[id] = rnd() < 0.1 ? null : start(pick(INCOMES, rnd));
  }
  const k = 2 + Math.floor(rnd() * 2);
  const assets: PlaceAsset[] = [];
  for (let i = 0; i < k; i++) {
    const owner = rnd() < 0.65 ? 'm0' : pick(members, rnd).id;
    const taxClass = pick(['equity', 'equity', 'slab', 'other_lt'] as const, rnd);
    const sip = rnd() < 0.25;
    const value = sip ? 0 : Math.round((2 + rnd() * 28) * L / 1_000_00) * 1_000_00;
    assets.push({
      id: `a${i}`, ownerId: owner, kind: sip ? 'sip' : 'holding', movable: rnd() < 0.9, taxClass,
      annualReturn: pick([0.06, 0.07, 0.09, 0.11, 0.12], rnd), value,
      gain: sip ? 0 : Math.round(value * rnd() * 0.5 / 1_000_00) * 1_000_00,
      yearlyAdd: sip ? pick([60_000_00, 1_20_000_00, 3_00_000_00, 6_00_000_00], rnd) : 0,
    });
  }
  return { members, starts, assets, asOf: ASOF };
}

/** Who may hold each asset: the owner, plus allowed receivers when it can move. */
function holdersOf(p: PlacementProblem, a: PlaceAsset): string[] {
  const owner = p.members.find((m) => m.id === a.ownerId)!;
  const base = a.kind === 'sip' ? a.yearlyAdd : a.value;
  if (!a.movable || owner.type === 'huf' || p.starts[owner.id] == null || base <= 0) return [owner.id];
  return [owner.id, ...p.members.filter((m) => m.id !== owner.id && p.starts[m.id] != null && canGift(owner, m, p.members, p.asOf)).map((m) => m.id)];
}

function sliceOf(a: PlaceAsset, share: number): Slice {
  return { assetId: a.id, taxClass: a.taxClass, annualReturn: a.annualReturn, value: Math.round(a.value * share), gain: Math.round(a.gain * share), yearlyAdd: Math.round(a.yearlyAdd * share) };
}

/** Every split in quarters per asset among its allowed holders, keeping the role lock; the lowest family tax. */
function bruteForce(p: PlacementProblem, rawOracle = false): { best: Paise; choice: Choice } {
  const options = p.assets.map((a) => {
    const hs = holdersOf(p, a);
    const out: Array<Record<string, number>> = [];
    const rec = (i: number, left: number, cur: Record<string, number>) => {
      if (i === hs.length - 1) { out.push({ ...cur, [hs[i]!]: left }); return; }
      for (let q = 0; q <= left; q++) rec(i + 1, left - q, { ...cur, [hs[i]!]: q });
    };
    rec(0, 4, {});
    return out;
  });
  const cache = new Map<string, Paise>();
  const taxOf = (m: Member, parts: Array<[PlaceAsset, number]>) => {
    const key = `${m.id}|${parts.map(([a, q]) => `${a.id}:${q}`).join(',')}`;
    let t = cache.get(key);
    if (t === undefined) { t = tenYearTax(m, p.starts[m.id]!, parts.map(([a, q]) => sliceOf(a, q / 4)), p.asOf); cache.set(key, t); }
    return t;
  };
  const familyTax = (ch: Array<Record<string, number>>) => {
    let total = 0;
    for (const m of p.members) {
      if (p.starts[m.id] == null) continue;
      const parts: Array<[PlaceAsset, number]> = [];
      p.assets.forEach((a, j) => { const q = ch[j]![m.id] ?? 0; if (q > 0) parts.push([a, q]); });
      total += taxOf(m, parts);
    }
    return total;
  };
  let best = Infinity, bestChoice: Choice = [];
  const choice: Choice = [];
  const walk = (i: number) => {
    if (i === p.assets.length) {
      const gave = new Set<string>(), got = new Set<string>();
      p.assets.forEach((a, j) => { for (const [h, q] of Object.entries(choice[j]!)) if (q > 0 && h !== a.ownerId) { gave.add(a.ownerId); got.add(h); } });
      for (const g of gave) if (got.has(g)) return;
      const total = familyTax(choice);
      // The plan drops any placement saving under MIN_SAVING_PER_YEAR on its own, so the oracle keeps the same rule.
      if (!rawOracle) {
        for (let j = 0; j < p.assets.length; j++) for (const [h, q] of Object.entries(choice[j]!)) {
          const owner = p.assets[j]!.ownerId;
          if (h === owner || q === 0) continue;
          const undone = choice.map((o, k) => (k === j ? { ...o, [h]: 0, [owner]: (o[owner] ?? 0) + q } : o));
          if (Math.round((familyTax(undone) - total) / 10 / 100) * 100 < MIN_SAVING_PER_YEAR) return;
        }
      }
      if (total < best) { best = total; bestChoice = choice.map((o) => ({ ...o })); }
      return;
    }
    for (const o of options[i]!) { choice[i] = o; walk(i + 1); }
  };
  walk(0);
  return { best, choice: bestChoice };
}

type Choice = Array<Record<string, number>>;

/**
 * Issue #49 (https://github.com/Devansh217/family-tax-harvesting/issues/49): does some member, in the final year of this plan, get marginal relief while holding special-rate gains?
 * That is the band where taxForYear's relief cuts capital-gains tax.
 */
function inReliefBand(p: PlacementProblem, choice: Choice): boolean {
  return p.members.some((m) => {
    const s = p.starts[m.id];
    if (s == null) return false;
    const slices = p.assets.flatMap((a, j) => { const q = choice[j]?.[m.id] ?? 0; return q > 0 ? [sliceOf(a, q / 4)] : []; });
    if (slices.length === 0) return false;
    const { buckets: b, date } = finalYearBuckets(m, s, slices, p.asOf, p.years);
    return b.equitySt + b.equityLt + b.otherLt > 0 && taxForYear(m, s.normal, b, rulesFor(date), date).marginalRelief > 0;
  });
}

function checkInvariants(p: PlacementProblem, r: PlacementResult) {
  const from = new Set(r.placements.map((x) => x.fromId)), to = new Set(r.placements.map((x) => x.toId));
  for (const id of from) expect(to.has(id)).toBe(false);
  for (const x of r.placements) {
    const a = p.assets.find((y) => y.id === x.assetId)!;
    expect(a.movable).toBe(true);
    expect(x.fromId).toBe(a.ownerId);
    expect(holdersOf(p, a)).toContain(x.toId);
    expect(x.share).toBeGreaterThan(0);
    expect(x.share).toBeLessThanOrEqual(1);
    expect(x.savingPerYear).toBeGreaterThanOrEqual(1_000_00);
  }
  const keys = r.placements.map((x) => `${x.assetId}|${x.toId}`);
  expect(new Set(keys).size).toBe(keys.length);
}

/** Made-up family shaped like a real import: an earner with most of 38 funds and shares, a spouse and two parents. */
function bigFamily(): PlacementProblem {
  const rnd = prng(38);
  const members = [
    member('earner', { age: 45 }), member('spouse', { relation: 'spouse', spouseId: 'earner' }),
    member('dad', { relation: 'parent', age: 72 }), member('mum', { relation: 'parent', age: 68 }),
  ];
  const starts = { earner: start(35 * L), spouse: start(9 * L), dad: start(3 * L), mum: start(0) };
  const owners = [...Array(26).fill('earner'), ...Array(6).fill('spouse'), ...Array(4).fill('dad'), ...Array(2).fill('mum')] as string[];
  const assets: PlaceAsset[] = owners.map((ownerId, i) => {
    const sip = i < 5;
    const taxClass = i % 7 === 3 ? 'slab' : i % 11 === 5 ? 'other_lt' : 'equity';
    const value = sip ? 0 : Math.round((0.5 + rnd() * 12) * L / 1_000_00) * 1_000_00;
    return {
      id: `f${String(i).padStart(2, '0')}`, ownerId, kind: sip ? 'sip' : 'holding', movable: rnd() < 0.85, taxClass,
      annualReturn: taxClass === 'equity' ? 0.12 : taxClass === 'slab' ? 0.07 : 0.09, value,
      gain: Math.round(value * rnd() * 0.4 / 1_000_00) * 1_000_00, yearlyAdd: sip ? pick([1_20_000_00, 2_40_000_00, 6_00_000_00], rnd) : 0,
    };
  });
  return { members, starts, assets, asOf: ASOF };
}
