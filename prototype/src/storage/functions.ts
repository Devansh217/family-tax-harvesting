import { friendly, supabase } from '../cloud';
import type { AppState } from '../store';
import type { CloudFamily, FamilyStore } from './index';

/** Calls a server function. Separated so tests can stand in for Supabase. */
export type Invoke = (name: string, opts: { method: 'GET' | 'PUT' | 'POST' | 'DELETE'; body?: unknown }) =>
  Promise<{ data: unknown; error: { status?: number; message: string } | null }>;

export const supabaseInvoke: Invoke = async (name, opts) => {
  const { data, error } = await supabase.functions.invoke(name, { method: opts.method, body: opts.body as Record<string, unknown> | undefined });
  if (!error) return { data, error: null };
  const status = (error as { context?: { status?: number } }).context?.status;
  return { data: null, error: { status, message: error.message } };
};

const fail = (e: { status?: number; message: string }): never => {
  throw new Error(e.status === 401 ? 'Sign in again to save your family.' : friendly(e.message));
};

/**
 * The account copy of a family through the `family` server function, which encrypts it before it reaches the
 * database. The user id comes from the sign-in on the server; the argument is kept for the FamilyStore interface.
 */
export function makeFunctionsStore(invoke: Invoke = supabaseInvoke): FamilyStore {
  return {
    async load() {
      const r = await invoke('family', { method: 'GET' });
      if (r.error) return fail(r.error);
      return (r.data as CloudFamily | null) ?? null;
    },
    async save(_userId: string, state: AppState, knownVersion: number | null) {
      const r = await invoke('family', { method: 'PUT', body: { state, knownVersion } });
      if (r.error?.status === 409) return 'conflict';
      if (r.error) return fail(r.error);
      return (r.data as { version: number }).version;
    },
    async remove() {
      const r = await invoke('family', { method: 'DELETE' });
      if (r.error) fail(r.error);
    },
  };
}

export const functionsFamilyStore = makeFunctionsStore();
