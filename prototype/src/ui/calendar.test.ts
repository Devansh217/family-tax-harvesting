import { describe, expect, it } from 'vitest';
import type { Move } from '../engine/family';
import { buildIcs } from './calendar';

const nameOf = (id: string) => (id === 'a' ? 'Asha' : 'Ravi');
const base = { isin: 'INF1', name: 'Nifty 50 Index Fund', account: '', qty: 123_450_000, value: 5_000_000, taxAvoided: 0, costs: 0, saving: 0, reasons: [] };
const gain = { ...base, id: 'm1', kind: 'harvest_gain', memberId: 'a', gain: 1, date: '2027-02-15', buyOn: '2027-02-16' } as unknown as Move;
const input = (moves: Move[], lastSafeDay: string | null = '2027-03-29') => ({ moves, nameOf, lastSafeDay, yearEnd: '2027-03-31' });
const events = (s: string) => s.split('BEGIN:VEVENT').slice(1);
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('buildIcs', () => {
  it('wraps a calendar with CRLF lines', () => {
    const s = buildIcs(input([gain]));
    expect(s.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(s.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(s).toContain('VERSION:2.0');
    expect(s).toContain('PRODID:');
    expect(s).toContain('BEGIN:VTIMEZONE');
    expect(s).toContain('TZID:Asia/Kolkata');
    expect(s).toContain('TZOFFSETFROM:+0530');
    expect(s.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
  it('has one event per dated step plus last safe day and year end, with stable UIDs', () => {
    const s = buildIcs(input([gain, { ...gain, id: 'm2', date: undefined, buyOn: undefined } as Move, { ...gain, id: 'm3', noRoom: true } as Move]));
    expect(events(s)).toHaveLength(4);
    expect(s).toContain('UID:m1-sell@harvesting');
    expect(s).toContain('UID:m1-buy@harvesting');
    expect(s).toContain('UID:last-safe-day-2027-03-29@harvesting');
    expect(s).toContain('UID:year-end-2027-03-31@harvesting');
    expect(buildIcs(input([gain]))).toBe(buildIcs(input([gain])));
  });
  it('omits the last safe day when unknown', () => {
    expect(events(buildIcs(input([], null)))).toHaveLength(1);
  });
  it('times events at 9:30 for 15 minutes with an alarm at start', () => {
    const s = buildIcs(input([gain]));
    expect(s).toContain('DTSTART;TZID=Asia/Kolkata:20270215T093000');
    expect(s).toContain('DTEND;TZID=Asia/Kolkata:20270215T094500');
    expect(s).toContain('DTSTART;TZID=Asia/Kolkata:20270216T093000');
    expect(s).toContain('BEGIN:VALARM');
    expect(s).toContain('TRIGGER:PT0M');
  });
  it('writes summaries without units, digits of quantity or rupees', () => {
    const s = unfold(buildIcs(input([gain])));
    expect(s).toContain("SUMMARY:Asha: sell and buy back Nifty 50 Index Fund. Open Harvesting for today's units.");
    expect(s).toContain('SUMMARY:Asha: buy back Nifty 50 Index Fund.');
    for (const line of s.split('\r\n').filter((l) => l.startsWith('SUMMARY'))) {
      expect(line).not.toContain('₹');
      expect(line).not.toContain('12345');
      if (!line.includes('sell')) expect(line).not.toContain('units');
    }
  });
  it('words each kind', () => {
    const mk = (o: object) => unfold(buildIcs(input([{ ...gain, ...o } as Move])));
    expect(mk({ kind: 'switch_direct' })).toContain('Asha: sell the regular plan of Nifty 50 Index Fund. Open');
    expect(mk({ kind: 'switch_direct' })).toContain('Asha: buy the direct plan of Nifty 50 Index Fund.');
    const g = mk({ kind: 'gift', fromId: 'a', toId: 'r' });
    expect(g).toContain('Asha: gift Nifty 50 Index Fund to Ravi. Open');
    expect(g).toContain('Ravi: buy back Nifty 50 Index Fund.');
    const l = mk({ kind: 'harvest_loss' });
    expect(l).toContain('Asha: sell Nifty 50 Index Fund at a loss. Open');
    expect(l).toContain('Asha: buy back Nifty 50 Index Fund if you want it.');
  });
  it('escapes commas and semicolons and folds long lines', () => {
    const s = buildIcs(input([{ ...gain, name: 'A, B; C Fund with a really very long name that will need to be folded across lines' } as Move]));
    expect(s).toContain('A\\, B\; C Fund');
    for (const line of s.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('titles the year-end events', () => {
    const s = buildIcs(input([]));
    expect(s).toContain('SUMMARY:Harvesting: last safe day to sell this tax year');
    expect(s).toContain('SUMMARY:Harvesting: tax year ends today');
  });
});
