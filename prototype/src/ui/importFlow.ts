import { detectDone, seasonStartOf } from '../engine/detect';
import type { Move } from '../engine/family';
import type { TaxRules } from '../engine/rules';
import type { ParseResult } from '../parsers';
import { applyImport, type AppState, type ImportOptions } from '../store';

/**
 * Adds a parsed file to a member, then marks done every move the new transactions confirm. `seen` is the moves as the
 * family last saw them, before this import changes anything: that is what a sale is matched against.
 */
export function importAndDetect(
  s: AppState,
  a: { memberId: string; fileName: string; result: ParseResult; opts: ImportOptions; seen: Move[]; rules: TaxRules; at: string },
): AppState {
  const next = applyImport(s, a.memberId, a.fileName, a.result, a.opts);
  const before = new Set(s.txns.map((t) => t.id));
  const detected = detectDone({
    moves: a.seen, records: s.recommendations, datedMoves: s.datedMoves, newTxns: next.txns.filter((t) => !before.has(t.id)),
    seasonStart: seasonStartOf(a.rules), seasonEnd: a.rules.end, at: a.at,
  });
  return detected.length ? { ...next, recommendations: [...next.recommendations, ...detected] } : next;
}
