import { describe, expect, it } from 'vitest';
import { tenYearTax, PLACEMENT_YEARS, type Slice } from './placementTax';
import type { Member } from './types';

const L = 1_00_000_00;
const ASOF = '2026-11-24';
const member = (over: Partial<Member> = {}): Member => ({ id: 'm', name: 'M', relation: 'self', age: 40, regime: 'new', type: 'person', ...over });
const none = { equitySt: 0, equityLt: 0, otherLt: 0, slab: 0 };
const slice = (over: Partial<Slice>): Slice => ({ assetId: 'a', taxClass: 'equity', annualReturn: 0.1, value: 5 * L, gain: 0, yearlyAdd: 0, ...over });

describe('tenYearTax', () => {
  it('runs for ten years by default', () => {
    expect(PLACEMENT_YEARS).toBe(10);
  });

  // 5 L at 10%: the biggest yearly gain is 5 L * 1.1^9 * 10% = about 1.18 L, under the 1.25 L room, so every
  // year's gain is harvested tax-free and nothing is left to sell in year 10.
  it('equity inside the yearly room adds no tax', () => {
    expect(tenYearTax(member(), { normal: 20 * L, year1: none }, [slice({})], ASOF)).toBe(0);
  });

  // Year-10 value is 10 L * 1.07^10 = 19,67,151, gain 9,67,151. Normal 20 L is in the 25% band up to 24 L:
  // 4 L * 25% = 1,00,000; the other 5,67,151 * 30% = 1,70,145.30; total 2,70,145.30; with 4% cess 2,80,951.
  it('slab fund sold in year 10 is taxed at the member\'s slab', () => {
    const s = slice({ taxClass: 'slab', annualReturn: 0.07, value: 10 * L });
    expect(tenYearTax(member(), { normal: 20 * L, year1: none }, [s], ASOF)).toBe(2_80_951_00);
  });

  // 2 L + 9,67,151 = 11,67,151, under 12 L, so the rebate wipes out the tax.
  it('low-income parent pays nil on the same slab fund', () => {
    const s = slice({ taxClass: 'slab', annualReturn: 0.07, value: 10 * L });
    expect(tenYearTax(member(), { normal: 2 * L, year1: none }, [s], ASOF)).toBe(0);
  });

  // One year only. Equity 2 L grows 10% so the gain is 20,000 + 20,000 = 40,000. Year 1 already has 1,25,000 of
  // long-term gain, so no room is left: nothing is harvested and all 40,000 is sold. Equity gain 1,65,000 less
  // the 1,25,000 exemption = 40,000 * 12.5% = 5,000, plus 4% cess = 5,200. With an empty year 1 the 40,000 is
  // harvested free and the tax is 0.
  it('year 1 uses only the room left after start.year1', () => {
    const s = slice({ value: 2 * L, gain: 20_000_00 });
    expect(tenYearTax(member(), { normal: 20 * L, year1: { ...none, equityLt: 1_25_000_00 } }, [s], ASOF, 1)).toBe(5_200_00);
    expect(tenYearTax(member(), { normal: 20 * L, year1: none }, [s], ASOF, 1)).toBe(0);
  });

  // Other long-term gain at 12.5% + 4% cess is linear in the gain (normal 20 L leaves no basic room).
  // Plain 4 L gain: 4 L * 12.5% * 1.04 = 52,000. Cushioned 4.4 L: 55,000 * 1.04 = 57,200 = 52,000 * 1.1.
  it('cushioned approx gain counts in full', () => {
    const plain = slice({ taxClass: 'other_lt', annualReturn: 0, value: 10 * L, gain: 4 * L });
    const cushioned = { ...plain, gain: Math.round(4 * L * 1.1) };
    const start = { normal: 20 * L, year1: none };
    expect(tenYearTax(member(), start, [plain], ASOF)).toBe(52_000_00);
    expect(tenYearTax(member(), start, [cushioned], ASOF)).toBe(57_200_00);
  });

  it('is zero with no slices and never negative', () => {
    expect(tenYearTax(member(), { normal: 20 * L, year1: none }, [], ASOF)).toBe(0);
    expect(tenYearTax(member(), { normal: 20 * L, year1: none }, [slice({ annualReturn: -0.1, taxClass: 'slab' })], ASOF)).toBe(0);
  });

  // A SIP's add in year y is harvestable from year y+1, not in year y.
  it('does not harvest gain on money added this year', () => {
    // 1 year, nothing held, 10 L added each year at 100% return. Year 1: add earns nothing, so no gain, no tax.
    const s = slice({ value: 0, annualReturn: 1, yearlyAdd: 10 * L });
    expect(tenYearTax(member(), { normal: 20 * L, year1: none }, [s], ASOF, 1)).toBe(0);
  });
});
