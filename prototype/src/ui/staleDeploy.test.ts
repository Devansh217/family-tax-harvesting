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

  it('reloads when the clock ticks between saving and checking the guard', () => {
    let t = 1_000_000, n = 0, stored: string | null = null;
    const ticking = { now: () => t++, get: () => stored, set: (v: string) => { stored = v; }, reload: () => { n++; } };
    expect(reloadOnceForStaleBuild(ticking)).toBe(true);
    expect(n).toBe(1);
  });

  it('reloads again for a later deploy', () => {
    const d = deps('1000000', 1_000_000 + 120_000);
    expect(reloadOnceForStaleBuild(d)).toBe(true);
  });

  it('never reloads when storage is blocked, since a guard could not survive the reload', () => {
    let n = 0;
    const blocked = { now: () => 1_000_000, get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); }, reload: () => { n++; } };
    for (let i = 0; i < 3; i++) expect(reloadOnceForStaleBuild(blocked)).toBe(false);
    // Storage that accepts writes but keeps nothing (some private modes) is treated the same.
    const forgetful = { now: () => 1_000_000, get: () => null, set: () => {}, reload: () => { n++; } };
    expect(reloadOnceForStaleBuild(forgetful)).toBe(false);
    expect(n).toBe(0);
  });
});
