import { describe, expect, it } from 'vitest';
import { emailKindFor, renderEmail, type SeasonEmailInput } from './seasonEmail.ts';
import type { seasonSummary } from '../../../src/engine/seasonSummary';

// Drift guard: the engine's summary must stay assignable to the server's local input type.
const fromEngine = (s: ReturnType<typeof seasonSummary>): SeasonEmailInput => s;
void fromEngine;

const LAST_SAFE = '2027-03-29';
const base: SeasonEmailInput = { roomLeft: 340_000_00, movesWaiting: 3, nextDate: '2027-02-26', doneSinceWeek: 2, taxableGainsBooked: false };
const rupees = (t: string) => (t.match(/₹/g) ?? []).length;
const URL = 'https://app.example.in/';
const mk = (kind: Parameters<typeof renderEmail>[0], s = base, savedOn = '2027-02-03', today = '2027-02-07', lastSafe: string | null = LAST_SAFE) =>
  renderEmail(kind, s, savedOn, today, URL, lastSafe)!;

describe('emailKindFor', () => {
  it('maps the schedule', () => {
    expect(emailKindFor('2027-02-01', LAST_SAFE)).toBe('email_start');
    expect(emailKindFor('2027-02-07', LAST_SAFE)).toBe('email_weekly');
    expect(emailKindFor('2027-03-28', LAST_SAFE)).toBe('email_weekly');
    expect(emailKindFor('2027-03-01', LAST_SAFE)).toBe('email_deadline');
    expect(emailKindFor('2027-03-15', LAST_SAFE)).toBe('email_deadline');
    expect(emailKindFor(LAST_SAFE, LAST_SAFE)).toBe('email_deadline');
    expect(emailKindFor('2027-02-08', LAST_SAFE)).toBeNull();
    expect(emailKindFor('2027-04-04', LAST_SAFE)).toBeNull();
    expect(emailKindFor('2027-01-31', LAST_SAFE)).toBeNull();
  });
  it('deadline wins over weekly when last safe day is a Sunday', () => {
    expect(emailKindFor('2027-03-28', '2027-03-28')).toBe('email_deadline');
  });
  it('works with an unpublished last safe day and in other years', () => {
    expect(emailKindFor('2027-03-29', null)).toBeNull();
    expect(emailKindFor('2027-03-01', null)).toBe('email_deadline');
    expect(emailKindFor('2028-02-13', null)).toBe('email_weekly'); // a Sunday in 2028, inside the window
    expect(emailKindFor('2028-02-06', null)).toBeNull(); // a Sunday before 7 Feb
    expect(emailKindFor('2028-02-07', null)).toBeNull();
    expect(emailKindFor('2028-02-01', null)).toBe('email_start');
  });
  it('weekly window is Sundays from 7 Feb to 28 Mar', () => {
    expect(emailKindFor('2027-02-07', null)).toBe('email_weekly');
    expect(emailKindFor('2027-03-28', null)).toBe('email_weekly');
    expect(emailKindFor('2024-03-31', null)).toBeNull(); // a Sunday after 28 Mar
    expect(emailKindFor('2027-02-14', null)).toBe('email_weekly');
  });
  it('1 Feb on a Sunday is the start email, not a weekly one', () => {
    expect(emailKindFor('2026-02-01', null)).toBe('email_start'); // 1 Feb 2026 is a Sunday
  });
});

describe('renderEmail', () => {
  it('has one rupee figure in Indian format, saved-on line, link and footer', () => {
    for (const k of ['email_start', 'email_weekly', 'email_deadline'] as const) {
      const { text } = mk(k);
      expect(rupees(text)).toBe(1);
      expect(text).toContain('₹3,40,000');
      expect(text).toContain('Based on what you last saved on 3 Feb 2027');
      expect(text).toContain(`Open Harvesting: ${URL}`);
      expect(text).toContain('Turn these off on the Account page');
    }
  });
  it('subjects carry no rupee figures', () => {
    expect(mk('email_start').subject).toBe('Harvest season has started');
    expect(mk('email_weekly').subject).toBe('This week in harvest season');
    expect(mk('email_deadline', base, '2027-03-10', '2027-03-15').subject).toBe('Harvest deadline: 15 Mar 2027');
    expect(mk('email_deadline', base, '2027-03-10', LAST_SAFE).subject).toBe('Last safe day to sell: 29 Mar 2027');
    for (const k of ['email_start', 'email_weekly', 'email_deadline'] as const) expect(mk(k).subject).not.toMatch(/₹|\d{2},\d{3}/);
  });
  it('start email names the last safe day and moves waiting', () => {
    const { text } = mk('email_start', base, '2027-01-30', '2027-02-01');
    expect(text).toContain('29 Mar 2027');
    expect(text).toContain('3 moves');
  });
  it('start email without a published last safe day omits it', () => {
    const { text } = mk('email_start', base, '2027-01-30', '2027-02-01', null);
    expect(text).not.toMatch(/last safe day/i);
  });
  it('weekly lists moves done since last week and the next date', () => {
    const { text } = mk('email_weekly');
    expect(text).toContain('2 moves done since last week');
    expect(text).toContain('26 Feb 2027');
    expect(mk('email_weekly', { ...base, nextDate: null }).text).not.toMatch(/next date/i);
  });
  it('15 March advance tax line only when taxable gains were booked', () => {
    const line = 'check the 15 March advance tax instalment';
    expect(mk('email_deadline', { ...base, taxableGainsBooked: true }, '2027-03-10', '2027-03-15').text).toContain(line);
    expect(mk('email_deadline', base, '2027-03-10', '2027-03-15').text).not.toContain(line);
    expect(mk('email_deadline', { ...base, taxableGainsBooked: true }, '2027-03-10', '2027-03-01').text).not.toContain(line);
  });
  it('stale save (30+ days) gives the fresh-statement line and no rupee figure', () => {
    const fresh = "Import this month's statements so the app can mark what's done. For shares, import your broker's tradebook.";
    const stale = mk('email_weekly', base, '2027-01-08', '2027-02-07'); // exactly 30 days
    expect(stale.text).toContain(fresh);
    expect(stale.text).not.toContain('₹');
    expect(stale.subject).toBe('This week in harvest season');
    const ok = mk('email_weekly', base, '2027-01-09', '2027-02-07'); // 29 days
    expect(ok.text).not.toContain(fresh);
    expect(ok.text).toContain('₹');
  });
  it('words the figure as room the family can still use', () => {
    expect(mk('email_weekly').text).toContain('₹3,40,000 of tax-free room your family can still use');
  });
  it('rounds the rupee figure down', () => {
    expect(mk('email_weekly', { ...base, roomLeft: 340_000_99 }).text).toContain('₹3,40,000 ');
  });
  it('returns null under the floor with nothing waiting', () => {
    expect(renderEmail('email_weekly', { ...base, roomLeft: 199_999, movesWaiting: 0 }, '2027-02-03', '2027-02-07', URL, LAST_SAFE)).toBeNull();
    expect(renderEmail('email_weekly', { ...base, roomLeft: 200_000, movesWaiting: 0 }, '2027-02-03', '2027-02-07', URL, LAST_SAFE)).not.toBeNull();
    expect(renderEmail('email_weekly', { ...base, roomLeft: 0, movesWaiting: 1 }, '2027-02-03', '2027-02-07', URL, LAST_SAFE)).not.toBeNull();
  });
  it('carries no names, and no urgency words or emojis', () => {
    const s = { ...base, memberName: 'Asha', fundName: 'Nifty 50 Index Fund' } as SeasonEmailInput;
    for (const k of ['email_start', 'email_weekly', 'email_deadline'] as const) {
      const { text, subject } = mk(k, s);
      expect(text + subject).not.toMatch(/Asha|Nifty/);
      expect(text + subject).not.toMatch(/hurry|don't miss|last chance/i);
      expect(text + subject).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
  it('uses plural and singular for moves', () => {
    expect(mk('email_weekly', { ...base, movesWaiting: 1, doneSinceWeek: 1 }).text).toContain('1 move waiting');
    expect(mk('email_weekly', { ...base, movesWaiting: 1, doneSinceWeek: 1 }).text).toContain('1 move done since last week');
  });
});
