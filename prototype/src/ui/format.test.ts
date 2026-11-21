import { describe, expect, it } from 'vitest';
import { ltLabel } from './format';

describe('ltLabel', () => {
  it('a net loss reads as a loss', () => {
    expect(ltLabel(-168800)).toBe(` · ₹1,688 long-term loss (not yet booked)`);
  });
  it('a gain reads as a gain', () => {
    expect(ltLabel(500000)).toBe(` · ₹5,000 long-term gains`);
  });
});
