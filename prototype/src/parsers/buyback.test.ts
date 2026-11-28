import { describe, expect, it } from 'vitest';
import { buybackOutcome, buybackWarnings, withBuybacks } from './buyback';

describe('buybackOutcome', () => {
  it('splits exits by the date rules', () => {
    expect(buybackOutcome('2024-06-10')).toBe('companyPaid');
    expect(buybackOutcome('2024-10-01')).toBe('dividend');
    expect(buybackOutcome('2026-03-31')).toBe('dividend');
    expect(buybackOutcome('2026-04-01')).toBe('book');
  });
});

describe('buybackWarnings', () => {
  it('words one and many', () => {
    expect(buybackWarnings(0, 0)).toEqual([]);
    expect(buybackWarnings(1, 2)[0]).toMatch(/^1 buyback exit .* was left out/);
    expect(buybackWarnings(1, 2)[1]).toMatch(/^2 buyback exits before 1 Oct 2024 were left out/);
  });
});

describe('withBuybacks', () => {
  it('keeps a total that already counts them, adds them to one that does not, else adds only a gain', () => {
    expect(withBuybacks(150_000_00, 100_000_00, 50_000_00)).toBe(150_000_00);
    expect(withBuybacks(100_000_00, 100_000_00, 50_000_00)).toBe(150_000_00);
    expect(withBuybacks(70_000_00, 100_000_00, 50_000_00)).toBe(120_000_00);
    expect(withBuybacks(70_000_00, 100_000_00, -5_000_00)).toBe(70_000_00);
    expect(withBuybacks(null, 1, 1)).toBeNull();
  });
});
