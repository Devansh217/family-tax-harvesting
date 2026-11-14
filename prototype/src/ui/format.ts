import { QTY_SCALE, type ISODate, type Member, type Paise, type Qty } from '../engine/types';

const group = (n: number) => {
  const s = String(Math.abs(Math.trunc(n)));
  const last = s.slice(-3), rest = s.slice(0, -3);
  return (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last;
};

/** ₹1,25,000 — whole rupees, Indian grouping. */
export const inr = (p: Paise | null | undefined) => (p == null ? '—' : `${p < 0 ? '−' : ''}₹${group(Math.round(Math.abs(p) / 100))}`);

/** ₹4.95 L / ₹1.2 Cr for summaries; full figure below a lakh. */
export function inrShort(p: Paise): string {
  const r = Math.abs(p) / 100, sign = p < 0 ? '−' : '';
  if (r >= 1e7) return `${sign}₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (r >= 1e5) return `${sign}₹${(r / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  return inr(p);
}

export function units(q: Qty): string {
  const n = q / QTY_SCALE;
  return Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateLabel(d: ISODate, withYear = true): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return `${day} ${MON[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export const RELATIONS: Record<Member['relation'], string> = {
  self: 'You', spouse: 'Spouse', parent: 'Parent', child_adult: 'Adult child', child_minor: 'Minor child',
  sibling: 'Sibling', daughter_in_law: "Son's wife", other: 'Other relative',
};

const TINTS: Array<[string, string]> = [
  ['#E4E8FB', '#3A4FD0'], ['#F6E4EF', '#8E2A63'], ['#FBF2D9', '#7E5F0B'], ['#FBEAE1', '#A8471F'],
  ['#E1EDF6', '#1F5F8B'], ['#EFE8F8', '#6A3FA0'], ['#F3EBE1', '#7A4A1F'], ['#E6F0F0', '#22625F'],
];
export const tint = (index: number) => TINTS[index % TINTS.length]!;

export const possessive = (name: string) => (name.trim().toLowerCase() === 'you' ? 'Your' : `${name}'s`);
