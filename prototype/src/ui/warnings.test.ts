import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeFamily, type FamilyState } from '../engine/family';
import { FY_2026_27 as R } from '../engine/rules';
import { QTY_SCALE, type LedgerWarning, type Member, type Realised, type Txn } from '../engine/types';
import {
  answeredSales, buyDateAnswer, bookedDisplay, hasYearPnl, currentPnls, holdingsNoteLines, monthRange, needsConfirm, oversellLine, pnlCoverage, unknownTermSales, visibleGapCount, visibleOversells,
} from './warnings';

const q = (n: number) => n * QTY_SCALE;
const rs = (n: number) => n * 100;
const me: Member = { id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other', amount: rs(20_00_000), from: 'manual' }] };
const oversell = (date: string, units: number, extra: Partial<LedgerWarning> = {}): LedgerWarning => ({
  memberId: 'a', isin: 'AFFLE', date, account: 'Zerodha', qty: q(units),
  message: `Sold ${units} more units than the history shows were bought in Zerodha. Import older statements for exact gains.`, ...extra,
});

describe('which oversold sales the member page shows', () => {
  const none = () => false;

  it('visibleOversells hides earlier-year and P&L-covered sales, and groups the rest per share', () => {
    // Eleven AFFLE rows on one day become one row with the summed units.
    const affle = Array.from({ length: 11 }, () => oversell('2026-06-12', 3));
    const older = oversell('2025-09-01', 5);
    const coveredOne = oversell('2026-07-01', 4, { isin: 'COVERED', account: 'Angel' });
    const covered = (_m: string, account: string) => account === 'Angel';
    const out = visibleOversells([...affle, older, coveredOne], R, covered);
    expect(out.now).toEqual([{ isin: 'AFFLE', account: 'Zerodha', units: q(33), from: '2026-06-12', to: '2026-06-12' }]);
    expect(out.older).toEqual([older, coveredOne]);
  });

  it('keeps the month range of a share sold over several months', () => {
    const out = visibleOversells([oversell('2026-08-03', 2), oversell('2026-05-20', 1)], R, none);
    expect(out.now).toEqual([{ isin: 'AFFLE', account: 'Zerodha', units: q(3), from: '2026-05-20', to: '2026-08-03' }]);
    expect(monthRange('2026-05-20', '2026-08-03')).toBe('May–Aug 2026');
    expect(monthRange('2026-06-12', '2026-06-30')).toBe('Jun 2026');
    expect(monthRange('2026-12-01', '2027-01-10')).toBe('Dec 2026–Jan 2027');
  });

  it('reads the units from the message for a warning saved without them', () => {
    const { qty: _q, ...bare } = oversell('2026-06-12', 7);
    expect(visibleOversells([bare], R, none).now[0]!.units).toBe(q(7));
  });

  it('words the grouped line with the share, units, months and broker', () => {
    expect(oversellLine('Affle 3i', { isin: 'AFFLE', account: 'Zerodha', units: q(33), from: '2026-06-12', to: '2026-06-12' })).toBe(
      'Affle 3i: sold 33 more units than the history shows (Jun 2026). Their gain is left out until you import Zerodha\'s tax P&L. Possibly an IPO allotment or a transfer in.',
    );
  });
});

describe('Home counts only the gaps the member pages show', () => {
  it('one per share grouped this year, none for earlier-year or P&L-covered sales', () => {
    const warnings = [
      ...Array.from({ length: 11 }, () => oversell('2026-06-12', 3)),
      oversell('2026-07-01', 1, { isin: 'OTHER' }),
      oversell('2025-09-01', 5),
      oversell('2026-07-01', 4, { isin: 'COVERED', account: 'Angel' }),
      oversell('2026-07-01', 2, { memberId: 'b' }),
    ];
    const summaries = [{ memberId: 'a', account: 'Angel', summary: { from: null, to: null } }];
    expect(visibleGapCount(warnings, R, summaries)).toBe(3);
    expect(visibleGapCount([oversell('2025-09-01', 5)], R, summaries)).toBe(0);
  });

  it('Home uses that count, not every ledger warning', () => {
    const home = readFileSync(resolve(__dirname, 'screens/Home.tsx'), 'utf8');
    expect(home).toMatch(/visibleGapCount\(fam\.ledger\.warnings, fam\.rules, state\.brokerSummaries\)/);
    expect(home).not.toMatch(/ledger\.warnings\.length/);
  });
});

describe('Tax P&L coverage', () => {
  const summaries = [{ memberId: 'a', account: 'Zerodha', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-09-30' } }];
  it('covers the account and dates the P&L spans, as the broker correction does', () => {
    const covered = pnlCoverage(summaries, R);
    expect(covered('a', 'Zerodha', '2026-06-10')).toBe(true);
    expect(covered('a', 'Zerodha', '2026-10-10')).toBe(false);
    expect(covered('a', 'Angel', '2026-06-10')).toBe(false);
    expect(covered('b', 'Zerodha', '2026-06-10')).toBe(false);
    // The buyback caveat matches labels exactly too, as the engine applies a P&L.
    const year = hasYearPnl(summaries, R);
    expect(year('a', 'Zerodha')).toBe(true);
    expect(year('a', ' zerodha ')).toBe(false);
    expect(hasYearPnl([{ ...summaries[0]!, summary: { broker: 'Zerodha', from: '2025-04-01', to: '2026-03-31' } }], R)('a', 'Zerodha')).toBe(false);
    // No dates: the whole tax year.
    expect(pnlCoverage([{ ...summaries[0]!, summary: { broker: 'Zerodha', from: null, to: null } }], R)('a', 'Zerodha', '2027-02-01')).toBe(true);
  });
});

describe('unknown-term sales the member can answer', () => {
  const sale = (extra: Partial<Realised> = {}): Realised => ({
    memberId: 'a', isin: 'X', account: 'Zerodha', buyDate: '2026-01-01', sellDate: '2026-06-10', qty: q(10), proceeds: rs(3_000), cost: rs(1_000),
    gain: rs(2_000), term: 'lt', taxType: 'equity', termUnknown: true, ...extra,
  });
  const none = () => false;

  it('lists each uncovered sale this year once, with its units and gain summed', () => {
    const rows = unknownTermSales([sale(), sale({ qty: q(5), gain: rs(1_000) }), sale({ memberId: 'b' }), sale({ termUnknown: undefined, isin: 'Y' })], 'a', R, none);
    expect(rows).toEqual([{ memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-06-10', qty: q(15), gain: rs(3_000), term: 'lt', pieceTerms: ['lt'] }]);
  });

  it('a sale with a gain piece and a loss piece asks for the confirm whichever term is picked', () => {
    // FIFO split one sale over two guessed lots: a ₹2,000 gain (long-term) and a ₹500 loss (short-term).
    const [mixed] = unknownTermSales([sale(), sale({ qty: q(5), gain: rs(-500), term: 'st' })], 'a', R, none);
    expect(mixed).toMatchObject({ term: 'lt', pieceTerms: ['lt', 'st'] });
    expect(needsConfirm(mixed!, 'lt')).toBe(true);
    expect(needsConfirm(mixed!, 'st')).toBe(true);
    // A plain gain: confirming its own assumption needs nothing, the other term asks first.
    const [plain] = unknownTermSales([sale()], 'a', R, none);
    expect(needsConfirm(plain!, 'lt')).toBe(false);
    expect(needsConfirm(plain!, 'st')).toBe(true);
  });

  it('a buy date asks first when the term it gives could free room, like picking that term', () => {
    const [plain] = unknownTermSales([sale()], 'a', R, none);
    const share = { isin: 'X', name: 'X', taxType: 'equity' as const, listed: true };
    // Sold 10 Jun 2026: bought 10 Jan 2026 is under a year, so short-term, which frees room: confirm first.
    expect(buyDateAnswer(plain!, share, '2026-01-10', R)).toEqual({ term: 'st', confirm: true });
    // Bought 10 Jan 2025 is over a year: long-term, the term already assumed, so nothing to confirm.
    expect(buyDateAnswer(plain!, share, '2025-01-10', R)).toEqual({ term: 'lt', confirm: false });
  });

  it('Review Focus 4: an unknown-term sale covered by a Tax P&L gets no prompt', () => {
    expect(unknownTermSales([sale()], 'a', R, () => true)).toEqual([]);
  });

  it('a sale from an earlier tax year gets no prompt', () => {
    expect(unknownTermSales([sale({ sellDate: '2026-03-10' })], 'a', R, none)).toEqual([]);
  });

  it('only shares and equity funds: other types keep their own term', () => {
    expect(unknownTermSales([sale({ taxType: 'slab' })], 'a', R, none)).toEqual([]);
  });

  it('answered sales read back the answer, matched by account whatever its spaces and case', () => {
    const answers = [{ memberId: 'a', account: ' zerodha ', isin: 'X', sellDate: '2026-06-10', term: 'st' as const }];
    expect(answeredSales([sale({ termUnknown: undefined, term: 'st' })], answers, 'a', R, none)).toEqual([
      { answer: answers[0], label: 'Term set by you' },
    ]);
    const dated = [{ memberId: 'a', account: 'Zerodha', isin: 'X', sellDate: '2026-06-10', buyDate: '2025-01-02' }];
    expect(answeredSales([sale({ termUnknown: undefined })], dated, 'a', R, none)[0]!.label).toBe('Buy date entered by you');
    // An answer whose sale is gone, or covered by a P&L, shows nothing.
    expect(answeredSales([], answers, 'a', R, none)).toEqual([]);
    expect(answeredSales([sale({ termUnknown: undefined })], answers, 'a', R, () => true)).toEqual([]);
  });
});

describe('the broker correction shows as a correction (spec test 8)', () => {
  // Asha sells 100 X bought at ₹100 for ₹300 (₹20,000 short-term gain) and 10 Y bought at ₹500 for ₹300 (₹2,000
  // short-term loss), both in Zerodha. Zerodha's tax P&L says short-term shares total ₹15,000, so the engine adds a
  // −₹3,000 short-term correction. Short-term net ₹15,000 at 20% = ₹3,000, plus 4% cess = ₹3,120.
  const trade = (isin: string, side: 'buy' | 'sell', date: string, units: number, price: number): Txn => ({
    id: `${isin}${side}${date}`, memberId: 'a', isin, date, side, qty: q(units), amount: rs(units * price), source: 'Trade history (Zerodha)', account: 'Zerodha',
  });
  const state: FamilyState = {
    members: [me],
    securities: [{ isin: 'X', name: 'X Ltd', taxType: 'equity', listed: true }, { isin: 'Y', name: 'Y Ltd', taxType: 'equity', listed: true }],
    txns: [trade('X', 'buy', '2026-04-10', 100, 100), trade('X', 'sell', '2026-06-10', 100, 300), trade('Y', 'buy', '2026-04-10', 10, 500), trade('Y', 'sell', '2026-06-10', 10, 300)],
    brokerSummaries: [{ memberId: 'a', account: 'Zerodha', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-09-30', equityShortTerm: rs(15_000), equityLongTerm: null, mfShortTerm: null, mfLongTerm: null } }],
  };
  const fam = computeFamily(state, '2026-11-22', R);
  const year = fam.members[0]!.year;

  it('"Losses set off" excludes the negative adjustment, which gets its own line; tax is unchanged', () => {
    expect(fam.brokerAdjustments).toMatchObject([{ term: 'st', gain: rs(-3_000) }]);
    // The engine folds the correction into set-off: ₹2,000 real loss + ₹3,000 correction.
    expect(year.stLosses).toBe(rs(5_000));
    expect(year.stNet).toBe(rs(15_000));
    expect(year.tax).toBe(rs(3_120));
    const d = bookedDisplay(year, fam.brokerAdjustments, 'a');
    expect(d.lossesSetOff).toBe(rs(2_000));
    expect(d.adjustments).toEqual(['Adjusted to Zerodha\'s figure: −₹3,000 short-term']);
    // Display only: the tax and nets are what summariseYear gave.
    expect(computeFamily(state, '2026-11-22', R).members[0]!.year.tax).toBe(rs(3_120));
  });

  it('a positive correction reads with a plus and leaves losses alone', () => {
    const d = bookedDisplay(year, [{ memberId: 'a', account: 'Zerodha', broker: 'Zerodha', label: 'Shares, long-term', term: 'lt', gain: rs(1_25_000) }], 'a');
    expect(d.lossesSetOff).toBe(year.stLosses + year.ltLosses);
    expect(d.adjustments).toEqual(['Adjusted to Zerodha\'s figure: +₹1,25,000 long-term']);
  });
});

describe('holdings file notes', () => {
  const notes = {
    trimmed: [{ memberId: 'a', account: 'Zerodha', asOf: '2026-11-01', isins: ['X', 'Y'] }],
    staleFiles: [{ memberId: 'a', account: 'Angel One', asOf: '2026-09-30' }],
    corporateActions: [{ memberId: 'a', isin: 'X', account: 'Zerodha', kind: 'units' as const }, { memberId: 'a', isin: 'Y', account: 'Zerodha', kind: 'cost' as const }],
  };
  const name = (isin: string) => `${isin} Ltd`;

  it('one quiet line per file, the buyback caveat without a current-year P&L, and corporate actions that changed units', () => {
    expect(holdingsNoteLines(notes, 'a', name, () => false)).toEqual([
      '2 shares in your trade history aren\'t in Zerodha\'s holdings on 1 Nov 2026, so they\'re left out. If any of these left in a buyback this year, that gain counts: import Zerodha\'s tax P&L.',
      'Your Angel One holdings file is from 30 Sep 2026, before your latest trades. Import a newer one.',
      'X Ltd: units changed without a trade (bonus, split or demerger?). Import Zerodha\'s tax P&L or external tradebook for exact figures.',
    ]);
  });

  it('the corporate-action line names the account\'s broker', () => {
    const angel = { ...notes, trimmed: [], staleFiles: [], corporateActions: [{ memberId: 'a', isin: 'X', account: 'Angel One', kind: 'units' as const }] };
    expect(holdingsNoteLines(angel, 'a', name, () => true)).toEqual([
      'X Ltd: units changed without a trade (bonus, split or demerger?). Import Angel One\'s tax P&L or external tradebook for exact figures.',
    ]);
  });

  it('a P&L read before buybacks counted keeps the buyback caveat', () => {
    const summaries = [{ importId: 'p1', memberId: 'a', account: 'Zerodha', summary: { broker: 'Zerodha', from: '2026-04-01', to: '2026-10-31' } }];
    const imports = [{ id: 'p1', memberId: 'a', format: 'Zerodha Tax P&L · 2026-04-01 to 2026-10-31', warnings: ['2 buyback exits were left out: since Oct 2024 buyback money is taxed as dividend income, not capital gains.'] }];
    expect(holdingsNoteLines(notes, 'a', name, hasYearPnl(currentPnls(summaries, imports), R))[0]).toMatch(/If any of these left in a buyback this year/);
    expect(holdingsNoteLines(notes, 'a', name, hasYearPnl(currentPnls(summaries, [{ ...imports[0]!, warnings: [] }]), R))[0]).not.toMatch(/buyback/);
  });

  it('no buyback caveat once the account has a P&L for this year; another member\'s notes stay out', () => {
    expect(holdingsNoteLines(notes, 'a', name, () => true)[0]).toBe('2 shares in your trade history aren\'t in Zerodha\'s holdings on 1 Nov 2026, so they\'re left out.');
    expect(holdingsNoteLines(notes, 'b', name, () => false)).toEqual([]);
    const one = { ...notes, trimmed: [{ ...notes.trimmed[0]!, isins: ['X'] }] };
    expect(holdingsNoteLines(one, 'a', name, () => true)[0]).toBe('1 share in your trade history isn\'t in Zerodha\'s holdings on 1 Nov 2026, so it\'s left out.');
  });
});
