import type { Move } from './family';
import type { TaxRules } from './rules';

/** A move before its id is attached. */
export type MoveDraft = Move extends infer M ? (M extends Move ? Omit<M, 'id'> : never) : never;

/**
 * A move's id is what it is, not a random number: tax year, kind, members, security and account. So its status and its
 * records survive a recompute, and a changed quantity is still the same move.
 */
export function moveId(m: MoveDraft, r: TaxRules): string {
  const who = m.kind === 'gift' ? `gift|${m.fromId}>${m.toId}` : `${m.kind}|${m.memberId}`;
  return `${r.label}|${who}|${m.isin}|${m.account}`;
}

export type RecordEvent = 'shown' | 'in_plan' | 'done' | 'dismissed' | 'undone';

/** What was suggested, when, and what happened to it. Append-only: the app never edits or removes one. */
export interface RecommendationRecord { moveId: string; at: string; event: RecordEvent; move: Move }

/** One 'shown' record for each move never recorded before. */
export function newShownRecords(moves: Move[], existing: RecommendationRecord[], at: string): RecommendationRecord[] {
  const seen = new Set(existing.map((x) => x.moveId));
  return moves.filter((m) => !seen.has(m.id)).map((m) => ({ moveId: m.id, at, event: 'shown', move: m }));
}

export const statusRecord = (move: Move, event: RecordEvent, at: string): RecommendationRecord => ({ moveId: move.id, at, event, move });
