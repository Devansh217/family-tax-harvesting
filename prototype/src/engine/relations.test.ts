import { describe, expect, it } from 'vitest';
import { canGift, clubbing, isRelative, pairRelation } from './relations';
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

  it('review: no tax-free gift to someone who is not a relative, or to an HUF from a non-member', () => {
    const friend = m('fr', { relation: 'other' });
    expect(canGift(me, friend, [...fam, friend], D)).toBe(false);
    expect(canGift(wife, huf, fam, D)).toBe(false);
    expect(isRelative(me, mum, fam)).toBe(true);
    expect(isRelative(me, friend, [...fam, friend])).toBe(false);
  });

  it('review: a spouse by relation only is still a spouse when other members have links', () => {
    const s = m('s', { relation: 'self', parentIds: ['p'] }), p = m('p', { relation: 'parent' }), sp = m('sp', { relation: 'spouse' });
    expect(pairRelation(s, sp, [s, p, sp])).toBe('spouse');
    expect(canGift(s, sp, [s, p, sp], D)).toBe(false);
    const stale = m('s2', { relation: 'self', spouseId: 'deleted' }), sp2 = m('sp2', { relation: 'spouse' });
    expect(pairRelation(stale, sp2, [stale, sp2])).toBe('spouse');
  });
});

describe('relations from "Relation to you" when members have no links', () => {
  const self = m('self', { relation: 'self' });
  const p1 = m('p1', { relation: 'parent', age: 66 });
  const p2 = m('p2', { relation: 'parent', age: 63 });
  const sib = m('sib', { relation: 'sibling' });
  const sib2 = m('sib2', { relation: 'sibling' });
  const c1 = m('c1', { relation: 'child_adult', age: 22 });
  const c2 = m('c2', { relation: 'child_adult', age: 20 });
  const sp = m('sp', { relation: 'spouse' });
  const gp = m('gp', { relation: 'grandparent', age: 88 });
  const all = [self, p1, p2, sib, sib2, c1, c2, sp, gp];

  it('two parents are spouses: gifts between them are clubbed, so not a gift that moves tax', () => {
    expect(pairRelation(p1, p2, all)).toBe('spouse');
    expect(isRelative(p1, p2, all)).toBe(true);
    expect(clubbing(p1, p2, all, D)).toMatchObject({ taxedInId: 'p1' });
    expect(canGift(p1, p2, all, D)).toBe(false);
  });

  it('siblings, children and parents of siblings', () => {
    expect(pairRelation(sib, sib2, all)).toBe('sibling');
    expect(pairRelation(c1, c2, all)).toBe('sibling');
    expect(pairRelation(p1, sib, all)).toBe('child');
    expect(pairRelation(sib, p1, all)).toBe('parent');
  });

  it('a sibling-in-law is not a relative for the gift rule', () => {
    expect(pairRelation(sp, sib, all)).toBe('other');
    expect(pairRelation(sib, sp, all)).toBe('other');
    expect(isRelative(sp, sib, all)).toBe(false);
  });

  it('your grandparent is a relative, so a gift between you is tax-free', () => {
    expect(pairRelation(self, gp, all)).toBe('grandparent');
    expect(pairRelation(gp, self, all)).toBe('grandchild');
    expect(isRelative(self, gp, all)).toBe(true);
    expect(canGift(self, gp, all, D)).toBe(true);
  });

  it('a parent and a grandparent with no link are not assumed related', () => {
    expect(pairRelation(p1, gp, all)).toBe('other');
  });
});

it('three parents with no links are not assumed married', () => {
  const ps = ['a', 'b', 'c'].map((id) => m(id, { relation: 'parent', age: 65 }));
  expect(pairRelation(ps[0]!, ps[1]!, ps)).toBe('other');
});
