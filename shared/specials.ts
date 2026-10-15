// Special modules (ADR-0033): one per drone, in the special slot. Each module's data and tuning live here, with
// the rules of its own ADR.

import type { DroneClassId } from './drones.js';

export type SpecialId = 'smoke' | 'maneuver' | 'afterburner' | 'shield';

export interface Special {
  id: SpecialId;
  name: string;
  blurb: string;
  kg: number;
  /** Bodies it fits (maneuver mode needs a wing's aerodynamics); undefined = all. */
  bodies?: readonly DroneClassId[];
  /** Tap to trigger (with a cooldown) or hold while you want it. */
  use: 'tap' | 'hold';
  /** Triggered through the server, which tells everyone (an 'ability' message); hold specials only change your own flight. */
  networked: boolean;
  /** HUD label. */
  hud: string;
}

export const SPECIALS: Record<SpecialId, Special> = {
  smoke: { id: 'smoke', name: 'Smoke trail', blurb: 'Tap: 6 s where others see only your frame (ADR-0024)', kg: 0.06, use: 'tap', networked: true, hud: 'SMOKE' },
  maneuver: { id: 'maneuver', name: 'Maneuver mode', blurb: 'Hold: way more pitch, easier to stall (ADR-0022)', kg: 0, bodies: ['wing'], use: 'hold', networked: false, hud: 'MANEUVER' },
  afterburner: { id: 'afterburner', name: 'Afterburner', blurb: 'Hold: +60% thrust while the fuel lasts', kg: 0.1, use: 'hold', networked: false, hud: 'BURNER' },
  shield: { id: 'shield', name: 'Shield', blurb: 'Tap: absorbs the next 40 damage for 3 s', kg: 0.16, use: 'tap', networked: true, hud: 'SHIELD' },
};

/** Specials the server triggers for everyone (an 'ability' message). */
export type NetworkedSpecialId = 'smoke' | 'shield';

export function isNetworkedSpecial(x: unknown): x is NetworkedSpecialId {
  return isSpecialId(x) && SPECIALS[x].networked;
}

/**
 * Smoke trail (ADR-0024): for `durationMs` the other pilot sees only your frame (no glow, trail, lead dot or
 * marker) while you leave a thin smoke trail.
 */
export const SMOKE = {
  durationMs: 6000,
  cooldownMs: 10000,
  /** Trail puffs: one every `puffEveryMs`, growing from `puffStart` to `puffEnd` metres over `puffLifeMs`. */
  puffEveryMs: 40,
  puffStart: 0.35,
  puffEnd: 1.8,
  puffLifeMs: 1600,
} as const;

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
