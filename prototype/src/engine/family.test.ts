import { describe, expect, it } from 'vitest';
import { computeFamily, simulateSale } from './family';
import { NSE_HOLIDAYS_2027, buybackDate } from './season';
import { FY_2026_27 as R } from './rules';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
let seq = 0;
const buy = (memberId: string, isin: string, date: string, units: number, priceRs: number): Txn => ({
  id: `b${++seq}`, memberId, isin, date, side: 'buy', qty: q(units), amount: rs(units * priceRs), source: 'test',
});
const person = (id: string, relation: Member['relation'], over: Partial<Member> = {}): Member => ({
  id, name: id, relation, age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: rs(20_00_000), from: 'manual' as const }], ...over,
});
const ASOF = '2026-11-14';

describe('harvest gain moves', () => {
  it('fills the room with whole shares from long-term lots and states the saving', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X Ltd', taxType: 'equity' as const, listed: true, price: rs(2000) }],
      txns: [buy('a', 'X', '2023-01-01', 500, 1000)], // ₹1,000 gain per share
    }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m).toMatchObject({ memberId: 'a', isin: 'X', qty: q(125), gain: rs(1_25_000) });
    expect(m.taxAvoided).toBe(rs(16_250));
    expect(m.costs).toBeGreaterThan(rs(500)); // ~0.23% of ₹2.5 L plus a depository charge
    expect(m.costs).toBeLessThan(rs(700));
    expect(m.saving).toBe(m.taxAvoided - m.costs);
  });

  it('skips moves too small to beat their trading costs', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(1400) }],
      txns: [buy('a', 'X', '2023-01-01', 10, 1000)], // ₹4,000 gain → ₹520 avoided, less ~₹45 costs
    }, ASOF, R);
    expect(fam.moves.filter((x) => x.kind === 'harvest_gain')).toHaveLength(0);
  });

  it('never suggests moves on lots with guessed dates or a missing 31 Jan 2018 value', () => {
    const base = { members: [person('a', 'self')], securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }] };
    const estimated = computeFamily({ ...base, txns: [{ ...buy('a', 'X', '2023-01-01', 100, 1000), estimated: true }] }, ASOF, R);
    expect(estimated.moves).toHaveLength(0);
    expect(estimated.totals.uncertainLots).toBe(1);

    const old = computeFamily({ ...base, txns: [buy('a', 'X', '2015-01-01', 100, 1000)] }, ASOF, R);
    expect(old.moves).toHaveLength(0);
    const withFmv = computeFamily({ ...base, securities: [{ ...base.securities[0]!, fmv2018: rs(1200) }], txns: [buy('a', 'X', '2015-01-01', 100, 1000)] }, ASOF, R);
    expect(withFmv.moves.find((x) => x.kind === 'harvest_gain')).toMatchObject({ gain: rs(80_000) });
  });

  it('harvests from each demat account separately', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }],
      txns: [{ ...buy('a', 'X', '2023-01-01', 40, 1000), account: 'Zerodha' }, { ...buy('a', 'X', '2023-06-01', 40, 1000), account: 'Angel One' }],
    }, ASOF, R);
    const h = fam.moves.filter((x) => x.kind === 'harvest_gain');
    expect(h.map((x) => [x.account, x.gain])).toEqual([['Zerodha', rs(40_000)], ['Angel One', rs(40_000)]]);
  });

  it('never sells into short-term lots', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }],
      txns: [buy('a', 'X', '2023-01-01', 20, 1000), buy('a', 'X', '2026-08-01', 500, 1000)],
    }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m.qty).toBe(q(20));
    expect(m.gain).toBe(rs(20_000));
  });

  it('allows fractional mutual fund units to three decimals', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'F', name: 'Fund', taxType: 'equity' as const, listed: false, price: rs(300) }],
      txns: [buy('a', 'F', '2023-01-01', 10_000, 100)], // ₹200 gain per unit
    }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m.qty).toBe(q(625));
    expect(m.gain).toBe(rs(1_25_000));
  });
});

describe('planned sales and money needed soon', () => {
  const state = {
    members: [person('a', 'self')],
    securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }, { isin: 'Y', name: 'Y', taxType: 'equity' as const, listed: true as const, price: rs(2000) }],
    txns: [buy('a', 'X', '2022-01-01', 100, 1000), buy('a', 'Y', '2022-01-01', 100, 1000)],
  };

  it('a planned sale uses room and its lots before moves are suggested', () => {
    const fam = computeFamily({ ...state, plannedSales: [{ id: 'p', memberId: 'a', isin: 'X', qty: q(100) }] }, ASOF, R);
    const v = fam.members[0]!;
    expect(v.planned.gain).toBe(rs(1_00_000));
    expect(v.planned.roomUsed).toBe(rs(1_00_000));
    expect(v.plan.room.free).toBe(rs(25_000));
    expect(fam.totals.freeRoom).toBe(rs(25_000));
    const h = fam.moves.filter((m) => m.kind === 'harvest_gain');
    expect(h.map((m) => [m.isin, m.gain])).toEqual([['Y', rs(25_000)]]);
  });

  it('tax on a big planned sale prompts loss moves and shows in the simulator baseline', () => {
    const fam = computeFamily({ ...state, plannedSales: [{ id: 'p', memberId: 'a', isin: 'X', qty: q(100) }, { id: 'p2', memberId: 'a', isin: 'Y', qty: q(100) }] }, ASOF, R);
    expect(fam.members[0]!.planned.tax).toBe(rs(9_750)); // 2,00,000 − 1,25,000 at 13%
    expect(fam.moves.filter((m) => m.kind === 'harvest_gain')).toHaveLength(0);
  });

  it('skips sell-and-buy-back on money needed within 12 months', () => {
    const fam = computeFamily({ ...state, needSoon: { 'a|X': true } }, ASOF, R);
    const h = fam.moves.filter((m) => m.kind === 'harvest_gain');
    expect(h.every((m) => m.isin === 'Y')).toBe(true);
  });
});

describe('gift moves', () => {
  const base = {
    securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }],
    txns: [buy('a', 'X', '2020-01-01', 1000, 1000)], // ₹10 L of LT gain with the owner
  };

  it('gifts to a parent with unused room but never to a spouse or minor', () => {
    const fam = computeFamily({
      ...base,
      members: [person('a', 'self'), person('s', 'spouse'), person('p', 'parent', { age: 64 }), person('k', 'child_minor', { age: 12 })],
    }, ASOF, R);
    const gifts = fam.moves.filter((x) => x.kind === 'gift');
    expect(gifts.map((g) => g.kind === 'gift' && g.toId)).toEqual(['p']);
    expect(gifts[0]).toMatchObject({ fromId: 'a', qty: q(125), gain: rs(1_25_000) });
  });

  it('does not gift mutual fund units', () => {
    const fam = computeFamily({
      members: [person('a', 'self'), person('p', 'parent')],
      securities: [{ isin: 'F', name: 'Fund', taxType: 'equity' as const, listed: false, price: rs(300) }],
      txns: [buy('a', 'F', '2020-01-01', 100_000, 100)],
    }, ASOF, R);
    expect(fam.moves.some((x) => x.kind === 'gift')).toBe(false);
  });
});

describe('wait and loss moves', () => {
  it('suggests waiting when a winner turns long-term within 90 days', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'H', name: 'H', taxType: 'equity' as const, listed: true, price: rs(1500) }],
      txns: [buy('a', 'H', '2025-12-06', 100, 1000)],
    }, ASOF, R);
    const w = fam.moves.find((x) => x.kind === 'wait')!;
    expect(w).toMatchObject({ until: '2026-12-07', days: 23, gain: rs(50_000) });
    expect(w.saving).toBe(rs(3_900)); // 50,000 × (20% − 12.5%) × 1.04
  });

  it('suggests booking losses against taxable gains already booked', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [
        { isin: 'W', name: 'Winner', taxType: 'equity' as const, listed: true, price: rs(100) },
        { isin: 'L', name: 'Loser', taxType: 'equity' as const, listed: true, price: rs(500) },
      ],
      txns: [
        buy('a', 'W', '2026-05-01', 1000, 50),
        { id: 's1', memberId: 'a', isin: 'W', date: '2026-08-01', side: 'sell', qty: q(1000), amount: rs(1_00_000), source: 't' }, // ST +50,000
        buy('a', 'L', '2026-06-01', 100, 1000), // ST −50,000 unrealised
      ],
    }, ASOF, R);
    const l = fam.moves.find((x) => x.kind === 'harvest_loss')!;
    expect(l).toMatchObject({ isin: 'L', loss: rs(50_000), qty: q(100) });
    expect(l.taxAvoided).toBe(rs(10_400));
    expect(l.saving).toBe(l.taxAvoided - l.costs);
  });
});

describe('family totals and simulator', () => {
  const state = {
    members: [person('a', 'self'), person('p', 'parent', { age: 64 })],
    securities: [{ isin: 'N', name: 'Nifty fund', taxType: 'equity' as const, listed: false as const, price: rs(200) }],
    txns: [buy('a', 'N', '2022-01-01', 3000, 100), buy('p', 'N', '2022-01-01', 3000, 150)],
  };

  it('adds up free room across members', () => {
    const fam = computeFamily(state, ASOF, R);
    expect(fam.totals.freeRoom).toBe(rs(2_50_000));
  });

  it('shows tax on a proposed sale for the member who holds it', () => {
    const fam = computeFamily(state, ASOF, R);
    const a = simulateSale(fam, 'a', 'N', q(2000), ASOF, R); // gain 2,00,000 LT; 75,000 over the room
    expect(a.gain).toBe(rs(2_00_000));
    expect(a.extraTax).toBe(rs(9_750));
    const p = simulateSale(fam, 'p', 'N', q(2000), ASOF, R); // gain 1,00,000 within room
    expect(p.extraTax).toBe(0);
    expect(p.roomUsed).toBe(rs(1_00_000));
  });
});

describe('previews of sales from guessed-date lots', () => {
  // A holdings file alone: 10 shares, none long-term, ₹10,000 at the broker's average; the price is ₹2,000 a share.
  // The fill-in lot is guessed (`estimated`), so a sale's term is unknown. Income ₹20 L (new regime, no rebate, no
  // surcharge). As long-term the ₹10,000 gain sits inside the ₹1,25,000 exemption: no tax. As short-term (what the
  // file says): 20% × ₹10,000 = ₹2,000, plus 4% cess = ₹2,080. The preview shows the higher, ₹2,080; room still
  // counts it long-term, ₹10,000 used.
  const held = {
    members: [person('a', 'self')],
    securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }],
    txns: [],
    positions: [{ memberId: 'a', isin: 'X', account: 'Zerodha', qty: q(10), ltQty: 0, cost: rs(10_000), asOf: '2026-11-20', source: 'Zerodha holdings', importId: 'h', canTrim: true }],
  };
  const DAY = '2026-11-23';

  it('Simulate shows the higher of the long-term and short-term tax, and room used as long-term', () => {
    const fam = computeFamily(held, DAY, R);
    const r = simulateSale(fam, 'a', 'X', q(10), DAY, R);
    expect(r.gain).toBe(rs(10_000));
    expect(r.extraTax).toBe(rs(2_080));
    expect(r.roomUsed).toBe(rs(10_000));
    expect(r.unknownTermGain).toBe(rs(10_000));
  });

  it('a planned sale shows the same higher tax and uses the same room', () => {
    const fam = computeFamily({ ...held, plannedSales: [{ id: 'p', memberId: 'a', isin: 'X', qty: q(10) }] }, DAY, R);
    expect(fam.members[0]!.planned).toMatchObject({ gain: rs(10_000), tax: rs(2_080), roomUsed: rs(10_000) });
    expect(fam.members[0]!.plan.room.free).toBe(rs(1_15_000));
  });

  it('a mixed preview is also tried with the gain short-term and the loss long-term', () => {
    // ₹1,25,000 long-term already booked (125 shares of X bought at ₹1,000 in 2023, sold at ₹2,000). Simulate sells 20
    // of Y at ₹1,000 from two guessed lots: 10 at no cost (₹10,000 gain) and 10 at ₹20,000 (₹10,000 loss).
    // As given (gain long, loss short), all long or all short: net long-term stays ₹1,25,000, inside the exemption, ₹0.
    // Gain short and loss long: the loss only offsets long-term (₹1,15,000, exempt), the ₹10,000 short-term gain is
    // taxed at 20% = ₹2,000, plus 4% cess = ₹2,080.
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) }, { isin: 'Y', name: 'Y', taxType: 'equity' as const, listed: true, price: rs(1000) }],
      txns: [
        buy('a', 'X', '2023-01-01', 125, 1000),
        { id: 'sx', memberId: 'a', isin: 'X', date: '2026-06-01', side: 'sell' as const, qty: q(125), amount: rs(2_50_000), source: 'test' },
        { ...buy('a', 'Y', '2026-01-01', 10, 0), estimated: true },
        { ...buy('a', 'Y', '2026-02-01', 10, 2000), estimated: true },
      ],
    }, DAY, R);
    expect(fam.members[0]!.year.ltGains).toBe(rs(1_25_000));
    const r = simulateSale(fam, 'a', 'Y', q(20), DAY, R);
    expect(r.gain).toBe(0);
    expect(r.extraTax).toBe(rs(2_080));
  });

  it('a booked sale from a guessed lot keeps the long-term rule', () => {
    const fam = computeFamily({
      ...held, positions: [],
      txns: [
        { id: 'g', memberId: 'a', isin: 'X', date: '2026-06-01', side: 'buy' as const, qty: q(10), amount: rs(10_000), source: 'test', estimated: true },
        { id: 's', memberId: 'a', isin: 'X', date: '2026-11-01', side: 'sell' as const, qty: q(10), amount: rs(20_000), source: 'test' },
      ],
    }, DAY, R);
    expect(fam.members[0]!.year.tax).toBe(0);
    expect(fam.members[0]!.year.exemptionUsed).toBe(rs(10_000));
  });
});

describe('funds to check', () => {
  it('a fund whose tax type is unknown gets no moves until it is set', () => {
    const st = (taxType: 'check' | 'equity') => ({
      members: [person('a', 'self')],
      securities: [{ isin: 'INFBAF', name: 'Balanced advantage', taxType, listed: false, price: rs(200) }],
      txns: [buy('a', 'INFBAF', '2023-01-01', 1000, 100)],
    });
    expect(computeFamily(st('check'), ASOF, R).moves).toHaveLength(0);
    expect(computeFamily(st('equity'), ASOF, R).moves.some((x) => x.kind === 'harvest_gain')).toBe(true);
  });
});


describe('ELSS lock-in and the move floor', () => {
  const elss = { isin: 'INF1', name: 'Tax Saver', taxType: 'equity' as const, listed: false, price: rs(200), category: 'Equity Scheme - ELSS' };
  const asof = '2027-02-10';

  it('elss partly locked: sells only the lot past its 3 years', () => {
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [elss],
      txns: [buy('a', 'INF1', '2023-06-01', 1000, 160), buy('a', 'INF1', '2025-06-01', 1000, 170)], // gains 40,000 and 30,000
    }, asof, R);
    const moves = fam.moves.filter((x) => x.kind === 'harvest_gain');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ qty: q(1000), gain: rs(40_000) });
  });

  it('elss all locked: no moves and the lot shows when it unlocks', () => {
    const fam = computeFamily({
      members: [person('a', 'self'), person('b', 'spouse')], securities: [{ ...elss, price: rs(100) }],
      txns: [buy('a', 'INF1', '2025-06-01', 1000, 170)], // a loss, would otherwise be harvestable
    }, asof, R);
    expect(fam.moves.filter((x) => 'isin' in x && x.isin === 'INF1')).toHaveLength(0);
    expect(fam.members[0]!.holdings[0]!.lots[0]!.lockedUntil).toBe('2028-06-01');
  });

  it('elss is never gifted, even when listed and a parent has room', () => {
    const fam = computeFamily({
      members: [person('a', 'self', { income: [{ kind: 'other' as const, amount: rs(20_00_000), from: 'manual' as const }] }), person('p', 'parent', { age: 64, income: [] })],
      securities: [{ ...elss, listed: true }],
      txns: [buy('a', 'INF1', '2020-06-01', 10000, 100)],
    }, asof, R);
    expect(fam.moves.filter((x) => x.kind === 'gift')).toHaveLength(0);
  });

  it('floor: a harvest saving ₹800 is not shown', () => {
    // ₹10,000 gain avoids ₹1,250 tax; costs are small, so the saving clears ₹1,000 and the move is shown.
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(1100) }],
      txns: [buy('a', 'X', '2023-01-01', 100, 1000)],
    }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain');
    expect(m).toBeDefined();
    expect(m!.saving).toBeGreaterThanOrEqual(rs(1000));
    const small = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(1080) }],
      txns: [buy('a', 'X', '2023-01-01', 100, 1000)], // ₹8,000 gain: avoids ₹1,000, saves under ₹1,000
    }, ASOF, R);
    expect(small.moves.filter((x) => x.kind === 'harvest_gain')).toHaveLength(0);
  });
});

describe('switch regular plans to direct', () => {
  const fundsOf = (over: Partial<Security>[]): Security[] => over.map((o, i) => ({ isin: `INF${i}`, name: `F${i}`, taxType: 'equity' as const, listed: false, category: 'Equity Scheme - Large Cap Fund', ...o }));

  it('switch takes room first: the regular fund switches inside the room, the direct fund gets the rest', () => {
    const securities = fundsOf([
      { isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', plan: 'regular', option: 'growth', price: rs(180) },
      { isin: 'INFDIR', name: 'Dir Fund - Direct Plan - Growth', plan: 'direct', option: 'growth', price: rs(190) },
    ]);
    const fam = computeFamily({
      members: [person('a', 'self')], securities,
      txns: [buy('a', 'INFREG', '2023-01-01', 1000, 100), buy('a', 'INFDIR', '2023-01-01', 1000, 100)], // ₹80,000 and ₹90,000 gains
    }, ASOF, R);
    const sw = fam.moves.find((x) => x.kind === 'switch_direct')!;
    expect(sw).toMatchObject({ kind: 'switch_direct', memberId: 'a', isin: 'INFREG', when: 'now', gain: rs(80_000), tax: 0 });
    expect(sw.feeSavedPerYear).toBe(Math.round(rs(1000 * 180) * 1.0 / 100));
    const hg = fam.moves.filter((x) => x.kind === 'harvest_gain');
    expect(hg).toHaveLength(1);
    expect(hg[0]).toMatchObject({ isin: 'INFDIR', gain: rs(45_000) });
    expect(fam.moves.some((x) => x.kind === 'harvest_gain' && x.isin === 'INFREG')).toBe(false);
  });

  it('finds the direct twin from the funds file and says so when there is none', () => {
    const securities = fundsOf([{ isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', plan: 'regular', option: 'growth', price: rs(180) }]);
    const state = { members: [person('a', 'self')], securities, txns: [buy('a', 'INFREG', '2023-01-01', 1000, 100)] };
    const without = computeFamily(state, ASOF, R).moves.find((x) => x.kind === 'switch_direct')!;
    expect(without).toMatchObject({ toIsin: undefined });
    expect(without.reasons.join(' ')).toMatch(/Find the direct plan of this fund at the fund house/);
    const withTwin = computeFamily({ ...state, funds: { INFDIRX: { n: 'Reg Fund - Direct Plan - Growth', c: 'Equity Scheme - Large Cap Fund' } } }, ASOF, R)
      .moves.find((x) => x.kind === 'switch_direct')!;
    expect(withTwin.toIsin).toBe('INFDIRX');
    expect(withTwin.reasons.join(' ')).toMatch(/Check the exit load in your fund statement before selling/);
  });

  it('beyond the room: waits for long-term, replacing the generic wait move', () => {
    const securities = fundsOf([{ isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', plan: 'regular', option: 'growth', price: rs(180) }]);
    const fam = computeFamily({ members: [person('a', 'self')], securities, txns: [buy('a', 'INFREG', '2025-12-01', 1000, 100)] }, ASOF, R);
    const sw = fam.moves.filter((x) => x.kind === 'switch_direct');
    expect(sw).toHaveLength(1);
    expect(sw[0]).toMatchObject({ when: 'wait', until: '2026-12-02' });
    expect(fam.moves.some((x) => x.kind === 'wait')).toBe(false);
  });

  it('skips a switch worth less than ₹1,000 a year; never switches ELSS', () => {
    const small = fundsOf([{ isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', plan: 'regular', price: rs(150) }]);
    expect(computeFamily({ members: [person('a', 'self')], securities: small, txns: [buy('a', 'INFREG', '2023-01-01', 10, 100)] }, ASOF, R)
      .moves.some((x) => x.kind === 'switch_direct')).toBe(false);
    const elss = fundsOf([{ isin: 'INFREG', name: 'E - Regular Plan - Growth', plan: 'regular', category: 'Equity Scheme - ELSS', price: rs(180) }]);
    expect(computeFamily({ members: [person('a', 'self')], securities: elss, txns: [buy('a', 'INFREG', '2023-01-01', 1000, 100)] }, ASOF, R)
      .moves.some((x) => x.kind === 'switch_direct')).toBe(false);
  });

  it('move id is stable across recomputes', () => {
    const securities = fundsOf([{ isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', plan: 'regular', price: rs(180) }]);
    const state = { members: [person('a', 'self')], securities, txns: [buy('a', 'INFREG', '2023-01-01', 1000, 100)] };
    const a = computeFamily(state, ASOF, R).moves.find((x) => x.kind === 'switch_direct')!;
    const b = computeFamily({ ...state, securities: securities.map((s) => ({ ...s, price: rs(185) })) }, ASOF, R).moves.find((x) => x.kind === 'switch_direct')!;
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/\|switch_direct\|a\|INFREG\|/);
  });
});

describe('switch fix round 1', () => {
  const reg = (over: Partial<Security> = {}): Security => ({ isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', taxType: 'equity', listed: false, category: 'Equity Scheme - Large Cap Fund', plan: 'regular', price: rs(180), ...over });

  it('SIP holding with no room: switches only the long-term units, not a rolling wait', () => {
    const txns: Txn[] = [];
    for (let i = 0; i < 36; i++) txns.push(buy('a', 'INFREG', `${2023 + Math.floor((i + 1) / 12)}-${String(((i + 1) % 12) + 1).padStart(2, '0')}-05`, 100, 100));
    const member = person('a', 'self', { income: [{ kind: 'other', amount: rs(60_00_000), from: 'manual' }] });
    const used = { members: [member], securities: [reg()], txns: [...txns, buy('a', 'INFREG', '2020-01-01', 1, 100)] };
    // another member's-style room use: a big realised gain this year leaves no room
    const fam = computeFamily({ ...used, txns: [...used.txns, buy('a', 'FILL', '2020-01-01', 100, 100), { id: 'sFILL', memberId: 'a', isin: 'FILL', date: '2026-05-01', side: 'sell', qty: q(100), amount: rs(100 * 5000), source: 'test' }], securities: [reg(), { isin: 'FILL', name: 'Fill', taxType: 'equity', listed: false }] }, ASOF, R);
    const sw = fam.moves.find((x) => x.kind === 'switch_direct')!;
    expect(sw).toBeDefined();
    expect(sw.when).not.toBe('wait');
    const ltUnits = txns.filter((t) => t.date <= '2025-11-14').reduce((a, t) => a + t.qty, 0) + q(1);
    expect(sw.qty).toBe(ltUnits);
  });

  it('slab fund for a nil-tax member says no tax now, not tax-free room', () => {
    const fund = reg({ taxType: 'slab', category: 'Debt Scheme - Gilt Fund', price: rs(200) });
    const member = person('a', 'self', { income: [] });
    // ₹3 L gain fits the ₹4 L nil band. (₹5 L here was past it: ₹1 L taxed, which the exact tax now shows.)
    const fam = computeFamily({ members: [member], securities: [fund], txns: [buy('a', 'INFREG', '2023-01-01', 3000, 100)] }, ASOF, R);
    const sw = fam.moves.find((x) => x.kind === 'switch_direct')!;
    expect(sw.when).toBe('now');
    expect(sw.reasons.join(' ')).toMatch(/No tax now: a's income is below the taxable limit/);
    expect(sw.reasons.join(' ')).not.toMatch(/tax-free room/);
  });

  it('wait date is plain English', () => {
    const fam = computeFamily({ members: [person('a', 'self')], securities: [reg()], txns: [buy('a', 'INFREG', '2025-12-01', 1000, 100)] }, ASOF, R);
    expect(fam.moves.find((x) => x.kind === 'switch_direct')!.reasons.join(' ')).toMatch(/Waiting until 2 Dec 2026/);
  });
});

describe('dated moves hold their room', () => {
  const idOf = (kind: string, who: string, isin: string) => `${R.label}|${kind}|${who}|${isin}|`;
  const two = [
    { isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) },
    { isin: 'Y', name: 'Y', taxType: 'equity' as const, listed: true, price: rs(1300) },
  ];
  const holds = [buy('a', 'X', '2023-01-01', 200, 1000), buy('a', 'Y', '2023-01-01', 200, 1000)]; // X ₹2 L gain, Y ₹60,000 gain

  it('a dated harvest gets its full gain before a bigger undated one', () => {
    const plain = computeFamily({ members: [person('a', 'self')], securities: two, txns: holds }, ASOF, R);
    expect(plain.moves.filter((m) => m.kind === 'harvest_gain').map((m) => m.isin)).toEqual(['X']);
    const dated = computeFamily({ members: [person('a', 'self')], securities: two, txns: holds, datedMoves: [{ moveId: idOf('harvest_gain', 'a', 'Y'), date: '2026-12-04' }] }, ASOF, R);
    const y = dated.moves.find((m) => m.isin === 'Y')!, x = dated.moves.find((m) => m.isin === 'X')!;
    expect(y).toMatchObject({ gain: rs(60_000), date: '2026-12-04' });
    expect(x.kind === 'harvest_gain' && x.gain).toBe(rs(65_000));
  });

  it('a dated gift keeps the receiver room from the receiver\'s own harvests', () => {
    const members = [person('a', 'self'), person('p', 'parent', { age: 64 })];
    const txns = [buy('a', 'X', '2020-01-01', 1000, 1000), { ...buy('p', 'Y', '2023-01-01', 500, 1000), memberId: 'p' }];
    const plain = computeFamily({ members, securities: two, txns }, ASOF, R);
    expect(plain.moves.some((m) => m.kind === 'gift')).toBe(false);
    const dated = computeFamily({ members, securities: two, txns, datedMoves: [{ moveId: `${R.label}|gift|a>p|X|`, date: '2026-12-10' }] }, ASOF, R);
    expect(dated.moves.find((m) => m.kind === 'gift')).toMatchObject({ qty: q(125), gain: rs(1_25_000), date: '2026-12-10' });
    expect(dated.moves.some((m) => m.kind === 'harvest_gain' && m.memberId === 'p')).toBe(false);
  });

  it('re-sizes at today\'s price under the same id, never past the room', () => {
    const mk = (price: number) => computeFamily({
      members: [person('a', 'self')], securities: [{ ...two[0]!, price: rs(price) }], txns: [buy('a', 'X', '2023-01-01', 500, 1000)],
      datedMoves: [{ moveId: idOf('harvest_gain', 'a', 'X'), date: '2026-12-04' }],
    }, ASOF, R).moves.find((m) => m.kind === 'harvest_gain')!;
    const at2000 = mk(2000), at2200 = mk(2200);
    expect(at2200.id).toBe(at2000.id);
    expect(at2200.qty).toBeLessThan(at2000.qty);
    expect(at2200.kind === 'harvest_gain' && at2200.gain).toBeLessThanOrEqual(rs(1_25_000));
  });

  it('keeps a dated move whose room is gone, with no units and no figures', () => {
    const sold: Txn = { id: 's1', memberId: 'a', isin: 'X', date: '2026-06-01', side: 'sell', qty: q(125), amount: rs(125 * 2000), source: 'test' };
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [two[0]!], txns: [buy('a', 'X', '2023-01-01', 500, 1000), sold],
      datedMoves: [{ moveId: idOf('harvest_gain', 'a', 'X'), date: '2026-12-04' }],
    }, ASOF, R);
    const m = fam.moves.find((x) => x.id === idOf('harvest_gain', 'a', 'X'))!;
    expect(m).toMatchObject({ noRoom: true, qty: 0, gain: 0, saving: 0, date: '2026-12-04' });
    expect(m.reasons).toEqual(['No room left for this move']);
    expect(fam.totals.laterSaving).toBe(0);
  });

  it('buyOn is the next trading day after the picked date', () => {
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [two[0]!], txns: [buy('a', 'X', '2023-01-01', 500, 1000)],
      datedMoves: [{ moveId: idOf('harvest_gain', 'a', 'X'), date: '2026-12-04' }],
    }, ASOF, R);
    expect(fam.moves[0]!.buyOn).toBe(buybackDate('2026-12-04', true, NSE_HOLIDAYS_2027.dates));
    expect(fam.moves[0]!.buyOn).toBe('2026-12-07');
  });

  it('drops a dated move that matches no holding', () => {
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [two[0]!], txns: [buy('a', 'X', '2023-01-01', 500, 1000)],
      datedMoves: [{ moveId: idOf('harvest_gain', 'a', 'GONE'), date: '2026-12-04' }, { moveId: 'garbage', date: '2026-12-04' }],
    }, ASOF, R);
    expect(fam.moves.map((m) => m.isin)).toEqual(['X']);
  });

  it('never uses the same units twice: a dated gift and the giver\'s own harvest fit within the holding', () => {
    const members = [person('a', 'self'), person('p', 'parent', { age: 64 })];
    const fam = computeFamily({
      members, securities: [two[0]!], txns: [buy('a', 'X', '2020-01-01', 130, 1000)],
      datedMoves: [{ moveId: `${R.label}|gift|a>p|X|`, date: '2026-12-10' }],
    }, ASOF, R);
    const used = fam.moves.filter((m) => m.isin === 'X' && (m.kind === 'gift' || m.kind === 'harvest_gain')).reduce((a, m) => a + m.qty, 0);
    expect(fam.moves.find((m) => m.kind === 'gift')!.qty).toBe(q(125));
    expect(used).toBeLessThanOrEqual(q(130));
  });

  it('a dated harvest beats an undated in-room switch for the same room', () => {
    const securities = [
      { isin: 'INFR', name: 'Reg Fund', taxType: 'equity' as const, listed: false, price: rs(2000), plan: 'regular' as const, category: 'Flexi Cap' },
      two[1]!,
    ];
    const txns = [buy('a', 'INFR', '2023-01-01', 100, 1000), buy('a', 'Y', '2023-01-01', 200, 1000)]; // switch ₹1 L, Y ₹60,000
    const members = [person('a', 'self')];
    const plain = computeFamily({ members, securities, txns }, ASOF, R);
    expect(plain.moves.find((m) => m.kind === 'switch_direct' && m.when === 'now')).toBeDefined();
    const fam = computeFamily({ members, securities, txns, datedMoves: [{ moveId: idOf('harvest_gain', 'a', 'Y'), date: '2026-12-04' }] }, ASOF, R);
    expect(fam.moves.find((m) => m.kind === 'harvest_gain' && m.isin === 'Y')).toMatchObject({ gain: rs(60_000), date: '2026-12-04' });
  });
});

describe('M1 review fixes', () => {
  const sell = (memberId: string, isin: string, date: string, units: number, priceRs: number): Txn => ({
    id: `s${++seq}`, memberId, isin, date, side: 'sell', qty: q(units), amount: rs(units * priceRs), source: 'test',
  });
  const regEq: Security = { isin: 'INFREG', name: 'Reg Fund - Regular Plan - Growth', taxType: 'equity', listed: false, category: 'Equity Scheme - Large Cap Fund', plan: 'regular', price: rs(2000) };
  const swId = `${R.label}|switch_direct|a|INFREG|`;

  it('C1: a dated in-room switch whose room is gone shows "No room left", never a big taxed switch on that date', () => {
    const fill: Security = { isin: 'FILL', name: 'Fill', taxType: 'equity', listed: true, price: rs(2000) };
    const txns = [buy('a', 'INFREG', '2023-01-01', 2000, 1000), buy('a', 'FILL', '2023-01-01', 125, 1000), sell('a', 'FILL', '2026-06-01', 125, 2000)];
    const fam = computeFamily({ members: [person('a', 'self')], securities: [regEq, fill], txns, datedMoves: [{ moveId: swId, date: '2027-02-20' }] }, ASOF, R);
    const mine = fam.moves.filter((m) => m.id === swId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ noRoom: true, qty: 0, date: '2027-02-20' });
  });

  it('C2: a slab switch after harvests that used the nil band shows the real tax', () => {
    const shares: Security = { isin: 'X', name: 'X Ltd', taxType: 'equity', listed: true, price: rs(2000) };
    const debt: Security = { isin: 'INFDEBT', name: 'Gilt Fund - Regular Plan - Growth', taxType: 'slab', listed: false, category: 'Debt Scheme - Gilt Fund', plan: 'regular', price: rs(200) };
    const fam = computeFamily({
      members: [person('a', 'self', { income: [] })], securities: [shares, debt],
      txns: [buy('a', 'X', '2023-01-01', 500, 1000), buy('a', 'INFDEBT', '2024-01-01', 3000, 100)], // ₹5 L LT shares, ₹3 L debt
    }, ASOF, R);
    expect(fam.moves.find((m) => m.kind === 'harvest_gain')).toMatchObject({ gain: rs(5_00_000) });
    const sw = fam.moves.find((m) => m.kind === 'switch_direct')!;
    expect(sw.reasons.join(' ')).not.toMatch(/No tax now/);
    expect(sw.reasons.join(' ')).toMatch(/₹35,750/);
  });

  it('C2 cross-check: the tax shown across a member\'s moves equals the tax once they are all done', () => {
    const shares: Security = { isin: 'X', name: 'X Ltd', taxType: 'equity', listed: true, price: rs(2000) };
    const debt: Security = { isin: 'INFDEBT', name: 'Gilt Fund - Regular Plan - Growth', taxType: 'slab', listed: false, category: 'Debt Scheme - Gilt Fund', plan: 'regular', price: rs(200) };
    const base = { members: [person('a', 'self', { income: [] })], securities: [shares, debt], txns: [buy('a', 'X', '2023-01-01', 500, 1000), buy('a', 'INFDEBT', '2024-01-01', 50_000, 194)] };
    const fam = computeFamily(base, ASOF, R);
    const sw = fam.moves.find((m) => m.kind === 'switch_direct')!;
    expect(sw).toMatchObject({ when: 'now' });
    const shown = fam.moves.reduce((a, m) => a + (m.kind === 'switch_direct' ? m.tax : 0), 0);
    expect(shown).toBeGreaterThan(0);
    const doneTxns = fam.moves.filter((m) => m.kind !== 'wait').map((m) => sell('a', m.isin, ASOF, m.qty / QTY_SCALE, (fam.securities.get(m.isin)!.price ?? 0) / 100));
    const after = computeFamily({ ...base, txns: [...base.txns, ...doneTxns] }, ASOF, R);
    expect(after.members[0]!.year.tax - fam.members[0]!.year.tax).toBe(shown);
  });

  it('I4: only detected_done retires a dated move; a manual done keeps its room; undone brings it back', () => {
    const two = [
      { isin: 'X', name: 'X', taxType: 'equity' as const, listed: true, price: rs(2000) },
      { isin: 'Y', name: 'Y', taxType: 'equity' as const, listed: true, price: rs(1300) },
    ];
    const txns = [buy('a', 'X', '2023-01-01', 200, 1000), buy('a', 'Y', '2023-01-01', 200, 1000)];
    const yId = `${R.label}|harvest_gain|a|Y|`;
    const datedMoves = [{ moveId: yId, date: '2026-12-04' }];
    const rec = (event: 'done' | 'undone' | 'detected_done', at: string) => ({ moveId: yId, at, event, move: { id: yId } as never });
    const st = { members: [person('a', 'self')], securities: two, txns, datedMoves };
    const xGain = (f: ReturnType<typeof computeFamily>) => (f.moves.find((m) => m.kind === 'harvest_gain' && m.isin === 'X') as { gain: number }).gain;
    expect(computeFamily(st, ASOF, R).moves.find((m) => m.isin === 'Y')!.date).toBe('2026-12-04');
    // Manual done: the sale may not be in the statements yet, so Y keeps its room and X stays small.
    for (const records of [[rec('done', 't1')], [rec('done', 't1'), rec('undone', 't2'), rec('done', 't3')]]) {
      const fam = computeFamily({ ...st, recommendations: records }, ASOF, R);
      expect(fam.moves.find((m) => m.isin === 'Y')!.date).toBe('2026-12-04');
      expect(xGain(fam)).toBe(rs(65_000));
      const total = fam.moves.filter((m) => m.kind === 'harvest_gain').reduce((a, m) => a + m.gain, 0);
      expect(total).toBeLessThanOrEqual(rs(1_25_000));
    }
    // Detected done: the sale is in the statements, the dated move is retired.
    for (const records of [[rec('detected_done', 't1')], [rec('done', 't1'), rec('undone', 't2'), rec('detected_done', 't3')]]) {
      const fam = computeFamily({ ...st, recommendations: records }, ASOF, R);
      expect(fam.moves.some((m) => m.date)).toBe(false);
      expect(xGain(fam)).toBe(rs(1_25_000));
    }
    const back = computeFamily({ ...st, recommendations: [rec('done', 't1'), rec('undone', 't2')] }, ASOF, R);
    expect(back.moves.find((m) => m.isin === 'Y')!.date).toBe('2026-12-04');
  });

  it('I5: no wait move for ELSS units still locked on their long-term date', () => {
    const elss: Security = { isin: 'INF1', name: 'Tax Saver', taxType: 'equity', listed: false, price: rs(250), category: 'Equity Scheme - ELSS' };
    const fam = computeFamily({ members: [person('a', 'self')], securities: [elss], txns: [buy('a', 'INF1', '2026-03-20', 1000, 100)] }, '2027-02-10', R);
    expect(fam.moves.filter((m) => m.kind === 'wait')).toHaveLength(0);
  });

  it('I6: a fund with no category is treated as ELSS by its name', () => {
    const named: Security = { isin: 'INF1', name: 'Axis ELSS Tax Saver Fund - Regular Plan - Growth', taxType: 'equity', listed: false, price: rs(200), plan: 'regular' };
    const fam = computeFamily({ members: [person('a', 'self')], securities: [named], txns: [buy('a', 'INF1', '2025-06-01', 1000, 100)] }, '2027-02-10', R);
    expect(fam.moves.filter((m) => m.isin === 'INF1')).toHaveLength(0);
    expect(fam.members[0]!.holdings[0]!.lots[0]!.lockedUntil).toBe('2028-06-01');
    const saver: Security = { ...named, name: 'Some Tax Saving Fund - Regular Plan - Growth' };
    expect(computeFamily({ members: [person('a', 'self')], securities: [saver], txns: [buy('a', 'INF1', '2020-06-01', 1000, 100)] }, '2027-02-10', R)
      .moves.some((m) => m.kind === 'switch_direct')).toBe(false); // unlocked by now, but switching would start a new lock
  });

  it('I7: gains moved into the room by in-room switches count as made tax-free', () => {
    const fam = computeFamily({ members: [person('a', 'self')], securities: [{ ...regEq, price: rs(180) }], txns: [buy('a', 'INFREG', '2023-01-01', 1000, 100)] }, ASOF, R);
    const sw = fam.moves.find((m) => m.kind === 'switch_direct')!;
    expect(sw).toMatchObject({ when: 'now', gain: rs(80_000), taxFreeGain: rs(80_000) });
    expect(fam.totals.taxFreeGains).toBe(rs(80_000));
  });

  it('m1: a lot used by a gift is not also sold at a loss', () => {
    const z: Security = { isin: 'Z', name: 'Z', taxType: 'equity', listed: true, price: rs(2000) };
    const s: Security = { isin: 'S', name: 'S', taxType: 'equity', listed: true, price: rs(2000) };
    const fam = computeFamily({
      members: [person('a', 'self'), person('p', 'parent', { age: 64 })], securities: [z, s],
      // a booked ₹2.25 L of long-term gain (₹1 L taxable); Z: a long-term loss lot in front of a long-term gain lot.
      txns: [buy('a', 'Z', '2023-01-01', 50, 3000), buy('a', 'Z', '2023-06-01', 100, 1000), buy('a', 'S', '2023-05-01', 225, 1000), sell('a', 'S', '2026-07-01', 225, 2000)],
    }, ASOF, R);
    expect(fam.moves.some((m) => m.kind === 'gift' && m.isin === 'Z')).toBe(true);
    const used = fam.moves.filter((m) => m.isin === 'Z' && m.kind !== 'wait').reduce((a, m) => a + m.qty, 0);
    expect(used).toBeLessThanOrEqual(q(150));
  });

  it('m5: the wait reason gives a plain date', () => {
    const fam = computeFamily({ members: [person('a', 'self')], securities: [{ isin: 'H', name: 'H', taxType: 'equity', listed: true, price: rs(1500) }], txns: [buy('a', 'H', '2025-12-06', 100, 1000)] }, ASOF, R);
    expect(fam.moves.find((x) => x.kind === 'wait')!.reasons[0]).toMatch(/Turns long-term on 7 Dec 2026/);
  });
});

describe('old data marks', () => {
  const sec = (isin: string, price: number): Security => ({ isin, name: isin, taxType: 'equity', listed: true, price: rs(price) });
  const tb = (memberId: string, isin: string, date: string, units: number, priceRs: number, account: string): Txn =>
    ({ ...buy(memberId, isin, date, units, priceRs), source: 'Trade history (Zerodha)', account });
  const OLD = '2026-03-31';

  it('marks a harvest and a loss in an account whose newest trade is old', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [sec('X', 2000), sec('L', 1000), sec('W', 100)],
      txns: [
        tb('a', 'X', '2023-01-01', 500, 1000, 'Zerodha'), tb('a', 'L', OLD, 100, 3000, 'Zerodha'),
        buy('a', 'W', '2026-05-01', 1000, 50),
        { id: 'sw', memberId: 'a', isin: 'W', date: '2026-08-01', side: 'sell', qty: q(1000), amount: rs(1_00_000), source: 'test' }, // ST gain booked
      ],
    }, ASOF, R);
    const h = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(h.oldData).toBe(OLD);
    expect(h.roomMayBeSmaller).toBe(OLD);
    const l = fam.moves.find((x) => x.kind === 'harvest_loss')!;
    expect(l.oldData).toBe(OLD);
    expect(l.roomMayBeSmaller).toBeUndefined();
    expect(fam.oldAccounts).toEqual([{ memberId: 'a', account: 'Zerodha', newest: OLD }]);
  });

  it('does not mark when newest data is 29 days old', () => {
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [sec('X', 2000)],
      txns: [tb('a', 'X', '2023-01-01', 500, 1000, 'Zerodha'), tb('a', 'X', '2026-10-16', 1, 1000, 'Zerodha')],
    }, ASOF, R);
    expect(fam.moves.length).toBeGreaterThan(0);
    expect(fam.moves.every((m) => m.oldData === undefined && m.roomMayBeSmaller === undefined)).toBe(true);
    expect(fam.oldAccounts).toEqual([]);
  });

  it('flags room on a fresh account\'s harvest when the same member has an old account', () => {
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [sec('X', 2000), sec('Y', 1000)],
      txns: [tb('a', 'X', '2023-01-01', 500, 1000, 'Zerodha'), tb('a', 'X', '2026-11-10', 1, 1000, 'Zerodha'), tb('a', 'Y', OLD, 10, 1000, 'Angel One')],
    }, ASOF, R);
    const h = fam.moves.find((x) => x.kind === 'harvest_gain' && x.isin === 'X')!;
    expect(h.oldData).toBeUndefined();
    expect(h.roomMayBeSmaller).toBe(OLD);
  });

  it('gift: recipient\'s old account flags room, giver\'s fresh account sets no oldData', () => {
    const fam = computeFamily({
      members: [person('a', 'self'), person('p', 'parent', { age: 64 })],
      securities: [sec('X', 2000), sec('Z', 1000)],
      txns: [tb('a', 'X', '2020-01-01', 1000, 1000, 'Zerodha'), tb('a', 'X', '2026-11-10', 1, 1000, 'Zerodha'), tb('p', 'Z', OLD, 10, 1000, 'Angel One')],
    }, ASOF, R);
    const g = fam.moves.find((x) => x.kind === 'gift')!;
    expect(g.roomMayBeSmaller).toBe(OLD);
    expect(g.oldData).toBeUndefined();
  });

  it('ids and sizes do not change', () => {
    const run = (extra: string) => computeFamily({
      members: [person('a', 'self')], securities: [sec('X', 2000), sec('Y', 1000)],
      txns: [tb('a', 'X', '2023-01-01', 500, 1000, 'Zerodha'), tb('a', 'Y', extra, 1, 1000, 'Zerodha')],
    }, ASOF, R);
    const old = run(OLD).moves.find((x) => x.kind === 'harvest_gain')!;
    const fresh = run('2026-11-10').moves.find((x) => x.kind === 'harvest_gain')!;
    expect(old.oldData).toBe(OLD);
    expect(fresh.oldData).toBeUndefined();
    expect([old.id, old.qty, old.kind === 'harvest_gain' && old.gain]).toEqual([fresh.id, fresh.qty, fresh.kind === 'harvest_gain' && fresh.gain]);
  });

  it('accounts with no dated evidence get no marks', () => {
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [sec('X', 2000)],
      txns: [{ ...buy('a', 'X', '2023-01-01', 500, 1000), account: 'Zerodha' }],
    }, ASOF, R);
    expect(fam.moves.length).toBeGreaterThan(0);
    expect(fam.moves.every((m) => m.oldData === undefined && m.roomMayBeSmaller === undefined)).toBe(true);
    expect(fam.oldAccounts).toEqual([]);
  });

  it('a fund-CAS-only account gets no marks', () => {
    const cas = (date: string): Txn => ({ ...buy('a', 'X', date, 250, 1000), source: 'Mutual fund CAS (CAMS / KFintech)', account: 'Folio 123/45' });
    const fam = computeFamily({
      members: [person('a', 'self')], securities: [sec('X', 2000)],
      txns: [cas('2023-01-01'), cas(OLD)],
    }, ASOF, R);
    expect(fam.moves.length).toBeGreaterThan(0);
    expect(fam.moves.every((m) => m.oldData === undefined && m.roomMayBeSmaller === undefined)).toBe(true);
    expect(fam.oldAccounts).toEqual([]);
  });
});
