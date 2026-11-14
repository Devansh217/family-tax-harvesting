import { describe, expect, it } from 'vitest';
import { addMonths, isLongTerm, longTermFrom } from './dates';
import { buildLedger } from './ledger';
import { FY_2026_27 as R } from './rules';
import { summariseYear } from './tax';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
let seq = 0;
const tx = (memberId: string, isin: string, date: string, side: 'buy' | 'sell', units: number, priceRs: number): Txn => ({
  id: `t${++seq}`, memberId, isin, date, side, qty: q(units), amount: rs(units * priceRs), source: 'test',
});
const member = (over: Partial<Member> = {}): Member => ({
  id: 'm1', name: 'Test', relation: 'self', age: 40, regime: 'new', otherIncome: rs(20_00_000), ...over,
});
const sec = (isin: string, over: Partial<Security> = {}): Security => ({ isin, name: isin, kind: 'equity', ...over });

describe('dates', () => {
  it('clamps month ends', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
  });
  it('long-term means held more than 12 months', () => {
    expect(longTermFrom('2025-06-15', 12)).toBe('2026-06-16');
    expect(isLongTerm('2025-06-15', '2026-06-15', 12)).toBe(false);
    expect(isLongTerm('2025-06-15', '2026-06-16', 12)).toBe(true);
  });
});

describe('ledger FIFO', () => {
  it('sells oldest lots first and splits a lot', () => {
    const l = buildLedger(
      [
        tx('m1', 'A', '2024-01-10', 'buy', 10, 100),
        tx('m1', 'A', '2026-02-01', 'buy', 10, 150),
        tx('m1', 'A', '2026-05-01', 'sell', 15, 200),
      ],
      [sec('A')],
    );
    expect(l.realised).toHaveLength(2);
    const [first, second] = l.realised;
    expect(first).toMatchObject({ buyDate: '2024-01-10', qty: q(10), cost: rs(1000), proceeds: rs(2000), gain: rs(1000), term: 'lt' });
    expect(second).toMatchObject({ buyDate: '2026-02-01', qty: q(5), cost: rs(750), proceeds: rs(1000), gain: rs(250), term: 'st' });
    const open = l.lots.get('m1|A|')!;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ qty: q(5), cost: rs(750) });
  });

  it('applies 31 Jan 2018 grandfathering', () => {
    const l = buildLedger(
      [tx('m1', 'G', '2016-05-01', 'buy', 10, 100), tx('m1', 'G', '2026-05-01', 'sell', 10, 400)],
      [sec('G', { fmv2018: rs(300) })],
    );
    expect(l.realised[0]).toMatchObject({ cost: rs(3000), gain: rs(1000) });
  });

  it('grandfathered cost is capped at the sale price', () => {
    const l = buildLedger(
      [tx('m1', 'G', '2016-05-01', 'buy', 10, 100), tx('m1', 'G', '2026-05-01', 'sell', 10, 250)],
      [sec('G', { fmv2018: rs(300) })],
    );
    expect(l.realised[0]).toMatchObject({ cost: rs(2500), gain: 0 });
  });

  it('warns instead of crashing when selling more than held', () => {
    const l = buildLedger([tx('m1', 'A', '2026-05-01', 'sell', 5, 100)], [sec('A')]);
    expect(l.warnings).toHaveLength(1);
    expect(l.realised).toHaveLength(0);
  });

  it('matches sells within the same demat account', () => {
    const l = buildLedger(
      [
        { ...tx('m1', 'A', '2020-01-10', 'buy', 10, 100), account: 'Zerodha' },
        { ...tx('m1', 'A', '2026-02-01', 'buy', 10, 150), account: 'Angel One' },
        { ...tx('m1', 'A', '2026-06-01', 'sell', 10, 200), account: 'Angel One' },
      ],
      [sec('A')],
    );
    expect(l.realised).toHaveLength(1);
    expect(l.realised[0]).toMatchObject({ account: 'Angel One', buyDate: '2026-02-01', gain: rs(500), term: 'st' });
    expect(l.lots.get('m1|A|Zerodha')![0]!.qty).toBe(q(10));
  });

  it('keeps members separate', () => {
    const l = buildLedger(
      [tx('m1', 'A', '2024-01-10', 'buy', 10, 100), tx('m2', 'A', '2024-01-10', 'buy', 5, 100)],
      [sec('A')],
    );
    expect(l.lots.get('m1|A|')![0]!.qty).toBe(q(10));
    expect(l.lots.get('m2|A|')![0]!.qty).toBe(q(5));
  });
});

describe('tax year summary', () => {
  const sell = (buy: string, sellDate: string, cost: number, proceeds: number) =>
    buildLedger([tx('m1', 'A', buy, 'buy', 1, cost), tx('m1', 'A', sellDate, 'sell', 1, proceeds)], [sec('A')]).realised;

  it('uses the exemption and leaves free room', () => {
    const s = summariseYear(member(), sell('2024-01-01', '2026-06-01', 1_00_000, 1_80_000), R);
    expect(s.ltNet).toBe(rs(80_000));
    expect(s.exemptionUsed).toBe(rs(80_000));
    expect(s.room.free).toBe(rs(45_000));
    expect(s.tax).toBe(0);
  });

  it('taxes LTCG above ₹1.25 L at 12.5% plus cess', () => {
    const s = summariseYear(member(), sell('2024-01-01', '2026-06-01', 1_00_000, 3_25_000), R);
    expect(s.ltTaxable).toBe(rs(1_00_000));
    expect(s.tax).toBe(rs(13_000));
    expect(s.room.free).toBe(0);
  });

  it('short-term loss offsets long-term gain; long-term loss never offsets short-term gain', () => {
    const realised = [
      ...sell('2024-01-01', '2026-06-01', 1_00_000, 2_00_000), // LT +1,00,000
      ...sell('2026-05-01', '2026-06-01', 50_000, 20_000), // ST -30,000
    ];
    const s = summariseYear(member(), realised, R);
    expect(s.ltNet).toBe(rs(70_000));
    expect(s.stNet).toBe(0);

    const s2 = summariseYear(member(), [
      ...sell('2026-05-01', '2026-06-01', 10_000, 40_000), // ST +30,000
      ...sell('2024-01-01', '2026-06-01', 50_000, 10_000), // LT -40,000
    ], R);
    expect(s2.stNet).toBe(rs(30_000));
    expect(s2.ltNet).toBe(0);
    expect(s2.lossCarriedForward.lt).toBe(rs(40_000));
  });

  it('ignores sales outside the tax year', () => {
    const s = summariseYear(member(), sell('2023-01-01', '2026-03-31', 1_00_000, 2_00_000), R);
    expect(s.ltNet).toBe(0);
  });

  it('gives low-income members bonus room from unused basic exemption, short-term first', () => {
    const parent = member({ otherIncome: rs(2_50_000) }); // shortfall 1,50,000 under new regime
    const s = summariseYear(parent, [
      ...sell('2026-05-01', '2026-06-01', 10_000, 1_10_000), // ST +1,00,000
      ...sell('2024-01-01', '2026-06-01', 1_00_000, 2_75_000), // LT +1,75,000
    ], R);
    expect(s.exemptionUsed).toBe(rs(1_25_000));
    expect(s.bonus.total).toBe(rs(1_50_000));
    expect(s.stTaxable).toBe(0);
    expect(s.ltTaxable).toBe(0); // 50,000 LT left after exemption, covered by remaining 50,000 bonus
    expect(s.bonus.free).toBe(0);
    expect(s.tax).toBe(0);
  });

  it('assumes no bonus room when other income is not entered', () => {
    const s = summariseYear(member({ otherIncome: undefined }), sell('2024-01-01', '2026-06-01', 1_00_000, 3_25_000), R);
    expect(s.bonus.total).toBe(0);
    expect(s.tax).toBe(rs(13_000));
  });

  it('applies carried-forward losses', () => {
    const s = summariseYear(member({ carriedLoss: { st: 0, lt: rs(50_000) } }), sell('2024-01-01', '2026-06-01', 1_00_000, 3_00_000), R);
    expect(s.ltNet).toBe(rs(1_50_000));
    expect(s.ltTaxable).toBe(rs(25_000));
  });
});

describe('income bands', () => {
  it('reads a slab at its top end so bonus room is never overstated', async () => {
    const { incomeBands, slabRate } = await import('./rules');
    const bands = incomeBands({ regime: 'new', age: 40 }, R);
    expect(bands.find((b) => b.label.startsWith('Up to ₹4 L'))!.assumed).toBe(rs(4_00_000));
    const student = member({ otherIncome: 0, incomeBand: 'No other income' });
    expect(summariseYear(student, [], R).bonus.total).toBe(rs(4_00_000));
    const upTo4 = member({ otherIncome: rs(4_00_000), incomeBand: 'Up to ₹4 L (nil)' });
    expect(summariseYear(upTo4, [], R).bonus.total).toBe(0);
    expect(slabRate(member({ otherIncome: rs(10_00_000) }), R)).toBe(0.1);
    expect(slabRate(member({ otherIncome: undefined }), R)).toBeNull();
  });
});
