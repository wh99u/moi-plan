import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, profileFromCredential } from './google';

/** Builds an unsigned JWT the way Google encodes it: base64url of UTF-8 JSON. */
function jwt(payload: object) {
  const enc = (o: object) => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${enc({ alg: 'RS256' })}.${enc(payload)}.sig`;
}

describe('profileFromCredential', () => {
  it('reads a Cyrillic display name from the ID token', () => {
    const p = profileFromCredential(jwt({ name: 'Иван Богоцкий', given_name: 'Иван', picture: 'https://x/p.jpg' }));
    expect(p).toMatchObject({ name: 'Иван Богоцкий', givenName: 'Иван', picture: 'https://x/p.jpg' });
  });

  it('builds the name from its parts when the full name is missing', () => {
    expect(profileFromCredential(jwt({ given_name: 'Иван', family_name: 'Богоцкий' }))?.name).toBe('Иван Богоцкий');
  });

  it('rejects broken tokens', () => {
    expect(profileFromCredential('not-a-token')).toBeNull();
    expect(decodeJwtPayload('a.@@@.c')).toBeNull();
    expect(profileFromCredential(jwt({ email: 'a@b.c' }))).toBeNull();
  });
});
