import { fromB64, toB64 } from './base64.ts';

/**
 * A family as stored: AES-256-GCM ciphertext of its JSON, with a fresh random IV each save. `kid` names the key so
 * keys can be rotated. The additional authenticated data (who and which version) is not stored: the caller supplies
 * it, so an envelope copied onto another row or version fails to open. See the secure storage spec §5.1.
 */
export interface Envelope { v: 1; kid: string; iv: string; ct: string }

export type KeyRing = { current: string; keys: Record<string, CryptoKey> };

/** Builds the key ring from the function secrets FAMILY_KEYS (JSON of id → base64 32-byte key) and FAMILY_KEY_CURRENT. */
export async function importKeyRing(keysJson: string, current: string): Promise<KeyRing> {
  const raw = JSON.parse(keysJson) as Record<string, string>;
  if (!(current in raw)) throw new Error('FAMILY_KEY_CURRENT not in FAMILY_KEYS');
  const keys: Record<string, CryptoKey> = {};
  for (const [kid, b64] of Object.entries(raw)) {
    const bytes = fromB64(b64);
    if (bytes.length !== 32) throw new Error(`key ${kid} must be 32 bytes`);
    keys[kid] = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return { current, keys };
}

const enc = new TextEncoder(), dec = new TextDecoder();

export async function sealJson(value: unknown, ring: KeyRing, aad: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, ring.keys[ring.current]!, enc.encode(JSON.stringify(value)));
  return { v: 1, kid: ring.current, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function openJson<T>(env: Envelope, ring: KeyRing, aad: string): Promise<T> {
  const key = ring.keys[env.kid];
  if (!key) throw new Error(`unknown key ${env.kid}`);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv), additionalData: enc.encode(aad) }, key, fromB64(env.ct));
  return JSON.parse(dec.decode(plain)) as T;
}

/** Binds a family's envelope to its owner and version. */
export const familyAad = (userId: string, version: number) => `${userId}|${version}`;
