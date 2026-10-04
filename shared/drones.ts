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
  /** Hit sphere radius (m): matches the drawn size (ADR-0012, ADR-0029). */
  hitRadius: number;
  /** Model scale when drawn (the base models are real size). */
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
    // Drawn and hit at 3x (ADR-0029): ~4.5 m across, 2.25 m hit radius.
    hitRadius: 2.25,
    visualScale: 14.4,
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
    visualScale: 14.4,
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
    // Base wing model spans ~0.9 m; drawn ~5.4 m (ADR-0029).
    visualScale: 6,
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
    // Much smaller than the 5" (ADR-0036): ~2.5 m drawn, 1 m hit radius. Hard to hit, hard to see.
    hitRadius: 1,
    visualScale: 6.5,
  },
  x8: {
    id: 'x8',
    name: 'X8 heavy lifter',
    blurb: 'Eight motors, four hardpoints, 180 HP. Huge, slow, easy to hit',
    flight: 'quad',
    maxHp: 180,
    frameKg: 2.0,
    // Default loadout (2 guns + burst rifle + missile pod + shield, 3.19 kg) at thrust-to-weight 4.
    thrustKg: 12.76,
    hardpoints: 4,
    // Much bigger than the 5" (ADR-0036): ~13 m drawn, 5.4 m hit radius. The price of four hardpoints.
    hitRadius: 5.4,
    visualScale: 21.6,
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
