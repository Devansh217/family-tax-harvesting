import type { AppState } from '../store';
import { supabaseFamilyStore } from './supabase';

export { loadProfile, saveProfile, type Profile } from './supabase';

/** A family as saved to an account, with the version used to detect a save from another device. */
export interface CloudFamily { state: AppState; version: number }

/**
 * The one place the account copy of a family is loaded and saved. Today it talks to the Supabase table directly;
 * the secure storage project swaps in an implementation that calls server functions (encryption, logged admin
 * reads) without changing anything outside this folder. See docs/superpowers/specs/2026-11-16-architecture-design.md.
 */
export interface FamilyStore {
  load(userId: string): Promise<CloudFamily | null>;
  /** With `knownVersion` it only writes if nobody saved in between; 'conflict' means reload the newer copy. */
  save(userId: string, state: AppState, knownVersion: number | null): Promise<number | 'conflict'>;
  remove(userId: string): Promise<void>;
}

export const familyStore: FamilyStore = supabaseFamilyStore;
