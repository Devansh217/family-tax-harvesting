import { describe, expect, it } from 'vitest';
import { computeFamily } from './family';
import { APPROX_MARGIN, effectiveTxns, type HeldPosition } from './openingLots';
import { FY_2026_27 as R } from './rules';
import { QTY_SCALE, type Member, type Txn } from './types';

const q = (n: number) => Math.round(n * QTY_SCALE);
const rs = (n: number) => Math.round(n * 100);
const ASOF = '2026-11-22';
let seq = 0;
const trade = (side: 'buy' | 'sell', date: string, units: number, priceRs: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++seq}`, memberId: 'a', isin: 'X', date, side, qty: q(units), amount: rs(units * priceRs), source: 'Trade history · tb.xlsx', account: 'Zerodha', ...over,
});
const pos = (units: number, ltUnits: number | undefined, avgRs: number | undefined, over: Partial<HeldPosition> = {}): HeldPosition => ({
  memberId: 'a', isin: 'X', account: 'Zerodha', qty: q(units), ltQty: ltUnits == null ? undefined : q(ltUnits),
  cost: avgRs == null ? undefined : rs(units * avgRs), asOf: ASOF, source: 'Zerodha holdings', ...over,
});
const openings = (txns: Txn[]) => txns.filter((t) => t.id.includes('|opening-'));

describe('opening lots from the holdings file', () => {
  it('with no trade history, long-term units become a usable lot at average cost and the rest stay guessed', () => {
    const out = effectiveTxns([], [pos(100, 60, 500)], ASOF);
    const [lt, st] = openings(out);
    expect(lt).toMatchObject({ side: 'buy', qty: q(60), amount: rs(30_000), approx: true, account: 'Zerodha' });
    expect(lt!.estimated).toBeFalsy();
    expect(lt!.date <= '2025-10-22').toBe(true); // held more than 12 months
    expect(st).toMatchObject({ qty: q(40), amount: rs(20_000), estimated: true });
  });

  it('adds the units older than the tradebook when the stock also traded this year', () => {
    // Holds 35, 25 long-term; the tradebook only shows this year's buy of 10.
    const out = effectiveTxns([trade('buy', '2026-05-04', 10, 1500)], [pos(35, 25, 1200)], ASOF);
    const o = openings(out);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ qty: q(25), approx: true, amount: rs(25 * 1200) });
    expect(o[0]!.date < '2026-05-04').toBe(true);
  });

  it('counts this year’s sales of older units, so the sold units are long-term too', () => {
    const out = effectiveTxns([trade('sell', '2026-06-01', 20, 900)], [pos(30, 30, 600)], ASOF);
    expect(openings(out)).toMatchObject([{ qty: q(50), approx: true }]);
  });

  it('replaces a guessed opening lot saved at import for the same holding', () => {
    const guessed = trade('buy', '2025-10-22', 100, 500, { id: 'a|X|opening|imp1', estimated: true, source: 'Opening balance (estimated date)' });
    const out = effectiveTxns([guessed], [pos(100, 100, 500)], ASOF);
    expect(out.find((t) => t.id === guessed.id)).toBeUndefined();
    expect(openings(out)).toMatchObject([{ qty: q(100), approx: true }]);
  });

  it('leaves the history alone when the holdings file has no cost or no long-term units (mutual funds)', () => {
    const guessed = trade('buy', '2025-10-22', 100, 500, { estimated: true });
    expect(effectiveTxns([guessed], [pos(100, undefined, 500)], ASOF)).toEqual([guessed]);
    expect(effectiveTxns([guessed], [pos(100, 100, undefined)], ASOF)).toEqual([guessed]);
  });

  it('adds nothing when the tradebook already explains every unit', () => {
    const b = trade('buy', '2024-01-10', 35, 1000);
    expect(openings(effectiveTxns([b], [pos(35, 35, 1000)], ASOF))).toHaveLength(0);
  });

  it('ignores trades after the holdings file date', () => {
    const out = effectiveTxns([trade('buy', '2026-11-25', 10, 1500)], [pos(25, 25, 1000, { asOf: '2026-11-20' })], '2026-11-30');
    expect(openings(out)).toMatchObject([{ qty: q(25) }]);
  });

  it('drops Tax P&L exits for an account that also has tradebooks, so sales are not counted twice', () => {
    const tb = trade('sell', '2026-06-01', 10, 900);
    const pnlBuy = trade('buy', '2021-12-06', 10, 500, { source: 'Zerodha Tax P&L · 2026-04-01 to 2026-11-14' });
    const pnlSell = trade('sell', '2026-06-01', 10, 900, { source: 'Zerodha Tax P&L · 2026-04-01 to 2026-11-14' });
    expect(effectiveTxns([tb, pnlBuy, pnlSell], [], ASOF)).toEqual([tb]);
    // Without tradebooks for that account the exits are the only record and stay.
    const other = { ...pnlSell, account: 'Groww' };
    expect(effectiveTxns([tb, other], [], ASOF)).toEqual([tb, other]);
  });
});

describe('a demat CAS on top of broker files', () => {
  // As saved at import: a guessed lot per ISIN (id `member|isin|opening|importId`) and a position from the statement.
  const CAS_DATE = '2026-11-01';
  const casLot = (units: number, importId = 'cas1', over: Partial<Txn> = {}) => trade('buy', '2025-10-22', units, 500, {
    id: `a|X|opening|${importId}`, account: 'Demat (CAS)', estimated: true, source: 'Opening balance (estimated date)', ...over,
  });
  const casPos = (units: number, importId = 'cas1'): HeldPosition => ({
    memberId: 'a', isin: 'X', account: 'Demat (CAS)', qty: q(units), asOf: CAS_DATE, source: 'Demat CAS (NSDL / CDSL)', importId,
  });
  const casUnits = (txns: Txn[]) => txns.filter((t) => t.account === 'Demat (CAS)').reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0);
  const held = (txns: Txn[]) => txns.reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0);

  it('does not count shares again that the broker account already explains', () => {
    // Zerodha: 63 held (tradebook 15 this year + 48 older from the holdings file). The CAS lists the same 63.
    const out = effectiveTxns([trade('buy', '2026-05-04', 15, 1500), casLot(63)], [pos(63, 48, 1200), casPos(63)], ASOF);
    expect(casUnits(out)).toBe(0);
    expect(held(out)).toBe(q(63));
  });

  it('keeps the units only the CAS shows (shares at a second broker), at the saved cost', () => {
    const out = effectiveTxns([trade('buy', '2024-01-10', 40, 1000), casLot(100)], [casPos(100)], ASOF);
    expect(out.find((t) => t.account === 'Demat (CAS)')).toMatchObject({ qty: q(60), amount: rs(30_000), estimated: true });
  });

  it('compares with the other accounts on the statement date: later sales do not bring the units back', () => {
    const out = effectiveTxns([trade('buy', '2024-01-10', 63, 1000), trade('sell', '2026-11-10', 63, 1500), casLot(63)], [casPos(63)], ASOF);
    expect(casUnits(out)).toBe(0);
    expect(held(out)).toBe(0);
  });

  it('later buys at the broker do not take units from the second broker', () => {
    const out = effectiveTxns([trade('buy', '2024-01-10', 40, 1000), trade('buy', '2026-11-10', 30, 1500), casLot(100)], [casPos(100)], ASOF);
    expect(casUnits(out)).toBe(q(60));
  });

  it('counts other guessed lots as explained, so nothing is doubled', () => {
    const groww = trade('buy', '2025-10-22', 60, 500, { id: 'a|X|opening|g1', account: 'Groww', estimated: true, source: 'Opening balance (estimated date)' });
    const out = effectiveTxns([trade('buy', '2024-01-10', 40, 1000), groww, casLot(100)], [casPos(100)], ASOF);
    expect(casUnits(out)).toBe(0);
    expect(out).toContainEqual(groww);
    expect(held(out)).toBe(q(100));
  });

  it('leaves guessed lots from a single-broker file alone', () => {
    // Zerodha holds 50; a Groww holdings CSV says 100 there. Both are real.
    const groww = trade('buy', '2025-10-22', 100, 500, { id: 'a|X|opening|g1', account: 'Groww', estimated: true, source: 'Opening balance (estimated date)' });
    const out = effectiveTxns([trade('buy', '2024-01-10', 50, 1000), groww], [{ ...pos(100, undefined, 500), account: 'Groww', source: 'Holdings · groww.csv' }], ASOF);
    expect(out).toContainEqual(groww);
    expect(held(out)).toBe(q(150));
  });

  it('a newer CAS replaces the lots an older one saved', () => {
    const out = effectiveTxns([casLot(100, 'old'), casLot(100, 'new')], [casPos(100, 'new')], ASOF);
    expect(casUnits(out)).toBe(q(100));
  });

  it('fund units in a folio do not hide the units held in demat', () => {
    // A fund CAS shows 100 units in a folio; the demat CAS shows another 50 held in demat. Both are real.
    const folio = trade('buy', '2023-04-10', 100, 50, { account: 'Folio 123', source: 'Mutual fund CAS (CAMS / KFintech)' });
    const out = effectiveTxns([folio, casLot(50)], [casPos(50)], ASOF);
    expect(casUnits(out)).toBe(q(50));
  });

  it('repairs shares from a combined CAS saved before demat rows were marked', () => {
    const S = { isin: 'INE009A01021' };
    const old = { ...casPos(63), ...S, source: 'Combined CAS' };
    const out = effectiveTxns([trade('buy', '2024-01-10', 63, 1000, S), casLot(63, 'cas1', S)], [old], ASOF);
    expect(casUnits(out)).toBe(0);
  });

  it('leaves a CAS lot alone when nothing else holds that security', () => {
    const out = effectiveTxns([casLot(10)], [casPos(10)], ASOF);
    expect(casUnits(out)).toBe(q(10));
  });
});

describe('moves on lots from the holdings file', () => {
  const me: Member = { id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] };
  const sec = { isin: 'X', name: 'X Ltd', taxType: 'equity' as const, listed: true, price: rs(2000) };

  it('harvests them, keeping a cushion in the room because the cost is an average', () => {
    const fam = computeFamily({ members: [me], securities: [sec], txns: [], positions: [pos(500, 500, 1000)] }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m).toMatchObject({ approx: true });
    expect(m.kind === 'harvest_gain' && m.gain * (1 + APPROX_MARGIN)).toBeLessThanOrEqual(rs(1_25_000));
    expect(m.kind === 'harvest_gain' && m.gain).toBeGreaterThan(rs(1_10_000));
    expect(m.reasons.join(' ')).toMatch(/average cost/);
    expect(fam.totals.uncertainLots).toBe(0);
  });

  it('a second holding cannot use the cushion', () => {
    const y = { ...sec, isin: 'Y', name: 'Y Ltd' };
    const fam = computeFamily({ members: [me], securities: [sec, y], txns: [], positions: [pos(500, 500, 1000), pos(500, 500, 1000, { isin: 'Y' })] }, ASOF, R);
    const used = fam.moves.filter((x) => x.kind === 'harvest_gain').reduce((a, x) => a + (x.kind === 'harvest_gain' ? x.gain : 0), 0);
    expect(used * (1 + APPROX_MARGIN)).toBeLessThanOrEqual(rs(1_25_000) + 100);
  });

  it('exact lots from a full tradebook still use the whole room', () => {
    const fam = computeFamily({ members: [me], securities: [sec], txns: [trade('buy', '2023-01-01', 500, 1000)], positions: [pos(500, 500, 1000)] }, ASOF, R);
    const m = fam.moves.find((x) => x.kind === 'harvest_gain')!;
    expect(m).toMatchObject({ gain: rs(1_25_000) });
    expect(m.approx).toBeFalsy();
  });
});
