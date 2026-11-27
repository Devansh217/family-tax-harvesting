import { describe, expect, it } from 'vitest';
import { computeFamily, isMarked, type FamilyState, type Move } from './family';
import { computePlacement, placementProblem } from './placementMoves';
import { autoLink } from './links';
import { sampleState } from '../sample';
import { FY_2026_27 as R } from './rules';
import { freeEquityLtRoom } from './tax';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';

// Made-up family: an earner (e), a parent (p), a spouse (s) and the earner's HUF (h). No real names or amounts.
const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
const ASOF = '2026-11-24';
let seq = 0;
const buy = (memberId: string, isin: string, date: string, units: number, priceRs: number, over: Partial<Txn> = {}): Txn => ({
  id: `b${++seq}`, memberId, isin, date, side: 'buy', qty: q(units), amount: rs(units * priceRs), source: 'test', ...over,
});
const person = (id: string, relation: Member['relation'], incomeRs: number | null, over: Partial<Member> = {}): Member => ({
  id, name: id.toUpperCase(), relation, age: relation === 'parent' ? 64 : 40, regime: 'new',
  ...(incomeRs == null ? {} : { income: [{ kind: 'other' as const, amount: rs(incomeRs), from: 'manual' as const }] }), ...over,
});
const earner = () => person('e', 'self', 30_00_000);
const parent = (incomeRs: number | null = 3_00_000) => person('p', 'parent', incomeRs);
const shareX: Security = { isin: 'INE000TEST01', name: 'Test Shares Ltd', taxType: 'equity', listed: true, price: rs(1_100) };
const hybrid: Security = {
  isin: 'INF000TEST01', name: 'Test Conservative Hybrid Fund - Direct - Growth', taxType: 'slab', listed: false,
  category: 'Hybrid Scheme - Conservative Hybrid Fund', price: rs(120),
};
const run = (state: FamilyState) => {
  const fam = computeFamily(state, ASOF, R);
  return { fam, view: computePlacement(state, fam), problem: placementProblem(state, fam) };
};
const sipConfirmed = (memberId = 'e', monthlyRs = 20_000) => ({ memberId, isin: hybrid.isin, monthly: rs(monthlyRs), confirmedAt: ASOF });

describe('placement starts', () => {
  it('year 1 starts after this season\'s moves', () => {
    // Earner (₹30 L) holds 10,000 shares bought at ₹1,000, now ₹1,100: ₹100 long-term gain a share. They harvest their
    // own ₹1,25,000 (1,250 shares), then gift to the parent. The parent's normal income is ₹1 L on the new regime, so
    // their room is the ₹1,25,000 exemption plus ₹3,00,000 of unused basic exemption (₹4 L − ₹1 L) = ₹4,25,000:
    // the gift is 4,250 shares, ₹4,25,000 of gain, and fills it exactly.
    const state: FamilyState = {
      members: [earner(), parent(1_00_000)], securities: [shareX],
      txns: [buy('e', shareX.isin, '2023-01-01', 10_000, 1_000)],
    };
    const { fam, problem } = run(state);
    const gift = fam.moves.find((m) => m.kind === 'gift' && m.toId === 'p')!;
    expect(gift).toMatchObject({ qty: q(4_250), gain: rs(4_25_000) });
    const start = problem.starts.p!;
    expect(start.year1.equityLt).toBe(rs(4_25_000));
    // So no placement can use this year's room in the parent's name.
    // ₹3 is what tax rounding lets through (₹3 × 12.5% × 1.04 = ₹0.39, rounded to ₹0), not room.
    expect(freeEquityLtRoom(problem.members.find((m) => m.id === 'p')!, start.normal, start.year1, R, ASOF)).toBe(rs(3));
  });

  it('assets are what each member holds after this season\'s moves', () => {
    // Same family as above: the earner harvests 1,250 shares and gifts 4,250 to the parent. Of the 10,000 shares the
    // earner keeps 5,750 (₹63,25,000 at ₹1,100): the 1,250 sold and bought back have no gain left, the other 4,500 keep
    // ₹100 each (₹4,50,000). The parent holds the 4,250 gifted shares (₹46,75,000), their gain gone with the parent's
    // own sale and buyback, and cannot place them again.
    const state: FamilyState = {
      members: [earner(), parent(1_00_000)], securities: [shareX],
      txns: [buy('e', shareX.isin, '2023-01-01', 10_000, 1_000)],
    };
    const { fam, problem } = run(state);
    expect(fam.moves.filter((m) => !m.noRoom).map((m) => [m.kind, m.qty])).toEqual([['harvest_gain', q(1_250)], ['gift', q(4_250)]]);
    const mine = problem.assets.filter((a) => a.ownerId === 'e');
    expect(mine).toEqual([expect.objectContaining({ movable: true, value: rs(63_25_000), gain: rs(4_50_000) })]);
    const theirs = problem.assets.filter((a) => a.ownerId === 'p');
    expect(theirs).toEqual([expect.objectContaining({ movable: false, taxClass: 'equity', value: rs(46_75_000), gain: 0 })]);
  });

  it('planned sales leave the giver\'s assets', () => {
    // A planned sale of 3,000 of the earner's 10,000 shares: those units are gone before any move or placement.
    const state: FamilyState = {
      members: [earner(), parent(5_00_000)], securities: [shareX],
      txns: [buy('e', shareX.isin, '2023-01-01', 10_000, 1_000)], plannedSales: [{ id: 'ps1', memberId: 'e', isin: shareX.isin, qty: q(3_000) }],
    };
    const { fam, problem } = run(state);
    const sold = fam.moves.filter((m) => !m.noRoom).reduce((a, m) => a + (m.kind === 'gift' ? m.qty : 0), 0);
    const held = problem.assets.filter((a) => a.ownerId === 'e').reduce((a, x) => a + x.value, 0);
    expect(held).toBe(Math.round((shareX.price! * (q(7_000) - sold)) / QTY_SCALE));
  });

  it('year 1 counts the cushion of an approx season gift', () => {
    // Earner holds 2,272 shares from a holdings file (approx lot) at ₹100 average cost, now ₹200: ₹100 a share. Each
    // ₹100 of gain uses ₹110 of room. Own harvest: ⌊1,25,000 / 110⌋ = 1,136 shares. Gift to the parent (₹5 L on
    // the new regime, so no basic-exemption room): another 1,136 shares, gain 1,136 × 100 = ₹1,13,600, using
    // 1,13,600 × 1.1 = ₹1,24,960 of room. Year 1 then leaves ₹1,25,000 − ₹1,24,960 = ₹40; counting the uncushioned
    // gain would leave ₹11,400. `freeEquityLtRoom` adds the ₹3 that tax rounding lets through (₹3 × 12.5% × 1.04 =
    // ₹0.39, rounded to ₹0): ₹43.
    const shareY: Security = { ...shareX, isin: 'INE000TEST02', price: rs(200) };
    const state: FamilyState = {
      members: [earner(), parent(5_00_000)], securities: [shareY],
      txns: [buy('e', shareY.isin, '2023-01-01', 2_272, 100, { approx: true })],
    };
    const { fam, problem } = run(state);
    const gift = fam.moves.find((m) => m.kind === 'gift' && m.toId === 'p')!;
    expect(gift).toMatchObject({ qty: q(1_136), gain: rs(1_13_600), approx: true });
    const start = problem.starts.p!;
    expect(start.year1.equityLt).toBe(rs(1_24_960));
    const left = freeEquityLtRoom(problem.members.find((m) => m.id === 'p')!, start.normal, start.year1, R, ASOF);
    expect(left).toBe(rs(43));
    expect(left).toBeLessThan(rs(11_400));
  });
  it('units switched to the direct plan now are counted but not placed', () => {
    // The earner (₹30 L) holds 10,000 units of a regular-plan equity fund bought at ₹100, now ₹110: ₹1,00,000 of gain,
    // inside their ₹1,25,000 room, so all of it switches to the direct plan now. Those units leave the regular plan this
    // season, so none can be gifted under the regular plan's ISIN; they still count in the earner's tax.
    const regular: Security = {
      isin: 'INF000TESTR1', name: 'Test Large Cap Fund - Regular Plan - Growth', taxType: 'equity', listed: false,
      category: 'Equity Scheme - Large Cap Fund', plan: 'regular', option: 'growth', price: rs(110),
    };
    const state: FamilyState = {
      members: [earner(), parent()], securities: [regular],
      txns: [buy('e', regular.isin, '2023-01-01', 10_000, 100)],
    };
    const { fam, view, problem } = run(state);
    expect(fam.moves.filter((m) => !m.noRoom).map((m) => [m.kind, m.kind === 'switch_direct' ? m.when : '', m.qty])).toEqual([['switch_direct', 'now', q(10_000)]]);
    expect(problem.assets.filter((a) => a.ownerId === 'e')).toEqual([expect.objectContaining({ id: `fixed|e|${regular.isin}|`, movable: false, value: rs(11_00_000), gain: 0 })]);
    expect(view.moves.some((m) => m.isin === regular.isin)).toBe(false);
  });
});

describe('placement moves', () => {
  it('placement moves carry the old-data mark', () => {
    // Earner holds 2,000 units of a slab-taxed fund from a fund statement whose newest trade is 31 Mar 2026, 238 days
    // before 24 Nov 2026: old. Bought at ₹100, now ₹120 (₹2,40,000, ₹40,000 gain). In the parent's name (₹3 L) the
    // gain stays under the ₹12 L line; in the earner's it is taxed at 30% plus cess, so some of it is placed.
    const OLD = '2026-03-31';
    const cas = { source: 'Mutual fund CAS (CAMS / KFintech)', account: 'Folio 1' };
    const state: FamilyState = {
      members: [earner(), parent()], securities: [hybrid],
      txns: [buy('e', hybrid.isin, '2023-01-01', 1_000, 100, cas), buy('e', hybrid.isin, OLD, 1_000, 100, cas)],
    };
    const { view } = run(state);
    const m = view.moves.find((x) => x.kind === 'place_holding')!;
    expect(m).toMatchObject({ fromId: 'e', toId: 'p', isin: hybrid.isin, account: 'Folio 1', oldData: OLD });
    expect(m.roomMayBeSmaller).toBeUndefined(); // the parent has no account
    expect(isMarked(m)).toBe(true);
    expect(m.qty).toBeGreaterThan(0);
    expect(m.qty % (QTY_SCALE / 1000)).toBe(0); // whole fund-unit steps (0.001)
    expect(m.value).toBe(Math.round((hybrid.price! * m.qty) / QTY_SCALE));
    expect(m.reasons.join(' ')).toMatch(/gift letter/);
    expect(m.reasons.join(' ')).toMatch(/check with your CA/);
  });

  it('no placement runs against this season\'s gifts', () => {
    // The earner (₹3 L) holds 10,000 shares bought at ₹1,000, now ₹1,100. They harvest their own room (2,250 shares:
    // ₹1,25,000 plus ₹1,00,000 of unused basic exemption) and gift 1,250 shares into the parent's ₹1,25,000 room.
    // The parent (₹30 L) holds 10,000 units of a conservative hybrid fund, ₹12 L at ₹120. In the earner's name that fund
    // would save about ₹29,317 a year, but the parent receives this season, so they can't also give (D11): no move.
    const state: FamilyState = {
      members: [person('e', 'self', 3_00_000), person('p', 'parent', 30_00_000)], securities: [shareX, hybrid],
      txns: [buy('e', shareX.isin, '2023-01-01', 10_000, 1_000), buy('p', hybrid.isin, '2023-01-01', 10_000, 100)],
    };
    const { fam, view, problem } = run(state);
    expect(fam.moves.filter((m) => !m.noRoom).map((m) => [m.kind, m.qty])).toEqual([['harvest_gain', q(2_250)], ['gift', q(1_250)]]);
    expect(problem).toMatchObject({ fixedGivers: ['e'], fixedReceivers: ['p'] });
    expect(view.moves.filter((m) => m.kind === 'place_sip' || m.kind === 'place_holding').map((m) => m.id)).toEqual([]);
  });

  it('SIP placement', () => {
    // ₹10,000 a month into a conservative hybrid (slab-taxed, 7.80% a year assumed): ₹1,20,000 a year, the spec's D2
    // example. Earner ₹30 L pays 30% plus cess on its gain at year 10. The parent at ₹3 L ends year 10 under the ₹12 L
    // line (₹3 L plus 10/12 of the ₹7,65,877 gain a ₹12,000 SIP makes: about ₹9.4 L), so all of it could go to them.
    // The brief's ₹20,000 SIP can't all go: see the next test.
    const state: FamilyState = {
      members: [earner(), parent()], securities: [hybrid], txns: [], confirmedSips: [sipConfirmed('e', 10_000)],
    };
    const { view } = run(state);
    const m = view.moves.find((x) => x.kind === 'place_sip')!;
    expect(m).toMatchObject({ fromId: 'e', toId: 'p', isin: hybrid.isin, monthly: rs(10_000), yearlyGift: rs(1_20_000), qty: 0, value: rs(1_20_000), costs: 0 });
    if (m.kind !== 'place_sip') throw new Error('kind');
    expect(m.savingPerYear).toBeGreaterThan(rs(1_000));
    expect(m.taxAvoided).toBe(m.savingPerYear);
    expect(m.saving).toBe(m.savingPerYear);
    expect(m.saving10y).toBeGreaterThan(m.savingPerYear);
    const why = m.reasons.join(' ');
    expect(why).toMatch(/could save/i);
    expect(why).toMatch(/for good/);
    expect(why).toMatch(/will or nominee/);
    expect(why).toMatch(/bank transfer/);
    expect(why).not.toMatch(/recommend|you should/i);
    expect(view.unconfirmed).toBe(false);
  });

  it('SIP placement stops at the receiver\'s ₹12 L line', () => {
    // The parent at ₹3 L: all ₹20,000 a month would take their year-10 income to ₹15,76,461 (₹1,21,128 of tax).
    // ₹14,000 a month takes it to ₹11,93,523, under the line and tax-free; ₹14,500 to ₹12,25,434 (₹26,452 of tax).
    // So ₹14,000 a month (₹1,68,000 a year) goes to the parent and ₹6,000 stays with the earner.
    const state: FamilyState = {
      members: [earner(), parent()], securities: [hybrid], txns: [], confirmedSips: [sipConfirmed()],
    };
    const m = run(state).view.moves.find((x) => x.kind === 'place_sip')!;
    expect(m).toMatchObject({ fromId: 'e', toId: 'p', monthly: rs(14_000), yearlyGift: rs(1_68_000), value: rs(1_68_000) });
  });

  it('unconfirmed SIP guesses are not placed', () => {
    const sipBuys = ['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map((d) => buy('e', hybrid.isin, d, 200, 100));
    const state: FamilyState = { members: [earner(), parent()], securities: [hybrid], txns: sipBuys };
    const { view } = run(state);
    expect(view.sipGuesses).toHaveLength(1);
    expect(view.unconfirmed).toBe(true);
    expect(view.moves.some((m) => m.kind === 'place_sip')).toBe(false);
  });

  it('clubbed members are listed, not placed', () => {
    const state: FamilyState = {
      members: [
        earner(), person('s', 'spouse', 0), parent(),
        { id: 'h', name: 'E HUF', type: 'huf', relation: 'other', age: 10, regime: 'new', hufMemberIds: ['e'], income: [] },
      ],
      securities: [hybrid], txns: [], confirmedSips: [sipConfirmed()],
    };
    const { view } = run(state);
    expect(view.clubbedLeftOut).toEqual(['h', 's']);
    const to = (m: Move) => (m.kind === 'place_sip' || m.kind === 'place_holding' ? m.toId : '');
    expect(view.moves.some((m) => to(m) === 's' || to(m) === 'h')).toBe(false);
    expect(view.moves.some((m) => to(m) === 'p')).toBe(true);
  });

  it('a member is listed as clubbed only when no giver can give to them unclubbed', () => {
    // Sample family: Arjun and Meera can both receive from Ramesh or Sunita (gifts to a grown child are not clubbed);
    // Ramesh and Sunita can receive from Arjun; Meera's only relatives (husband, parents-in-law) are all clubbed.
    const s = sampleState();
    const state = { ...s, members: autoLink(s.members) };
    const view = computePlacement(state, computeFamily(state, '2026-11-28', R));
    expect(view.clubbedLeftOut).toEqual(['m']);
  });

  it('member without income is never a receiver', () => {
    const state: FamilyState = {
      members: [earner(), parent(null)], securities: [hybrid], txns: [], confirmedSips: [sipConfirmed()],
    };
    const { view } = run(state);
    expect(view.missingIncome).toEqual(['p']);
    expect(view.moves).toEqual([]);
  });

  it('moveId is stable across computes', () => {
    const state: FamilyState = {
      members: [earner(), parent()], securities: [hybrid], txns: [], confirmedSips: [sipConfirmed()],
    };
    const a = run(state).view.moves.map((m) => m.id);
    const b = run({ ...state, members: [...state.members].reverse() }).view.moves.map((m) => m.id);
    expect(a).toEqual([`${R.label}|place_sip|e>p|${hybrid.isin}|`]);
    expect(b).toEqual(a);
  });

  it('a SIP move keeps its id whether or not the files still show the SIP', () => {
    // The same confirmed SIP, once with four monthly buys in 'Folio 1' that make a guess, once with none.
    const sipBuys = ['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map((d) => buy('e', hybrid.isin, d, 100, 100, { account: 'Folio 1' }));
    const state: FamilyState = {
      members: [earner(), parent()], securities: [hybrid], txns: sipBuys, confirmedSips: [sipConfirmed('e', 10_000)],
    };
    const withGuess = run(state).view;
    expect(withGuess.sipGuesses.map((g) => g.account)).toEqual(['Folio 1']);
    const sipIds = (v: typeof withGuess) => v.moves.filter((m) => m.kind === 'place_sip').map((m) => m.id);
    expect(sipIds(withGuess)).toEqual([`${R.label}|place_sip|e>p|${hybrid.isin}|`]);
    expect(sipIds(run({ ...state, txns: [] }).view)).toEqual(sipIds(withGuess));
  });
});
