import { describe, expect, it } from 'vitest';
import { computeFamily } from './engine/family';
import { FY_2026_27 } from './engine/rules';
import { parseTablePreview, previewTable } from './parsers';
import { sampleState } from './sample';
import { applyImport, emptyState, removeImport, type AppState } from './store';

const withMember = (): AppState => ({ ...emptyState(), members: [{ id: 'a', name: 'A', relation: 'self', age: 40, regime: 'new', otherIncome: 0 }] });
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
