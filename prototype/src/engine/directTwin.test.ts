import { describe, expect, it } from 'vitest';
import { directTwin } from './directTwin';
import type { Security } from './types';

const sec = (name: string, over: Partial<Security> = {}): Security => ({ isin: 'INF_REG', name, taxType: 'equity', listed: false, ...over });

describe('directTwin', () => {
  const funds = {
    INF_REG: { n: 'Axis Bluechip Fund - Regular Plan - Growth', c: 'Equity Scheme - Large Cap Fund' },
    INF_DIR: { n: 'Axis Bluechip Fund - Direct Plan - Growth', c: 'Equity Scheme - Large Cap Fund' },
    INF_DIR_IDCW: { n: 'Axis Bluechip Fund - Direct Plan - IDCW', c: 'Equity Scheme - Large Cap Fund' },
  };

  it('finds the direct plan of the same fund and option', () => {
    expect(directTwin(sec('Axis Bluechip Fund - Regular Plan - Growth'), funds)).toBe('INF_DIR');
    expect(directTwin(sec('Axis Bluechip Fund - Regular Plan IDCW', { option: 'idcw' }), funds)).toBe('INF_DIR_IDCW');
  });

  it('ambiguous twin: returns nothing when several funds match', () => {
    expect(directTwin(sec('Axis Bluechip Fund - Regular Plan - Growth'), { ...funds, INF_DIR2: { n: 'Axis Bluechip Fund - Direct Plan - Growth', c: 'x' } })).toBeUndefined();
  });

  it('returns nothing when there is no match', () => {
    expect(directTwin(sec('Other Fund - Regular Plan - Growth'), funds)).toBeUndefined();
    expect(directTwin(sec('Axis Bluechip Fund - Regular Plan - Growth'), {})).toBeUndefined();
  });
});
