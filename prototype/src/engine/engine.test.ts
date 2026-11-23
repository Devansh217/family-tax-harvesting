import { describe, expect, it } from 'vitest';
import { addMonths, isLongTerm, longTermFrom, todayISO } from './dates';
import { computeFamily, type FamilyState } from './family';
import { buildLedger } from './ledger';
import { effectiveTxns, type HeldPosition } from './openingLots';
import { FY_2026_27 as R, roundTripCost } from './rules';
import { classifyByIsin } from '../parsers/common';
import { summariseYear } from './tax';
import { QTY_SCALE, type Member, type Security, type TermAnswer, type Txn } from './types';

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

describe('units that left the account', () => {
  const gone = (date: string, units: number): Txn => ({ ...tx('m1', 'A', date, 'sell', units, 0), left: true });

  it('removes the oldest units with no gain and no warning', () => {
    const l = buildLedger([tx('m1', 'A', '2024-01-10', 'buy', 10, 100), tx('m1', 'A', '2026-05-01', 'buy', 10, 300), gone('2026-11-22', 15)], [sec('A')]);
    expect(l.realised).toHaveLength(0);
    expect(l.warnings).toHaveLength(0);
    expect(l.lots.get('m1|A|')).toMatchObject([{ date: '2026-05-01', qty: q(5), cost: rs(1_500) }]);
  });

  it('never warns, even with nothing left to remove', () => {
    const l = buildLedger([gone('2026-11-22', 5)], [sec('A')]);
    expect(l.warnings).toHaveLength(0);
    expect(l.realised).toHaveLength(0);
  });

  it('comes before a buy on the next day, which stays held', () => {
    const l = buildLedger([tx('m1', 'A', '2024-01-10', 'buy', 10, 100), tx('m1', 'A', '2026-11-23', 'buy', 5, 200), gone('2026-11-22', 10)], [sec('A')]);
    expect(l.lots.get('m1|A|')).toMatchObject([{ date: '2026-11-23', qty: q(5), cost: rs(1_000) }]);
  });

  it('comes after a buy on the same day, and is never intraday', () => {
    const l = buildLedger([tx('m1', 'A', '2026-11-22', 'buy', 10, 100), gone('2026-11-22', 4)], [sec('A')]);
    expect(l.intraday).toHaveLength(0);
    expect(l.lots.get('m1|A|')).toMatchObject([{ qty: q(6), cost: rs(600) }]);
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

describe('units sold from the opening lot', () => {
  // History starts 2025-08-01 (10 bought at ₹500); the holdings file (22 Nov 2026) shows 30 long-term at ₹600 average
  // (₹18,000). On 10 Apr 2026, 8 units were sold at ₹900: they came from before the history, so their buy date is unknown.
  const FILE = '2026-11-22';
  const acct = { account: 'Zerodha', source: 'Trade history · tb.xlsx' };
  const history = (): Txn[] => [
    { ...tx('a', 'X', '2025-08-01', 'buy', 10, 500), ...acct },
    { ...tx('a', 'X', '2026-04-10', 'sell', 8, 900), ...acct },
  ];
  const file: HeldPosition = { memberId: 'a', isin: 'X', account: 'Zerodha', qty: q(30), ltQty: q(30), cost: rs(18_000), asOf: FILE, source: 'Zerodha holdings', canTrim: true };
  const ledger = (answers?: TermAnswer[]) => buildLedger(effectiveTxns(history(), [file], FILE), [sec('X')], R, answers);
  const who = member({ id: 'a' });

  it('units sold from the opening lot are term unknown', () => {
    const out = effectiveTxns(history(), [file], FILE);
    const sold = out.find((t) => t.id.endsWith('|opening-sold'))!;
    // The 8 sold units at the file's ₹600 average: ₹4,800, dated the day before the history starts.
    expect(sold).toMatchObject({ qty: q(8), amount: rs(4_800), estimated: true, approx: true, date: '2025-07-31' });
    expect(out.find((t) => t.id.endsWith('|opening-lt'))).toMatchObject({ qty: q(20), amount: rs(12_000), approx: true });
    const [r] = ledger().realised;
    // Proceeds ₹7,200 less ₹4,800: a ₹2,400 gain, counted long-term (the safe way for room).
    expect(r).toMatchObject({ qty: q(8), gain: rs(2_400), term: 'lt', taxType: 'equity', termUnknown: true });
    const s = summariseYear(who, ledger().realised, R);
    expect(s.room.used).toBe(rs(2_400));
    expect(s.room.free).toBe(rs(1_22_600));
  });

  it('a sale takes the term-unknown units, not the held long-term ones, when the history starts within 13 months', () => {
    // History starts 10 Jan 2026 (5 bought); the file shows 30, 25 long-term. Long-term units are dated 22 Oct 2025.
    const txns = [{ ...tx('a', 'X', '2026-01-10', 'buy', 5, 500), ...acct }, { ...tx('a', 'X', '2026-06-01', 'sell', 8, 900), ...acct }];
    const out = effectiveTxns(txns, [{ ...file, ltQty: q(25) }], FILE);
    const l = buildLedger(out, [sec('X')], R);
    expect(l.realised).toMatchObject([{ qty: q(8), term: 'lt', termUnknown: true }]);
    expect(l.lots.get('a|X|Zerodha')!.map((x) => [x.qty, !!x.estimated])).toEqual([[q(25), false], [q(5), false]]);
  });

  it("answer term 'st' makes the gain short-term", () => {
    const answer: TermAnswer = { memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-04-10', term: 'st' };
    const [r] = ledger([answer]).realised;
    expect(r).toMatchObject({ term: 'st', gain: rs(2_400) });
    expect(r!.termUnknown).toBeUndefined();
    // Room rises by the gain: ₹1,22,600 → ₹1,25,000. Tax: ₹2,400 × 20% = ₹480, plus 4% cess = ₹499.20, rounded ₹499.
    const s = summariseYear(who, ledger([answer]).realised, R);
    expect(s.room.free).toBe(rs(1_25_000));
    expect(s.stNet).toBe(rs(2_400));
    expect(s.tax).toBe(rs(499));
    // An answer for another sale date changes nothing.
    expect(ledger([{ ...answer, sellDate: '2026-04-11' }]).realised[0]).toMatchObject({ term: 'lt', termUnknown: true });
  });

  it('an answer matches its account whatever the case and spaces, and only its own member and share', () => {
    const answer: TermAnswer = { memberId: 'a', account: ' zerodha ', isin: 'X', sellDate: '2026-04-10', term: 'st' };
    expect(ledger([answer]).realised[0]).toMatchObject({ term: 'st' });
    expect(ledger([answer]).realised[0]!.termUnknown).toBeUndefined();
    expect(ledger([{ ...answer, memberId: 'b' }]).realised[0]).toMatchObject({ term: 'lt', termUnknown: true });
    expect(ledger([{ ...answer, isin: 'Y' }]).realised[0]).toMatchObject({ term: 'lt', termUnknown: true });
    expect(ledger([{ ...answer, account: 'Groww' }]).realised[0]).toMatchObject({ term: 'lt', termUnknown: true });
  });

  it('a malformed answer (no account, no term) is ignored, never a crash', () => {
    const noAccount = { memberId: 'a', isin: 'X', sellDate: '2026-04-10', term: 'st' } as unknown as TermAnswer;
    const noTerm = { memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-04-10' } as TermAnswer;
    expect(ledger([noAccount, noTerm]).realised[0]).toMatchObject({ term: 'lt', termUnknown: true });
    const state: FamilyState = { members: [who], securities: [sec('X')], txns: history(), positions: [file], termAnswers: [noAccount] };
    expect(computeFamily(state, FILE, R).members[0]!.year.room.free).toBe(rs(1_22_600));
  });

  it('a planned sale from a guessed lot at a gain uses long-term room', () => {
    // A guessed lot: 10 units at ₹500, dated 1 Mar 2026 (under 12 months before today). The price is ₹900, so a
    // planned sale of all 10 gains ₹4,000. Its buy date is unknown: the gain counts long-term, so room falls
    // ₹1,25,000 → ₹1,21,000 (inside the exemption). By the guessed date it would read short-term and leave the room
    // at ₹1,25,000, more than the truth may allow. The tax shown is the higher of the two treatments: short-term,
    // 20% × ₹4,000 = ₹800 plus 4% cess = ₹832 (long-term would be ₹0).
    const guess: Txn = { ...tx('a', 'G', '2026-03-01', 'buy', 10, 500), estimated: true };
    const fam = computeFamily({
      members: [who], securities: [sec('G', { price: rs(900) })], txns: [guess], plannedSales: [{ id: 'p1', memberId: 'a', isin: 'G', qty: q(10) }],
    }, FILE, R);
    expect(fam.plannedRealised).toMatchObject([{ gain: rs(4_000), term: 'lt', termUnknown: true }]);
    const v = fam.members[0]!;
    expect(v.plan.room.free).toBe(rs(1_21_000));
    expect(v.planned).toMatchObject({ gain: rs(4_000), tax: rs(832), roomUsed: rs(4_000) });
  });

  it('answer buyDate: the term comes from the holding period', () => {
    const at = (buyDate: string) => ledger([{ memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-04-10', buyDate }]).realised[0]!;
    expect(at('2025-03-01')).toMatchObject({ term: 'lt', buyDate: '2025-03-01' });
    expect(at('2025-09-01')).toMatchObject({ term: 'st', buyDate: '2025-09-01' });
    expect(at('2025-09-01').termUnknown).toBeUndefined();
  });

  it('a fund guessed lot (no long-term count) is term unknown too', () => {
    // A fund statement with no long-term count: one guessed lot of 30 at ₹600. A sale of 8 at ₹500 after the file: a loss.
    const fund = { ...file, ltQty: undefined };
    const sell = { ...tx('a', 'X', '2026-11-25', 'sell', 8, 500), ...acct };
    const out = effectiveTxns([sell], [fund], FILE);
    expect(out.find((t) => t.id.endsWith('|opening-est'))).toMatchObject({ estimated: true });
    expect(buildLedger(out, [sec('X')], R).realised[0]).toMatchObject({ gain: rs(-800), term: 'st', termUnknown: true });
  });

  it('a bonus lot (cost 0, guessed) sold later is term unknown', () => {
    // 10 bought at ₹1,000 in 2024; the file shows 20 at ₹500 (a 1:1 bonus, not a split: only 10 long-term). The 10 bonus
    // units come in at cost 0, dated the day before the history. A sale of 15 at ₹1,200 after the file takes them first.
    const old = { ...tx('a', 'X', '2024-01-10', 'buy', 10, 1000), ...acct };
    const bonus = { ...file, qty: q(20), ltQty: q(10), cost: rs(10_000) };
    const sell = { ...tx('a', 'X', '2026-11-25', 'sell', 15, 1200), ...acct };
    const r = buildLedger(effectiveTxns([old, sell], [bonus], FILE), [sec('X')], R).realised;
    expect(r[0]).toMatchObject({ qty: q(10), cost: 0, gain: rs(12_000), term: 'lt', termUnknown: true });
    expect(r[1]).toMatchObject({ qty: q(5), gain: rs(1_000), term: 'lt' });
    expect(r[1]!.termUnknown).toBeUndefined();
  });

  it('ELSS unknown-term is long-term', () => {
    const elss = sec('E', { listed: false, category: 'Equity Scheme - ELSS' });
    const guess: Txn = { ...tx('a', 'E', '2026-03-01', 'buy', 10, 100), estimated: true };
    const r = buildLedger([guess, tx('a', 'E', '2026-06-01', 'sell', 10, 80)], [elss], R).realised[0]!;
    // A ₹200 loss would count short-term for other shares; ELSS units are always past the 3-year lock-in.
    expect(r).toMatchObject({ gain: rs(-200), term: 'lt', taxType: 'equity', termUnknown: true });
  });

  it('a debt fund keeps slab rate', () => {
    const debt = sec('D', { taxType: 'slab', listed: false });
    const guess: Txn = { ...tx('a', 'D', '2024-01-01', 'buy', 100, 100), estimated: true };
    const r = buildLedger([guess, tx('a', 'D', '2026-06-01', 'sell', 100, 150)], [debt], R).realised[0]!;
    expect(r).toMatchObject({ gain: rs(5_000), taxType: 'slab', term: 'st', termUnknown: true });
    // The ₹5,000 is slab income, not long-term: room untouched. At ₹20 L income it falls in the 25% slab: ₹1,250 + 4% cess = ₹1,300.
    const s = summariseYear(who, [{ ...r, memberId: 'a' }], R);
    expect(s.room.free).toBe(rs(1_25_000));
    expect(s.buckets.slab).toBe(rs(5_000));
    expect(s.tax).toBe(rs(1_300));
    // A debt lot guessed before April 2023 keeps its own type: other long-term after 24 months.
    const old: Txn = { ...guess, id: 'old', date: '2023-01-01' };
    expect(buildLedger([old, tx('a', 'D', '2026-06-01', 'sell', 100, 150)], [debt], R).realised[0]).toMatchObject({ taxType: 'other_lt', term: 'lt' });
  });

  it('a covering broker Tax P&L wins over the unknown term and the answer', () => {
    // The broker says the ₹2,400 was short-term. Engine and answer both say long-term: the broker's totals win.
    const state = (termAnswers?: TermAnswer[]): FamilyState => ({
      members: [who], securities: [sec('X')], txns: history(), positions: [file], termAnswers,
      brokerSummaries: [{ memberId: 'a', account: 'Zerodha', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-11-20', equityShortTerm: rs(2_400), equityLongTerm: 0, mfShortTerm: null, mfLongTerm: null } }],
    });
    for (const answers of [undefined, [{ memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-04-10', term: 'lt' as const }]]) {
      const fam = computeFamily(state(answers), FILE, R);
      const y = fam.members[0]!.year;
      expect([y.stNet, y.ltNet, y.room.free]).toEqual([rs(2_400), 0, rs(1_25_000)]);
      expect(y.tax).toBe(rs(499));
    }
    // Without the P&L, the state's answer reaches the ledger.
    const st = computeFamily({ ...state([{ memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-04-10', term: 'st' }]), brokerSummaries: [] }, FILE, R);
    expect(st.members[0]!.year.room.free).toBe(rs(1_25_000));
    expect(computeFamily({ ...state(), brokerSummaries: [] }, FILE, R).members[0]!.year.room.free).toBe(rs(1_22_600));
  });
});
