import { describe, expect, it } from 'vitest';
import { groupCategories } from './categoryGroups';

describe('groupCategories', () => {
  it('shows one option when AMFI lists a category under both its old and new spelling', () => {
    const groups = groupCategories(['Equity Schemes - Large Cap Fund', 'Equity Scheme - Large Cap Fund', 'Equity Scheme - Mid Cap Fund']);
    expect(groups).toEqual([{ label: 'Equity', options: [
      { value: 'Equity Scheme - Large Cap Fund', label: 'Large Cap Fund' },
      { value: 'Equity Scheme - Mid Cap Fund', label: 'Mid Cap Fund' },
    ] }]);
  });

  it('groups by type in a fixed order and keeps unknown headings whole under Other', () => {
    const groups = groupCategories(['ELSS', 'Debt Scheme - Gilt Fund', 'Hybrid Scheme - Arbitrage Fund', 'Equity Scheme - Value Fund']);
    expect(groups.map((g) => g.label)).toEqual(['Equity', 'Hybrid', 'Debt', 'Other']);
    expect(groups[3]!.options).toEqual([{ value: 'ELSS', label: 'ELSS' }]);
  });
});
