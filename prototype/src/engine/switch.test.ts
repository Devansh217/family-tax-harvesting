import { describe, expect, it } from 'vitest';
import { switchDecision } from './switch';

const rs = (n: number) => Math.round(n * 100);
const base = {
  value: rs(10_00_000), gain: rs(4_00_000), term: 'lt' as const, monthsToLongTerm: 0, equityUnitsUnder12m: false,
  taxType: 'equity' as const, freeRoom: 0, slabRate: 0.312, gap: 1.0,
};

describe('switchDecision', () => {
  it('(a) no gap: never now, and no edge', () => {
    const d = switchDecision({ ...base, gap: 0 });
    expect(d.when).not.toBe('now');
    expect(d.edge10y).toBeLessThanOrEqual(0);
  });
  it('(b) long-term gain inside the free room: now, no tax', () => {
    const d = switchDecision({ ...base, gain: rs(80_000), freeRoom: rs(1_25_000) });
    expect(d).toMatchObject({ when: 'now', taxNow: 0 });
  });
  it('(c) short-term with 3 months to go: wait for long-term', () => {
    expect(switchDecision({ ...base, term: 'st', monthsToLongTerm: 3 })).toMatchObject({ when: 'wait', until: 'long_term' });
  });
  it('(d) slab fund, small gap, big gain: next tax year', () => {
    const d = switchDecision({ ...base, taxType: 'slab', gap: 0.3, gain: rs(2_00_000) });
    expect(d.when).toBe('next_year');
  });
  it('(e) slab fund for a nil-tax member: now', () => {
    expect(switchDecision({ ...base, taxType: 'slab', slabRate: 0, gap: 0.4 })).toMatchObject({ when: 'now', taxNow: 0 });
  });
  it('(f) equity units under 12 months: wait for the exit load to end', () => {
    expect(switchDecision({ ...base, term: 'st', monthsToLongTerm: 8, equityUnitsUnder12m: true })).toMatchObject({ when: 'wait', until: 'load_free' });
  });
  it('(g) the 10-year edge rises with the gap', () => {
    const a = switchDecision({ ...base, gap: 0.5 }).edge10y;
    const b = switchDecision({ ...base, gap: 1.0 }).edge10y;
    expect(b).toBeGreaterThan(a);
  });
  it('pays tax now when break-even is quick and the edge is big', () => {
    const d = switchDecision({ ...base, gap: 1.0 });
    expect(d.when).toBe('now');
    expect(d.taxNow).toBe(Math.round(rs(4_00_000) * 0.13));
  });
});
