import { fromB64, toB64 } from '../../supabase/functions/_shared/base64.ts';
import { sampleState } from '../sample';
import { emptyState, normalizeState, type AppState } from '../store';

/** Kept from the working name so data already in people's browsers is found and migrated. */
export const LOCAL_KEY = 'fasal-prototype-v1';
const AAD = new TextEncoder().encode('device');

/** Where this browser's key lives. The real one is IndexedDB; tests use memory. */
export interface KeyStore { get(): Promise<CryptoKey | null>; put(k: CryptoKey): Promise<void> }

export function memoryKeyStore(): KeyStore {
  let key: CryptoKey | null = null;
  return { get: async () => key, put: async (k) => { key = k; } };
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('harvesting', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction('keys', mode).objectStore('keys'));
      req.onsuccess = () => { resolve(req.result); open.result.close(); };
      req.onerror = () => { reject(req.error); open.result.close(); };
    };
  });
}

/** A non-extractable AES key in IndexedDB: page scripts can use it but never read it out. */
export const indexedDbKeyStore: KeyStore = {
  get: async () => ((await idb('readonly', (s) => s.get('device'))) as CryptoKey | undefined) ?? null,
  put: async (k) => { await idb('readwrite', (s) => s.put(k, 'device')); },
};

export type LoadResult = { state: AppState | null; status: 'ok' | 'empty' | 'unreadable' };

/**
 * The family saved in this browser, decrypted. An old plain-text copy is read once and re-saved encrypted. A copy
 * that can't be decrypted (key lost with cleared site data, another browser profile, damage) is `unreadable`.
 */
export async function loadLocal(ks: KeyStore = indexedDbKeyStore): Promise<LoadResult> {
  let raw: string | null;
  try { raw = localStorage.getItem(LOCAL_KEY); } catch { return { state: null, status: 'unreadable' }; }
  if (!raw) return { state: null, status: 'empty' };
  try {
    const parsed = JSON.parse(raw) as { kid?: string; iv?: string; ct?: string; version?: number };
    if (parsed.kid !== 'device') {
      const state = normalizeState(parsed as AppState);
      if (!state) return { state: null, status: 'unreadable' };
      await saveLocal(state, ks);
      return { state, status: 'ok' };
    }
    const key = (await keys.get(ks)) ?? (await ks.get());
    if (!key) return { state: null, status: 'unreadable' };
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parsed.iv!), additionalData: AAD }, key, fromB64(parsed.ct!));
    const state = normalizeState(JSON.parse(new TextDecoder().decode(plain)) as AppState);
    return state ? { state, status: 'ok' } : { state: null, status: 'unreadable' };
  } catch {
    return { state: null, status: 'unreadable' };
  }
}

/** One key per store, created once even when several saves start together (a second key would orphan the first copy). */
const keys = new WeakMap<KeyStore, Promise<CryptoKey>>();
function deviceKey(ks: KeyStore): Promise<CryptoKey> {
  let p = keys.get(ks);
  if (!p) {
    p = (async () => {
      const found = await ks.get();
      if (found) return found;
      const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await ks.put(k);
      return k;
    })();
    p.catch(() => keys.delete(ks));
    keys.set(ks, p);
  }
  return p;
}

/** Saves run one at a time and only the newest waiting family is written, so an older save never lands last. */
const queues = new WeakMap<KeyStore, { running: Promise<void> | null; latest: AppState | null; waiters: Array<(ok: boolean) => void> }>();

async function writeOnce(s: AppState, ks: KeyStore): Promise<boolean> {
  try {
    const key = await deviceKey(ks);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify(s)));
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ v: 1, kid: 'device', iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }));
    return true;
  } catch {
    return false;
  }
}

/** Encrypts and saves the family in this browser; false when storage is blocked (private window). */
export function saveLocal(s: AppState, ks: KeyStore = indexedDbKeyStore): Promise<boolean> {
  let q = queues.get(ks);
  if (!q) { q = { running: null, latest: null, waiters: [] }; queues.set(ks, q); }
  const queue = q;
  queue.latest = s;
  const done = new Promise<boolean>((resolve) => queue.waiters.push(resolve));
  if (!queue.running) {
    queue.running = (async () => {
      while (queue.latest) {
        const next = queue.latest, waiting = queue.waiters.splice(0);
        queue.latest = null;
        const ok = await writeOnce(next, ks);
        waiting.forEach((w) => w(ok));
      }
      queue.running = null;
    })();
  }
  return done;
}

/** What to show first: the saved family; else, for someone signed in, an empty family (their account copy loads next); else the sample. */
export function initialFamily(local: LoadResult, signedIn: boolean): AppState {
  if (local.state) return local.state;
  return signedIn ? emptyState() : sampleState();
}
