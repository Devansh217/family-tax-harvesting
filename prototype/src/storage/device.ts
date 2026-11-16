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
    const key = await ks.get();
    if (!key) return { state: null, status: 'unreadable' };
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parsed.iv!), additionalData: AAD }, key, fromB64(parsed.ct!));
    const state = normalizeState(JSON.parse(new TextDecoder().decode(plain)) as AppState);
    return state ? { state, status: 'ok' } : { state: null, status: 'unreadable' };
  } catch {
    return { state: null, status: 'unreadable' };
  }
}

/** Encrypts and saves the family in this browser; false when storage is blocked (private window). */
export async function saveLocal(s: AppState, ks: KeyStore = indexedDbKeyStore): Promise<boolean> {
  try {
    let key = await ks.get();
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await ks.put(key);
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify(s)));
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ v: 1, kid: 'device', iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }));
    return true;
  } catch {
    return false;
  }
}

/** What to show first: the saved family; else, for someone signed in, an empty family (their account copy loads next); else the sample. */
export function initialFamily(local: LoadResult, signedIn: boolean): AppState {
  if (local.state) return local.state;
  return signedIn ? emptyState() : sampleState();
}
