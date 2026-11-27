import { describe, expect, it } from 'vitest';
import { ltLabel, unitWord } from './format';

describe('ltLabel', () => {
  it('a net loss reads as a loss', () => {
    expect(ltLabel(-168800)).toBe(` · ₹1,688 long-term loss (not yet booked)`);
  });
  it('a gain reads as a gain', () => {
    expect(ltLabel(500000)).toBe(` · ₹5,000 long-term gains`);
  });
});

describe('unitWord', () => {
  it('says shares for a listed share and units for a fund, singular for one', () => {
    expect(unitWord('INE154A01025', 300 * 10_000)).toBe('shares');
    expect(unitWord('INE154A01025', 10_000)).toBe('share');
    expect(unitWord('INF0SAMPLE01', 1_811.111 * 10_000)).toBe('units');
    expect(unitWord('INF0SAMPLE01', 10_000)).toBe('unit');
  });
});
