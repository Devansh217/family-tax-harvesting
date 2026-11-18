import { friendly, supabase } from '../cloud';
import { normalizeState, type AppState } from '../store';
import { supabaseInvoke } from './functions';

/** Whether the signed-in person is in `admins` (only to show the admin tab; the function checks again). */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

export interface FamilyListing { userId: string; email: string; version: number; updatedAt: string }

const call = async (path: 'list' | 'read' | 'invites' | 'season', method: 'GET' | 'POST' | 'DELETE', body?: unknown) => {
  const r = await supabaseInvoke(`admin/${path}`, { method, body });
  if (r.error) throw new Error(r.error.status === 403 ? 'Two-factor sign-in needed, or not an admin.' : friendly(r.error.message));
  return r.data;
};

export const adminList = async (): Promise<FamilyListing[]> => (await call('list', 'GET')) as FamilyListing[];

export interface SeasonRow {
  week: string; families: number; room_usable: number; room_used: number; used_share_by_family: number[];
  moves_shown: number; moves_dated: number; moves_done: number; moves_detected: number; families_with_detected: number;
}
/** Weekly beta totals, newest first. */
export const seasonStats = async (): Promise<SeasonRow[]> => (await call('season', 'GET')) as SeasonRow[];

export interface Invite { email: string; note: string | null; invitedAt: string }

export const invitesList = async (): Promise<Invite[]> => (await call('invites', 'GET')) as Invite[];
export const invitesAdd = async (email: string, note: string): Promise<void> => { await call('invites', 'POST', { email, note }); };
export const invitesRemove = async (email: string): Promise<void> => { await call('invites', 'DELETE', { email }); };

/** Opens a family read-only. The server logs the read (with the reason) before decrypting it. */
export async function adminRead(familyUserId: string, reason: string): Promise<AppState> {
  const r = (await call('read', 'POST', { familyUserId, reason })) as { state: AppState };
  const s = normalizeState(r.state);
  if (!s) throw new Error('That family could not be read.');
  return s;
}

/** Two-factor state of this session: no authenticator yet, enrolled but not used this session, or verified (aal2). */
export async function mfaStatus(): Promise<'none' | 'enrolled' | 'verified'> {
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === 'aal2') return 'verified';
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.some((f) => f.status === 'verified') ? 'enrolled' : 'none';
}

export async function mfaEnroll(): Promise<{ qr: string; factorId: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Harvesting admin' });
  if (error) throw new Error(friendly(error.message));
  return { qr: data.totp.qr_code, factorId: data.id };
}

/** The verified factor to step up with, if any. */
export async function mfaFactorId(): Promise<string | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === 'verified')?.id ?? null;
}

/** Checks a 6-digit code; afterwards the session is two-factor (aal2). */
export async function mfaVerify(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw new Error(friendly(error.message));
}
