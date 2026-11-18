// Your personal settings (ADR-0083), kept in this browser: your tag and your color.

import { defaultProfile, parseProfile, type Profile } from '../../shared/profile';

const PROFILE_KEY = 'dronefight.profile.v1';

let current: Profile = load();

function load(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? parseProfile(JSON.parse(raw)) : defaultProfile();
  } catch {
    return defaultProfile();
  }
}

export function profile(): Profile {
  return current;
}

export function setProfile(p: Partial<Profile>): Profile {
  current = parseProfile({ ...current, ...p });
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(current));
  } catch {
    // Private mode: settings just don't stick.
  }
  return current;
}
