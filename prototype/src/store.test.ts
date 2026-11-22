import { describe, expect, it } from 'vitest';
import { computeFamily } from './engine/family';
import { FY_2026_27 } from './engine/rules';
import { parseTablePreview, previewTable } from './parsers';
import { sampleState } from './sample';
import { applyImport, emptyState, hasRealData, normalizeState, backupHadSeasonHelp, parseBackup, removeImport, RESTORE_ALERTS_NOTE, type AppState } from './store';
import { ageOn } from './engine/dates';

const withMember = (): AppState => ({ ...emptyState(), members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new', income: [{ kind: 'other' as const, amount: 0 , from: 'manual' as const }]}] });
const parse = (csv: string) => { const p = previewTable(csv); return parseTablePreview(p, p.mapping, 'f.csv'); };

const tradebook = 'symbol,isin,trade_date,segment,trade_type,quantity,price\nINFY,INE009A01021,2024-03-12,EQ,buy,10,1500\nINFY,INE009A01021,2024-03-12,EQ,buy,10,1500';
const holdings = 'Instrument,Qty.,Avg. cost,LTP\nINFY,20,1500,1900\nTCS,5,3000,4400';

describe('importing', () => {
  it('keeps a fund statement’s plan, option and distributor on the security', () => {
    const r = (plan: 'regular' | 'direct', distributor?: string) => ({
      format: 'CAS', txns: [], warnings: [], skipped: 0,
      prices: [{ isin: 'INF879O01027', name: 'X Flexi', price: 100_00, plan, option: 'growth' as const, distributor }],
    });
    let s = applyImport(withMember(), 'a', 'cas.pdf', r('regular', 'ARN-12345'));
    expect(s.securities[0]).toMatchObject({ isin: 'INF879O01027', taxType: 'check', plan: 'regular', option: 'growth', distributor: 'ARN-12345' });
    s = applyImport(s, 'a', 'cas2.pdf', r('direct'));
    expect(s.securities[0]).toMatchObject({ plan: 'direct' });
    expect(s.securities[0]!.distributor).toBeUndefined();
  });

  it('keeps identical fills apart but ignores a repeated import of the same file', () => {
    let s = applyImport(withMember(), 'a', 'tb.csv', parse(tradebook));
    expect(s.txns).toHaveLength(2);
    s = applyImport(s, 'a', 'tb.csv', parse(tradebook));
    expect(s.txns).toHaveLength(2);
  });

  it('matches symbol-only holdings to ISINs from the trade history and prices them', () => {
    let s = applyImport(withMember(), 'a', 'tb.csv', parse(tradebook));
    s = applyImport(s, 'a', 'h.csv', parse(holdings), { openingDate: '2024-01-01' });
    expect(s.txns.find((t) => t.source.startsWith('Opening'))!.estimated).toBe(true);
    const infy = s.securities.find((x) => x.isin === 'INE009A01021')!;
    expect(infy.price).toBe(1900_00);
    // INFY already has history, so only TCS gets an estimated opening lot
    const opening = s.txns.filter((t) => t.source.startsWith('Opening'));
    expect(opening.map((t) => t.isin)).toEqual(['SYM:TCS']);
    expect(opening[0]!.amount).toBe(15_000_00);
  });

  it('removing an import removes its transactions', () => {
    let s = applyImport(withMember(), 'a', 'tb.csv', parse(tradebook));
    s = removeImport(s, s.imports[0]!.id);
    expect(s.txns).toHaveLength(0);
  });
});

describe('sample family', () => {
  it('produces the numbers shown in the design', () => {
    const s = sampleState();
    const fam = computeFamily(s, '2026-11-14', FY_2026_27);
    const by = (id: string) => fam.members.find((m) => m.member.id === id)!;
    expect(by('a').year.room.free).toBe(15_000_00);
    expect(by('m').year.room.free).toBe(1_05_000_00);
    expect(by('r').year.stNet).toBe(12_400_00);
    expect(by('k').year.bonus.free).toBe(4_00_000_00);
    expect(fam.moves.some((m) => m.kind === 'wait' && m.isin === 'INE040A01034')).toBe(true);
    expect(fam.moves.some((m) => m.kind === 'gift' && m.toId === 'k')).toBe(true);
    expect(fam.moves.some((m) => m.kind === 'gift' && m.toId === 'm')).toBe(false);
  });
});

const rs = (n: number) => Math.round(n * 100);
/** A version-1 state as saved before the member profile change: otherIncome, incomeBand, security `kind`, undated ticks. */
function oldState(member: Record<string, unknown>, extra: Record<string, unknown> = {}, members?: Array<Record<string, unknown>>): AppState {
  return {
    ...emptyState(),
    members: (members ?? [{ id: 'm1', name: 'A', relation: 'self', age: 40, regime: 'new', ...member }]) as never,
    ...extra,
  } as AppState;
}

describe('migrating saved families', () => {
  it('migrates old income fields to income sources', () => {
    const s = normalizeState(oldState({ otherIncome: rs(8_00_000), incomeBand: '₹4–8 L (5%)' }))!;
    expect(s.members[0]!.income).toEqual([{ kind: 'other', amount: rs(8_00_000), from: 'band', band: '₹4–8 L (5%)' }]);
    expect(s.members[0]!.type).toBe('person');
    expect('otherIncome' in s.members[0]!).toBe(false);
    expect(normalizeState(oldState({ otherIncome: rs(3_00_000) }))!.members[0]!.income).toEqual([{ kind: 'other', amount: rs(3_00_000), from: 'manual' }]);
  });

  it('keeps unknown income unknown', () => {
    expect(normalizeState(oldState({}))!.members[0]!.income).toBeUndefined();
  });

  it('links spouse, parents and children from manager-relative relations', () => {
    const s = normalizeState(oldState({}, {}, [
      { id: 'me', name: 'Me', relation: 'self', age: 40, regime: 'new' },
      { id: 'w', name: 'W', relation: 'spouse', age: 38, regime: 'new' },
      { id: 'f', name: 'F', relation: 'parent', age: 66, regime: 'new' },
      { id: 'mo', name: 'Mo', relation: 'parent', age: 63, regime: 'new' },
      { id: 'c', name: 'C', relation: 'child_minor', age: 9, regime: 'new' },
    ]))!;
    const by = (id: string) => s.members.find((m) => m.id === id)!;
    expect(by('me').spouseId).toBe('w');
    expect(by('w').spouseId).toBe('me');
    expect(by('me').parentIds).toEqual(['f', 'mo']);
    expect(by('f').spouseId).toBe('mo');
    expect(by('mo').spouseId).toBe('f');
    expect(by('c').parentIds).toEqual(['me', 'w']);
  });

  it('does not guess parents are married when there are three', () => {
    const s = normalizeState(oldState({}, {}, [
      { id: 'me', name: 'Me', relation: 'self', age: 40, regime: 'new' },
      { id: 'p1', name: 'P1', relation: 'parent', age: 66, regime: 'new' },
      { id: 'p2', name: 'P2', relation: 'parent', age: 63, regime: 'new' },
      { id: 'p3', name: 'P3', relation: 'parent', age: 70, regime: 'new' },
    ]))!;
    expect(s.members.find((m) => m.id === 'p1')!.spouseId).toBeUndefined();
  });

  it('prefixes old move ticks with the tax year', () => {
    expect(normalizeState(oldState({}, { done: { 'harvest_gain|m1|INE1|': true, 'FY 2026-27|wait|m1|INE2|': true } }))!.done)
      .toEqual({ 'FY 2026-27|harvest_gain|m1|INE1|': true, 'FY 2026-27|wait|m1|INE2|': true });
  });

  it('migrates saved security kinds to tax types', () => {
    const s = normalizeState(oldState({}, { securities: [
      { isin: 'INE1', name: 'S', kind: 'equity' }, { isin: 'INF1', name: 'F', kind: 'equity_mf' }, { isin: 'INF2', name: 'D', kind: 'other' },
    ] }))!;
    expect(s.securities[0]).toEqual({ isin: 'INE1', name: 'S', taxType: 'equity', listed: true, taxTypeSource: 'share' });
    expect(s.securities[1]).toEqual({ isin: 'INF1', name: 'F', taxType: 'equity', listed: false });
    expect(s.securities[2]).toEqual({ isin: 'INF2', name: 'D', taxType: 'check', listed: false });
  });

  it('an equity-only family saved before the change keeps its tax figures', () => {
    // Review Focus #1. Figures recorded from the engine before the member change (sample family, 15 Nov 2026).
    const old = sampleState();
    const legacy = { a: rs(30_00_000), m: rs(18_00_000), r: rs(4_60_000), s: rs(4_20_000), k: 0 } as Record<string, number>;
    const saved = oldState({}, {
      ...old,
      members: old.members.map(({ income: _i, type: _t, ...m }) => ({ ...m, otherIncome: legacy[m.id] })),
      securities: old.securities.map(({ taxType: _t, listed, taxTypeSource: _s, ...x }) => ({ ...x, kind: x.isin.startsWith('INF') ? 'equity_mf' : 'equity', ...(listed ? {} : {}) })),
    });
    const fam = computeFamily(normalizeState(saved)!, '2026-11-15', FY_2026_27);
    const got = fam.members.map((v) => [v.member.id, v.year.tax, v.year.room.free, v.year.bonus.free, v.plan.tax]);
    expect(got).toEqual([['a', 0, 15_000_00, 0, 0], ['m', 0, 1_05_000_00, 0, 0], ['r', 2_579_00, 1_25_000_00, 0, 2_579_00], ['s', 0, 1_25_000_00, 0, 0], ['k', 0, 1_25_000_00, 4_00_000_00, 0]]);
  });

  it('works out age on a date from date of birth, else the stored age', () => {
    const m = { id: 'x', name: 'X', relation: 'self' as const, age: 50, regime: 'new' as const, type: 'person' as const };
    expect(ageOn({ ...m, dob: '1966-11-16' }, '2026-11-15')).toBe(59);
    expect(ageOn({ ...m, dob: '1966-11-15' }, '2026-11-15')).toBe(60);
    expect(ageOn(m, '2026-11-15')).toBe(50);
  });
});

describe('review: restoring a backup', () => {
  it('migrates an old-shape backup instead of loading it raw', () => {
    const { taxTypeOverrides: _t, recommendations: _r, ...old } = emptyState();
    const text = JSON.stringify({ ...old, members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new', otherIncome: 100 }], securities: [{ isin: 'INF1', name: 'F', kind: 'equity_mf' }] });
    const s = parseBackup(text)!;
    expect(s.taxTypeOverrides).toEqual({});
    expect(s.recommendations).toEqual([]);
    expect(s.securities[0]).toMatchObject({ taxType: 'equity', listed: false });
  });
  it('a restore turns harvest season help off, and the family is told when it had been on', () => {
    const on = JSON.stringify({ ...emptyState(), alerts: { seasonHelp: true, chosen: true } });
    expect(parseBackup(on)!.alerts).toEqual({ seasonHelp: false, chosen: false });
    expect(backupHadSeasonHelp(on)).toBe(true);
    expect(backupHadSeasonHelp(JSON.stringify(emptyState()))).toBe(false);
    expect(backupHadSeasonHelp('not json')).toBe(false);
    expect(RESTORE_ALERTS_NOTE).toBe('Harvest season help is off after a restore; turn it on in Account.');
  });
  it('rejects a file that is not a backup', () => {
    expect(parseBackup('{"hello":1}')).toBeNull();
    expect(parseBackup('not json')).toBeNull();
  });
  it('security review: rejects a backup whose lists or members have the wrong shape, instead of loading it and crashing', () => {
    expect(parseBackup('{"version":1,"members":[{"id":"a","name":"x"}],"txns":"oops"}')).toBeNull();
    expect(parseBackup('{"version":1,"members":[null]}')).toBeNull();
    expect(parseBackup('{"version":1,"members":[{"id":1,"name":"x"}]}')).toBeNull();
    expect(parseBackup('{"version":1,"members":[],"done":[]}')).toBeNull();
    expect(parseBackup('[1]')).toBeNull();
  });
  it('security review: a backup without trade lists loads with empty ones', () => {
    const s = parseBackup('{"version":1,"members":[{"id":"a","name":"A","relation":"self","age":40,"regime":"new"}]}')!;
    expect(s.txns).toEqual([]);
    expect(s.imports).toEqual([]);
    expect(hasRealData(s)).toBe(false);
  });
});

