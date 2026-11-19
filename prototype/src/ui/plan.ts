import { taxFreeGainOf, type FamilyView, type Move } from '../engine/family';
import { doneThisSeason, type RecommendationRecord } from '../engine/records';
import type { ISODate } from '../engine/types';

/** Days a move can be put on: from today to the last safe day, or to the end of the tax year when that is not known. */
export const datePickerBounds = (today: ISODate, yearEnd: ISODate, lastSafe: ISODate | null) => ({ min: today, max: lastSafe ?? yearEnd });

export const dateVerb = (kind: Move['kind']) => (kind === 'gift' ? 'Gift and sell on' : kind === 'switch_direct' ? 'Switch on' : 'Sell on');

/** Tax cut this year by a move (losses and waits); harvests, gifts and switches pay off later or in fees. */
const nowSavingOf = (m: Move) => (m.kind === 'harvest_loss' || m.kind === 'wait' ? m.saving : 0);

/**
 * The Plan screen's lists and headline. Done moves (marked, or seen in a statement) leave the open lists for "Done this
 * season", built from their records, so they stay counted after the next import sells the units and the move is gone.
 */
export function planView(fam: Pick<FamilyView, 'moves' | 'rules'>, records: RecommendationRecord[]) {
  const done = doneThisSeason(records, fam.rules).map((d) => ({
    ...d, label: d.detected ? 'Done, seen in your statement' : 'Marked done',
  }));
  const doneIds = new Set(done.map((d) => d.move.id));
  const open = fam.moves.filter((m) => !doneIds.has(m.id));
  const sum = (ms: Move[], f: (m: Move) => number) => ms.reduce((a, m) => a + f(m), 0);
  const doneMoves = done.map((d) => d.move).filter((m) => !m.noRoom);
  const gainDone = sum(doneMoves, taxFreeGainOf);
  const nowDone = sum(doneMoves, nowSavingOf);
  return {
    open, done, gainDone, gainTotal: gainDone + sum(open, taxFreeGainOf), nowDone, nowTotal: nowDone + sum(open, nowSavingOf),
    doneCount: doneMoves.length, liveCount: doneMoves.length + open.filter((m) => !m.noRoom).length,
  };
}
