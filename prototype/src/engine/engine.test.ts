import { describe, expect, it } from 'vitest';
import { addMonths, isLongTerm, longTermFrom, todayISO } from './dates';
import { buildLedger } from './ledger';
import { FY_2026_27 as R, roundTripCost } from './rules';
import { classifyByIsin } from '../parsers/common';
import { summariseYear } from './tax';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
let seq = 0;
const tx = (memberId: string, isin: string, date: string, side: 'buy' | 'sell', units: number, priceRs: number): Txn => ({
  id: `t${++seq}`, memberId, isin, date, side, qty: q(units), amount: rs(units * priceRs), source: 'test',
});
const member = (over: Partial<Member> = {}): Member => ({
  id: 'm1', name: 'Test', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: rs(20_00_000), from: 'manual' as const }], ...over,
});
const sec = (isin: string, over: Partial<Security> = {}): Security => ({ isin, name: isin, taxType: 'equity', listed: true, ...over });

describe('tax types', () => {
  it('classifies by ISIN', () => {
    expect(classifyByIsin('INE002A01018')).toEqual({ taxType: 'equity', listed: true, taxTypeSource: 'share' });
    expect(classifyByIsin('INF209K01YN0')).toEqual({ taxType: 'check', listed: false });
  });
  it('round-trip cost follows listing, not asset class', () => {
    expect(roundTripCost({ listed: false }, rs(1_00_000), R)).toBe(Math.round(rs(1_00_000) * R.costs.mfStampBuy));
    expect(roundTripCost({ listed: true }, rs(1_00_000), R)).toBeGreaterThan(rs(200));
  });
});

describe('today in India', () => {
  it('uses India time whatever the machine time zone', () => {
    expect(todayISO(new Date('2027-03-30T19:00:00Z'))).toBe('2027-03-31'); // 00:30 IST
    expect(todayISO(new Date('2027-03-31T18:29:00Z'))).toBe('2027-03-31'); // 23:59 IST
    expect(todayISO(new Date('2027-03-31T18:30:00Z'))).toBe('2027-04-01'); // midnight IST
  });
});

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
    const parent = member({ income: [{ kind: 'other' as const, amount: rs(2_50_000) , from: 'manual' as const }]}); // shortfall 1,50,000 under new regime
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
    const s = summariseYear(member({ income: undefined }), sell('2024-01-01', '2026-06-01', 1_00_000, 3_25_000), R);
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
    const student = member({ income: [{ kind: 'other' as const, amount: 0, from: 'band' as const, band: 'No other income' }] });
    expect(summariseYear(student, [], R).bonus.total).toBe(rs(4_00_000));
    const upTo4 = member({ income: [{ kind: 'other' as const, amount: rs(4_00_000), from: 'band' as const, band: 'Up to ₹4 L (nil)' }] });
    expect(summariseYear(upTo4, [], R).bonus.total).toBe(0);
    expect(slabRate(member({ income: [{ kind: 'other' as const, amount: rs(10_00_000) , from: 'manual' as const }]}), R)).toBe(0.1);
    expect(slabRate(member({ income: undefined }), R)).toBeNull();
  });
});

describe('intraday and F&O', () => {
  it('treats same-day buy and sell in one account as intraday, not a capital gain', () => {
    const l = buildLedger([
      tx('m1', 'A', '2024-01-10', 'buy', 10, 100),
      tx('m1', 'A', '2026-07-01', 'buy', 5, 200),
      tx('m1', 'A', '2026-07-01', 'sell', 5, 210),
    ], [sec('A')]);
    expect(l.intraday).toEqual([expect.objectContaining({ qty: q(5), pnl: rs(50) })]);
    expect(l.realised).toHaveLength(0);
    expect(l.lots.get('m1|A|')![0]!.qty).toBe(q(10));
  });

  it('only the matched quantity is intraday', () => {
    const l = buildLedger([
      tx('m1', 'A', '2024-01-10', 'buy', 10, 100),
      tx('m1', 'A', '2026-07-01', 'buy', 2, 200),
      tx('m1', 'A', '2026-07-01', 'sell', 6, 210),
    ], [sec('A')]);
    expect(l.intraday[0]).toMatchObject({ qty: q(2), pnl: rs(20) });
    expect(l.realised).toEqual([expect.objectContaining({ qty: q(4), term: 'lt', gain: rs(440) })]);
  });

  const sell = (buy: string, sellDate: string, cost: number, proceeds: number) =>
    buildLedger([tx('m1', 'A', buy, 'buy', 1, cost), tx('m1', 'A', sellDate, 'sell', 1, proceeds)], [sec('A')]).realised;

  it('an F&O loss offsets short-term gains first, then long-term', () => {
    const realised = [...sell('2026-05-01', '2026-06-01', 10_000, 60_000), ...sell('2024-01-01', '2026-06-01', 1_00_000, 3_00_000)];
    const s = summariseYear(member(), realised, R, { speculative: 0, nonSpeculative: rs(-80_000) });
    expect(s.business.setOffAgainstGains).toBe(rs(80_000));
    expect(s.stNet).toBe(0);
    expect(s.ltNet).toBe(rs(1_70_000));
    expect(s.business.carryForward.nonSpeculative).toBe(0);
  });

  it('an intraday loss never offsets capital gains and carries forward', () => {
    const s = summariseYear(member(), sell('2026-05-01', '2026-06-01', 10_000, 60_000), R, { speculative: rs(-30_000), nonSpeculative: 0 });
    expect(s.stNet).toBe(rs(50_000));
    expect(s.business.carryForward.speculative).toBe(rs(30_000));
  });

  it('taxes trading profit at the slab, with the 87A rebate below ₹12 L', () => {
    const low = summariseYear(member({ income: [{ kind: 'other' as const, amount: rs(6_00_000) , from: 'manual' as const }]}), [], R, { speculative: 0, nonSpeculative: rs(2_00_000) });
    expect(low.business.tax).toBe(0); // total ₹8 L: slab tax ₹20,000 fully rebated
    const high = summariseYear(member({ income: [{ kind: 'other' as const, amount: rs(20_00_000) , from: 'manual' as const }]}), [], R, { speculative: 0, nonSpeculative: rs(2_00_000) });
    expect(high.business.tax).toBe(rs(52_000)); // ₹2 L in the 25% slab, plus cess
    const unknown = summariseYear(member({ income: undefined }), [], R, { speculative: rs(1_00_000), nonSpeculative: 0 });
    expect(unknown.business).toMatchObject({ tax: rs(31_200), assumedTopSlab: true });
  });

  it('trading profit uses up basic exemption that would otherwise be bonus room', () => {
    const s = summariseYear(member({ income: [{ kind: 'other' as const, amount: rs(1_00_000) , from: 'manual' as const }]}), [], R, { speculative: 0, nonSpeculative: rs(2_00_000) });
    expect(s.bonus.total).toBe(rs(1_00_000));
  });
});
