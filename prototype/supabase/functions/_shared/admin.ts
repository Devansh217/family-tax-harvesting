import { familyAad, openJson, type KeyRing } from './envelope.ts';
import type { FamilyDb, Reply } from './family.ts';

export interface AdminDb {
  isAdmin(userId: string): Promise<boolean>;
  /** Metadata only: never a family's contents. */
  list(): Promise<Array<{ userId: string; email: string; version: number; updatedAt: string }>>;
  logRead(row: { familyUserId: string; adminUserId: string; reason: string }): Promise<void>;
  family: Pick<FamilyDb, 'get'>;
}

/**
 * The founder's only way into a family. Needs two-factor sign-in (`aal2`) and a row in `admins`. A read needs a
 * reason and is logged before anything is decrypted: no log, no data. The family sees the log on its Account page.
 */
export async function handleAdmin(
  req: { method: string; path: 'list' | 'read'; userId: string; aal: string; body?: string },
  deps: { db: AdminDb; ring: KeyRing },
): Promise<Reply> {
  const { db, ring } = deps;
  if (req.aal !== 'aal2') return { status: 403, json: { error: 'two_factor_required' } };
  if (!(await db.isAdmin(req.userId))) return { status: 403, json: { error: 'not_admin' } };
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
