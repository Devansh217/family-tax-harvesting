import { describe, expect, it } from 'vitest';
import { computeFamily, type DatedMove, type Move } from './family';
import { statusRecord, type RecommendationRecord } from './records';
import { FY_2026_27 as R } from './rules';
import { seasonSummary } from './seasonSummary';
import { QTY_SCALE, type Member, type Security, type Txn } from './types';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
let seq = 0;
const buy = (memberId: string, isin: string, date: string, units: number, priceRs: number): Txn => ({
  id: `b${++seq}`, memberId, isin, date, side: 'buy', qty: q(units), amount: rs(units * priceRs), source: 'test',
});
const sell = (memberId: string, isin: string, date: string, units: number, priceRs: number): Txn => ({
  id: `s${++seq}`, memberId, isin, date, side: 'sell', qty: q(units), amount: rs(units * priceRs), source: 'test',
});
const person = (id: string, over: Partial<Member> = {}): Member => ({
  id, name: id, relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: rs(20_00_000), from: 'manual' as const }], ...over,
});
const X: Security = { isin: 'X', name: 'X Ltd', taxType: 'equity', listed: true, price: rs(2000) };
const ASOF = '2027-02-15';
const START = '2027-02-01';
const noState = { recommendations: [] as RecommendationRecord[], datedMoves: [] as DatedMove[], imports: [] as { date: string }[] };
const fam = (txns: Txn[], over: Partial<Parameters<typeof computeFamily>[0]> = {}, asOf = ASOF) =>
  computeFamily({ members: [person('a')], securities: [X], txns, ...over }, asOf, R);
// 100 shares bought at 1000, price 2000 each: ₹1,00,000 gain; a 50-share lot gives ₹50,000.
const holding = (units: number) => buy('a', 'X', '2023-01-01', units, 1000);

describe('seasonSummary: usable room', () => {
  it('room and harvestable gain: usable is the smaller, nothing used', () => {
    const s = seasonSummary(fam([holding(50)]), noState, ASOF, START);
    expect(s.usable).toBe(rs(50_000));
    expect(s.used).toBe(0);
    expect(s.roomLeft).toBeGreaterThanOrEqual(rs(1_25_000));
  });

  it('a Rs 30,000 LT sale inside the season is used, and usable counts it plus what is left', () => {
    // 80 shares at 1000, sell 30 at 2000 on 10 Feb => 30,000 gain realised; 50 left => 50,000 harvestable.
    const s = seasonSummary(fam([holding(80), sell('a', 'X', '2027-02-10', 30, 2000)]), noState, ASOF, START);
    expect(s.used).toBe(rs(30_000));
    expect(s.usable).toBe(rs(80_000));
  });

  it('a member with no equity adds 0 to both', () => {
    const f = fam([holding(50)], { members: [person('a'), person('b')] });
    const s = seasonSummary(f, noState, ASOF, START);
    expect(s.usable).toBe(rs(50_000));
    expect(s.used).toBe(0);
  });

  it('a sale before season start is not used', () => {
    const s = seasonSummary(fam([holding(80), sell('a', 'X', '2027-01-20', 30, 2000)]), noState, ASOF, START);
    expect(s.used).toBe(0);
    expect(s.usable).toBe(rs(50_000));
  });

  it('used is capped by room left once earlier gains had eaten the room (min with fullRoom - gainBefore)', () => {
    // Full room is 1.25 L plus the nil band. A pre-season gain close to full room leaves little for the season.
    const probe = seasonSummary(fam([holding(10)]), noState, ASOF, START);
    const full = probe.roomLeft; // nothing realised: roomLeft = full room
    const preGainRs = Math.floor(full / 100) - 10_000; // leaves Rs 10,000 of room
    const units = preGainRs / 1000 + 20 + 10; // big lot: pre-season sale, season sale of 20 shares (Rs 20,000 gain)
    const f = fam([buy('a', 'X', '2023-01-01', units, 1000), sell('a', 'X', '2027-01-10', preGainRs / 1000, 2000), sell('a', 'X', '2027-02-10', 20, 2000)]);
    const s = seasonSummary(f, noState, ASOF, START);
    expect(s.used).toBe(rs(10_000));
  });

  it('left is capped by room free now', () => {
    // 2000 shares => Rs 20 L harvestable, room is far smaller.
    const f = fam([holding(2000)]);
    const s = seasonSummary(f, noState, ASOF, START);
    expect(s.usable).toBe(s.roomLeft);
  });

  it('ignores short-term, uncertain and locked lots when sizing harvestable gain', () => {
    const elss: Security = { isin: 'E', name: 'Axis ELSS Tax Saver', taxType: 'equity', listed: false, price: rs(2000), category: 'ELSS' } as Security;
    const f = fam([
      buy('a', 'X', '2027-01-01', 50, 1000), // short-term
      { ...buy('a', 'X', '2023-01-01', 50, 1000), estimated: true }, // uncertain
      buy('a', 'E', '2025-06-01', 50, 1000), // locked until 2028
    ], { securities: [X, elss] });
    const s = seasonSummary(f, noState, ASOF, START);
    expect(s.usable).toBe(0);
  });
});

const mv = (id: string, over: Record<string, unknown> = {}): Move =>
  ({ id, kind: 'harvest_gain', memberId: 'a', isin: 'X', name: 'X', account: 'Z', qty: 1, value: 0, taxAvoided: 0, costs: 0, saving: 0, reasons: [], gain: 1, ...over }) as Move;
const withMoves = (moves: Move[]) => ({ ...fam([holding(50)]), moves });
const T = 'FY 2026-27';

describe('seasonSummary: counts', () => {
  it('movesWaiting excludes wait, noRoom and done moves; nextDate is the earliest waiting date on or after asOf', () => {
    const view = withMoves([
      mv(`${T}|h|1`, { date: '2027-03-01' }), mv(`${T}|h|2`, { date: '2027-02-20' }), mv(`${T}|h|3`, { date: '2027-02-10' }),
      mv(`${T}|h|4`, { noRoom: true, date: '2027-02-16' }), mv(`${T}|w|5`, { kind: 'wait' }), mv(`${T}|h|6`, { date: '2027-02-17' }), mv(`${T}|h|7`),
    ]);
    const recs = [statusRecord(view.moves[5]!, 'done', '2027-02-14T00:00:00Z')];
    const s = seasonSummary(view, { ...noState, recommendations: recs }, ASOF, START);
    expect(s.movesWaiting).toBe(4); // 1, 2, 3, 7
    expect(s.nextDate).toBe('2027-02-20'); // 3 is in the past
  });

  it('nextDate is null with no waiting dated move', () => {
    expect(seasonSummary(withMoves([mv(`${T}|h|1`)]), noState, ASOF, START).nextDate).toBeNull();
  });

  it('shown, dated, done, detected and doneSinceWeek', () => {
    const view = withMoves([mv(`${T}|h|1`), mv(`${T}|h|2`), mv(`${T}|h|3`), mv('FY 2025-26|h|old')]);
    const [a, b, c, old] = view.moves as [Move, Move, Move, Move];
    const recs: RecommendationRecord[] = [
      statusRecord(a, 'shown', '2027-02-01T00:00:00Z'), statusRecord(a, 'shown', '2027-02-02T00:00:00Z'),
      statusRecord(b, 'shown', '2027-02-01T00:00:00Z'), statusRecord(old, 'shown', '2027-02-01T00:00:00Z'),
      statusRecord(a, 'done', '2027-02-12T00:00:00Z'), // inside the week
      statusRecord(b, 'detected_done', '2027-02-08T00:00:00Z'), // exactly 7 days before asOf: outside
      statusRecord(c, 'detected_done', '2027-02-09T00:00:00Z'), // inside
    ];
    const dated = [{ moveId: a.id, date: '2027-02-20' }, { moveId: b.id, date: '2027-02-20' }, { moveId: c.id, date: '2027-02-21' }, { moveId: c.id, date: '2027-02-22' }];
    const s = seasonSummary(view, { recommendations: recs, datedMoves: dated, imports: [] }, ASOF, START);
    expect(s.shown).toBe(2);
    expect(s.dated).toBe(1); // b and c are retired by a detected done; only a is left
    expect(s.done).toBe(1);
    expect(s.detected).toBe(2);
    expect(s.doneSinceWeek).toBe(2); // a (12 Feb) and c (9 Feb)
  });

  it('lastImport is the latest import date, null with none', () => {
    const v = fam([holding(1)]);
    expect(seasonSummary(v, noState, ASOF, START).lastImport).toBeNull();
    expect(seasonSummary(v, { ...noState, imports: [{ date: '2027-01-05' }, { date: '2027-02-03' }, { date: '2027-01-30' }] }, ASOF, START).lastImport).toBe('2027-02-03');
  });

  it('taxableGainsBooked is true when any member owes tax on gains this year', () => {
    expect(seasonSummary(fam([holding(50)]), noState, ASOF, START).taxableGainsBooked).toBe(false);
    // Rs 5 L LT gain booked, past the Rs 1.25 L exemption.
    const f = fam([holding(500), sell('a', 'X', '2027-02-10', 500, 2000)]);
    expect(seasonSummary(f, noState, ASOF, START).taxableGainsBooked).toBe(true);
  });
});
