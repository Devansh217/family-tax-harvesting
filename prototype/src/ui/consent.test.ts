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
