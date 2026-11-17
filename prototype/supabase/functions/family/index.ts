// The `family` server function (Deno). All logic is in ../_shared/family.ts, tested with Vitest; this file only
// wires the Supabase clients and secrets. Deploy: npx supabase@2 functions deploy family
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { importKeyRing, type Envelope, type KeyRing } from '../_shared/envelope.ts';
import { handleFamily, verifiedEmail, type FamilyDb } from '../_shared/family.ts';
import { corsHeaders, toResponse } from '../_shared/http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let ring: Promise<KeyRing> | null = null;
const keyRing = () => (ring ??= importKeyRing(Deno.env.get('FAMILY_KEYS')!, Deno.env.get('FAMILY_KEY_CURRENT')!));

const db: FamilyDb = {
  async get(userId) {
    const { data, error } = await service.from('families').select('version, envelope').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data as { version: number; envelope: Envelope } | null;
  },
  async insert(userId, envelope, seasonHelp) {
    const { error } = await service.from('families').insert({ user_id: userId, version: 1, envelope, season_help: seasonHelp });
    if (error?.code === '23505') return false;
    if (error) throw error;
    return true;
  },
  async updateIf(userId, knownVersion, newVersion, envelope, seasonHelp) {
    const { data, error } = await service.from('families').update({ version: newVersion, envelope, season_help: seasonHelp })
      .eq('user_id', userId).eq('version', knownVersion).select('version');
    if (error) throw error;
    return !!data?.length;
  },
  async removeAll(userId) {
    const { error } = await service.from('admin_reads').delete().eq('family_user_id', userId);
    if (error) throw error;
    // Deleting the sign-in account cascades to families, profiles and admins (foreign keys on delete cascade).
    const { error: e2 } = await service.auth.admin.deleteUser(userId);
    if (e2) throw e2;
  },
  async isInvited(email, userId) {
    const { data, error } = await service.from('beta_invites').select('email').eq('email', email).maybeSingle();
    if (error) throw error;
    if (data) return true;
    const { data: admin, error: e2 } = await service.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (e2) throw e2;
    return !!admin;
  },
};

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data } = await service.auth.getUser(token);
  if (!data.user) return toResponse({ status: 401, json: { error: 'sign_in' } }, origin);
  try {
    const body = req.method === 'PUT' ? await req.text() : undefined;
    return toResponse(await handleFamily({ method: req.method, userId: data.user.id, email: verifiedEmail(data.user), body }, { db, ring: await keyRing() }), origin);
  } catch (e) {
    console.error('family', req.method, (e as Error).message);
    return toResponse({ status: 500, json: { error: 'server' } }, origin);
  }
});
