import { describe, expect, it, vi } from 'vitest';
import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import { sampleState } from '../sample';
import { emptyState } from '../store';
import type { Ctx } from './app-context';
import { viewedContext } from './viewing';

describe('viewing another family', () => {
  it('shows their family, never changes anything, and says so', () => {
    const own = emptyState();
    const update = vi.fn(), toast = vi.fn();
    const base = { state: own, fam: computeFamily(own, '2026-11-17', FY_2026_27), famPrev: null, market: { latest: null, previous: null, funds: null }, asOf: '2026-11-17', update, toast, viewing: null } as unknown as Ctx;
    const theirs = { ...sampleState(), isSample: false };
    const v = viewedContext(base, theirs, 'meera@example.com');
    expect(v.state).toBe(theirs);
    expect(v.fam.members.map((m) => m.member.id)).toEqual(theirs.members.map((m) => m.id));
    expect(v.viewing).toEqual({ name: 'meera@example.com' });
    v.update((s) => ({ ...s, members: [] }));
    expect(update).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Read-only: you are viewing another family');
    expect(theirs.members.length).toBeGreaterThan(0);
    expect(v.nameOf(theirs.members[0]!.id)).toBe(theirs.members[0]!.name);
  });
});
