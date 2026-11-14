import { describe, expect, it } from 'vitest';
import { computeFamily, simulateSale } from './family';
import { FY_2026_27 as R } from './rules';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
let seq = 0;
const buy = (memberId: string, isin: string, date: string, units: number, priceRs: number): Txn => ({
  id: `b${++seq}`, memberId, isin, date, side: 'buy', qty: q(units), amount: rs(units * priceRs), source: 'test',
});
const person = (id: string, relation: Member['relation'], over: Partial<Member> = {}): Member => ({
  id, name: id, relation, age: 40, regime: 'new', otherIncome: rs(20_00_000), ...over,
});
const ASOF = '2026-11-14';

describe('harvest gain moves', () => {
  it('fills the room with whole shares from long-term lots and states the saving', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X Ltd', kind: 'equity', price: rs(2000) }],
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
      securities: [{ isin: 'X', name: 'X', kind: 'equity', price: rs(1400) }],
      txns: [buy('a', 'X', '2023-01-01', 10, 1000)], // ₹4,000 gain → ₹520 avoided, less ~₹45 costs
    }, ASOF, R);
    expect(fam.moves.filter((x) => x.kind === 'harvest_gain')).toHaveLength(0);
  });

  it('never suggests moves on lots with guessed dates or a missing 31 Jan 2018 value', () => {
    const base = { members: [person('a', 'self')], securities: [{ isin: 'X', name: 'X', kind: 'equity' as const, price: rs(2000) }] };
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
      securities: [{ isin: 'X', name: 'X', kind: 'equity', price: rs(2000) }],
      txns: [{ ...buy('a', 'X', '2023-01-01', 40, 1000), account: 'Zerodha' }, { ...buy('a', 'X', '2023-06-01', 40, 1000), account: 'Angel One' }],
    }, ASOF, R);
    const h = fam.moves.filter((x) => x.kind === 'harvest_gain');
    expect(h.map((x) => [x.account, x.gain])).toEqual([['Zerodha', rs(40_000)], ['Angel One', rs(40_000)]]);
  });

  it('never sells into short-term lots', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'X', name: 'X', kind: 'equity', price: rs(2000) }],
      txns: [buy('a', 'X', '2023-01-01', 20, 1000), buy('a', 'X', '2026-08-01', 500, 1000)],
    }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m.qty).toBe(q(20));
    expect(m.gain).toBe(rs(20_000));
  });

  it('allows fractional mutual fund units to three decimals', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'F', name: 'Fund', kind: 'equity_mf', price: rs(300) }],
      txns: [buy('a', 'F', '2023-01-01', 10_000, 100)], // ₹200 gain per unit
    }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m.qty).toBe(q(625));
    expect(m.gain).toBe(rs(1_25_000));
  });
});

describe('gift moves', () => {
  const base = {
    securities: [{ isin: 'X', name: 'X', kind: 'equity' as const, price: rs(2000) }],
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
      securities: [{ isin: 'F', name: 'Fund', kind: 'equity_mf', price: rs(300) }],
      txns: [buy('a', 'F', '2020-01-01', 100_000, 100)],
    }, ASOF, R);
    expect(fam.moves.some((x) => x.kind === 'gift')).toBe(false);
  });
});

describe('wait and loss moves', () => {
  it('suggests waiting when a winner turns long-term within 90 days', () => {
    const fam = computeFamily({
      members: [person('a', 'self')],
      securities: [{ isin: 'H', name: 'H', kind: 'equity', price: rs(1500) }],
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
        { isin: 'W', name: 'Winner', kind: 'equity', price: rs(100) },
        { isin: 'L', name: 'Loser', kind: 'equity', price: rs(500) },
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
    securities: [{ isin: 'N', name: 'Nifty fund', kind: 'equity_mf' as const, price: rs(200) }],
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
