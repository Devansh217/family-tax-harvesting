import { describe, expect, it } from 'vitest';
import { computeFamily } from './family';
import { bringsHome, nominalReturn, type BringsHomeInput } from './planner';
import { FY_2026_27 as R } from './rules';
import type { Member, Security } from './types';

const rs = (n: number) => Math.round(n * 100);
const D = '2026-11-15';
const sal = (rupees: number) => [{ kind: 'salary' as const, amount: rs(rupees), from: 'manual' as const }];
const me: Member = { id: 'me', name: 'Arjun', relation: 'self', age: 40, regime: 'new', type: 'person', spouseId: 'w', parentIds: ['dad'], income: sal(30_00_000) };
const wife: Member = { id: 'w', name: 'Meera', relation: 'spouse', age: 38, regime: 'new', type: 'person', spouseId: 'me', income: sal(10_00_000) };
const dad: Member = { id: 'dad', name: 'Ramesh', relation: 'parent', age: 68, regime: 'new', type: 'person', income: [] };
const members = [me, wife, dad];
const securities: Security[] = [{ isin: 'INFCHK', name: 'Unknown fund', taxType: 'check', listed: false }];
const view = computeFamily({ members, securities, txns: [] }, D, R);
const run = (i: Partial<BringsHomeInput>) =>
  bringsHome({ product: { kind: 'category', category: 'Hybrid Scheme - Conservative Hybrid Fund' }, amount: rs(5_00_000), years: 1, fromMemberId: 'me', ...i }, view, members, securities, D);

describe('assumed returns', () => {
  it('turns real returns into nominal ones with the scenario’s inflation', () => {
    expect(nominalReturn('equity', 'base', R)).toBeCloseTo(0.1104, 4);
    expect(nominalReturn('conservative_hybrid', 'base', R)).toBeCloseTo(0.078, 4);
    expect(nominalReturn('fd', 'base', R)).toBeCloseTo(0.0673, 4);
    expect(nominalReturn('ppf', 'base', R)).toBe(0.071);
    expect(nominalReturn('equity', 'conservative', R)).toBeLessThan(nominalReturn('equity', 'base', R));
    expect(nominalReturn('equity', 'base', R)).toBeLessThan(nominalReturn('equity', 'optimistic', R));
  });
});

describe('what it brings home, per member', () => {
  it('a conservative hybrid fund: the no-income parent keeps it all, the 30% earner pays 31.2% of the gain', () => {
    const r = run({ annualReturn: 0.078 });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.taxType).toBe('slab');
    expect(r.rows[0]).toMatchObject({ memberId: 'dad', tax: 0, gift: true });
    const mine = r.rows.find((x) => x.memberId === 'me')!;
    expect(Math.abs(mine.tax - mine.gain * 0.312)).toBeLessThanOrEqual(100);
    expect(mine.gift).toBe(false);
    expect(r.rows.map((x) => x.bringsHome)).toEqual([...r.rows.map((x) => x.bringsHome)].sort((a, b) => b - a));
  });

  it('money given to a spouse is still taxed in the giver', () => {
    const r = run({ annualReturn: 0.078 });
    if (r.status !== 'ok') throw new Error(r.status);
    const w = r.rows.find((x) => x.memberId === 'w')!, mine = r.rows.find((x) => x.memberId === 'me')!;
    expect(w).toMatchObject({ taxedInId: 'me', gift: true, tax: mine.tax });
    expect(w.clubbedReason).toMatch(/spouse/);
  });

  it('a gift to a parent warns that it passes by their will', () => {
    const r = run({ annualReturn: 0.078 });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.rows.find((x) => x.memberId === 'dad')!.warnings.join(' ')).toMatch(/Gift from Arjun.*will/);
  });

  it('a fund whose tax type is unknown asks to be checked', () => {
    expect(run({ product: { kind: 'fund', isin: 'INFCHK' } })).toMatchObject({ status: 'check' });
  });

  it('an equity fund sold in a later year uses a clean year: the full ₹1.25 L exemption', () => {
    const r = run({ product: { kind: 'category', category: 'Equity Scheme - Flexi Cap Fund' }, amount: rs(5_00_000), years: 3, annualReturn: 0.12 });
    if (r.status !== 'ok') throw new Error(r.status);
    const mine = r.rows.find((x) => x.memberId === 'me')!;
    const expected = Math.round(((mine.gain - rs(1_25_000)) * 0.125 * 1.04) / 100) * 100;
    expect(mine.gain).toBeGreaterThan(rs(1_25_000));
    expect(mine.tax).toBe(expected);
    expect(r.rows.find((x) => x.memberId === 'dad')!.tax).toBe(0);
  });

  it('PPF above ₹1.5 L or under 15 years warns; it is never taxed', () => {
    const r = run({ product: { kind: 'ppf' }, amount: rs(2_00_000), years: 5 });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.rows.every((x) => x.tax === 0)).toBe(true);
    expect(r.rows[0]!.warnings.join(' ')).toMatch(/₹1.5 L a year/);
    expect(r.rows[0]!.warnings.join(' ')).toMatch(/15 years/);
  });

  it('a fixed deposit is taxed every year on the interest', () => {
    const r = run({ product: { kind: 'fd' }, annualReturn: 0.07, years: 2 });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.taxType).toBe('interest');
    const mine = r.rows.find((x) => x.memberId === 'me')!, dadRow = r.rows.find((x) => x.memberId === 'dad')!;
    expect(dadRow.tax).toBe(0);
    expect(mine.tax).toBeGreaterThan(0);
    expect(mine.bringsHome).toBeLessThan(dadRow.bringsHome);
  });

  it('nonsense inputs return an error naming the field, never NaN', () => {
    expect(run({ amount: 0 })).toMatchObject({ status: 'invalid', field: 'amount' });
    expect(run({ years: 0.1 })).toMatchObject({ status: 'invalid', field: 'years' });
    expect(run({ years: 41 })).toMatchObject({ status: 'invalid', field: 'years' });
    expect(run({ annualReturn: 0.9 })).toMatchObject({ status: 'invalid', field: 'annualReturn' });
    expect(run({ annualReturn: Number.NaN })).toMatchObject({ status: 'invalid', field: 'annualReturn' });
  });

  it('review: money given to someone who is not a relative carries gift tax and says so', () => {
    const friend: Member = { id: 'fr', name: 'Kiran', relation: 'other', age: 40, regime: 'new', type: 'person', income: sal(20_00_000) };
    const all = [...members, friend];
    const v = computeFamily({ members: all, securities, txns: [] }, D, R);
    const r = bringsHome({ product: { kind: 'fd' }, amount: rs(5_00_000), years: 1, annualReturn: 0.07, fromMemberId: 'me' }, v, all, securities, D);
    if (r.status !== 'ok') throw new Error(r.status);
    const row = r.rows.find((x) => x.memberId === 'fr')!;
    expect(row.warnings.join(' ')).toMatch(/not a relative/i);
    expect(row.tax).toBeGreaterThan(0);
  });
});

