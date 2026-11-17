import { familyAad, openJson, type KeyRing } from './envelope.ts';
import type { FamilyDb, Reply } from './family.ts';

export interface AdminDb {
  isAdmin(userId: string): Promise<boolean>;
  /** Metadata only: never a family's contents. */
  list(): Promise<Array<{ userId: string; email: string; version: number; updatedAt: string }>>;
  logRead(row: { familyUserId: string; adminUserId: string; reason: string }): Promise<void>;
  invites: {
    list(): Promise<Array<{ email: string; note: string | null; invitedAt: string }>>;
    /** Upsert: inviting twice is not an error. */
    add(email: string, note: string | null): Promise<void>;
    remove(email: string): Promise<void>;
  };
  family: Pick<FamilyDb, 'get'>;
}

/**
 * The founder's only way into a family. Needs two-factor sign-in (`aal2`) and a row in `admins`. A read needs a
 * reason and is logged before anything is decrypted: no log, no data. The family sees the log on its Account page.
 */
export async function handleAdmin(
  req: { method: string; path: 'list' | 'read' | 'invites'; userId: string; aal: string; body?: string },
  deps: { db: AdminDb; ring: KeyRing },
): Promise<Reply> {
  const { db, ring } = deps;
  if (req.aal !== 'aal2') return { status: 403, json: { error: 'two_factor_required' } };
  if (!(await db.isAdmin(req.userId))) return { status: 403, json: { error: 'not_admin' } };
  if (req.path === 'invites') return handleInvites(req, db);
  if (req.path === 'list' && req.method === 'GET') return { status: 200, json: await db.list() };
  if (req.path !== 'read' || req.method !== 'POST') return { status: 405, json: { error: 'method' } };

  let body: { familyUserId?: unknown; reason?: unknown };
  try { body = JSON.parse(req.body ?? ''); } catch { return { status: 400, json: { error: 'bad_json' } }; }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (typeof body.familyUserId !== 'string' || reason.length < 3 || reason.length > 300) return { status: 400, json: { error: 'reason_required' } };
  const row = await db.family.get(body.familyUserId);
  if (!row) return { status: 404, json: { error: 'no_family' } };
  await db.logRead({ familyUserId: body.familyUserId, adminUserId: req.userId, reason });
  try {
    return { status: 200, json: { state: await openJson(row.envelope, ring, familyAad(body.familyUserId, row.version)), version: row.version } };
  } catch {
    return { status: 500, json: { error: 'cannot_open' } };
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The beta invite list. Each change is logged against the admin's own id, like a read. */
async function handleInvites(req: { method: string; userId: string; body?: string }, db: AdminDb): Promise<Reply> {
  if (req.method === 'GET') return { status: 200, json: await db.invites.list() };
  if (req.method !== 'POST' && req.method !== 'DELETE') return { status: 405, json: { error: 'method' } };
  let body: { email?: unknown; note?: unknown };
  try { body = JSON.parse(req.body ?? ''); } catch { return { status: 400, json: { error: 'bad_json' } }; }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) return { status: 400, json: { error: 'bad_email' } };
  const add = req.method === 'POST';
  const prefix = add ? 'invite: ' : 'uninvite: ';
  const reason = (prefix + email).slice(0, 300);
  await db.logRead({ familyUserId: req.userId, adminUserId: req.userId, reason });
  if (add) {
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
    await db.invites.add(email, note);
  } else {
    await db.invites.remove(email);
  }
  return { status: 200, json: { ok: true } };
}
