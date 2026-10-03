import { cleanPilotName, completeLooks, type DroneLook } from '../../../shared/cosmetics';
import type { DroneClassId } from '../../../shared/drones';
import { loadJson, saveJson } from '../storage';

/**
 * Your profile (ADR-0030): kept in the browser for guests, and in your account once you sign in
 * (ADR-0031). Only what a client may set lives here; progression is server-written (step 3).
 */
export interface Profile {
  name: string;
  looks: Record<DroneClassId, DroneLook>;
}

const KEY = 'profile';

export function loadLocalProfile(): Profile {
  const saved = loadJson<Partial<Profile>>(KEY, {});
  return { name: cleanPilotName(saved.name), looks: completeLooks(saved.looks) };
}

export function saveLocalProfile(profile: Profile): void {
  saveJson(KEY, profile);
}

/** A profile row as stored in Supabase. */
export interface ProfileRow {
  pilot_name: string;
  looks: unknown;
}

export function profileFromRow(row: ProfileRow): Profile {
  return { name: cleanPilotName(row.pilot_name), looks: completeLooks(row.looks) };
}

export function rowFromProfile(profile: Profile): ProfileRow {
  return { pilot_name: cleanPilotName(profile.name), looks: profile.looks };
}

/**
 * Signing in (ADR-0031): a brand-new account (no row yet) takes the guest profile from this browser;
 * an existing account wins, so your profile is the same on every device.
 * Returns the profile to use and whether the account needs the guest profile written to it.
 */
export function mergeOnSignIn(local: Profile, remote: ProfileRow | null): { profile: Profile; upload: boolean } {
  if (!remote) return { profile: local, upload: true };
  return { profile: profileFromRow(remote), upload: false };
}
