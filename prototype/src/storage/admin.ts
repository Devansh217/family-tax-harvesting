import { friendly, supabase } from '../cloud';
import { normalizeState, type AppState } from '../store';
import { supabaseInvoke } from './functions';
import { parseInvites, type Invite } from './invites';
import { parseSeasonRows, type SeasonRow } from './seasonRows';

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

export type { SeasonRow };
/** Weekly beta totals, newest first. */
export async function seasonStats(): Promise<SeasonRow[]> {
  const rows = parseSeasonRows(await call('season', 'GET'));
  if (!rows) throw new Error('Season numbers are not available. Redeploy the admin function (see the setup guide).');
  return rows;
}

export type { Invite };
/** The beta invite list. An old `admin` deploy answers with the family list, which must never show here. */
export async function invitesList(): Promise<Invite[]> {
  const rows = parseInvites(await call('invites', 'GET'));
  if (!rows) throw new Error('Redeploy the admin function (see the setup guide).');
  return rows;
}
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
