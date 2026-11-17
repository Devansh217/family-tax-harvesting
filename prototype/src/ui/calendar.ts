import type { Move } from '../engine/family';
import type { ISODate } from '../engine/types';

export interface IcsInput { moves: Move[]; nameOf: (id: string) => string; lastSafeDay: ISODate | null; yearEnd: ISODate }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compact = (d: ISODate) => d.replace(/-/g, '');

/** Fold at 75 octets (RFC 5545), never splitting a character. */
function fold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let len = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > limit) { out.push(cur); cur = ' '; len = 1; limit = 75; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out;
}

const TIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Asia/Kolkata', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0530', 'TZOFFSETTO:+0530', 'TZNAME:IST', 'END:STANDARD', 'END:VTIMEZONE',
];

function event(uid: string, date: ISODate, summary: string, stamp: string): string[] {
  const d = compact(date);
  return [
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Kolkata:${d}T093000`, `DTEND;TZID=Asia/Kolkata:${d}T094500`,
    `SUMMARY:${esc(summary)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT',
  ];
}

/** An iCalendar file for the dated steps. Summaries never carry units or amounts: those go stale by the day. */
export function buildIcs({ moves, nameOf, lastSafeDay, yearEnd }: IcsInput, stamp = '20261117T000000Z'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Harvesting//Family tax planner//EN', 'CALSCALE:GREGORIAN', ...TIMEZONE];
  for (const m of moves) {
    if (!m.date || m.noRoom) continue;
    const who = m.kind === 'gift' ? nameOf(m.fromId) : 'memberId' in m ? nameOf(m.memberId) : '';
    const taker = m.kind === 'gift' ? nameOf(m.toId) : who;
    const sell = m.kind === 'harvest_gain' ? `${who}: sell and buy back ${m.name}.`
      : m.kind === 'switch_direct' ? `${who}: sell the regular plan of ${m.name}.`
      : m.kind === 'gift' ? `${who}: gift ${m.name} to ${taker}.`
      : m.kind === 'harvest_loss' ? `${who}: sell ${m.name} at a loss.`
      : null;
    if (sell === null) continue;
    lines.push(...event(`${m.id}-sell@harvesting`, m.date, `${sell} Open Harvesting for today's units.`, stamp));
    if (m.buyOn) {
      const buy = m.kind === 'switch_direct' ? `${who}: buy the direct plan of ${m.name}.`
        : m.kind === 'harvest_loss' ? `${who}: buy back ${m.name} if you want it.`
        : `${taker}: buy back ${m.name}.`;
      lines.push(...event(`${m.id}-buy@harvesting`, m.buyOn, buy, stamp));
    }
  }
  if (lastSafeDay) lines.push(...event(`last-safe-day-${lastSafeDay}@harvesting`, lastSafeDay, 'Harvesting: last safe day to sell this tax year', stamp));
  lines.push(...event(`year-end-${yearEnd}@harvesting`, yearEnd, 'Harvesting: tax year ends today', stamp));
  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
