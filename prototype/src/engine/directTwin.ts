import type { Security } from './types';

/** Same shape as `FundsFile['funds']` (src/prices/parse.ts): ISIN → fund name and SEBI category. Kept here so the engine imports nothing outside itself. */
export type FundsMap = Record<string, { n: string; c: string }>;

const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const optionOf = (name: string): 'growth' | 'idcw' => (/\b(idcw|dividend|payout|reinvest\w*)\b/.test(norm(name)) ? 'idcw' : 'growth');

/**
 * ISIN of the one fund whose name is this fund's with "Regular" turned into "Direct", in the same option (growth or
 * IDCW). Undefined when no fund or several funds fit: the family is then told to find it at the fund house.
 */
export function directTwin(sec: Pick<Security, 'isin' | 'name' | 'option'>, funds: FundsMap): string | undefined {
  const want = norm(sec.name).replace(/\bregular\b/, 'direct');
  if (want === norm(sec.name)) return undefined;
  const option = sec.option ?? optionOf(sec.name);
  const hits = Object.entries(funds).filter(([isin, f]) => isin !== sec.isin && norm(f.n) === want && optionOf(f.n) === option);
  return hits.length === 1 ? hits[0]![0] : undefined;
}
