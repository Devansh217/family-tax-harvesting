import { describe, expect, it } from 'vitest';
import { seasonLogLabel } from './seasonLog';

describe('seasonLogLabel', () => {
  it('says Emailed only when sent', () => {
    expect(seasonLogLabel('email_weekly', true)).toBe('Emailed: weekly summary');
    expect(seasonLogLabel('email_weekly', false)).toBe('Read your family (weekly email day)');
    expect(seasonLogLabel('email_deadline', false)).toBe('Read your family (deadline email day)');
    expect(seasonLogLabel('email_start', false)).toBe('Read your family (season start email day)');
    expect(seasonLogLabel('season_check', false)).toBe('Read your family');
  });
});
