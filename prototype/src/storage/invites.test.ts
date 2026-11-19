import { describe, expect, it } from 'vitest';
import { parseInvites } from './invites';

const invite = { email: 'a@b.c', note: null, invitedAt: '2026-12-01T00:00:00Z' };

describe('parseInvites', () => {
  it('accepts well-formed invites (note text or null) and an empty list', () => {
    expect(parseInvites([invite, { ...invite, email: 'd@e.f', note: 'cousin' }])).toEqual([invite, { ...invite, email: 'd@e.f', note: 'cousin' }]);
    expect(parseInvites([])).toEqual([]);
  });
  it('rejects what an old admin deploy returns (the family list) and other junk', () => {
    expect(parseInvites([{ userId: 'u', email: 'a@b.c', version: 1, updatedAt: 'x' }])).toBeNull();
    expect(parseInvites([{ ...invite, userId: 'u' }])).toBeNull();
    expect(parseInvites([{ email: 'a@b.c', note: null }])).toBeNull();
    expect(parseInvites([{ ...invite, email: 3 }])).toBeNull();
    expect(parseInvites({ error: 'x' })).toBeNull();
    expect(parseInvites(null)).toBeNull();
  });
});
