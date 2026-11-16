import type { Reply } from './family.ts';

/** The app's own origins: the live site and the dev server. Nothing else may call the functions from a browser. */
export const ALLOWED_ORIGINS = ['https://devansh217.github.io', 'http://localhost:5199'];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin',
  };
}

export function toResponse(r: Reply, origin: string | null): Response {
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? null), { status: r.status, headers });
}

/** The payload of a JWT that Supabase Auth has already verified (used only to read `aal`). */
export function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  try { return JSON.parse(atob(b64)) as Record<string, unknown>; } catch { return {}; }
}
