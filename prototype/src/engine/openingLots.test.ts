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
    const { txns } = effectiveTxnsWithNotes([trade('buy', '2024-01-10', 10, 500), trade('buy', '2026-05-04', 5, 1500)], [file(5)], ASOF);
    expect(left(txns)).toMatchObject([{ qty: q(10) }]);
    expect(ledgerOf(txns).lots.get('a|X|Zerodha')).toMatchObject([{ date: '2026-05-04', qty: q(5), cost: rs(7_500) }]);
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
