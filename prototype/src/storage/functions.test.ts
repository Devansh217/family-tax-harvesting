import { describe, expect, it } from 'vitest';
import { makeFunctionsStore, type Invoke } from './functions';

const fake = (reply: Awaited<ReturnType<Invoke>>) => {
  const calls: Array<{ name: string; method: string; body?: unknown }> = [];
  const invoke: Invoke = async (name, opts) => { calls.push({ name, ...opts }); return reply; };
  return { calls, store: makeFunctionsStore(invoke) };
};
const family = { version: 1 } as never;

describe('family store over server functions', () => {
  it('loads through GET family', async () => {
    const { calls, store } = fake({ data: { state: family, version: 4 }, error: null });
    expect(await store.load('u1')).toEqual({ state: family, version: 4 });
    expect(calls).toEqual([{ name: 'family', method: 'GET' }]);
  });
  it('saves with PUT and returns the new version', async () => {
    const { calls, store } = fake({ data: { version: 5 }, error: null });
    expect(await store.save('u1', family, 4)).toBe(5);
    expect(calls[0]).toEqual({ name: 'family', method: 'PUT', body: { state: family, knownVersion: 4 } });
  });
  it('a 409 means another device saved first', async () => {
    const { store } = fake({ data: null, error: { status: 409, message: 'conflict' } });
    expect(await store.save('u1', family, 4)).toBe('conflict');
  });
  it('other errors throw', async () => {
    const { store } = fake({ data: null, error: { status: 500, message: 'Edge Function returned a non-2xx status code' } });
    await expect(store.load('u1')).rejects.toThrow();
  });
});
