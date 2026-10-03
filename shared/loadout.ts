// Loadouts (ADR-0033): a body, a weapon per hardpoint, a special. Weight against thrust decides how it flies;
// nothing stops a bad build.

import { DRONE_CLASSES, isDroneClassId, type DroneClassId } from './drones.js';
import { isSpecialId, SPECIALS, specialFits, type SpecialId } from './specials.js';
import { isWeaponId, WEAPONS, type WeaponId } from './weapons.js';

export interface Loadout {
  body: DroneClassId;
  /** One entry per hardpoint; null = empty. */
  weapons: (WeaponId | null)[];
  special: SpecialId | null;
}

/** Each body's default loadout: it flies exactly as the original drone was tuned. */
export const DEFAULT_LOADOUTS: Record<DroneClassId, Loadout> = {
  freestyle: { body: 'freestyle', weapons: ['gun', 'missile'], special: null },
  quad3d: { body: 'quad3d', weapons: ['shotgun', null], special: 'smoke' },
  wing: { body: 'wing', weapons: ['cannon', null], special: 'maneuver' },
  racer: { body: 'racer', weapons: ['gun'], special: null },
  x8: { body: 'x8', weapons: ['gun', 'gun', 'burst', 'missile'], special: 'shield' },
};

export function defaultLoadout(body: DroneClassId): Loadout {
  const d = DEFAULT_LOADOUTS[body];
  return { body, weapons: [...d.weapons], special: d.special };
}

/** Make anything (saved, or from the wire) into a valid loadout: right number of hardpoints, known modules, a special that fits. */
export function cleanLoadout(raw: unknown, fallbackBody: DroneClassId = 'freestyle'): Loadout {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const body = isDroneClassId(r.body) ? r.body : fallbackBody;
  if (!Array.isArray(r.weapons)) return defaultLoadout(body);
  const slots = DRONE_CLASSES[body].hardpoints;
  const weapons: (WeaponId | null)[] = [];
  for (let i = 0; i < slots; i++) {
    const w = r.weapons[i];
    weapons.push(isWeaponId(w) ? w : null);
  }
  const special = isSpecialId(r.special) && specialFits(r.special, body) ? r.special : null;
  return { body, weapons, special };
}

export function totalKg(l: Loadout): number {
  let kg = DRONE_CLASSES[l.body].frameKg;
  for (const w of l.weapons) if (w) kg += WEAPONS[w].kg;
  if (l.special) kg += SPECIALS[l.special].kg;
  return kg;
}

/** Thrust-to-weight: under 1 it can't take off. */
export function thrustToWeight(l: Loadout): number {
  return DRONE_CLASSES[l.body].thrustKg / totalKg(l);
}

/**
 * How much heavier than its tuned default this loadout is (1 = as tuned). The client scales the simulated
 * mass by this with thrust fixed, so every default loadout flies exactly as before (ADR-0033).
 */
export function loadFactor(l: Loadout): number {
  return totalKg(l) / totalKg(DEFAULT_LOADOUTS[l.body]);
}

/** Weapons by kind: guns fire with Fire; missile pods are the second group. */
export function guns(l: Loadout): WeaponId[] {
  return l.weapons.filter((w): w is WeaponId => !!w && WEAPONS[w].kind === 'gun');
}

export function missilePods(l: Loadout): number {
  return l.weapons.filter((w) => w === 'missile').length;
}

/** How many of a weapon are mounted. */
export function count(l: Loadout, id: WeaponId): number {
  return l.weapons.filter((w) => w === id).length;
}

/** A plain-words read on a build, for the Loadout screen. */
export function handling(tw: number): { label: string; level: 'good' | 'heavy' | 'pig' | 'grounded' } {
  if (tw <= 1) return { label: "Too heavy to take off", level: 'grounded' };
  if (tw < 1.8) return { label: 'Barely flies', level: 'pig' };
  if (tw < 3.5) return { label: 'Heavy and sluggish', level: 'heavy' };
  return { label: 'Agile', level: 'good' };
}
