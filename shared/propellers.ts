// Propellers (ADR-0035): one set per drone, a sidegrade like everything else (ADR-0030). Each trades lift
// for response and top speed; the tri-blade is the stock prop every default build flies on.

import type { DroneClassId } from './drones.js';

export type PropellerId = 'tri' | 'bi' | 'quad' | 'heavy' | 'ducted';

export interface Propeller {
  id: PropellerId;
  name: string;
  /** The real prop it's modeled on. */
  real: string;
  blurb: string;
  /** Extra weight over the stock tri-blades (kg). */
  kg: number;
  /** Multipliers on the body's tuned values (1 = stock). */
  thrust: number;
  /** Rate-response and motor-spool time constants: below 1 is snappier. */
  response: number;
  spool: number;
  /** Air drag: below 1 is a higher top speed. */
  drag: number;
  /** Prop wash wobble when dropping through your own air. */
  wash: number;
  /** Prop guards: hits that would crash you bounce off instead (this many times harder to crash). */
  crashTolerance: number;
  /** Bodies it fits; undefined = all. */
  bodies?: readonly DroneClassId[];
}

export const PROPELLERS: Record<PropellerId, Propeller> = {
  tri: {
    id: 'tri',
    name: 'Race tri-blade',
    real: '5×4.3×3',
    blurb: 'The all-rounder. Stock',
    kg: 0,
    thrust: 1,
    response: 1,
    spool: 1,
    drag: 1,
    wash: 1,
    crashTolerance: 1,
  },
  bi: {
    id: 'bi',
    name: 'Bi-blade freestyle',
    real: '5×4.8×2',
    blurb: 'Snappy and fast in a line, but lifts less',
    kg: 0,
    thrust: 0.85,
    response: 0.75,
    spool: 0.8,
    drag: 0.9,
    wash: 1.2,
    crashTolerance: 1,
  },
  quad: {
    id: 'quad',
    name: 'Quad-blade cinematic',
    real: '5×3×4',
    blurb: 'More lift and smooth, but floaty and slow at the top end',
    kg: 0.01,
    thrust: 1.15,
    response: 1.25,
    spool: 1.15,
    drag: 1.15,
    wash: 0.6,
    crashTolerance: 1,
  },
  heavy: {
    id: 'heavy',
    name: 'Heavy-lift long-pitch',
    real: '5.1×5×3',
    blurb: 'Carries the big guns; rolls like a truck and washes out on drops',
    kg: 0.03,
    thrust: 1.35,
    response: 1.45,
    spool: 1.3,
    drag: 0.95,
    wash: 1.5,
    crashTolerance: 1,
  },
  ducted: {
    id: 'ducted',
    name: 'Ducted (prop guards)',
    real: 'cinewhoop ducts',
    blurb: "Bounce off walls instead of crashing. Less lift, more drag",
    kg: 0.12,
    thrust: 0.8,
    response: 1.05,
    spool: 1,
    drag: 1.3,
    wash: 0.8,
    crashTolerance: 2.5,
    // Ducts are a quad thing: a pusher wing has nothing to guard.
    bodies: ['freestyle', 'quad3d', 'racer', 'x8'],
  },
};

export const PROPELLER_ORDER: readonly PropellerId[] = ['tri', 'bi', 'quad', 'heavy', 'ducted'];
export const DEFAULT_PROPELLER: PropellerId = 'tri';

export function isPropellerId(x: unknown): x is PropellerId {
  return typeof x === 'string' && x in PROPELLERS;
}

export function propellerFits(id: PropellerId, body: DroneClassId): boolean {
  const b = PROPELLERS[id].bodies;
  return !b || b.includes(body);
}
