import { describe, expect, it } from 'vitest';
import { reloadOnceForStaleBuild, type ReloadDeps } from './staleDeploy';

const deps = (stored: string | null, now = 1_000_000) => {
  const d = { reloads: 0, stored, now: () => now, get: () => d.stored, set: (v: string) => { d.stored = v; }, reload: () => { d.reloads++; } };
  return d as ReloadDeps & { reloads: number; stored: string | null };
};

describe('reload after a deploy', () => {
  it('reloads once when a code file from the old build is missing', () => {
    const d = deps(null);
    expect(reloadOnceForStaleBuild(d)).toBe(true);
    expect(d.reloads).toBe(1);
    // The new page fails again within a minute: a real outage, not a stale page. No reload loop.
    expect(reloadOnceForStaleBuild(d)).toBe(false);
    expect(d.reloads).toBe(1);
  });

  it('reloads again for a later deploy', () => {
    const d = deps('1000000', 1_000_000 + 120_000);
    expect(reloadOnceForStaleBuild(d)).toBe(true);
  });

  it('still reloads once when storage is blocked', () => {
    const d = { ...deps(null), get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); } };
    let n = 0;
    expect(reloadOnceForStaleBuild({ ...d, reload: () => { n++; } })).toBe(true);
    expect(n).toBe(1);
  });
});
