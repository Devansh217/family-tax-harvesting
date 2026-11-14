import { describe, expect, it } from 'vitest';
import { namesFromLogin } from './cloud';

describe('names from the sign-in provider', () => {
  it('uses Google given and family names when present', () => {
    expect(namesFromLogin({ given_name: 'Meera', family_name: 'Mehta', full_name: 'Meera Mehta' })).toEqual({ first_name: 'Meera', last_name: 'Mehta' });
    expect(namesFromLogin({ custom_claims: { given_name: 'Ramesh', family_name: 'Mehta' } })).toEqual({ first_name: 'Ramesh', last_name: 'Mehta' });
  });
  it('splits a full name at the first space', () => {
    expect(namesFromLogin({ full_name: 'Arjun Kumar Mehta' })).toEqual({ first_name: 'Arjun', last_name: 'Kumar Mehta' });
    expect(namesFromLogin({ name: 'Kabir' })).toEqual({ first_name: 'Kabir', last_name: '' });
  });
  it('prefers names typed on the sign-up form', () => {
    expect(namesFromLogin({ first_name: 'Sunita', last_name: 'Shah', full_name: 'S Shah' })).toEqual({ first_name: 'Sunita', last_name: 'Shah' });
  });
});
