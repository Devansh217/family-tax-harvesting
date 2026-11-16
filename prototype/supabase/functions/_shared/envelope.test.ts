import { describe, expect, it } from 'vitest';
import { toB64 } from './base64.ts';
import { familyAad, importKeyRing, openJson, sealJson, type Envelope } from './envelope.ts';

const rawKey = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
const ring = (keys: Record<string, string>, current: string) => importKeyRing(JSON.stringify(keys), current);
const family = { version: 1, members: [{ id: 'a', name: 'Asha' }], txns: [] };

describe('family envelope', () => {
  it('opens to what was sealed, with a fresh IV each time', async () => {
    const r = await ring({ k1: rawKey() }, 'k1');
    const a = await sealJson(family, r, familyAad('u1', 1));
    const b = await sealJson(family, r, familyAad('u1', 1));
    expect(a).toMatchObject({ v: 1, kid: 'k1' });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(await openJson(a, r, familyAad('u1', 1))).toEqual(family);
  });

  it('a tampered ciphertext does not open', async () => {
    const r = await ring({ k1: rawKey() }, 'k1');
    const env = await sealJson(family, r, familyAad('u1', 1));
    const flipped: Envelope = { ...env, ct: (env.ct[0] === 'A' ? 'B' : 'A') + env.ct.slice(1) };
    await expect(openJson(flipped, r, familyAad('u1', 1))).rejects.toThrow();
  });

  it('an envelope moved to another user or another version does not open', async () => {
    const r = await ring({ k1: rawKey() }, 'k1');
    const env = await sealJson(family, r, familyAad('u1', 1));
    await expect(openJson(env, r, familyAad('u2', 1))).rejects.toThrow();
    await expect(openJson(env, r, familyAad('u1', 2))).rejects.toThrow();
  });

  it('old keys still open; new saves use the current key', async () => {
    const k1 = rawKey(), k2 = rawKey();
    const old = await sealJson(family, await ring({ k1 }, 'k1'), 'x');
    const r = await ring({ k1, k2 }, 'k2');
    expect(await openJson(old, r, 'x')).toEqual(family);
    expect((await sealJson(family, r, 'x')).kid).toBe('k2');
    await expect(openJson({ ...old, kid: 'k9' }, r, 'x')).rejects.toThrow('unknown key k9');
  });

  it('refuses a current key id that is not in the key list', async () => {
    await expect(ring({ k1: rawKey() }, 'k2')).rejects.toThrow('FAMILY_KEY_CURRENT not in FAMILY_KEYS');
  });
});
