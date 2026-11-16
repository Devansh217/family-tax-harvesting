// The `admin` server function (Deno): GET …/admin/list and POST …/admin/read. Logic in ../_shared/admin.ts.
// Deploy: npx supabase@2 functions deploy admin
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleAdmin, type AdminDb } from '../_shared/admin.ts';
import { importKeyRing, type Envelope, type KeyRing } from '../_shared/envelope.ts';
import { corsHeaders, jwtPayload, toResponse } from '../_shared/http.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let ring: Promise<KeyRing> | null = null;
const keyRing = () => (ring ??= importKeyRing(Deno.env.get('FAMILY_KEYS')!, Deno.env.get('FAMILY_KEY_CURRENT')!));

const db: AdminDb = {
  async isAdmin(userId) {
    const { data, error } = await service.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  async list() {
    const { data, error } = await service.from('families').select('user_id, version, updated_at').order('updated_at', { ascending: false });
    if (error) throw error;
    const { data: users, error: e2 } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (e2) throw e2;
    const email = new Map(users.users.map((u) => [u.id, u.email ?? '']));
    return (data ?? []).map((r) => ({ userId: r.user_id as string, email: email.get(r.user_id as string) ?? '', version: r.version as number, updatedAt: r.updated_at as string }));
  },
  async logRead(row) {
    const { error } = await service.from('admin_reads').insert({ family_user_id: row.familyUserId, admin_user_id: row.adminUserId, reason: row.reason });
    if (error) throw error;
  },
  family: {
    async get(userId) {
      const { data, error } = await service.from('families').select('version, envelope').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data as { version: number; envelope: Envelope } | null;
    },
  },
};

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data } = await service.auth.getUser(token);
  if (!data.user) return toResponse({ status: 401, json: { error: 'sign_in' } }, origin);
  const path = new URL(req.url).pathname.split('/').pop() === 'read' ? 'read' : 'list';
  try {
    const body = req.method === 'POST' ? await req.text() : undefined;
    const aal = String(jwtPayload(token).aal ?? 'aal1');
    return toResponse(await handleAdmin({ method: req.method, path, userId: data.user.id, aal, body }, { db, ring: await keyRing() }), origin);
  } catch (e) {
    console.error('admin', path, (e as Error).message);
    return toResponse({ status: 500, json: { error: 'server' } }, origin);
  }
});
