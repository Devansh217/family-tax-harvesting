/**
 * Groups AMFI category headings for a picker. AMFI renamed "Equity Scheme - X" to "Equity Schemes - X" (and the same for
 * Hybrid), so its list holds both spellings of one category; the engine classifies them alike, so the picker shows one.
 * The value kept is the full heading, so the engine still receives a real AMFI category.
 */
export interface CategoryGroup { label: string; options: Array<{ value: string; label: string }> }

const GROUPS: Array<[RegExp, string]> = [
  [/^Equity Schemes?$/i, 'Equity'],
  [/^Hybrid Schemes?$/i, 'Hybrid'],
  [/^Debt Scheme$/i, 'Debt'],
  [/^Income\/Debt Oriented Schemes$/i, 'Debt (older AMFI names)'],
  [/^Exchange Traded Funds/i, 'ETFs'],
  [/^Index Funds$/i, 'Index funds'],
];

const key = (s: string) => s.toLowerCase().replace(/\bfunds?\b/g, '').replace(/[^a-z0-9]/g, '');

export function groupCategories(headings: string[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup & { seen: Set<string> }>();
  for (const h of [...new Set(headings)].sort()) {
    const dash = h.indexOf(' - ');
    const prefix = dash > 0 ? h.slice(0, dash).trim() : '';
    const name = dash > 0 ? h.slice(dash + 3).trim() : h;
    const group = GROUPS.find(([re]) => re.test(prefix))?.[1] ?? 'Other';
    let g = groups.get(group);
    if (!g) groups.set(group, (g = { label: group, options: [], seen: new Set() }));
    const k = key(name);
    if (g.seen.has(k)) continue;
    g.seen.add(k);
    g.options.push({ value: h, label: group === 'Other' ? h : name });
  }
  const order = [...GROUPS.map(([, l]) => l), 'Other'];
  return order.flatMap((l) => {
    const g = groups.get(l);
    return g ? [{ label: g.label, options: g.options }] : [];
  });
}
