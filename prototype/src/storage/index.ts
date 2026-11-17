import type { AppState } from '../store';
import { signOut } from '../cloud';
import { functionsFamilyStore } from './functions';

export { listMyAdminReads, loadSeasonLog, loadProfile, saveProfile, type Profile } from './supabase';

/** A family as saved to an account, with the version used to detect a save from another device. */
export interface CloudFamily { state: AppState; version: number }

/**
 * The one place the account copy of a family is loaded and saved: through the `family` server function, which
 * encrypts it with a key the database doesn't hold. See docs/superpowers/specs/2026-11-17-secure-storage-design.md.
 */
export interface FamilyStore {
  load(userId: string): Promise<CloudFamily | null>;
  /** With `knownVersion` it only writes if nobody saved in between; 'conflict' means reload the newer copy. */
  save(userId: string, state: AppState, knownVersion: number | null): Promise<number | 'conflict'>;
  /** Deletes the account and everything in it. */
  remove(userId: string): Promise<void>;
}

export const familyStore: FamilyStore = functionsFamilyStore;

/** Deletes the account, the family, the admin-read log and the profile on the server, then signs out. */
export async function deleteAccount(userId: string): Promise<void> {
  await familyStore.remove(userId);
  await signOut();
}
