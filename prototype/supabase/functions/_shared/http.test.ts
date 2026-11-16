import { describe, expect, it } from 'vitest';
import { corsHeaders, jwtPayload } from './http.ts';

describe('function HTTP helpers', () => {
  it('only echoes the app’s own origins', () => {
    expect(corsHeaders('http://localhost:5199')['Access-Control-Allow-Origin']).toBe('http://localhost:5199');
    expect(corsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBe('https://devansh217.github.io');
  });
  it('reads the aal claim from a token payload, and survives junk', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', aal: 'aal2' })).toString('base64url');
    expect(jwtPayload(`x.${payload}.y`)).toMatchObject({ aal: 'aal2' });
    expect(jwtPayload('nonsense')).toEqual({});
  });
});
