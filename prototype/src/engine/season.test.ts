import { describe, expect, it } from 'vitest';
import { buybackDate, isTradingDay, lastSafeDay, nextTradingDay } from './season';

describe('season dates', () => {
  it('lastSafeDay is the second-to-last trading day on or before year end', () => {
    expect(lastSafeDay('2027-03-31', { published: true, dates: [] })).toBe('2027-03-30');
    expect(lastSafeDay('2027-03-31', { published: true, dates: ['2027-03-30'] })).toBe('2027-03-29');
  });
  it('lastSafeDay skips a weekend year end', () => {
    // 2027-03-28 is a Sunday: trading days back are Fri 26, Thu 25
    expect(lastSafeDay('2027-03-28', { published: true, dates: [] })).toBe('2027-03-25');
  });
  it('lastSafeDay is null while the holiday list is unpublished', () => {
    expect(lastSafeDay('2027-03-31', { published: false, dates: [] })).toBeNull();
  });
  it('isTradingDay excludes weekends and holidays', () => {
    expect(isTradingDay('2027-03-26', [])).toBe(true);
    expect(isTradingDay('2027-03-27', [])).toBe(false);
    expect(isTradingDay('2027-03-28', [])).toBe(false);
    expect(isTradingDay('2027-03-26', ['2027-03-26'])).toBe(false);
  });
  it('nextTradingDay is strictly after, skipping weekends and holidays', () => {
    expect(nextTradingDay('2027-03-26', [])).toBe('2027-03-29');
    expect(nextTradingDay('2027-03-24', ['2027-03-25'])).toBe('2027-03-26');
  });
  it('buybackDate is the next trading day for shares and funds', () => {
    expect(buybackDate('2027-03-30', true, [])).toBe('2027-03-31');
    expect(buybackDate('2027-03-30', false, ['2027-03-31'])).toBe('2027-04-01');
  });
});
