// Season email schedule and wording. Pure: no clock, DOM, fetch or randomness. Dates are ISO (YYYY-MM-DD).
// SeasonEmailInput is the slice of the engine's season summary this module reads; a test pins that the engine's
// result stays assignable to it (Deno can't import from src/ here).

export type EmailKind = 'email_start' | 'email_weekly' | 'email_deadline';

export interface SeasonEmailInput {
  roomLeft: number; // paise: usable room still left (usable minus used)
  movesWaiting: number;
  nextDate: string | null;
  doneSinceWeek: number;
  taxableGainsBooked: boolean;
  lastImport: string | null; // ISO date of the latest import, if any
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FLOOR = 2_000_00; // paise: nothing is sent below ₹2,000 with no moves waiting
const STALE_DAYS = 30;

const parts = (d: string) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7), d: +d.slice(8, 10) });
const utcDay = (d: string) => { const p = parts(d); return Date.UTC(p.y, p.m - 1, p.d); };

/** "26 Mar 2027" */
export function plainDate(d: string): string {
  const p = parts(d);
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

const isSunday = (d: string) => new Date(utcDay(d)).getUTCDay() === 0;
const daysBetween = (from: string, to: string) => Math.round((utcDay(to) - utcDay(from)) / 86_400_000);

/** Which email goes out on `date`: start 1 Feb; deadline 1 Mar, 15 Mar, last safe day; weekly each Sunday 7 Feb–28 Mar. */
export function emailKindFor(date: string, lastSafe: string | null): EmailKind | null {
  const { m, d } = parts(date);
  if (m === 3 && (d === 1 || d === 15)) return 'email_deadline';
  if (lastSafe !== null && date === lastSafe) return 'email_deadline';
  if (m === 2 && d === 1) return 'email_start';
  if (((m === 2 && d >= 7) || (m === 3 && d <= 28)) && isSunday(date)) return 'email_weekly';
  return null;
}

const rupees = (paise: number) => `₹${Math.floor(paise / 100).toLocaleString('en-IN')}`;
const moves = (n: number) => `${n} ${n === 1 ? 'move' : 'moves'}`;

const FRESH = "Import this month's statements so the app can mark what's done. For shares, import your broker's tradebook.";

/** The email for `kind`, or null when there is nothing to say (room under ₹2,000 and no moves waiting). */
export function renderEmail(
  kind: EmailKind, s: SeasonEmailInput, savedOn: string, today: string, appUrl: string, lastSafe: string | null,
): { subject: string; text: string } | null {
  if (s.roomLeft < FLOOR && s.movesWaiting === 0) return null;
  const stale = daysBetween(savedOn, today) >= STALE_DAYS;
  const onLastSafe = lastSafe !== null && today === lastSafe;

  let subject: string;
  const body: string[] = [];
  const figure = Math.floor(s.roomLeft / 100);
  const room = figure <= 0 ? null : `There is ${rupees(s.roomLeft)} of tax-free room your family can still use. This counts only gains you can still take tax-free this year.`;
  const importStale = s.lastImport === null || daysBetween(s.lastImport, today) >= STALE_DAYS;

  if (kind === 'email_start') {
    subject = 'Harvest season has started';
    body.push('Harvest season has started. It runs until 31 March.');
    if (room) body.push(room);
    if (lastSafe) body.push(`The last safe day to sell is ${plainDate(lastSafe)}.`);
    body.push(`${moves(s.movesWaiting)} waiting.`);
  } else if (kind === 'email_weekly') {
    subject = 'This week in harvest season';
    if (room) body.push(room);
    body.push(`${moves(s.movesWaiting)} waiting.`);
    if (s.nextDate) body.push(`The next date your family picked is ${plainDate(s.nextDate)}.`);
    body.push(`${moves(s.doneSinceWeek)} done since last week.`);
  } else {
    subject = onLastSafe ? `Last safe day to sell: ${plainDate(today)}` : `Harvest deadline: ${plainDate(today)}`;
    body.push(onLastSafe ? 'Today is the last safe day to sell this tax year.' : `Today is ${plainDate(today)}. Harvest season ends on 31 March.`);
    if (room) body.push(room);
    body.push(`${moves(s.movesWaiting)} waiting.`);
    if (today.slice(5) === '03-15' && s.taxableGainsBooked) {
      body.push('If anyone booked taxable gains this year, check the 15 March advance tax instalment.');
    }
  }

  // Over 30 days since the last save, the numbers are too old to quote: only the fresh-statement line goes out.
  if (stale) body.splice(0, body.length, FRESH);
  else if (importStale && s.movesWaiting > 0) body.push(FRESH);

  const text = [
    body.join('\n'),
    `Based on what you last saved on ${plainDate(savedOn)}.`,
    `Open Harvesting: ${appUrl}`,
    'Turn these off on the Account page.',
  ].join('\n\n') + '\n';
  return { subject, text };
}
