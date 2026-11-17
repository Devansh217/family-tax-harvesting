/**
 * Yearly cost gap between a regular and a direct plan, in percentage points, by fund type. An estimate: scheme-level
 * expense ratios would need their own monthly fetch, and a category figure is enough to rank and decide.
 * Source: docs/superpowers/specs/2026-11-17-beta-features-design.md §5.3.
 */
export const TER_GAP_IS_ESTIMATE = true;

const INDEX_OR_ETF = /\bindex\b|\betfs?\b|\bnifty\b|\bsensex\b|\bbees\b/i;

export function terGapFor(category?: string, name?: string): number {
  if (INDEX_OR_ETF.test(name ?? '') || INDEX_OR_ETF.test(category ?? '')) return 0.3;
  const c = category ?? '';
  if (/hybrid|arbitrage|equity savings|multi asset|balanced|asset allocation/i.test(c)) return 0.5;
  if (/debt|income|gilt|liquid|overnight|money market|bond/i.test(c)) return 0.4;
  if (/equity|elss/i.test(c)) return 1.0;
  return 0.5;
}
