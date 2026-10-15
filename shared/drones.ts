// Drone bodies (ADR-0013, ADR-0033): what every client and the server agree on about a body. Weapons and
// specials are modules (shared/weapons.ts, shared/specials.ts); a loadout puts them together (shared/loadout.ts).
// Flight (parts, thrust, tuning) lives client-side in client/src/config.ts and client/src/sim/ (the server never
// simulates flight).

export type DroneClassId = 'freestyle' | 'quad3d' | 'wing' | 'racer' | 'x8';

/** Which flight model a body uses. */
export type FlightKind = 'quad' | 'quad3d' | 'wing';

export interface DroneClass {
  id: DroneClassId;
  name: string;
  /** Short description for the menu. */
  blurb: string;
  flight: FlightKind;
  maxHp: number;
  /**
   * The bare drone's weight, ready to fly with its battery (kg): the physical model's parts (ADR-0066, guarded by
   * physicalQuad.test.ts). Weapons, specials and props add their own weight on top.
   */
  frameKg: number;
  /** Weapon hardpoints, and whether it has a special slot. */
  hardpoints: number;
  /** Hit sphere radius (m): deliberately bigger than the drawn drone (ADR-0029, ADR-0036, ADR-0043). */
  hitRadius: number;
  /** Model scale when drawn: 1 = the real-size model (ADR-0043). */
  visualScale: number;
  /** Which model draws it, and where weapons hang under it (model metres: row width, below the frame, fore). */
  model: 'quad' | 'x8' | 'wing';
  mount: { width: number; below: number; fore: number };
  /** A fixed FPV camera uptilt (deg) instead of the pilot's: wings fly nose-forward. */
  cameraUptiltDeg?: number;
}

const QUAD_MOUNT = { width: 0.08, below: -0.012, fore: -0.03 } as const;

export const DRONE_CLASSES: Record<DroneClassId, DroneClass> = {
  freestyle: {
    id: 'freestyle',
    name: 'Freestyle 5"',
    blurb: 'All-rounder acro quad',
    flight: 'quad',
    maxHp: 100,
    frameKg: 0.65,
    hardpoints: 2,
    // Drawn at real size (~0.31 m, ADR-0043), hit at 2.25 m radius (ADR-0029): bigger than the drone, on purpose.
    hitRadius: 2.25,
    visualScale: 1,
    model: 'quad',
    mount: QUAD_MOUNT,
  },
  quad3d: {
    id: 'quad3d',
    name: '3D quad',
    blurb: 'Reversible thrust: hover inverted, back up',
    flight: 'quad3d',
    maxHp: 90,
    frameKg: 0.6,
    hardpoints: 2,
    hitRadius: 2.25,
    visualScale: 1,
    model: 'quad',
    mount: QUAD_MOUNT,
  },
  wing: {
    id: 'wing',
    name: 'FPV wing',
    blurb: "Fast, can't hover; lift from the wing, so weight raises its stall speed",
    flight: 'wing',
    maxHp: 130,
    frameKg: 1.0,
    hardpoints: 2,
    hitRadius: 2.7,
    // The wing model spans ~0.9 m, drawn at real size (ADR-0043).
    visualScale: 1,
    model: 'wing',
    // Under the wing either side of the pod.
    mount: { width: 0.5, below: -0.02, fore: -0.02 },
    cameraUptiltDeg: 6,
  },
  racer: {
    id: 'racer',
    name: '3" racer',
    blurb: 'Tiny, light and twitchy. One hardpoint, 70 HP, tiny target',
    flight: 'quad',
    maxHp: 70,
    frameKg: 0.35,
    hardpoints: 1,
    // A 3": the 5" model at 0.65x, ~0.2 m (ADR-0043); 1 m hit radius (ADR-0036). Hard to hit, hard to see.
    hitRadius: 1,
    visualScale: 0.65,
    model: 'quad',
    mount: QUAD_MOUNT,
  },
  x8: {
    id: 'x8',
    name: 'X8 heavy lifter',
    blurb: 'Eight motors, four hardpoints, 180 HP. Huge, slow, self-levelling (horizon mode)',
    flight: 'quad',
    maxHp: 180,
    frameKg: 2.0,
    hardpoints: 4,
    // ~0.5 m across at real size (ADR-0043); 5.4 m hit radius (ADR-0036): the price of four hardpoints.
    hitRadius: 5.4,
    visualScale: 1,
    model: 'x8',
    mount: { width: 0.16, below: -0.025, fore: -0.03 },
  },
};

export const DRONE_ORDER: readonly DroneClassId[] = ['freestyle', 'quad3d', 'wing', 'racer', 'x8'];
export const DEFAULT_DRONE: DroneClassId = 'freestyle';

export function isDroneClassId(x: unknown): x is DroneClassId {
  return typeof x === 'string' && x in DRONE_CLASSES;
}

export function droneClass(id: DroneClassId): DroneClass {
  return DRONE_CLASSES[id];
}

/** Fixed-wing bodies: their own flight model, no hover (ADR-0013). */
export function isWing(id: DroneClassId): boolean {
  return DRONE_CLASSES[id].flight === 'wing';
}
