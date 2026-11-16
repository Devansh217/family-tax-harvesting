import { describe, expect, it } from 'vitest';
import { checkRestore, copyRows } from './restore-check';

describe('restore test checks', () => {
  it('passes only when every family came back and one opens with the family key', () => {
    expect(checkRestore(5, 5, true)).toEqual({ ok: true, message: 'families=5, one opened with the family key' });
    expect(checkRestore(4, 5, true)).toMatchObject({ ok: false, message: 'restored 4 families but the live project has 5' });
    expect(checkRestore(5, 5, false)).toMatchObject({ ok: false, message: 'a restored family did not open with the family key' });
    expect(checkRestore(0, 0, false)).toMatchObject({ ok: false, message: 'the backup holds no families' });
  });

  it('reads family rows out of the pg_restore data output', () => {
    const text = ['SET x = 1;', 'COPY public.families (user_id, version, envelope, updated_at) FROM stdin;',
      'u1\t3\t{"v": 1, "kid": "k1", "iv": "AAA", "ct": "BB+/"}\t2026-11-17 10:00:00+00', '\\.', ''].join('\n');
    expect(copyRows(text, 'families')).toEqual([['u1', '3', '{"v": 1, "kid": "k1", "iv": "AAA", "ct": "BB+/"}', '2026-11-17 10:00:00+00']]);
    expect(copyRows(text, 'admins')).toEqual([]);
  });
});

