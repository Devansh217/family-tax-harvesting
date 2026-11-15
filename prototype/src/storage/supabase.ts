import { friendly, supabase } from '../cloud';
import type { AppState } from '../store';
import type { CloudFamily, FamilyStore } from './index';

export interface Profile { first_name: string; last_name: string }

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function saveProfile(userId: string, p: Profile) {
  const { error } = await supabase.from('profiles').update({ first_name: p.first_name.trim(), last_name: p.last_name.trim() }).eq('id', userId);
  if (error) throw new Error(friendly(error.message));
}

/** Families in the `family_data` table: one row per account, readable only by its owner (row-level security). */
export const supabaseFamilyStore: FamilyStore = {
  async load(userId) {
    const { data, error } = await supabase.from('family_data').select('state, version').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(friendly(error.message));
    return data as CloudFamily | null;
  },

  async save(userId: string, state: AppState, knownVersion: number | null) {
    if (knownVersion == null) {
      const { error } = await supabase.from('family_data').insert({ user_id: userId, state, version: 1 });
      if (error) {
        if (error.code === '23505') return 'conflict';
        throw new Error(friendly(error.message));
      }
      return 1;
    }
    const { data, error } = await supabase
      .from('family_data')
      .update({ state, version: knownVersion + 1 })
      .eq('user_id', userId)
      .eq('version', knownVersion)
      .select('version');
    if (error) throw new Error(friendly(error.message));
    return data && data.length ? (data[0] as { version: number }).version : 'conflict';
  },

  async remove(userId) {
    const { error } = await supabase.from('family_data').delete().eq('user_id', userId);
    if (error) throw new Error(friendly(error.message));
  },
};
