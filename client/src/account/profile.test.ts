import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOKS } from '../../../shared/cosmetics';
import { mergeOnSignIn, profileFromRow, type Profile } from './profile';

const guest: Profile = { name: 'Holden', looks: { ...DEFAULT_LOOKS, wing: { body: 'pink', pattern: 'camo', accent: 'gold' } } };

describe('profile sync on sign-in (ADR-0031)', () => {
  it('a new account takes the guest profile and uploads it', () => {
    expect(mergeOnSignIn(guest, null)).toEqual({ profile: guest, upload: true });
  });

  it('an existing account wins over this browser', () => {
    const { profile, upload } = mergeOnSignIn(guest, { pilot_name: 'Ace', looks: {} });
    expect(upload).toBe(false);
    expect(profile.name).toBe('Ace');
    expect(profile.looks).toEqual(DEFAULT_LOOKS);
  });

  it('rows from the database are cleaned like anything else from outside', () => {
    expect(profileFromRow({ pilot_name: '<b>Bad</b> name!!', looks: { freestyle: { body: 'lava', pattern: 'x', accent: 'y' } } })).toEqual({
      name: 'bBadb name',
      looks: DEFAULT_LOOKS,
    });
  });
});
