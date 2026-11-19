import { describe, expect, it } from 'vitest';
import { seasonLogLabel } from './seasonLog';

describe('seasonLogLabel', () => {
  it("says Emailed only when the row's outcome is sent", () => {
    expect(seasonLogLabel('email_weekly', 'sent')).toBe('Emailed: weekly summary');
    expect(seasonLogLabel('email_weekly', 'failed')).toBe('Read your family (weekly email day)');
    expect(seasonLogLabel('email_weekly', 'nothing_to_send')).toBe('Read your family (weekly email day)');
    expect(seasonLogLabel('email_deadline', null)).toBe('Read your family (deadline email day)');
    expect(seasonLogLabel('email_start', 'nothing_to_send')).toBe('Read your family (season start email day)');
    expect(seasonLogLabel('season_check', null)).toBe('Read your family');
  });
});
