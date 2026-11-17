import { friendly, supabase } from '../cloud';

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

/** When the founder opened this family through the logged admin function (row-level security: own rows only). */
export async function listMyAdminReads(): Promise<Array<{ at: string; reason: string }>> {
  const { data, error } = await supabase.from('admin_reads').select('at, reason').order('at', { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as Array<{ at: string; reason: string }>;
}

/** Every automatic read of this family by the server's season check (row-level security: own rows only). */
export async function loadSeasonLog(): Promise<{ on_date: string; kind: string }[]> {
  const { data, error } = await supabase.from('season_log').select('on_date, kind').order('on_date', { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as { on_date: string; kind: string }[];
}
