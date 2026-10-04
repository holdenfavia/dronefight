// Drone bodies (ADR-0013, ADR-0033): what every client and the server agree on about a body. Weapons and
// specials are modules (shared/weapons.ts, shared/specials.ts); a loadout puts them together (shared/loadout.ts).
// Flight tuning lives client-side in client/src/sim/ (the server never simulates flight).

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
  /** Frame weight with battery (kg), and max static thrust (kgf). Thrust over total weight sets how it flies (ADR-0033). */
  frameKg: number;
  thrustKg: number;
  /** Weapon hardpoints, and whether it has a special slot. */
  hardpoints: number;
  /** Hit sphere radius (m): deliberately bigger than the drawn drone (ADR-0029, ADR-0036, ADR-0043). */
  hitRadius: number;
  /** Model scale when drawn: 1 = the real-size model (ADR-0043). */
  visualScale: number;
}

export const DRONE_CLASSES: Record<DroneClassId, DroneClass> = {
  freestyle: {
    id: 'freestyle',
    name: 'Freestyle 5"',
    blurb: 'All-rounder acro quad',
    flight: 'quad',
    maxHp: 100,
    frameKg: 0.65,
    // Default loadout (gun + missile pod, 1.02 kg) at the tuned thrust-to-weight of 8.
    thrustKg: 8.16,
    hardpoints: 2,
    // Drawn at real size (~0.31 m, ADR-0043), hit at 2.25 m radius (ADR-0029): bigger than the drone, on purpose.
    hitRadius: 2.25,
    visualScale: 1,
  },
  quad3d: {
    id: 'quad3d',
    name: '3D quad',
    blurb: 'Reversible thrust: hover inverted, back up',
    flight: 'quad3d',
    maxHp: 90,
    frameKg: 0.6,
    // Default loadout (shotgun + smoke, 1.05 kg) at the tuned thrust-to-weight of 7.
    thrustKg: 7.35,
    hardpoints: 2,
    hitRadius: 2.25,
    visualScale: 1,
  },
  wing: {
    id: 'wing',
    name: 'FPV wing',
    blurb: "Fast, can't hover; lift from the wing, so weight raises its stall speed",
    flight: 'wing',
    maxHp: 130,
    frameKg: 1.0,
    // Default loadout (cannon, 1.35 kg) at the tuned thrust (16 N for the 1 kg airframe = T/W 1.63).
    thrustKg: 2.2,
    hardpoints: 2,
    hitRadius: 2.7,
    // The wing model spans ~0.9 m, drawn at real size (ADR-0043).
    visualScale: 1,
  },
  racer: {
    id: 'racer',
    name: '3" racer',
    blurb: 'Tiny, light and twitchy. One hardpoint, 70 HP, tiny target',
    flight: 'quad',
    maxHp: 70,
    frameKg: 0.35,
    // Default loadout (gun, 0.47 kg) at thrust-to-weight 8.
    thrustKg: 3.76,
    hardpoints: 1,
    // A 3": the 5" model at 0.65x, ~0.2 m (ADR-0043); 1 m hit radius (ADR-0036). Hard to hit, hard to see.
    hitRadius: 1,
    visualScale: 0.65,
  },
  x8: {
    id: 'x8',
    name: 'X8 heavy lifter',
    blurb: 'Eight motors, four hardpoints, 180 HP. Huge, slow, self-levelling (horizon mode)',
    flight: 'quad',
    maxHp: 180,
    frameKg: 2.0,
    // Default loadout (2 guns + burst rifle + missile pod + shield, 3.19 kg) at thrust-to-weight 4.
    thrustKg: 12.76,
    hardpoints: 4,
    // ~0.5 m across at real size (ADR-0043); 5.4 m hit radius (ADR-0036): the price of four hardpoints.
    hitRadius: 5.4,
    visualScale: 1,
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
