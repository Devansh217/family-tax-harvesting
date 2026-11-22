import { AuthClient, type Session } from '@supabase/auth-js';
import { FunctionsClient } from '@supabase/functions-js';
import { PostgrestClient } from '@supabase/postgrest-js';

/**
 * Supabase project for sign-in and saving a family to an account. The publishable key is meant to ship in the web
 * app: it can only do what the database's row-level security allows, which is each person reading and writing their
 * own profile and admin-read log (see supabase/migrations/); families go only through the server functions. The secret
 * key never goes in this code.
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './cloud-config';

export { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL };

/** Beta: Google sign-in only. Supabase's built-in email sender reaches only the project team (secure storage spec §3). */
export const SHOW_EMAIL_SIGNIN = false;

/**
 * The three Supabase parts the app uses (sign-in, tables, server functions), wired the way `createClient` wires them
 * (supabase-js 2.118.0), without file storage and live updates, which the app never uses and which made up about a
 * third of the download. Same sign-in storage key, so people stay signed in across the change.
 */
const base = new URL(SUPABASE_URL.endsWith('/') ? SUPABASE_URL : `${SUPABASE_URL}/`);
const KEY = SUPABASE_PUBLISHABLE_KEY;
/** New-format keys (sb_publishable_…) are not JWTs: never sent as a Bearer token where supabase-js omits them. */
const isNewKey = KEY.startsWith('sb_publishable_') || KEY.startsWith('sb_secret_');
const auth = new AuthClient({
  url: new URL('auth/v1', base).href,
  headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
  storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
  flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
});
const sessionToken = async () => (await auth.getSession()).data.session?.access_token ?? null;
const withAuth = (keyAsBearer: boolean): typeof fetch => async (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has('apikey')) headers.set('apikey', KEY);
  if (!headers.has('Authorization')) {
    const bearer = (await sessionToken()) ?? (keyAsBearer ? KEY : null);
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  }
  return fetch(input, { ...init, headers });
};
const rest = new PostgrestClient(new URL('rest/v1', base).href, { fetch: withAuth(true) });
const functions = new FunctionsClient(new URL('functions/v1', base).href, { customFetch: withAuth(!isNewKey) });

export const supabase = {
  auth,
  from: (table: string) => rest.from(table),
  rpc: (fn: string, args: Record<string, unknown> = {}) => rest.rpc(fn, args),
  functions,
};

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

import type { Profile } from './storage/supabase';

export type { Profile };

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
