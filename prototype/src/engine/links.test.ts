import { describe, expect, it } from 'vitest';
import { autoLink, linkChoices, linkProblems, linkSummary } from './links';
import type { Member } from './types';

const m = (id: string, over: Partial<Member> = {}): Member => ({ id, name: id, relation: 'other', age: 40, regime: 'new', type: 'person', ...over });
const by = (ms: Member[], id: string) => ms.find((x) => x.id === id)!;

describe('autoLink: links from "Relation to you"', () => {
  const me = m('me', { relation: 'self' });
  const w = m('w', { relation: 'spouse' });
  const f = m('f', { relation: 'parent', age: 66 });
  const mo = m('mo', { relation: 'parent', age: 63 });
  const c = m('c', { relation: 'child_minor', age: 9 });
  const sib = m('sib', { relation: 'sibling' });

  it('spouse, parents, children and siblings, on both sides', () => {
    const out = autoLink([me, w, f, mo, c, sib]);
    expect(by(out, 'me').spouseId).toBe('w');
    expect(by(out, 'w').spouseId).toBe('me');
    expect(by(out, 'me').parentIds).toEqual(['f', 'mo']);
    expect(by(out, 'f').spouseId).toBe('mo');
    expect(by(out, 'mo').spouseId).toBe('f');
    expect(by(out, 'c').parentIds).toEqual(['me', 'w']);
    expect(by(out, 'sib').parentIds).toEqual(['f', 'mo']);
    expect(by(out, 'f').parentIds).toBeUndefined();
  });

  it('a child with no spouse in the family gets you only', () => {
    expect(by(autoLink([me, c]), 'c').parentIds).toEqual(['me']);
  });

  it('is the same when run twice', () => {
    const once = autoLink([me, w, f, mo, c]);
    expect(autoLink(once)).toEqual(once);
  });

  it("son's wife: linked to the only adult child; not guessed with two", () => {
    const son = m('son', { relation: 'child_adult', age: 30 });
    const dil = m('dil', { relation: 'daughter_in_law', age: 28 });
    const one = autoLink([me, son, dil]);
    expect(by(one, 'dil').spouseId).toBe('son');
    expect(by(one, 'son').spouseId).toBe('dil');
    expect(by(autoLink([me, son, m('son2', { relation: 'child_adult', age: 26 }), dil]), 'dil').spouseId).toBeUndefined();
    expect(by(autoLink([me, dil]), 'dil').spouseId).toBeUndefined();
  });

  it('grandparents: parent of your only parent in the family; not guessed with two parents', () => {
    const gp = m('gp', { relation: 'grandparent', age: 90 });
    expect(by(autoLink([me, f, gp]), 'f').parentIds).toEqual(['gp']);
    expect(by(autoLink([me, f, mo, gp]), 'f').parentIds).toBeUndefined();
  });

  it('three parents: none is linked as your parent or as anyone’s spouse', () => {
    const p3 = m('p3', { relation: 'parent', age: 70 });
    const out = autoLink([me, f, mo, p3]);
    expect(by(out, 'me').parentIds).toBeUndefined();
    expect(by(out, 'f').spouseId).toBeUndefined();
  });

  it('never overwrites a link set by hand', () => {
    const out = autoLink([me, m('w', { relation: 'spouse', spouseId: 'x' }), m('x', { relation: 'other' })]);
    expect(by(out, 'w').spouseId).toBe('x');
    expect(by(out, 'me').spouseId).toBeUndefined();
  });

  it('fills gaps around existing links, so a one-sided spouse link becomes two-sided', () => {
    const out = autoLink([me, m('w', { relation: 'spouse', spouseId: 'me' })]);
    expect(by(out, 'me').spouseId).toBe('w');
    expect(by(out, 'w').spouseId).toBe('me');
  });

  it('changing a relation clears the links it had set, and keeps links set by hand', () => {
    const linked = autoLink([me, w, f, mo, c]);
    const changed = autoLink(linked.map((x) => (x.id === 'mo' ? { ...x, relation: 'other' as const } : x)));
    expect(by(changed, 'me').parentIds).toEqual(['f']);
    expect(by(changed, 'f').spouseId).toBeUndefined();
    expect(by(changed, 'mo').spouseId).toBeUndefined();
    expect(by(changed, 'w').spouseId).toBe('me');
  });

  it('leaves a member alone once their links were changed by hand', () => {
    const out = autoLink([me, m('w', { relation: 'spouse', linksByHand: true })]);
    expect(by(out, 'w').spouseId).toBeUndefined();
    expect(by(out, 'me').spouseId).toBeUndefined();
  });

  it('does nothing without a manager, and ignores HUFs', () => {
    expect(autoLink([w, f])).toEqual([w, f]);
    expect(by(autoLink([me, m('h', { type: 'huf', relation: 'spouse' })]), 'me').spouseId).toBeUndefined();
  });
});

describe('linkProblems: checks on save', () => {
  it('spouse and parent of the same person', () => {
    const a = m('a', { spouseId: 'b', parentIds: ['b'] });
    expect(linkProblems(a, [a, m('b')])).toEqual([{ field: 'spouse', text: 'b can’t be both spouse and parent of a.' }]);
  });

  it("their own parent's parent", () => {
    const a = m('a', { parentIds: ['b'] });
    expect(linkProblems(a, [a, m('b', { parentIds: ['a'] })])).toEqual([{ field: 'parents', text: 'b is already set as a’s child.' }]);
  });

  it('none for a normal family', () => {
    const out = autoLink([m('me', { relation: 'self' }), m('w', { relation: 'spouse' })]);
    expect(linkProblems(out[0]!, out)).toEqual([]);
  });
});

describe('linkSummary: the one line on the member form', () => {
  it('relation to you plus links between other members', () => {
    const out = autoLink([m('me', { relation: 'self', name: 'Devansh' }), m('r', { relation: 'parent', name: 'Rekha' }), m('k', { relation: 'parent', name: 'Kirit' })]);
    expect(linkSummary(by(out, 'r'), out)).toBe('Devansh’s parent · spouse of Kirit');
    expect(linkSummary(by(out, 'me'), out)).toBe('Child of Rekha and Kirit');
  });
});

describe('linkChoices: what the form offers', () => {
  const fam = autoLink([
    m('me', { relation: 'self' }), m('w', { relation: 'spouse' }), m('r', { relation: 'parent', age: 66 }),
    m('k', { relation: 'parent', age: 68 }), m('c', { relation: 'child_minor', age: 8 }),
  ]);
  const ids = (xs: Member[]) => xs.map((x) => x.id);

  it('a parent: spouse is only the other parent; no parent choices without grandparents', () => {
    const c = linkChoices(by(fam, 'r'), fam);
    expect(ids(c.spouse)).toEqual(['k']);
    expect(c.parents).toEqual([]);
  });

  it('a parent with no other parent in the family gets no spouse choice', () => {
    const small = autoLink([m('me', { relation: 'self' }), m('r', { relation: 'parent', age: 66 }), m('w', { relation: 'spouse' })]);
    expect(linkChoices(by(small, 'r'), small).spouse).toEqual([]);
  });

  it('you: parents are only members marked Parent; spouse is not a parent or child', () => {
    const c = linkChoices(by(fam, 'me'), fam);
    expect(ids(c.parents)).toEqual(['r', 'k']);
    expect(ids(c.spouse)).toEqual(['w']);
  });

  it("son's wife picks among adult children", () => {
    const f2 = [m('me', { relation: 'self' }), m('a', { relation: 'child_adult', age: 30 }), m('b', { relation: 'child_adult', age: 27 }), m('d', { relation: 'daughter_in_law', age: 28 })];
    expect(ids(linkChoices(by(f2, 'd'), f2).husbands)).toEqual(['a', 'b']);
  });
});
