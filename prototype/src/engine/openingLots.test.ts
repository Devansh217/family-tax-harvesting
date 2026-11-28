import { describe, expect, it } from 'vitest';
import { computeFamily } from './family';
import { buildLedger, splitIntraday } from './ledger';
import { APPROX_MARGIN, decidingFiles, effectiveTxns, effectiveTxnsWithNotes, normAccount, type HeldPosition } from './openingLots';
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
    // The file's ₹42,000 (35 × ₹1,200) less the ₹15,000 the tradebook lot still holds: ₹27,000 for the older 25, so
    // held cost never exceeds the file's.
    const out = effectiveTxns([trade('buy', '2026-05-04', 10, 1500)], [pos(35, 25, 1200)], ASOF);
    const o = openings(out);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ qty: q(25), approx: true, amount: rs(27_000) });
    expect(o[0]!.date < '2026-05-04').toBe(true);
  });

  it('counts this year’s sales of older units in their own term-unknown lot, ahead of the held long-term units', () => {
    const out = effectiveTxns([trade('sell', '2026-06-01', 20, 900)], [pos(30, 30, 600)], ASOF);
    expect(openings(out)).toMatchObject([
      { id: 'a|X|Zerodha|opening-sold', qty: q(20), amount: rs(12_000), approx: true, estimated: true },
      { id: 'a|X|Zerodha|opening-lt', qty: q(30), amount: rs(18_000), approx: true },
    ]);
    expect(openings(out)[1]!.estimated).toBeFalsy();
  });

  it('replaces a guessed opening lot saved at import for the same holding', () => {
    const guessed = trade('buy', '2025-10-22', 100, 500, { id: 'a|X|opening|imp1', estimated: true, source: 'Opening balance (estimated date)' });
    const out = effectiveTxns([guessed], [pos(100, 100, 500)], ASOF);
    expect(out.find((t) => t.id === guessed.id)).toBeUndefined();
    expect(openings(out)).toMatchObject([{ qty: q(100), approx: true }]);
  });

  it('fills in a guessed lot when the holdings file has no cost or no long-term units (mutual funds)', () => {
    const guessed = trade('buy', '2025-10-22', 100, 500, { estimated: true });
    const est = (out: Txn[]) => { expect(out.find((t) => t.id === guessed.id)).toBeUndefined(); return openings(out); };
    expect(est(effectiveTxns([guessed], [pos(100, undefined, 500)], ASOF))).toMatchObject([{ id: 'a|X|Zerodha|opening-est', qty: q(100), amount: rs(50_000), estimated: true }]);
    // No cost in the file: priced at the latest price, as the import's guessed lot was.
    const secs = [{ isin: 'X', price: rs(500) }];
    expect(est(effectiveTxns([guessed], [pos(100, 100, undefined)], ASOF, secs))).toMatchObject([{ id: 'a|X|Zerodha|opening-est', qty: q(100), amount: rs(50_000), estimated: true }]);
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

  describe('a generic Tax P&L (any broker)', () => {
    const SRC = 'Tax P&L · Angel One · 2026-04-01 to 2027-03-31';
    const tb = trade('sell', '2026-06-01', 10, 900);

    it('generic Tax P&L exits are dropped beside a tradebook', () => {
      const buy = trade('buy', '2021-12-06', 10, 500, { source: SRC });
      const sell = trade('sell', '2026-06-01', 10, 900, { source: SRC });
      expect(effectiveTxns([tb, buy, sell], [], ASOF)).toEqual([tb]);
    });

    it('buyback sells are kept', () => {
      const sell = trade('sell', '2026-07-01', 5, 1200, { source: SRC, buyback: true });
      expect(effectiveTxns([tb, sell], [], ASOF)).toContainEqual(sell);
    });

    it('kept when the account has no tradebook', () => {
      const sell = trade('sell', '2026-06-01', 10, 900, { source: SRC, account: 'Angel' });
      expect(effectiveTxns([tb, sell], [], ASOF)).toEqual([tb, sell]);
    });

    it('a fund capital gains report is not a Tax P&L and is kept beside a tradebook', () => {
      const sell = trade('sell', '2026-06-01', 10, 900, { source: 'Fund capital gains · Angel One · 2026-04-01 to 2027-03-31' });
      expect(effectiveTxns([tb, sell], [], ASOF)).toEqual([tb, sell]);
    });
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

  it('an Angel One fund statement is a snapshot the CAS folios explain', () => {
    const angelLot = (units: number) => trade('buy', '2025-10-22', units, 50, { id: `a|X|opening|ang1`, account: 'Angel One', estimated: true, source: 'Opening balance (estimated date)' });
    const angelPos = (units: number): HeldPosition => ({ memberId: 'a', isin: 'X', account: 'Angel One', qty: q(units), asOf: CAS_DATE, source: 'Angel One fund holdings', importId: 'ang1' });
    const folio = (units: number) => trade('buy', '2023-04-10', units, 40, { account: 'Folio 1881', source: 'Mutual fund CAS (CAMS / KFintech)' });
    const angelUnits = (txns: Txn[]) => txns.filter((t) => t.account === 'Angel One').reduce((a, t) => a + t.qty, 0);
    expect(angelUnits(effectiveTxns([folio(100), angelLot(100)], [angelPos(100)], ASOF))).toBe(0);
    expect(angelUnits(effectiveTxns([folio(40), angelLot(100)], [angelPos(100)], ASOF))).toBe(q(60));
    // Units of the same fund on another platform (Zerodha Coin, in demat) are not the Angel folios' units.
    const coin = trade('buy', '2023-04-10', 100, 40, { account: 'Zerodha', source: 'Trade history · coin.xlsx' });
    expect(angelUnits(effectiveTxns([coin, angelLot(50)], [angelPos(50)], ASOF))).toBe(q(50));
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

describe('the newest holdings file trims units that left the account', () => {
  // A dated, fully read Zerodha holdings file: it may trim.
  const file = (units: number, over: Partial<HeldPosition> = {}) => pos(units, units, 1000, { canTrim: true, importId: 'h1', ...over });
  const left = (txns: Txn[]) => txns.filter((t) => t.left);
  const ledgerOf = (txns: Txn[]) => buildLedger(txns, [{ isin: 'X', name: 'X', taxType: 'equity', listed: true }]);
  const heldX = (txns: Txn[]) => (ledgerOf(txns).lots.get('a|X|Zerodha') ?? []).reduce((a, l) => a + l.qty, 0);

  it('trims units the newest file doesn\u2019t list', () => {
    const { txns, trimmed, staleFiles } = effectiveTxnsWithNotes([trade('buy', '2025-01-10', 10, 1000)], [file(0)], ASOF);
    expect(left(txns)).toEqual([{
      id: `a|X|Zerodha|left|${ASOF}`, memberId: 'a', isin: 'X', account: 'Zerodha', side: 'sell', left: true, qty: q(10), amount: 0, date: ASOF, source: 'Left the account',
    }]);
    const l = ledgerOf(txns);
    expect(l.lots.get('a|X|Zerodha') ?? []).toHaveLength(0);
    expect(l.realised).toHaveLength(0);
    expect(l.warnings).toHaveLength(0);
    expect(trimmed).toEqual([{ memberId: 'a', account: 'Zerodha', asOf: ASOF, isins: ['X'] }]);
    expect(staleFiles).toEqual([]);
  });

  it('removes the oldest units first and keeps the newest', () => {
    // The file's cost matches the newest 5 (₹7,500), so nothing is capped.
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 500), trade('buy', '2026-05-04', 5, 1500)], [file(5, { cost: rs(7_500) })], ASOF);
    expect(left(txns)).toMatchObject([{ qty: q(10) }]);
    expect(ledgerOf(txns).lots.get('a|X|Zerodha')).toMatchObject([{ date: '2026-05-04', qty: q(5), cost: rs(7_500) }]);
  });

  it('never trims buys from the 3 days up to the file date: the full count comes from older units, oldest first', () => {
    // 10 shares held since Jan 2025, 5 more bought on 19, 21 or 22 Nov 2026 (up to 3 days before the 22 Nov file);
    // the file lists 10. 15 − 10 = 5 trimmed, all from the old lot: the recent 5 stay held.
    const recent = (date: string, file10 = 10, oldUnits = 10) =>
      effectiveTxnsWithNotes([trade('buy', '2025-01-10', oldUnits, 1000), trade('buy', date, 5, 1000)], [file(file10)], ASOF);
    for (const date of ['2026-11-19', '2026-11-21', ASOF]) {
      const { txns } = recent(date);
      expect(left(txns)).toMatchObject([{ qty: q(5) }]);
      expect(ledgerOf(txns).lots.get('a|X|Zerodha')).toMatchObject([{ date: '2025-01-10', qty: q(5) }, { date, qty: q(5) }]);
    }
    // Older units can't cover the count: 3 old + 5 recent, file lists 0. Only the 3 old go; the recent 5 stay.
    const short = recent('2026-11-21', 0, 3);
    expect(left(short.txns)).toMatchObject([{ qty: q(3) }]);
    expect(heldX(short.txns)).toBe(q(5));
    // Bought 4 days before: settled, so it can be trimmed: all 8 go.
    expect(left(recent('2026-11-18', 0, 3).txns)).toMatchObject([{ qty: q(8) }]);
  });

  it('a file that already lists the recent buy trims every old unit that left: no move on shares not held', () => {
    // 10 bought 10 Jan 2025 at ₹1,000 left the account off the history; 5 bought 21 Nov 2026 at ₹3,000. The 22 Nov
    // file lists the 5 (cost ₹15,000). All 10 old units are trimmed; held = the 5 recent, short-term, so no harvest.
    const txns = [trade('buy', '2025-01-10', 10, 1000), trade('buy', '2026-11-21', 5, 3000)];
    const held = file(5, { ltQty: 0, cost: rs(15_000) });
    const out = effectiveTxnsWithNotes(txns, [held], ASOF);
    expect(left(out.txns)).toMatchObject([{ qty: q(10) }]);
    expect(ledgerOf(out.txns).lots.get('a|X|Zerodha')).toMatchObject([{ date: '2026-11-21', qty: q(5), cost: rs(15_000) }]);
    const me: Member = { id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] };
    const fam = computeFamily({ members: [me], securities: [{ isin: 'X', name: 'X', taxType: 'equity', listed: true, price: rs(3000) }], txns, positions: [held] }, ASOF, R);
    expect(fam.moves.filter((m) => m.kind === 'harvest_gain')).toEqual([]);
  });

  it('an ISIN missing from the newest file is held at 0, even if an older file listed it', () => {
    const older = file(10, { importId: 'h0', asOf: '2026-03-31' });
    const newer = file(5, { isin: 'Y', importId: 'h1' });
    const { txns, trimmed } = effectiveTxnsWithNotes([trade('buy', '2025-01-10', 10, 1000)], [older, newer], ASOF);
    expect(heldX(txns)).toBe(0);
    expect(trimmed).toMatchObject([{ isins: ['X'] }]);
  });

  it('never trims from a file older than the last trade in that account', () => {
    const trades = [trade('buy', '2025-01-10', 10, 1000), trade('buy', '2026-11-01', 1, 1000, { isin: 'Y' })];
    const { txns, trimmed, staleFiles } = effectiveTxnsWithNotes(trades, [file(0, { asOf: '2026-10-31' })], ASOF);
    expect(left(txns)).toHaveLength(0);
    expect(trimmed).toEqual([]);
    expect(staleFiles).toEqual([{ memberId: 'a', account: 'Zerodha', asOf: '2026-10-31' }]);
  });

  it('a Tax P&L exit after the file date does not make it stale', () => {
    const pnl = trade('sell', '2026-11-20', 1, 900, { isin: 'Y', source: 'Zerodha Tax P&L · 2026-04-01 to 2026-11-20' });
    const { txns, staleFiles } = effectiveTxnsWithNotes([trade('buy', '2025-01-10', 10, 1000), pnl], [file(0, { asOf: '2026-11-15' })], ASOF);
    expect(staleFiles).toEqual([]);
    expect(left(txns)).toMatchObject([{ qty: q(10) }]);
  });

  it('never trims when canTrim is false or the account label is blank', () => {
    const b = trade('buy', '2025-01-10', 10, 1000);
    expect(left(effectiveTxns([b], [file(0, { canTrim: false })], ASOF))).toHaveLength(0);
    expect(left(effectiveTxns([b], [{ ...file(0), canTrim: undefined }], ASOF))).toHaveLength(0);
    const blank = { ...b, account: '' };
    expect(left(effectiveTxns([blank], [file(0, { account: '  ' })], ASOF))).toHaveLength(0);
    expect(left(effectiveTxns([blank], [file(0, { account: undefined })], ASOF))).toHaveLength(0);
  });

  it('never trims from a file with no date', () => {
    expect(left(effectiveTxns([trade('buy', '2025-01-10', 10, 1000)], [file(0, { asOf: undefined })], ASOF))).toHaveLength(0);
  });

  it('" Zerodha " and "zerodha" match', () => {
    expect(normAccount(' Zerodha ')).toBe('zerodha');
    expect(normAccount(undefined)).toBe('');
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2025-01-10', 10, 1000, { account: 'zerodha' })], [file(0, { account: ' Zerodha ' })], ASOF);
    expect(left(txns)).toMatchObject([{ account: 'zerodha', qty: q(10) }]);
  });

  it('same asOf twice: the later importId decides, with no double fill-in', () => {
    const first = file(30, { importId: 'h1' });
    const second = file(20, { importId: 'h2' });
    const files = decidingFiles([first, second]);
    expect([...files.keys()]).toEqual(['a|zerodha']);
    expect(files.get('a|zerodha')).toMatchObject({ importId: 'h2', asOf: ASOF, canTrim: true, positions: [second] });
    const { txns } = effectiveTxnsWithNotes([], [first, second], ASOF);
    expect(openings(txns)).toMatchObject([{ qty: q(20) }]);
    expect(left(txns)).toHaveLength(0);
    expect(heldX(txns)).toBe(q(20));
  });

  it('the newest file decides whatever order the files came in', () => {
    const older = file(30, { importId: 'h1', asOf: '2026-03-31' });
    const newer = file(20, { importId: 'h0' });
    expect(decidingFiles([newer, older]).get('a|zerodha')).toMatchObject({ importId: 'h0' });
    expect(decidingFiles([older, newer]).get('a|zerodha')).toMatchObject({ importId: 'h0' });
  });

  it('only account-level holdings files decide', () => {
    expect(decidingFiles([{ ...file(10), source: 'Demat CAS (NSDL / CDSL)' }]).size).toBe(0);
  });

  it('a buy after the file date is not trimmed', () => {
    const trades = [trade('buy', '2025-01-10', 10, 1000), trade('buy', '2026-11-21', 5, 1200)];
    const { txns, staleFiles } = effectiveTxnsWithNotes(trades, [file(10, { asOf: '2026-11-20' })], ASOF);
    expect(left(txns)).toHaveLength(0);
    expect(staleFiles).toEqual([{ memberId: 'a', account: 'Zerodha', asOf: '2026-11-20' }]);
    expect(heldX(txns)).toBe(q(15));
  });

  it('a file labelled with other spaces or case fills nothing in for units the history explains', () => {
    // The tradebook lot (₹10,000) must survive, not be swapped for one at the file's ₹15,000 average.
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 1000, { account: 'zerodha' })], [pos(10, 10, 1500, { canTrim: true, importId: 'h1', account: ' Zerodha ' })], ASOF);
    expect(openings(txns)).toHaveLength(0);
    expect(left(txns)).toHaveLength(0);
    expect(ledgerOf(txns).lots.get('a|X|zerodha')).toMatchObject([{ date: '2024-01-10', qty: q(10), cost: rs(10_000) }]);
  });

  it('a label with more sold than bought does not keep units the file says are gone', () => {
    const trades = [trade('buy', '2024-01-10', 10, 1000), trade('sell', '2025-06-01', 3, 1200, { account: 'zerodha' })];
    const { txns } = effectiveTxnsWithNotes(trades, [file(0)], ASOF);
    expect(left(txns)).toMatchObject([{ account: 'Zerodha', qty: q(10) }]);
    expect(heldX(txns)).toBe(0);
  });

  it('counts the units filled in from the file before trimming', () => {
    // History explains 10 of the file's 30: 20 are filled in, nothing left over to trim.
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2026-05-04', 10, 1500)], [file(30)], ASOF);
    expect(left(txns)).toHaveLength(0);
    expect(heldX(txns)).toBe(q(30));
  });

  it('a left sell is never intraday', () => {
    const buy = trade('buy', ASOF, 10, 1000);
    const out = { ...trade('sell', ASOF, 10, 0), left: true as const, amount: 0 };
    const { delivery, intraday } = splitIntraday([buy, out]);
    expect(intraday).toHaveLength(0);
    expect(delivery).toHaveLength(2);
    expect(delivery).toEqual(expect.arrayContaining([buy, out]));
  });
});

describe('fill-in on every compute: cost never stacks', () => {
  const SEC = (isin: string) => ({ isin, name: isin, taxType: 'equity' as const, listed: true });
  const lotsOf = (txns: Txn[], isin = 'X', account = 'Zerodha') => buildLedger(txns, [SEC('X'), SEC('Y')]).lots.get(`a|${isin}|${account}`) ?? [];
  const heldQty = (txns: Txn[], isin = 'X') => lotsOf(txns, isin).reduce((a, l) => a + l.qty, 0);
  const heldCost = (txns: Txn[], isin = 'X') => lotsOf(txns, isin).reduce((a, l) => a + l.cost, 0);
  const file = (units: number, ltUnits: number | undefined, costRs: number | undefined, over: Partial<HeldPosition> = {}) =>
    pos(units, ltUnits, undefined, { canTrim: true, importId: 'imp1', ...(costRs == null ? {} : { cost: rs(costRs) }), ...over });
  const savedLot = (units: number, costRs: number, importId = 'imp1', isin = 'X') => trade('buy', '2025-10-22', units, costRs / units, {
    id: `a|${isin}|opening|${importId}`, isin, estimated: true, source: 'Opening balance (estimated date)',
  });

  // Fund: 12,000 units, ₹3,50,000 in the file; the tradebook explains 6,500 (4,000 × ₹25 + 2,500 × ₹26 = ₹1,65,000).
  const fundBuys = () => [trade('buy', '2026-05-04', 4_000, 25), trade('buy', '2026-08-01', 2_500, 26)];
  const fundFile = () => file(12_000, undefined, 3_50_000);

  it('fund holdings: order doesn’t matter', () => {
    const without = effectiveTxns(fundBuys(), [fundFile()], ASOF);
    const withSaved = effectiveTxns([savedLot(12_000, 3_50_000), ...fundBuys()], [fundFile()], ASOF);
    for (const out of [without, withSaved]) {
      expect(heldQty(out)).toBe(q(12_000));
      // ₹3,50,000 − ₹1,65,000 = ₹1,85,000 for the 5,500 units the history can't explain.
      expect(openings(out)).toEqual([expect.objectContaining({ id: 'a|X|Zerodha|opening-est', qty: q(5_500), amount: rs(1_85_000), estimated: true })]);
      expect(heldCost(out)).toBe(rs(3_50_000));
    }
  });

  it('the guessed lot saved at import by a holdings file is dropped at compute', () => {
    const out = effectiveTxns([savedLot(100, 5_000)], [file(100, undefined, 5_000)], ASOF);
    expect(out.find((t) => t.id === 'a|X|opening|imp1')).toBeUndefined();
    expect(heldQty(out)).toBe(q(100));
    // An older file's lot for a share the newest file doesn't list is dropped too: when the newest file may trim,
    // the share is held at 0; when it can't, the older file's units still fill in, once.
    const older = file(100, undefined, 5_000, { importId: 'imp0', asOf: '2026-03-31' });
    const newer = file(10, 10, 1_000, { isin: 'Y' });
    const trims = effectiveTxns([savedLot(100, 5_000, 'imp0')], [older, newer], ASOF);
    expect(trims.find((t) => t.id === 'a|X|opening|imp0')).toBeUndefined();
    expect(heldQty(trims)).toBe(0);
    const keeps = effectiveTxns([savedLot(100, 5_000, 'imp0')], [older, { ...newer, canTrim: false }], ASOF);
    expect(keeps.find((t) => t.id === 'a|X|opening|imp0')).toBeUndefined();
    expect(heldQty(keeps)).toBe(q(100));
    expect(heldCost(keeps)).toBe(rs(5_000));
  });

  it('a newer file that can\u2019t trim still lets an older file fill in what it doesn\u2019t list, but decides what it does list', () => {
    const older = [file(100, undefined, 5_000, { importId: 'imp0', asOf: '2026-03-31' }), file(30, 30, 3_000, { isin: 'Y', importId: 'imp0', asOf: '2026-03-31' })];
    const newer = file(10, 10, 1_000, { isin: 'Y', canTrim: false });
    const out = effectiveTxns([], [...older, newer], ASOF);
    expect(heldQty(out)).toBe(q(100));
    expect(heldQty(out, 'Y')).toBe(q(10));
  });

  it('two older files listing a share the non-trimming newest file omits fill it in once', () => {
    // Both older files show X 100 at ₹5,000; only the newest of them counts: 100 held at ₹5,000, not 200 at ₹10,000.
    const older = [file(100, 100, 5_000, { importId: 'i0', asOf: '2026-01-31' }), file(100, 100, 5_000, { importId: 'i1', asOf: '2026-03-31' })];
    const newer = file(10, 10, 1_000, { isin: 'Y', importId: 'i2', canTrim: false });
    for (const files of [[...older, newer], [older[1]!, older[0]!, newer]]) {
      const out = effectiveTxns([], files, ASOF);
      expect(heldQty(out)).toBe(q(100));
      expect(heldCost(out)).toBe(rs(5_000));
    }
  });

  it('two undated imports listing the same share fill it in once', () => {
    const undated = (importId: string) => file(100, 100, 5_000, { importId, asOf: undefined, canTrim: undefined });
    const out = effectiveTxns([], [undated('i0'), undated('i1')], ASOF);
    expect(heldQty(out)).toBe(q(100));
    expect(heldCost(out)).toBe(rs(5_000));
  });

  it('1:1 bonus on a holding still all short-term is not taken for a split', () => {
    // Bought 10 at ₹1,000 in March 2026; the file shows 20, none long-term, ₹10,000 in all. A split would show the same,
    // so the 10 new units take cost 0 and an unknown term rather than the March date.
    const { txns, corporateActions } = effectiveTxnsWithNotes([trade('buy', '2026-03-01', 10, 1000)], [file(20, 0, 10_000)], ASOF);
    expect(openings(txns)).toEqual([expect.objectContaining({ id: 'a|X|Zerodha|opening-ca', qty: q(10), amount: 0, estimated: true })]);
    expect(lotsOf(txns).filter((l) => !l.estimated)).toMatchObject([{ date: '2026-03-01', qty: q(10), cost: rs(10_000) }]);
    expect(corporateActions).toEqual([{ memberId: 'a', isin: 'X', account: 'Zerodha', kind: 'units' }]);
  });

  it('a demerger where the broker splits the cost: the parent\u2019s held cost is capped at the file\u2019s', () => {
    // Bought 10 X at ₹1,000. The file: X 10 at ₹7,000 in all, Y 10 at ₹3,000. X's lot keeps its date at ₹7,000.
    const files = [file(10, 10, 7_000), file(10, 10, 3_000, { isin: 'Y' })];
    const { txns, corporateActions } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 1000)], files, ASOF);
    expect(lotsOf(txns)).toMatchObject([{ date: '2024-01-10', qty: q(10), cost: rs(7_000) }]);
    expect(heldCost(txns, 'Y')).toBe(rs(3_000));
    expect(corporateActions).toContainEqual({ memberId: 'a', isin: 'X', account: 'Zerodha', kind: 'cost' });
  });

  it('a consolidation whose cost is just under the history\u2019s is capped at the file\u2019s', () => {
    // 50 at ₹200 (₹10,000); the file shows 10 at ₹9,950 in all, within 1%: one lot of 10 at ₹9,950.
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 50, 200)], [file(10, 10, 9_950)], ASOF);
    expect(lotsOf(txns)).toMatchObject([{ date: '2024-01-10', qty: q(10), cost: rs(9_950) }]);
  });

  it('a holdings file with no date (saved before files were dated) still fills in, dated today, and never trims', () => {
    const undated = file(100, undefined, 5_000, { asOf: undefined, canTrim: undefined });
    const out = effectiveTxnsWithNotes([savedLot(100, 5_000), trade('buy', '2026-06-01', 40, 60)], [undated], ASOF);
    expect(out.txns.find((t) => t.id === 'a|X|opening|imp1')).toBeUndefined();
    expect(heldQty(out.txns)).toBe(q(100));
    expect(openings(out.txns)).toMatchObject([{ qty: q(60), amount: rs(2_600), estimated: true }]);
    expect(out.txns.filter((t) => t.left)).toHaveLength(0);
    // With no history, the units are all kept.
    expect(heldQty(effectiveTxns([savedLot(100, 5_000)], [undated], ASOF))).toBe(q(100));
  });

  it('fill-in lots use the history’s account label, so one account is one queue', () => {
    const out = effectiveTxns([trade('buy', '2026-05-04', 10, 1500, { account: 'zerodha' })], [file(35, 25, 42_000)], ASOF);
    expect(openings(out)).toMatchObject([{ id: 'a|X|zerodha|opening-lt', account: 'zerodha', qty: q(25) }]);
    expect(heldQty(out)).toBe(0);
    expect(lotsOf(out, 'X', 'zerodha').reduce((a, l) => a + l.qty, 0)).toBe(q(35));
  });

  it('1:1 bonus: held cost stays ₹10,000, the 10 extra units cost 0 and are guessed', () => {
    const { txns, corporateActions } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 1000)], [file(20, 10, 10_000)], ASOF);
    expect(openings(txns)).toEqual([expect.objectContaining({ id: 'a|X|Zerodha|opening-ca', qty: q(10), amount: 0, estimated: true })]);
    expect(heldQty(txns)).toBe(q(20));
    expect(heldCost(txns)).toBe(rs(10_000));
    expect(corporateActions).toEqual([{ memberId: 'a', isin: 'X', account: 'Zerodha', kind: 'units' }]);
  });

  it('1:5 split: one lot of 50 units at ₹10,000, original date, nothing filled in', () => {
    const { txns, corporateActions } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 1000)], [file(50, 50, 10_000)], ASOF);
    expect(corporateActions).toEqual([{ memberId: 'a', isin: 'X', account: 'Zerodha', kind: 'units' }]);
    expect(openings(txns)).toHaveLength(0);
    expect(txns.filter((t) => t.left)).toHaveLength(0);
    expect(lotsOf(txns)).toMatchObject([{ date: '2024-01-10', qty: q(50), cost: rs(10_000) }]);
  });

  it('a split ratio over buys on different dates is not rescaled: the share goes the corporate-action way, no moves', () => {
    // 100 bought Jun 2023 for ₹1,00,000; an unrecorded 1:5 split in Jan 2025 (500 at ₹200); 100 more bought Feb 2025
    // for ₹20,000. The 20 Nov 2026 file shows 600, all long-term, ₹1,20,000. History 200 units at ₹1,20,000 looks like a
    // 1:3 split, which would give 300 at ₹1,00,000 and 300 at ₹20,000: at ₹1,000 a move of 187 units would count about
    // ₹1,24,700 of gain (₹666.67 a unit) while the broker's first in, first out books 187 × ₹800 = ₹1,49,600: ₹24,900
    // past the room, about ₹3,200 of tax (12.5% plus 4% cess).
    // The held units don't come from one buy date, so nothing is rescaled and the share gets no moves.
    const trades = [trade('buy', '2023-06-01', 100, 1000), trade('buy', '2025-02-01', 100, 200)];
    const f = file(600, 600, 1_20_000, { asOf: '2026-11-20' });
    const { txns, corporateActions } = effectiveTxnsWithNotes(trades, [f], ASOF);
    expect(corporateActions).toEqual([{ memberId: 'a', isin: 'X', account: 'Zerodha', kind: 'units' }]);
    expect(heldQty(txns)).toBe(q(600));
    expect(heldCost(txns)).toBeLessThanOrEqual(rs(1_20_000));
    expect(lotsOf(txns).every((l) => l.estimated)).toBe(true);
    const me: Member = { id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] };
    const fam = computeFamily({ members: [me], securities: [{ isin: 'X', name: 'X', taxType: 'equity', listed: true, price: rs(1000) }], txns: trades, positions: [f] }, ASOF, R);
    expect(fam.moves.filter((m) => m.isin === 'X' && m.kind !== 'wait')).toEqual([]);
  });

  it('5:1 consolidation: one lot of 10 units at ₹10,000, nothing trimmed', () => {
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 50, 200)], [file(10, 10, 10_050)], ASOF);
    expect(openings(txns)).toHaveLength(0);
    expect(txns.filter((t) => t.left)).toHaveLength(0);
    expect(lotsOf(txns)).toMatchObject([{ date: '2024-01-10', qty: q(10), cost: rs(10_000) }]);
  });

  it('units moved out with the same count ratio but a different cost are not a split', () => {
    // 50 held at ₹200, the file lists 10 at ₹2,000 in all: 40 left the account, they weren't consolidated.
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 50, 200)], [file(10, 10, 2_000)], ASOF);
    expect(heldQty(txns)).toBe(q(10));
    expect(lotsOf(txns)).toMatchObject([{ date: '2024-01-10', qty: q(10), cost: rs(2_000) }]);
  });

  it('a demerger credit: the new share takes cost 0, term unknown, with a note', () => {
    const files = [file(10, 10, 10_000), file(10, 0, 0, { isin: 'Y' })];
    const { txns, corporateActions } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 1000)], files, ASOF);
    expect(openings(txns)).toEqual([expect.objectContaining({ id: 'a|Y|Zerodha|opening-ca', isin: 'Y', qty: q(10), amount: 0, estimated: true })]);
    expect(txns.filter((t) => t.left)).toHaveLength(0);
    expect(lotsOf(txns)).toMatchObject([{ qty: q(10), cost: rs(10_000) }]);
    expect(corporateActions).toEqual([{ memberId: 'a', isin: 'Y', account: 'Zerodha', kind: 'units' }]);
  });

  it('a share the history never saw, with no cost: a guessed lot at the file price, and no trim', () => {
    const files = [file(5, 5, undefined), file(10, 10, 10_000, { isin: 'Y' })];
    const trades = [trade('buy', '2024-01-10', 10, 1000, { isin: 'Y' })];
    const { txns, trimmed, corporateActions } = effectiveTxnsWithNotes(trades, files, ASOF, [{ isin: 'X', price: rs(120) }]);
    expect(openings(txns)).toEqual([expect.objectContaining({ id: 'a|X|Zerodha|opening-est', qty: q(5), amount: rs(600), estimated: true })]);
    expect(txns.filter((t) => t.left)).toHaveLength(0);
    expect(trimmed).toEqual([]);
    expect(corporateActions).toEqual([]);
    // With no price either, the guess costs nothing rather than failing.
    expect(openings(effectiveTxns(trades, files, ASOF))).toMatchObject([{ qty: q(5), amount: 0, estimated: true }]);
  });

  it('invariant: the held lots never cost more than the file', () => {
    const fixtures: Array<{ name: string; txns: Txn[]; files: HeldPosition[] }> = [
      { name: 'fund, no saved lot', txns: fundBuys(), files: [fundFile()] },
      { name: 'fund, saved lot', txns: [savedLot(12_000, 3_50_000), ...fundBuys()], files: [fundFile()] },
      { name: 'saved lot only', txns: [savedLot(100, 5_000)], files: [file(100, undefined, 5_000)] },
      { name: 'undated', txns: [savedLot(100, 5_000), trade('buy', '2026-06-01', 40, 60)], files: [file(100, undefined, 5_000, { asOf: undefined, canTrim: undefined })] },
      { name: 'bonus', txns: [trade('buy', '2024-01-10', 10, 1000)], files: [file(20, 10, 10_000)] },
      { name: 'split', txns: [trade('buy', '2024-01-10', 10, 1000)], files: [file(50, 50, 10_000)] },
      { name: 'consolidation', txns: [trade('buy', '2024-01-10', 50, 200)], files: [file(10, 10, 10_050)] },
      { name: 'moved out', txns: [trade('buy', '2024-01-10', 50, 200)], files: [file(10, 10, 2_000)] },
      { name: 'demerger', txns: [trade('buy', '2024-01-10', 10, 1000)], files: [file(10, 10, 10_000), file(10, 0, 0, { isin: 'Y' })] },
      { name: 'older units', txns: [trade('buy', '2026-05-04', 10, 1500)], files: [file(35, 25, 42_000)] },
      { name: 'sold older units', txns: [trade('sell', '2026-06-01', 20, 900)], files: [file(30, 30, 18_000)] },
      { name: 'cheap history', txns: [trade('buy', '2026-05-04', 10, 500)], files: [file(35, 25, 42_000)] },
      { name: 'short-term bonus', txns: [trade('buy', '2026-03-01', 10, 1000)], files: [file(20, 0, 10_000)] },
      { name: 'demerger, cost split', txns: [trade('buy', '2024-01-10', 10, 1000)], files: [file(10, 10, 7_000), file(10, 10, 3_000, { isin: 'Y' })] },
      { name: 'consolidation under cost', txns: [trade('buy', '2024-01-10', 50, 200)], files: [file(10, 10, 9_950)] },
      { name: 'part sold, cost split', txns: [trade('buy', '2024-01-10', 10, 1000), trade('buy', '2025-01-10', 10, 1200), trade('sell', '2026-06-01', 5, 1500)], files: [file(15, 15, 12_000)] },
    ];
    for (const f of fixtures) {
      const out = effectiveTxns(f.txns, f.files, ASOF);
      for (const p of f.files) {
        const cost = buildLedger(out, [SEC('X'), SEC('Y')]).lots.get(`a|${p.isin}|Zerodha`)?.reduce((a, l) => a + l.cost, 0) ?? 0;
        expect([f.name, p.isin, cost <= p.cost!]).toEqual([f.name, p.isin, true]);
      }
    }
  });
});
