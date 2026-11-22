import { ageOn } from './dates';
import { FY_2026_27, normalIncomeOf } from './rules';
import type { ISODate, Member } from './types';

/** How `b` is related to `a`, worked out from spouse and parent links so any pair works, not only pairs with the manager. */
export type PairRelation = 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'grandparent' | 'grandchild' | 'parent_in_law' | 'child_in_law' | 'other';

/** Parent ids that point at members in this family (stale ids are ignored). */
const parentsOf = (x: Member, members: Member[]) => (x.parentIds ?? []).filter((id) => members.some((y) => y.id === id));

/** Spouse id from either side, so a link recorded on one side only still counts. */
function spouseOf(x: Member, members: Member[]): string | undefined {
  if (x.spouseId && members.some((y) => y.id === x.spouseId)) return x.spouseId;
  return members.find((y) => y.spouseId === x.id)?.id;
}

/** For families saved without links: relation of `b` to `a` from both members' relation to the manager. */
function fromManager(a: Member, b: Member): PairRelation {
  const pair = `${a.relation}>${b.relation}`;
  const table: Record<string, PairRelation> = {
    'self>spouse': 'spouse', 'spouse>self': 'spouse',
    'self>parent': 'parent', 'parent>self': 'child',
    'self>child_adult': 'child', 'self>child_minor': 'child', 'spouse>child_adult': 'child', 'spouse>child_minor': 'child',
    'child_adult>self': 'parent', 'child_minor>self': 'parent', 'child_adult>spouse': 'parent', 'child_minor>spouse': 'parent',
    'self>sibling': 'sibling', 'sibling>self': 'sibling',
    'self>daughter_in_law': 'child_in_law', 'spouse>daughter_in_law': 'child_in_law',
    'daughter_in_law>self': 'parent_in_law', 'daughter_in_law>spouse': 'parent_in_law',
    'parent>spouse': 'child_in_law', 'spouse>parent': 'parent_in_law',
    'parent>child_adult': 'grandchild', 'parent>child_minor': 'grandchild', 'child_adult>parent': 'grandparent', 'child_minor>parent': 'grandparent',
    // Siblings share the manager's parents. Two parents are handled in pairRelation, which can count them.
    'sibling>sibling': 'sibling', 'parent>sibling': 'child', 'sibling>parent': 'parent',
    'child_adult>child_adult': 'sibling', 'child_adult>child_minor': 'sibling', 'child_minor>child_adult': 'sibling', 'child_minor>child_minor': 'sibling',
    // The manager's own grandparent. Which parent's parent they are can't be told without a link, so parent>grandparent stays 'other'.
    'self>grandparent': 'grandparent', 'grandparent>self': 'grandchild',
  };
  return table[pair] ?? 'other';
}

/**
 * Links first; when they don't connect the pair (no links, half-entered links, or a stale id), fall back to both
 * members' relation to the manager, so a spouse added without the spouse link is still a spouse.
 */
export function pairRelation(a: Member, b: Member, members: Member[]): PairRelation {
  if (a.id === b.id) return 'self';
  const linked = fromLinks(a, b, members);
  if (linked !== 'other') return linked;
  // The manager's two parents are each other's spouse. With three or more (a step-parent), don't guess.
  if (a.relation === 'parent' && b.relation === 'parent') return members.filter((x) => x.relation === 'parent').length === 2 ? 'spouse' : 'other';
  return fromManager(a, b);
}

function fromLinks(a: Member, b: Member, members: Member[]): PairRelation {
  if (spouseOf(a, members) === b.id || spouseOf(b, members) === a.id) return 'spouse';
  const pa = parentsOf(a, members), pb = parentsOf(b, members);
  if (pa.includes(b.id)) return 'parent';
  if (pb.includes(a.id)) return 'child';
  if (pa.some((id) => pb.includes(id))) return 'sibling';
  const byId = (id: string) => members.find((y) => y.id === id)!;
  if (pa.some((id) => parentsOf(byId(id), members).includes(b.id))) return 'grandparent';
  if (pb.some((id) => parentsOf(byId(id), members).includes(a.id))) return 'grandchild';
  const sa = spouseOf(a, members), sb = spouseOf(b, members);
  if (sa && parentsOf(byId(sa), members).includes(b.id)) return 'parent_in_law';
  if (sb && parentsOf(byId(sb), members).includes(a.id)) return 'child_in_law';
  return 'other';
}

/**
 * Whose income a gift from `from` to `to` counts as (s.99, old s.64). Null when the receiver is taxed on it themself.
 * Spouse: the giver. Child-in-law: the giver (the law clubs only a son's wife; the model has no gender, so it is
 * conservative for a son-in-law). A minor: the parent with the higher income, whoever gave. Own HUF: the member.
 */
export function clubbing(from: Member, to: Member, members: Member[], asOf: ISODate): { taxedInId: string; reason: string } | null {
  if (from.id === to.id) return null;
  if (to.type === 'huf') {
    return to.hufMemberIds?.includes(from.id) ? { taxedInId: from.id, reason: `A member's gift to their own HUF stays ${from.name}'s income.` } : null;
  }
  const rel = pairRelation(from, to, members);
  if (rel === 'spouse') return { taxedInId: from.id, reason: `Income from a gift to a spouse is taxed in ${from.name}'s hands.` };
  if (rel === 'child_in_law') {
    return { taxedInId: from.id, reason: `Income from a gift to a son's wife is taxed in the giver's hands. Treated the same for a son-in-law, to be safe.` };
  }
  if (ageOn(to, asOf) < 18) {
    const parents = parentsOf(to, members).map((id) => members.find((y) => y.id === id)!);
    const income = (x: Member) => normalIncomeOf(x, FY_2026_27, asOf) ?? 0;
    const top = [...parents].sort((x, y) => income(y) - income(x))[0];
    return { taxedInId: top?.id ?? from.id, reason: `A minor's income is taxed in the hands of the parent with the higher income.` };
  }
  return null;
}

const RELATIVES: PairRelation[] = ['spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'parent_in_law', 'child_in_law'];

/**
 * A "relative" for the gift exemption (s.92, old s.56(2)(x)): gifts from relatives are not taxed in the receiver's
 * hands; from anyone else, over ₹50,000 a year they are. For an HUF, its relatives are its own members.
 */
export function isRelative(from: Member, to: Member, members: Member[]): boolean {
  if (to.type === 'huf') return !!to.hufMemberIds?.includes(from.id);
  if (from.type === 'huf') return !!from.hufMemberIds?.includes(to.id);
  return RELATIVES.includes(pairRelation(from, to, members));
}

/** A gift that really moves the tax: not to oneself, to a relative, not clubbed back, and to a resident. */
export function canGift(from: Member, to: Member, members: Member[], asOf: ISODate): boolean {
  return from.id !== to.id && isRelative(from, to, members) && clubbing(from, to, members, asOf) === null && to.resident !== false;
}
