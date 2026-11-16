import { describe, expect, it } from 'vitest';
import { sampleState } from '../sample';
import { SignInRequired } from '../storage/functions';
import { emptyState } from '../store';
import { afterConflict, failureKind, shouldSave } from './syncPolicy';

const base = { uid: 'u1', isSample: false, loaded: true, json: '{"a":2}', lastSaved: '{"a":1}', failedJson: null as string | null };

describe('when to save to the account', () => {
  it('saves a changed family once the account copy has loaded', () => {
    expect(shouldSave({ ...base, status: 'saved' })).toBe(true);
  });
  it('never saves before a successful load, while choosing, signed out, needing sign-in, or for the sample', () => {
    expect(shouldSave({ ...base, status: 'saved', loaded: false })).toBe(false);
    for (const status of ['loading', 'choose', 'signed-out', 'signin'] as const) expect(shouldSave({ ...base, status })).toBe(false);
    expect(shouldSave({ ...base, status: 'saved', isSample: true })).toBe(false);
    expect(shouldSave({ ...base, status: 'saved', json: base.lastSaved })).toBe(false);
  });
  it('after a failed save, does not retry the same family in a loop; a new edit tries again', () => {
    expect(shouldSave({ ...base, status: 'error', failedJson: base.json })).toBe(false);
    expect(shouldSave({ ...base, status: 'error', failedJson: '{"a":0}' })).toBe(true);
  });
});

describe('what a failure means', () => {
  it('an ended sign-in asks the person to sign in again; anything else is an error', () => {
    expect(failureKind(new SignInRequired())).toBe('signin');
    expect(failureKind(new Error('server'))).toBe('error');
  });
});

describe('a conflict when this device never loaded the account copy', () => {
  it('asks which copy to keep rather than replacing a real family held only in this browser', () => {
    const local = { ...sampleState(), isSample: false };
    const cloud = emptyState();
    expect(afterConflict(null, local, cloud)).toBe('choose');
    expect(afterConflict(3, local, cloud)).toBe('apply');
    expect(afterConflict(null, emptyState(), cloud)).toBe('apply');
  });
});
