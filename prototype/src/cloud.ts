import { createClient, type Session } from '@supabase/supabase-js';
import type { AppState } from './store';

/**
 * Supabase project for sign-in and saving a family to an account. The publishable key is meant to ship in the web
 * app: it can only do what the database's row-level security allows, which is each person reading and writing their
 * own rows (see supabase/schema.sql). The secret key never goes in this code.
 */
export const SUPABASE_URL = 'https://iaesqhisslztykbglcck.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CNFrds5IHwjo7O5pZ-x7GQ_rcpzng24';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type { Session };

/** Where email links and Google send people back to: this page, without any route or query. */
const returnUrl = () => `${location.origin}${location.pathname}`;

/** Supabase error text → a sentence that says what to do. */
export function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match. Check them, or reset your password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|already been registered/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least|weak password/i.test(message)) return 'Use a longer password: at least 8 characters, mixing letters and numbers.';
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google sign-in is not switched on yet. Use email and password for now.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(message)) return 'Could not reach the server. Check your connection and try again.';
  return message;
}

export async function signUp(email: string, password: string, firstName: string, lastName: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { first_name: firstName.trim(), last_name: lastName.trim() }, emailRedirectTo: returnUrl() },
  });
  if (error) throw new Error(friendly(error.message));
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } });
  if (error) throw new Error(friendly(error.message));
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${returnUrl()}#account` });
  if (error) throw new Error(friendly(error.message));
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut() {
  await supabase.auth.signOut();
}

export interface Profile { first_name: string; last_name: string }

/**
 * First and last name from what the sign-in provider shared. Google sends given_name / family_name (sometimes under
 * custom_claims) or only a full name, which is split at the first space.
 */
export function namesFromLogin(meta: Record<string, unknown> | undefined): Profile {
  const m = (meta ?? {}) as Record<string, string | Record<string, string> | undefined>;
  const claims = (typeof m.custom_claims === 'object' ? m.custom_claims : {}) as Record<string, string>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const full = str(m.full_name) || str(m.name);
  const [head = '', ...tail] = full.split(/\s+/);
  return {
    first_name: str(m.first_name) || str(m.given_name) || str(claims.given_name) || head,
    last_name: str(m.last_name) || str(m.family_name) || str(claims.family_name) || tail.join(' '),
  };
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function saveProfile(userId: string, p: Profile) {
  const { error } = await supabase.from('profiles').update({ first_name: p.first_name.trim(), last_name: p.last_name.trim() }).eq('id', userId);
  if (error) throw new Error(friendly(error.message));
}

export interface CloudFamily { state: AppState; version: number }

export async function loadFamily(userId: string): Promise<CloudFamily | null> {
  const { data, error } = await supabase.from('family_data').select('state, version').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return data as CloudFamily | null;
}

/**
 * Saves the family. With `knownVersion` it only writes if nobody else saved in between, and returns the new
 * version; 'conflict' means another device saved first and the caller should reload.
 */
export async function saveFamily(userId: string, state: AppState, knownVersion: number | null): Promise<number | 'conflict'> {
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
}

export async function deleteFamily(userId: string) {
  const { error } = await supabase.from('family_data').delete().eq('user_id', userId);
  if (error) throw new Error(friendly(error.message));
}
