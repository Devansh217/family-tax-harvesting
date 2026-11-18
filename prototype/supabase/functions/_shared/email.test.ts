import { describe, expect, it } from 'vitest';
import { sendEmail } from './email.ts';

describe('sendEmail', () => {
  it('posts to Brevo with the api-key header and the exact body shape', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status: 201 }); }) as unknown as typeof fetch;
    await sendEmail('a@x.in', 'Subject', 'Body\n', { apiKey: 'KEY', sender: 'me@x.in', fetch: fake });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0]!.init.method).toBe('POST');
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h['api-key']).toBe('KEY');
    expect(h['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      sender: { email: 'me@x.in', name: 'Harvesting' }, to: [{ email: 'a@x.in' }], subject: 'Subject', textContent: 'Body\n',
    });
  });

  it('throws on a non-2xx reply, without putting the address or key in the message', async () => {
    const fake = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const err = await sendEmail('a@x.in', 's', 't', { apiKey: 'KEY', sender: 'me@x.in', fetch: fake }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toMatch(/a@x\.in|KEY/);
  });
});
