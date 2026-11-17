import { addDays } from './dates';
import { summariseYear } from './tax';
import type { DatedMove, FamilyView, MemberView } from './family';
import { doneStatus, retiredMoveIds, type RecommendationRecord } from './records';
import { seasonStartOf } from './detect';
import type { ISODate, Paise } from './types';

export interface SeasonSummary {
  roomLeft: Paise; usable: Paise; used: Paise;
  movesWaiting: number; nextDate: ISODate | null; doneSinceWeek: number;
  shown: number; dated: number; done: number; detected: number;
  lastImport: ISODate | null; taxableGainsBooked: boolean;
}

/** Long-term equity gain a member booked in sales dated in [from, to], net of losses. */
function ltEquityGain(view: FamilyView, memberId: string, from: ISODate, to: ISODate): Paise {
  let sum = 0;
  for (const x of view.booked) {
    if (x.memberId === memberId && x.taxType === 'equity' && x.term === 'lt' && x.sellDate >= from && x.sellDate <= to) sum += x.gain;
  }
  return sum;
}

/** Long-term equity gain still harvestable: positive-gain, long-term, certain, unlocked lots of equity holdings. */
function harvestable(v: MemberView, asOf: ISODate): Paise {
  let sum = 0;
  for (const h of v.holdings) {
    if (h.taxType !== 'equity') continue;
    for (const l of h.lots) {
      if (l.term === 'lt' && l.certain && (l.gain ?? 0) > 0 && !(l.lockedUntil && l.lockedUntil > asOf)) sum += l.gain ?? 0;
    }
  }
  return sum;
}

/**
 * Usable room and move counts for the season (spec section 1, "Usable room, defined"). Per member, used = long-term equity
 * gain sold from season start that fell inside the member's room; left = min(room free now, gain still harvestable).
 * `imports[].date` is the day of each import (the caller converts the stored timestamp).
 */
export function seasonSummary(
  view: FamilyView,
  state: { recommendations: RecommendationRecord[]; datedMoves: DatedMove[]; imports: { date: ISODate }[] },
  asOf: ISODate,
  seasonStart: ISODate = seasonStartOf(view.rules),
): SeasonSummary {
  const rules = view.rules;
  let used = 0, usable = 0, roomLeft = 0;
  for (const v of view.members) {
    const free = v.plan.room.free + v.plan.bonus.free;
    roomLeft += free;
    const zero = summariseYear(v.member, [], rules, v.business);
    const fullRoom = zero.room.free + zero.bonus.free;
    const before = ltEquityGain(view, v.member.id, rules.start, addDays(seasonStart, -1));
    const since = Math.max(0, ltEquityGain(view, v.member.id, seasonStart, rules.end));
    const usedM = Math.max(0, Math.min(since, Math.max(0, fullRoom - before)));
    const leftM = Math.max(0, Math.min(free, harvestable(v, asOf)));
    used += usedM;
    usable += usedM + leftM;
  }

  const done = doneStatus(state.recommendations);
  const retired = retiredMoveIds(state.recommendations);
  const waiting = view.moves.filter((m) => m.kind !== 'wait' && !m.noRoom && !done.has(m.id));
  const dates = waiting.map((m) => m.date).filter((d): d is ISODate => !!d && d >= asOf).sort();

  const prefix = `${rules.label}|`;
  const shown = new Set(state.recommendations.filter((r) => r.event === 'shown' && r.moveId.startsWith(prefix)).map((r) => r.moveId));
  const weekFrom = addDays(asOf, -7);
  const recent = new Set(
    state.recommendations
      .filter((r) => (r.event === 'done' || r.event === 'detected_done') && r.at.slice(0, 10) > weekFrom && r.at.slice(0, 10) <= asOf)
      .map((r) => r.moveId),
  );
  const dated = new Set(state.datedMoves.filter((d) => d.moveId.startsWith(prefix) && !retired.has(d.moveId)).map((d) => d.moveId));
  const thisYear = [...done.values()].filter((x) => x.record.moveId.startsWith(prefix));
  const imports = state.imports.map((i) => i.date).sort();

  return {
    roomLeft, usable, used,
    movesWaiting: waiting.length, nextDate: dates[0] ?? null, doneSinceWeek: recent.size,
    shown: shown.size, dated: dated.size,
    done: thisYear.filter((x) => !x.detected).length,
    detected: thisYear.filter((x) => x.detected).length,
    lastImport: imports[imports.length - 1] ?? null,
    taxableGainsBooked: view.members.some((v) => v.year.tax > 0),
  };
}
