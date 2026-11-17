import { describe, expect, it } from 'vitest';
import { datePickerBounds, dateVerb } from './plan';

describe('date picker (m2, m4)', () => {
  it('max is the last safe day, or the end of the tax year when the holiday list is not out; min is today', () => {
    expect(datePickerBounds('2026-11-17', '2027-03-31', '2027-03-26')).toEqual({ min: '2026-11-17', max: '2027-03-26' });
    expect(datePickerBounds('2026-11-17', '2028-03-31', null)).toEqual({ min: '2026-11-17', max: '2028-03-31' });
  });
  it('a gift is gifted and sold on the day, a switch switched, anything else sold', () => {
    expect(dateVerb('gift')).toBe('Gift and sell on');
    expect(dateVerb('switch_direct')).toBe('Switch on');
    expect(dateVerb('harvest_gain')).toBe('Sell on');
  });
});
