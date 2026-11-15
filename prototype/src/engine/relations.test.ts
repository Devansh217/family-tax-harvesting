import { describe, expect, it } from 'vitest';
import { canGift, clubbing, pairRelation } from './relations';
import type { Member } from './types';

const rs = (n: number) => Math.round(n * 100);
const D = '2026-11-15';
const m = (id: string, over: Partial<Member> = {}): Member => ({ id, name: id, relation: 'other', age: 40, regime: 'new', type: 'person', ...over });
const earns = (rupees: number) => ({ income: [{ kind: 'salary' as const, amount: rs(rupees), from: 'manual' as const }] });

// Me and my wife, my parents, our minor son, and my HUF.
const me = m('me', { relation: 'self', spouseId: 'w', parentIds: ['dad', 'mum'], ...earns(30_00_000) });
const wife = m('w', { relation: 'spouse', spouseId: 'me', ...earns(10_00_000) });
const dad = m('dad', { relation: 'parent', age: 68, spouseId: 'mum' });
const mum = m('mum', { relation: 'parent', age: 64, spouseId: 'dad' });
const son = m('son', { relation: 'child_minor', age: 12, parentIds: ['me', 'w'] });
const huf = m('huf', { type: 'huf', hufMemberIds: ['me', 'dad'] });
const fam = [me, wife, dad, mum, son, huf];

describe('relations between any two members', () => {
  it('works out pairs from links, not from relation to the manager', () => {
    expect(pairRelation(dad, mum, fam)).toBe('spouse');
    expect(pairRelation(me, dad, fam)).toBe('parent');
    expect(pairRelation(dad, me, fam)).toBe('child');
    expect(pairRelation(dad, son, fam)).toBe('grandchild');
    expect(pairRelation(son, dad, fam)).toBe('grandparent');
    expect(pairRelation(wife, dad, fam)).toBe('parent_in_law');
    expect(pairRelation(dad, wife, fam)).toBe('child_in_law');
  });

  it('Dad to Mum is a spouse gift, clubbed to Dad; me to my mother is not clubbed', () => {
    expect(clubbing(dad, mum, fam, D)).toMatchObject({ taxedInId: 'dad' });
    expect(clubbing(me, mum, fam, D)).toBeNull();
    expect(canGift(me, mum, fam, D)).toBe(true);
    expect(canGift(dad, mum, fam, D)).toBe(false);
  });

  it('a minor’s income is taxed in the parent with the higher income, whoever gave', () => {
    expect(clubbing(me, son, fam, D)).toMatchObject({ taxedInId: 'me' });
    expect(clubbing(dad, son, fam, D)).toMatchObject({ taxedInId: 'me' });
    expect(clubbing(wife, son, fam, D)).toMatchObject({ taxedInId: 'me' });
  });

  it('a gift to a child-in-law is taxed in the giver (conservative, the model has no gender)', () => {
    expect(clubbing(dad, wife, fam, D)).toMatchObject({ taxedInId: 'dad' });
    expect(clubbing(dad, wife, fam, D)!.reason).toMatch(/son-in-law/);
  });

  it('a member’s gift to their own HUF is taxed in the member', () => {
    expect(clubbing(me, huf, fam, D)).toMatchObject({ taxedInId: 'me' });
    expect(clubbing(wife, huf, fam, D)).toBeNull();
  });

  it('a one-sided spouse link still counts; parent ids not in the family are ignored', () => {
    const a = m('a', { spouseId: 'b', parentIds: ['gone'] }), bb = m('b');
    expect(pairRelation(bb, a, [a, bb])).toBe('spouse');
    expect(pairRelation(a, bb, [a, bb])).toBe('spouse');
    const c = m('c', { parentIds: ['gone'] });
    expect(pairRelation(a, c, [a, bb, c])).toBe('other'); // sharing a missing parent does not make siblings
  });

  it('families without links fall back to relation to the manager', () => {
    const s = m('s', { relation: 'self' }), sp = m('sp', { relation: 'spouse' }), p = m('p', { relation: 'parent' });
    expect(pairRelation(s, sp, [s, sp, p])).toBe('spouse');
    expect(pairRelation(s, p, [s, sp, p])).toBe('parent');
    expect(canGift(s, sp, [s, sp, p], D)).toBe(false);
  });

  it('never gifts to oneself or to a non-resident', () => {
    expect(canGift(me, me, fam, D)).toBe(false);
    expect(canGift(me, { ...mum, resident: false }, [me, wife, dad, { ...mum, resident: false }], D)).toBe(false);
  });
});
