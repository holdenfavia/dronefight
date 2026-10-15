// Propellers (ADR-0035): one set per drone, a sidegrade like everything else (ADR-0030). Each trades lift
// for response and top speed; the tri-blade is the stock prop every default build flies on.

import type { DroneClassId } from './drones.js';

export type PropellerId = 'tri' | 'bi' | 'quad' | 'heavy' | 'ducted' | 'turbine' | 'pulsejet' | 'ramjet';

/**
 * A quad prop as changes to the body's stock prop in the physical model (ADR-0065). Multipliers are on the stock
 * prop's numbers; the diameter stays the body's own. Absent fields keep the stock value.
 */
export interface BladeChange {
  blades?: number;
  pitch?: number;
  chord?: number;
  profileDrag?: number;
  /** Duct thrust factor, and the body drag-area multiplier the ducts add. */
  duct?: number;
  dragArea?: number;
}

export interface Propeller {
  id: PropellerId;
  name: string;
  /** The real prop it's modeled on. */
  real: string;
  blurb: string;
  /** Extra weight over the stock tri-blades (kg), for a 5"'s set of four; bigger props weigh more (ADR-0065). */
  kg: number;
  /** On a quad: the prop in the physical model (ADR-0065). Absent: the stock prop (or the prop doesn't fit quads). */
  blade?: BladeChange;
  /** On the wing, which keeps its own model (ADR-0035, ADR-0038): thrust and spool multipliers (1 = stock). */
  wing: { thrust: number; spool: number };
  /** Prop guards: hits that would crash you bounce off instead (this many times harder to crash). */
  crashTolerance: number;
  /** Bodies it fits; undefined = all. */
  bodies?: readonly DroneClassId[];
  /** A jet engine for the wing (ADR-0038): how it behaves beyond the multipliers above. */
  jet?: Jet;
}

/** Jet behavior (ADR-0038). `wing.thrust` above is the jet's peak. */
export interface Jet {
  kind: 'turbine' | 'pulsejet' | 'ramjet';
  /** Lowest output while armed (0..1): turbines idle, pulse jets barely throttle. */
  idle: number;
  /** Pulse jet: thrust pulses at `hz`, varying by ±`depth`, and shake the airframe (deg/s of wobble). */
  pulse?: { hz: number; depth: number; shakeDegPerSec: number };
  /** Ramjet: only `booster` of its thrust until it rams air; lights from `lightSpeed`, full at `fullSpeed` (m/s). */
  ram?: { booster: number; lightSpeed: number; fullSpeed: number };
}

export const PROPELLERS: Record<PropellerId, Propeller> = {
  tri: {
    id: 'tri',
    name: 'Race tri-blade',
    real: '5×4.3×3',
    blurb: 'The all-rounder. Stock',
    kg: 0,
    wing: { thrust: 1, spool: 1 },
    crashTolerance: 1,
  },
  bi: {
    id: 'bi',
    name: 'Bi-blade freestyle',
    real: '5×4.8×2',
    blurb: 'Snappy and fast in a line, but lifts less',
    kg: 0,
    blade: { blades: 2, pitch: 1.1, chord: 1.1 },
    wing: { thrust: 0.85, spool: 0.8 },
    crashTolerance: 1,
  },
  quad: {
    id: 'quad',
    name: 'Quad-blade cinematic',
    real: '5×3×4',
    blurb: 'Smooth and grippy in turns, but slow at the top end',
    kg: 0.01,
    blade: { blades: 4, pitch: 0.85, chord: 0.95 },
    wing: { thrust: 1.15, spool: 1.15 },
    crashTolerance: 1,
  },
  heavy: {
    id: 'heavy',
    name: 'Heavy-lift long-pitch',
    real: '5.1×5×3',
    blurb: 'Carries the big guns; rolls like a truck and washes out on drops',
    kg: 0.03,
    blade: { pitch: 1.1, chord: 1.35, profileDrag: 1.1 },
    wing: { thrust: 1.35, spool: 1.3 },
    crashTolerance: 1,
  },
  ducted: {
    id: 'ducted',
    name: 'Ducted (prop guards)',
    real: 'cinewhoop ducts',
    blurb: "Bounce off walls instead of crashing. Less lift, more drag",
    kg: 0.12,
    blade: { duct: 0.9, dragArea: 1.5 },
    wing: { thrust: 0.8, spool: 1 },
    crashTolerance: 2.5,
    // Ducts are a quad thing: a pusher wing has nothing to guard.
    bodies: ['freestyle', 'quad3d', 'racer', 'x8'],
  },
  // Jets (ADR-0038): wing only. `wing.spool` multiplies the wing's 0.08 s motor time constant.
  turbine: {
    id: 'turbine',
    name: 'Micro turbine',
    real: 'model jet turbine',
    blurb: 'Huge top speed, but ~1 s to spool up and it never fully idles. Heavy',
    kg: 0.35,
    wing: { thrust: 1.7, spool: 15 },
    crashTolerance: 1,
    bodies: ['wing'],
    jet: { kind: 'turbine', idle: 0.08 },
  },
  pulsejet: {
    id: 'pulsejet',
    name: 'Pulse jet',
    real: 'valved pulse jet',
    blurb: "Loud, light and punchy. Can't throttle below half, and it shakes your aim",
    kg: 0.2,
    wing: { thrust: 1.35, spool: 0.5 },
    crashTolerance: 1,
    bodies: ['wing'],
    jet: { kind: 'pulsejet', idle: 0.45, pulse: { hz: 48, depth: 0.35, shakeDegPerSec: 22 } },
  },
  ramjet: {
    id: 'ramjet',
    name: 'Ramjet',
    real: 'ramjet with a booster',
    blurb: 'Weak until it rams air: dive past 22 m/s to light it, then it is the fastest thing in the sky',
    kg: 0.25,
    wing: { thrust: 2.4, spool: 3 },
    crashTolerance: 1,
    bodies: ['wing'],
    jet: { kind: 'ramjet', idle: 0, ram: { booster: 0.3, lightSpeed: 22, fullSpeed: 45 } },
  },
};

export const PROPELLER_ORDER: readonly PropellerId[] = ['tri', 'bi', 'quad', 'heavy', 'ducted', 'turbine', 'pulsejet', 'ramjet'];
export const DEFAULT_PROPELLER: PropellerId = 'tri';

export function isPropellerId(x: unknown): x is PropellerId {
  return typeof x === 'string' && x in PROPELLERS;
}

export function propellerFits(id: PropellerId, body: DroneClassId): boolean {
  const b = PROPELLERS[id].bodies;
  return !b || b.includes(body);
}

/**
 * Thrust fraction a ramjet makes at `speed` m/s (ADR-0038): its booster alone when slow, rising to full once
 * it rams enough air. 1 for every other engine.
 */
export function ramFactor(id: PropellerId, speed: number): number {
  const ram = PROPELLERS[id].jet?.ram;
  if (!ram) return 1;
  const t = Math.max(0, Math.min(1, (speed - ram.lightSpeed) / (ram.fullSpeed - ram.lightSpeed)));
  return ram.booster + (1 - ram.booster) * t * t * (3 - 2 * t);
}
