/** One weekly row of beta totals, as the `admin` function's `season` route returns it. */
export interface SeasonRow {
  week: string; families: number; room_usable: number; room_used: number; used_share_by_family: number[];
  moves_shown: number; moves_dated: number; moves_done: number; moves_detected: number; families_with_detected: number;
}

const NUMS = ['families', 'room_usable', 'room_used', 'moves_shown', 'moves_dated', 'moves_done', 'moves_detected', 'families_with_detected'] as const;

/** The rows when the reply is a list of well-formed season rows; null for anything else (an old `admin` deploy answers with the family list). */
export function parseSeasonRows(x: unknown): SeasonRow[] | null {
  if (!Array.isArray(x)) return null;
  for (const r of x) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    if (typeof o.week !== 'string') return null;
    if (!NUMS.every((k) => typeof o[k] === 'number')) return null;
    if (!Array.isArray(o.used_share_by_family) || !o.used_share_by_family.every((n) => typeof n === 'number')) return null;
  }
  return x as SeasonRow[];
}
