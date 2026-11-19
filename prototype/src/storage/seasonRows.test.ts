import { describe, expect, it } from 'vitest';
import { parseSeasonRows } from './seasonRows';

const row = { week: '2027-02-07', families: 2, room_usable: 1, room_used: 0, used_share_by_family: [0.5], moves_shown: 0, moves_dated: 0, moves_done: 0, moves_detected: 0, families_with_detected: 0 };

describe('parseSeasonRows', () => {
  it('accepts well-formed rows and an empty list', () => {
    expect(parseSeasonRows([row])).toEqual([row]);
    expect(parseSeasonRows([])).toEqual([]);
  });
  it('rejects what an old admin deploy returns (the family list) and other junk', () => {
    expect(parseSeasonRows([{ userId: 'u', email: 'a@b.c', version: 1, updatedAt: 'x' }])).toBeNull();
    expect(parseSeasonRows([{ ...row, used_share_by_family: undefined }])).toBeNull();
    expect(parseSeasonRows({ error: 'x' })).toBeNull();
    expect(parseSeasonRows(null)).toBeNull();
  });
});
