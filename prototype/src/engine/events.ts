import { addDays } from './dates';
import type { FamilyView } from './family';
import { longTermMonthsFor } from './tax';
import type { ISODate, Paise } from './types';

export type EventKind = 'turns_long_term' | 'room_left';

/** A date that matters for a member: the input for alerts and the beta's notification policy. */
export interface DatedEvent { date: ISODate; kind: EventKind; memberId: string; isin?: string; amount?: Paise; text: string }

const rupees = (p: Paise) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/**
 * Upcoming dates, soonest first: lots in gain that turn long-term within `horizonDays` (only types that can become
 * long-term), and each member's unused tax-free room on the last day of the tax year.
 */
export function datedEvents(view: FamilyView, asOf: ISODate, horizonDays = 90): DatedEvent[] {
  const until = addDays(asOf, horizonDays);
  const out: DatedEvent[] = [];
  for (const v of view.members) {
    for (const h of v.holdings) {
      if (longTermMonthsFor(h.taxType, h.listed, view.rules) == null || h.taxType === 'check') continue;
      for (const l of h.lots) {
        if (l.term !== 'st' || l.gain == null || l.gain <= 0 || l.longTermOn <= asOf || l.longTermOn > until) continue;
        out.push({
          date: l.longTermOn, kind: 'turns_long_term', memberId: v.member.id, isin: h.isin, amount: l.gain,
          text: `${v.member.name}'s ${h.name} turns long-term on ${l.longTermOn}: ${rupees(l.gain)} of gain taxed at 12.5% instead of 20% if sold after that.`,
        });
      }
    }
    const room = v.plan.room.free + v.plan.bonus.free;
    if (room > 0 && view.rules.end >= asOf) {
      out.push({
        date: view.rules.end, kind: 'room_left', memberId: v.member.id, amount: room,
        text: `${v.member.name} has ${rupees(room)} of tax-free room that lapses on ${view.rules.end}.`,
      });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
