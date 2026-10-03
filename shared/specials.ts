// Special modules (ADR-0033): one per drone, in the special slot. Each keeps the rules of its own ADR.

import type { DroneClassId } from './drones.js';

export type SpecialId = 'smoke' | 'maneuver' | 'afterburner' | 'shield';

export interface Special {
  id: SpecialId;
  name: string;
  blurb: string;
  kg: number;
  /** Bodies it fits (maneuver mode needs a wing's aerodynamics); undefined = all. */
  bodies?: readonly DroneClassId[];
}

export const SPECIALS: Record<SpecialId, Special> = {
  smoke: { id: 'smoke', name: 'Smoke trail', blurb: 'Tap: 6 s where others see only your frame (ADR-0024)', kg: 0.15 },
  maneuver: { id: 'maneuver', name: 'Maneuver mode', blurb: 'Hold: way more pitch, easier to stall (ADR-0022)', kg: 0, bodies: ['wing'] },
  afterburner: { id: 'afterburner', name: 'Afterburner', blurb: 'Hold: +60% thrust while the fuel lasts', kg: 0.25 },
  shield: { id: 'shield', name: 'Shield', blurb: 'Tap: absorbs the next 40 damage for 3 s', kg: 0.4 },
};

export const SPECIAL_ORDER: readonly SpecialId[] = ['smoke', 'afterburner', 'shield', 'maneuver'];

/** Afterburner (ADR-0033): extra thrust while held, from a fuel tank that refills when you let go. */
export const AFTERBURNER = { thrustBoost: 0.6, fuelSeconds: 2, refillSeconds: 6 } as const;

/** Shield (ADR-0033): absorbs damage on the server for a short time, then cools down. */
export const SHIELD = { absorb: 40, durationMs: 3000, cooldownMs: 12000 } as const;

export function isSpecialId(x: unknown): x is SpecialId {
  return typeof x === 'string' && x in SPECIALS;
}

export function specialFits(special: SpecialId, body: DroneClassId): boolean {
  const b = SPECIALS[special].bodies;
  return !b || b.includes(body);
}
