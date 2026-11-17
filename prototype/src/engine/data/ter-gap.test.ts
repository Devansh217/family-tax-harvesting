import { describe, expect, it } from 'vitest';
import { TER_GAP_IS_ESTIMATE, terGapFor } from './ter-gap';

describe('terGapFor', () => {
  it('uses the category table', () => {
    expect(TER_GAP_IS_ESTIMATE).toBe(true);
    expect(terGapFor('Equity Scheme - Large Cap Fund', 'X Bluechip')).toBe(1.0);
    expect(terGapFor('Equity Schemes - ELSS- Tax Saver Fund')).toBe(1.0);
    expect(terGapFor('Other Scheme - Index Funds', 'X Nifty 50 Index Fund')).toBe(0.3);
    expect(terGapFor('Equity Scheme - Large Cap Fund', 'X Nifty 50 ETF')).toBe(0.3);
    expect(terGapFor('Hybrid Scheme - Aggressive Hybrid Fund')).toBe(0.5);
    expect(terGapFor('Debt Scheme - Gilt Fund')).toBe(0.4);
    expect(terGapFor(undefined, undefined)).toBe(0.5);
  });
});
