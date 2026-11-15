import { describe, expect, it } from 'vitest';
import { buildLedger } from './ledger';
import { FY_2026_27 as R } from './rules';
import { QTY_SCALE } from './types';
import { bestSetOff, freeEquityLtRoom, lotTaxType, longTermMonthsFor, normalIncomeOf, setOff, summariseYear, taxForYear, type GainBuckets } from './tax';
import type { IncomeSource, Member, Realised, Security } from './types';

// Worked examples from docs/research/2026-11-15-family-financial-planning.md §4.2 and the archetypes note.
const rs = (n: number) => Math.round(n * 100);
const D = '2026-11-15';
const src = (kind: IncomeSource['kind']) => (rupees: number): IncomeSource => ({ kind, amount: rs(rupees), from: 'manual' });
const salary = src('salary'), pension = src('pension'), interest = src('interest');
const person = (over: Partial<Member> = {}): Member => ({ id: 'p', name: 'P', relation: 'self', age: 40, regime: 'new', type: 'person', ...over });
const b = (g: Partial<GainBuckets>): GainBuckets => ({ equitySt: 0, equityLt: 0, otherLt: 0, slab: 0, ...g });
const tax = (m: Member, g: Partial<GainBuckets>) => taxForYear(m, normalIncomeOf(m, R, D)!, b(g), R, D).tax;
const delta = (m: Member, g: Partial<GainBuckets>) => tax(m, g) - tax(m, {});
const real = (over: Partial<Realised>): Realised => ({
  memberId: 'p', isin: 'X', buyDate: '2024-01-01', sellDate: '2026-06-01', qty: 1, proceeds: 0, cost: 0, gain: 0, term: 'lt', taxType: 'equity', ...over,
});

describe('one tax function', () => {
  it('debt fund gain: 30% earner pays 31.2%, retired parent pays nil', () => {
    const son = person({ income: [salary(30_00_000)] }), mum = person({ age: 66, income: [pension(3_00_000)] });
    expect(delta(son, { slab: rs(70_000) })).toBe(rs(21_840));
    expect(delta(mum, { slab: rs(70_000) })).toBe(0);
  });

  it('no-income adult books ₹5.25 L LTCG at nil; 30% earner pays ₹52,000', () => {
    expect(delta(person({ income: [] }), { equityLt: rs(5_25_000) })).toBe(0);
    expect(delta(person({ income: [salary(30_00_000)] }), { equityLt: rs(5_25_000) })).toBe(rs(52_000));
  });

  it('the ₹12 L cliff', () => {
    const p = person({ income: [interest(11_00_000)] });
    expect(delta(p, { equityLt: rs(1_00_000) })).toBe(0);
    expect(tax(p, { equityLt: rs(2_00_000) })).toBe(rs(61_750));
  });

  it('marginal relief just above ₹12 L', () => {
    expect(tax(person({ income: [interest(12_10_000)] }), {})).toBe(rs(10_400));
  });

  it('senior with ₹9 L FD interest: nil new regime, ₹83,200 old', () => {
    expect(tax(person({ age: 65, income: [interest(9_00_000)] }), {})).toBe(0);
    expect(tax(person({ age: 65, regime: 'old', income: [interest(9_00_000)] }), {})).toBe(rs(83_200));
  });

  it('other long-term gains get no rebate', () => {
    expect(delta(person({ income: [interest(6_00_000)] }), { otherLt: rs(1_00_000) })).toBe(rs(13_000));
  });

  it('harvest room stops at the ₹12 L line (archetype A, Priya)', () => {
    const priya = person({ income: [salary(12_00_000)] }); // new regime; ₹11.25 L after standard deduction
    expect(freeEquityLtRoom(priya, normalIncomeOf(priya, R, D)!, b({}), R, D)).toBe(rs(75_000));
    expect(delta(priya, { equityLt: rs(1_00_000) })).toBe(rs(26_000)); // marginal relief: ₹25,000 + cess
    expect(freeEquityLtRoom(person({ income: [] }), 0, b({}), R, D)).toBe(rs(1_25_000) + rs(4_00_000));
  });
});

describe('review: who gets the rebate', () => {
  it('only resident individuals get the ₹12 L rebate', () => {
    const ten = [interest(10_00_000)];
    expect(tax(person({ income: ten }), {})).toBe(0);
    expect(tax(person({ income: ten, resident: false }), {})).toBe(rs(41_600)); // ₹40,000 slab tax + cess, no rebate
    expect(tax(person({ income: ten, type: 'huf' }), {})).toBe(rs(41_600));
  });
  it('an HUF gets no age-based old-regime exemption', () => {
    expect(tax(person({ regime: 'old', age: 70, type: 'huf', income: [interest(3_00_000)] }), {})).toBe(rs(2_600)); // 5% of ₹50,000 + cess
  });
});

describe('income before tax', () => {
  it('applies the standard deduction once to salary and pension, rent at 70%, senior interest deduction old regime only', () => {
    expect(normalIncomeOf(person({ income: [salary(10_00_000), pension(1_00_000)] }), R, D)).toBe(rs(10_25_000));
    expect(normalIncomeOf(person({ income: [src('rent')(1_00_000)] }), R, D)).toBe(rs(70_000));
    expect(normalIncomeOf(person({ regime: 'old', age: 61, income: [interest(30_000)] }), R, D)).toBe(0);
    expect(normalIncomeOf(person({ regime: 'old', age: 61, income: [interest(3_00_000)], deductions: rs(1_50_000) }), R, D)).toBe(rs(1_00_000));
    expect(normalIncomeOf(person({ age: 61, income: [interest(3_00_000)], deductions: rs(1_50_000) }), R, D)).toBe(rs(3_00_000));
    expect(normalIncomeOf(person({ income: [salary(50_000)] }), R, D)).toBe(0);
    expect(normalIncomeOf(person({}), R, D)).toBeNull();
  });
});

describe('tax type per lot', () => {
  const debtFund: Security = { isin: 'INF1', name: 'Debt', taxType: 'slab', listed: false };
  it('debt lots bought before April 2023 are long-term other after 24 months', () => {
    expect(lotTaxType(debtFund, '2023-03-31', R)).toBe('other_lt');
    expect(lotTaxType(debtFund, '2023-04-01', R)).toBe('slab');
    expect(longTermMonthsFor('other_lt', false, R)).toBe(24);
    expect(longTermMonthsFor('other_lt', true, R)).toBe(12);
    expect(longTermMonthsFor('equity', false, R)).toBe(12);
    expect(longTermMonthsFor('slab', false, R)).toBeNull();
    expect(longTermMonthsFor('check', false, R)).toBe(12);
  });
  it('the ledger types and dates each lot: old debt lots long-term after 24 months, new ones always slab', () => {
    const t = (id: string, date: string, side: 'buy' | 'sell') => ({ id, memberId: 'p', isin: 'INF1', date, side, qty: QTY_SCALE, amount: rs(side === 'buy' ? 100 : 150), source: 't' });
    const l = buildLedger([t('1', '2023-03-01', 'buy'), t('2', '2024-01-01', 'buy'), t('3', '2026-06-01', 'sell'), t('4', '2026-06-02', 'sell')], [debtFund], R);
    expect(l.realised.map((x) => [x.taxType, x.term])).toEqual([['other_lt', 'lt'], ['slab', 'st']]);
  });
});

describe('set-off', () => {
  it('a short-term loss avoids long-term gains the exemption already covers', () => {
    // 30% earner; ₹1 L short-term equity loss; gains: ₹1 L equity LT (inside ₹1.25 L) and ₹1 L debt fund (slab).
    const p = person({ income: [salary(30_00_000)] });
    const realised = [
      real({ term: 'st', gain: rs(-1_00_000) }),
      real({ term: 'lt', gain: rs(1_00_000) }),
      real({ term: 'st', taxType: 'slab', gain: rs(1_00_000) }),
    ];
    const best = bestSetOff(realised, { st: 0, lt: 0 }, p, normalIncomeOf(p, R, D)!, R, D);
    expect(best.order.st[0]).toBe('slab');
    expect(taxForYear(p, normalIncomeOf(p, R, D)!, best.net, R, D).tax).toBe(tax(p, {}));
    const naive = setOff(realised, { st: 0, lt: 0 }, { st: ['equityLt', 'slab', 'equitySt', 'otherLt'], lt: ['otherLt', 'equityLt'] });
    expect(taxForYear(p, normalIncomeOf(p, R, D)!, naive.net, R, D).tax - tax(p, {})).toBe(rs(31_200));
  });

  it('long-term losses never touch short-term or slab gains; check gains are taxed as slab and reported', () => {
    const r = setOff([
      real({ term: 'lt', gain: rs(-50_000) }),
      real({ term: 'st', gain: rs(30_000) }),
      real({ term: 'st', taxType: 'check', gain: rs(20_000) }),
    ], { st: 0, lt: rs(10_000) }, { st: ['slab', 'equitySt', 'otherLt', 'equityLt'], lt: ['otherLt', 'equityLt'] });
    expect(r.net).toEqual(b({ equitySt: rs(30_000), slab: rs(20_000) }));
    expect(r.carryForward).toEqual({ st: 0, lt: rs(60_000) });
    expect(r.unchecked).toBe(rs(20_000));
  });

  it('unknown income keeps today’s meaning: no bonus room, trading profit at 30%', () => {
    const s = summariseYear(person({ income: undefined }), [], R, { speculative: rs(1_00_000), nonSpeculative: 0 });
    expect(s.bonus.total).toBe(0);
    expect(s.business).toMatchObject({ tax: rs(31_200), assumedTopSlab: true });
  });

  it('the year summary caps free room at the ₹12 L line', () => {
    const s = summariseYear(person({ id: 'p', income: [salary(12_00_000)] }), [], R);
    expect(s.room.free + s.bonus.free).toBe(rs(75_000));
    expect(s.buckets).toEqual(b({}));
  });
});
