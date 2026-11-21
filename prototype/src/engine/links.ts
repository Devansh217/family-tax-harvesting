import type { Member, Relation } from './types';

/**
 * Family links (spouse and parents) filled in from each member's "Relation to you", so the manager never has to tick
 * them. Only gaps are filled: a link set by hand is never overwritten, and a member whose links were changed by hand
 * (`linksByHand`) is left alone. Links this function set are recorded in `autoLinks`, so a later run can take them
 * back when a relation changes. Running it twice gives the same result.
 */
export function autoLink(members: Member[]): Member[] {
  const self = members.find((x) => x.relation === 'self' && x.type !== 'huf');
  // 1. Take back last run's links, so a changed relation drops what it had set.
  const out = members.map(stripAuto);
  if (!self) return out.some((x, i) => x !== members[i]) ? out : members;

  const people = out.filter((x) => x.type !== 'huf');
  const withRel = (...rs: Relation[]) => people.filter((x) => rs.includes(x.relation));
  const spouses = withRel('spouse');
  const parents = withRel('parent');
  const children = withRel('child_adult', 'child_minor');
  const adultChildren = withRel('child_adult');
  const spouse = spouses.length === 1 ? spouses[0]! : undefined;
  // Two parents at most: with three (a step-parent) it can't be told who is married to whom.
  const myParents = parents.length <= 2 ? parents : [];

  const pairs: Array<[Member, Member]> = [];
  const edges: Array<[Member, Member]> = []; // [child, parent]
  if (spouse) pairs.push([self, spouse]);
  if (myParents.length === 2) pairs.push([myParents[0]!, myParents[1]!]);
  for (const p of myParents) edges.push([self, p]);
  for (const c of children) {
    edges.push([c, self]);
    if (spouse) edges.push([c, spouse]);
  }
  for (const s of withRel('sibling')) for (const p of myParents) edges.push([s, p]);
  if (adultChildren.length === 1) for (const d of withRel('daughter_in_law')) pairs.push([d, adultChildren[0]!]);
  if (parents.length === 1) for (const g of withRel('grandparent')) edges.push([parents[0]!, g]);

  // 2. Fill gaps, recording what was filled.
  const byId = new Map(out.map((x) => [x.id, x]));
  const edit = (id: string, fn: (x: Member) => Member) => byId.set(id, fn(byId.get(id)!));
  for (const [a, b] of pairs) {
    const x = byId.get(a.id)!, y = byId.get(b.id)!;
    if (x.linksByHand || y.linksByHand) continue;
    if ((x.spouseId && x.spouseId !== y.id) || (y.spouseId && y.spouseId !== x.id)) continue;
    if (!x.spouseId) edit(x.id, (v) => ({ ...v, spouseId: y.id, autoLinks: { ...v.autoLinks, spouseId: y.id } }));
    if (!y.spouseId) edit(y.id, (v) => ({ ...v, spouseId: x.id, autoLinks: { ...v.autoLinks, spouseId: x.id } }));
  }
  for (const [c, p] of edges) {
    const x = byId.get(c.id)!;
    const have = x.parentIds ?? [];
    if (x.linksByHand || have.includes(p.id) || have.length >= 2) continue;
    edit(x.id, (v) => ({ ...v, parentIds: [...have, p.id], autoLinks: { ...v.autoLinks, parentIds: [...(v.autoLinks?.parentIds ?? []), p.id] } }));
  }
  const result = out.map((x) => byId.get(x.id)!);
  // Keep the same array (and members) when nothing changed, so React state doesn't churn.
  return result.every((x, i) => same(x, members[i]!)) ? members : result;
}

/** A member without last run's automatic links. Links set by hand stay. */
function stripAuto(x: Member): Member {
  if (!x.autoLinks) return x;
  const { autoLinks: a, ...rest } = x;
  if (x.linksByHand) return rest; // they own these values now
  const parentIds = (x.parentIds ?? []).filter((id) => !a.parentIds?.includes(id));
  return {
    ...rest,
    spouseId: a.spouseId && x.spouseId === a.spouseId ? undefined : x.spouseId,
    parentIds: parentIds.length ? parentIds : undefined,
  };
}

function same(a: Member, b: Member) {
  return a === b || JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}
const clean = (x: Member) => JSON.parse(JSON.stringify(x)) as Member; // drops undefined keys

/** Problems with a member's links, for the member form to show next to the field and block the save. */
export function linkProblems(m: Member, members: Member[]): Array<{ field: 'spouse' | 'parents'; text: string }> {
  const name = (id: string) => members.find((x) => x.id === id)?.name || 'Unnamed';
  const out: Array<{ field: 'spouse' | 'parents'; text: string }> = [];
  if (m.spouseId && m.parentIds?.includes(m.spouseId)) out.push({ field: 'spouse', text: `${name(m.spouseId)} can’t be both spouse and parent of ${m.name || 'Unnamed'}.` });
  for (const pid of m.parentIds ?? []) {
    if (members.find((x) => x.id === pid)?.parentIds?.includes(m.id)) out.push({ field: 'parents', text: `${name(pid)} is already set as ${m.name || 'Unnamed'}’s child.` });
  }
  return out;
}

const REL_WORDS: Record<Relation, string> = {
  self: 'you', spouse: 'spouse', parent: 'parent', grandparent: 'grandparent', child_adult: 'adult child', child_minor: 'minor child',
  sibling: 'sibling', daughter_in_law: 'son’s wife', other: 'relative',
};

/** One line for the member form, e.g. "Devansh’s parent · spouse of Kirit". Links already said by the relation are left out. */
export function linkSummary(m: Member, members: Member[]): string {
  const self = members.find((x) => x.relation === 'self' && x.type !== 'huf');
  const name = (id: string) => members.find((x) => x.id === id)?.name || 'Unnamed';
  const parts: string[] = [];
  if (m.relation !== 'self' && self) parts.push(`${self.name || 'Your'}’s ${REL_WORDS[m.relation]}`);
  const spouseId = m.spouseId ?? members.find((x) => x.spouseId === m.id)?.id;
  if (spouseId && members.some((x) => x.id === spouseId) && !(m.relation === 'spouse' && spouseId === self?.id)) parts.push(`spouse of ${name(spouseId)}`);
  const ps = (m.parentIds ?? []).filter((id) => members.some((x) => x.id === id));
  const saidByRelation = (m.relation === 'child_adult' || m.relation === 'child_minor') && ps.includes(self?.id ?? '');
  if (ps.length && !saidByRelation) parts.push(`child of ${ps.map(name).join(' and ')}`);
  const line = parts.join(' · ');
  return line ? line[0]!.toUpperCase() + line.slice(1) : 'Not linked to anyone yet';
}

/** Which relations can be this member's parents, by the member's own relation. Null means anyone. */
const PARENT_RELATIONS: Record<Relation, Relation[] | null> = {
  self: ['parent'], parent: ['grandparent'], grandparent: [], sibling: ['parent'], spouse: ['other'], daughter_in_law: ['other'],
  child_adult: ['self', 'spouse', 'other'], child_minor: ['self', 'spouse', 'other'], other: null,
};

/**
 * The choices the member form offers when links are changed by hand: only ones that make sense for this member's
 * relation. An empty list means the form shows no field at all. The current value is always kept as a choice.
 */
export function linkChoices(m: Member, members: Member[]): { spouse: Member[]; parents: Member[]; husbands: Member[] } {
  const others = members.filter((x) => x.id !== m.id && x.type !== 'huf');
  const myParents = new Set(m.parentIds ?? []);
  const myChildren = new Set(others.filter((x) => x.parentIds?.includes(m.id)).map((x) => x.id));
  const elders: Relation[] = ['parent', 'grandparent'];
  const spouse = others.filter((x) => {
    if (x.id === m.spouseId) return true;
    if (myParents.has(x.id) || myChildren.has(x.id)) return false;
    if (elders.includes(m.relation)) return x.relation === m.relation;
    return !elders.includes(x.relation);
  });
  const allowed = PARENT_RELATIONS[m.relation];
  const parents = others.filter((x) => {
    if (myParents.has(x.id)) return true;
    if (x.id === m.spouseId || x.spouseId === m.id || myChildren.has(x.id)) return false;
    return allowed === null || allowed.includes(x.relation);
  });
  const husbands = m.relation === 'daughter_in_law' ? others.filter((x) => x.relation === 'child_adult') : [];
  return { spouse, parents, husbands };
}
