import { describe, expect, it } from 'vitest';
import { fromB64, toB64 } from './base64.ts';

describe('base64', () => {
  it('round-trips bytes, including zero and 255', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    expect(fromB64(toB64(bytes))).toEqual(bytes);
    expect(toB64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
});
