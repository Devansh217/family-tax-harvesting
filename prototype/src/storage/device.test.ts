import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyState, type AppState } from '../store';
import { initialFamily, LOCAL_KEY, loadLocal, memoryKeyStore, saveLocal } from './device';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
};
const family = (): AppState => ({ ...emptyState(), members: [{ id: 'a', name: 'Asha', relation: 'self', age: 40, regime: 'new', type: 'person' }] });

beforeEach(() => mem.clear());

describe('the family saved in this browser', () => {
  it('is stored encrypted and reads back', async () => {
    const ks = memoryKeyStore();
    expect(await saveLocal(family(), ks)).toBe(true);
    const raw = mem.get(LOCAL_KEY)!;
    expect(raw).not.toContain('Asha');
    expect(JSON.parse(raw)).toMatchObject({ v: 1, kid: 'device' });
    expect(await loadLocal(ks)).toEqual({ state: family(), status: 'ok' });
  });

  it('an old plain copy is read once, re-saved encrypted, and the plain text is gone', async () => {
    const ks = memoryKeyStore();
    mem.set(LOCAL_KEY, JSON.stringify(family()));
    expect((await loadLocal(ks)).state?.members[0]?.name).toBe('Asha');
    expect(mem.get(LOCAL_KEY)).not.toContain('Asha');
    expect((await loadLocal(ks)).status).toBe('ok');
  });

  it('nothing saved is empty; a lost key or a damaged copy is unreadable, not a crash', async () => {
    expect(await loadLocal(memoryKeyStore())).toEqual({ state: null, status: 'empty' });
    await saveLocal(family(), memoryKeyStore());
    expect(await loadLocal(memoryKeyStore())).toEqual({ state: null, status: 'unreadable' });
    const ks = memoryKeyStore();
    await saveLocal(family(), ks);
    const env = JSON.parse(mem.get(LOCAL_KEY)!);
    mem.set(LOCAL_KEY, JSON.stringify({ ...env, ct: 'AAAA' + env.ct.slice(4) }));
    expect((await loadLocal(ks)).status).toBe('unreadable');
  });

  it('a signed-in person whose browser copy is unreadable starts empty, never on the sample family', () => {
    expect(initialFamily({ state: null, status: 'unreadable' }, true).isSample).toBe(false);
    expect(initialFamily({ state: null, status: 'unreadable' }, true).members).toEqual([]);
    expect(initialFamily({ state: null, status: 'empty' }, false).isSample).toBe(true);
    expect(initialFamily({ state: family(), status: 'ok' }, true)).toEqual(family());
  });

  it('the real key store keeps a non-extractable key in IndexedDB', async () => {
    const { indexedDbKeyStore } = await import('./device');
    await saveLocal(family(), indexedDbKeyStore);
    const key = await indexedDbKeyStore.get();
    expect(key?.extractable).toBe(false);
    expect((await loadLocal(indexedDbKeyStore)).status).toBe('ok');
  });

  it('review: saves made in quick succession keep the last one, and the first saves create one key', async () => {
    let puts = 0;
    const base = memoryKeyStore();
    const ks = { get: base.get, put: async (k: CryptoKey) => { puts++; await new Promise((r) => setTimeout(r, 5)); await base.put(k); } };
    const states = [1, 2, 3, 4, 5].map((n) => ({ ...family(), members: [{ ...family().members[0]!, name: `V${n}` }] }));
    await Promise.all(states.map((s) => saveLocal(s, ks)));
    expect(puts).toBe(1);
    expect((await loadLocal(ks)).state?.members[0]?.name).toBe('V5');
  });
});

