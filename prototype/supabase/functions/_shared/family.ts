import { familyAad, openJson, sealJson, type Envelope, type KeyRing } from './envelope.ts';

/** The families table as the function needs it. The real one is in family/index.ts; tests use an in-memory one. */
export interface FamilyDb {
  get(userId: string): Promise<{ version: number; envelope: Envelope } | null>;
  /** Inserts version 1; false when a row already exists. */
  insert(userId: string, envelope: Envelope): Promise<boolean>;
  /** Writes only if the stored version is still `knownVersion`; false if another save got there first. */
  updateIf(userId: string, knownVersion: number, newVersion: number, envelope: Envelope): Promise<boolean>;
  /** The family row, the admin-read log about it, the profile and the sign-in account. */
  removeAll(userId: string): Promise<void>;
  /** On the beta list, or an admin (so the founder can always reach the admin screen). `email` is lower-case. */
  isInvited(email: string, userId: string): Promise<boolean>;
}

export interface Reply { status: number; json?: unknown }

export const MAX_BODY = 5 * 1024 * 1024;

const isFamily = (s: unknown): s is { version: 1 } =>
  typeof s === 'object' && s !== null && !Array.isArray(s) && (s as { version?: unknown }).version === 1;

/**
 * One user's family: GET loads and decrypts, PUT encrypts and saves only if nobody saved in between, DELETE removes
 * the account and its data. GET and PUT also need an invite (403 `not_invited`); the email comes from the verified sign-in. `userId` always comes from the verified sign-in, never from the request body.
 */
export async function handleFamily(req: { method: string; userId: string; email?: string; body?: string }, deps: { db: FamilyDb; ring: KeyRing }): Promise<Reply> {
  const { db, ring } = deps;
  // Deleting an account is always allowed, so a family that is uninvited can still remove everything.
  if (req.method === 'GET' || req.method === 'PUT') {
    const email = (req.email ?? '').trim().toLowerCase();
    if (!email || !(await db.isInvited(email, req.userId))) return { status: 403, json: { error: 'not_invited' } };
  }
  if (req.method === 'GET') {
    const row = await db.get(req.userId);
    if (!row) return { status: 200, json: null };
    return { status: 200, json: { state: await openJson(row.envelope, ring, familyAad(req.userId, row.version)), version: row.version } };
  }
  if (req.method === 'PUT') {
    if ((req.body ?? '').length > MAX_BODY) return { status: 413, json: { error: 'too_large' } };
    let body: { state?: unknown; knownVersion?: unknown };
    try { body = JSON.parse(req.body ?? ''); } catch { return { status: 400, json: { error: 'bad_json' } }; }
    const known = body.knownVersion;
    if (!isFamily(body.state) || !(known === null || (Number.isInteger(known) && (known as number) > 0))) return { status: 400, json: { error: 'bad_family' } };
    const next = known === null ? 1 : (known as number) + 1;
    const envelope = await sealJson(body.state, ring, familyAad(req.userId, next));
    const ok = known === null ? await db.insert(req.userId, envelope) : await db.updateIf(req.userId, known as number, next, envelope);
    return ok ? { status: 200, json: { version: next } } : { status: 409, json: { conflict: true } };
  }
  if (req.method === 'DELETE') {
    await db.removeAll(req.userId);
    return { status: 204 };
  }
  return { status: 405, json: { error: 'method' } };
}
