import { describe, expect, it } from 'vitest';
import { nominalReturn } from './planner';
import { FY_2026_27 as R } from './rules';

describe('assumed returns', () => {
  it('turns real returns into nominal ones with the scenario’s inflation', () => {
    expect(nominalReturn('equity', 'base', R)).toBeCloseTo(0.1104, 4);
    expect(nominalReturn('conservative_hybrid', 'base', R)).toBeCloseTo(0.078, 4);
    expect(nominalReturn('fd', 'base', R)).toBeCloseTo(0.0673, 4);
    expect(nominalReturn('ppf', 'base', R)).toBe(0.071);
    expect(nominalReturn('equity', 'conservative', R)).toBeLessThan(nominalReturn('equity', 'base', R));
    expect(nominalReturn('equity', 'base', R)).toBeLessThan(nominalReturn('equity', 'optimistic', R));
  });
});
