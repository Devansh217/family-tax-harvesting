import { FamilyLoadError, SignInRequired } from '../storage/functions';
import { hasRealData, type AppState } from '../store';

export type SyncStatus = 'signed-out' | 'loading' | 'choose' | 'saving' | 'saved' | 'error' | 'signin' | 'not_invited';

/**
 * Whether to save the family to the account now. Never before the account copy has loaded (the version would be
 * unknown), never while the person chooses a copy or must sign in again, and never the same family that just failed:
 * a failed save waits for the next edit instead of retrying in a loop.
 */
export function shouldSave(p: { uid: string | null; status: SyncStatus; isSample: boolean; loaded: boolean; json: string; lastSaved: string; failedJson: string | null }): boolean {
  if (!p.uid || !p.loaded || p.isSample) return false;
  if (p.status === 'loading' || p.status === 'choose' || p.status === 'signed-out' || p.status === 'signin' || p.status === 'not_invited') return false;
  if (p.json === p.lastSaved) return false;
  if (p.status === 'error' && p.json === p.failedJson) return false;
  return true;
}

/** An ended sign-in is the person's to fix (sign in again); anything else is shown as an error. */
export const failureKind = (e: unknown): 'signin' | 'not_invited' | 'error' =>
  e instanceof SignInRequired ? 'signin' : e instanceof FamilyLoadError ? 'not_invited' : 'error';

const sameFamily = (a: AppState, b: AppState) =>
  JSON.stringify([a.members, a.txns.length, a.securities.length]) === JSON.stringify([b.members, b.txns.length, b.securities.length]);

/**
 * After another device saved first: take the account copy, unless this device never loaded the account (version
 * unknown) and holds a different real family, in which case ask which copy to keep.
 */
export function afterConflict(knownVersion: number | null, local: AppState, cloud: AppState): 'choose' | 'apply' {
  return knownVersion == null && hasRealData(local) && !sameFamily(local, cloud) ? 'choose' : 'apply';
}
