const DAY: Record<string, string> = { email_start: 'season start', email_weekly: 'weekly', email_deadline: 'deadline' };
const SENT: Record<string, string> = {
  email_start: 'Emailed: season has started',
  email_weekly: 'Emailed: weekly summary',
  email_deadline: 'Emailed: deadline reminder',
};

/** One line of "Automatic season checks": "Emailed" only when the row's outcome is 'sent' (an email really went out). */
export function seasonLogLabel(kind: string, outcome: string | null): string {
  if (kind === 'season_check') return 'Read your family';
  if (outcome === 'sent' && SENT[kind]) return SENT[kind]!;
  return DAY[kind] ? `Read your family (${DAY[kind]} email day)` : kind;
}
