/** One beta invite, as the `admin` function's `invites` route returns it. */
export interface Invite { email: string; note: string | null; invitedAt: string }

/** The invites when the reply is a list of well-formed invites; null for anything else (an old `admin` deploy answers with the family list). */
export function parseInvites(x: unknown): Invite[] | null {
  if (!Array.isArray(x)) return null;
  for (const r of x) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    if ('userId' in o) return null;
    if (typeof o.email !== 'string' || typeof o.invitedAt !== 'string') return null;
    if (o.note != null && typeof o.note !== 'string') return null;
  }
  return x as Invite[];
}
