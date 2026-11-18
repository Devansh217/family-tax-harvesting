import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyState, normalizeState, type AppState } from '../store';
import { describe, expect, it } from 'vitest';
import type { Member } from '../engine/types';
import { consentLabel } from './screens/memberFields';

const m = (over: Partial<Member>): Member => ({ id: 'x', name: 'Riya', relation: 'child_minor', age: 10, regime: 'new', type: 'person', ...over });
const D = '2026-11-17';

describe('consent wording', () => {
  it('a child needs a parent or guardian’s agreement; an adult agrees for themselves; the manager and HUFs need none', () => {
    expect(consentLabel(m({}), 'me', D)).toBe("I'm Riya's parent or guardian and agree to their data being included");
    expect(consentLabel(m({ relation: 'parent', age: 66, name: 'Ramesh' }), 'me', D)).toBe('Ramesh agreed to be included');
    expect(consentLabel(m({ id: 'me', relation: 'self', age: 40 }), 'me', D)).toBeNull();
    expect(consentLabel(m({ type: 'huf' }), 'me', D)).toBeNull();
  });
});

describe('harvest season help', () => {
  it('is off in a fresh and a migrated family', () => {
    expect(emptyState().alerts?.seasonHelp ?? false).toBe(false);
    const old = { ...emptyState() } as Partial<AppState>;
    delete old.alerts;
    expect(normalizeState(old as AppState)!.alerts).toEqual({ seasonHelp: false, chosen: false });
    expect(normalizeState({ ...emptyState(), alerts: { seasonHelp: true, chosen: true } })!.alerts).toEqual({ seasonHelp: true, chosen: true });
  });
  it('turning the switch either way records a choice, and the Home prompt hides after any choice', () => {
    const acct = readFileSync(resolve(__dirname, 'screens/Account.tsx'), 'utf8');
    expect(acct).toMatch(/alerts: \{ seasonHelp: e\.target\.checked, chosen: true \}/);
    const home = readFileSync(resolve(__dirname, 'screens/Home.tsx'), 'utf8');
    expect(home).toMatch(/!state\.alerts\?\.chosen/);
  });
  it('the Account screen carries the consent text verbatim', () => {
    const src = readFileSync(resolve(__dirname, 'screens/Account.tsx'), 'utf8').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');
    expect(src).toContain("From 1 Feb to 31 Mar, our server reads your family on each email day (once a week, plus a few deadline days) to email you what's left to do, and adds your numbers, without names, to the beta's totals. Each read is listed below.");
  });
});
