// Drone classes (ADR-0013): per-class combat stats shared by client and server.
// Flight tuning lives client-side in client/src/sim/ (the server never simulates flight).

export type DroneClassId = 'freestyle' | 'quad3d' | 'wing';

export interface DroneClass {
  id: DroneClassId;
  name: string;
  /** Short description for the menu. */
  blurb: string;
  maxHp: number;
  /** Damage each of this class's rounds does. */
  damage: number;
  /** Rounds per second. */
  fireRate: number;
  /** This class's round speed (m/s). */
  bulletSpeed: number;
  /** Hit sphere radius (m): matches the drawn size (ADR-0012). */
  hitRadius: number;
  /** Model scale when drawn (the base models are real size). */
  visualScale: number;
}

export const DRONE_CLASSES: Record<DroneClassId, DroneClass> = {
  freestyle: {
    id: 'freestyle',
    name: 'Freestyle 5"',
    blurb: 'All-rounder acro quad',
    maxHp: 100,
    damage: 20,
    fireRate: 12,
    bulletSpeed: 350,
    hitRadius: 0.75,
    visualScale: 4.8,
  },
  quad3d: {
    id: 'quad3d',
    name: '3D quad',
    blurb: 'Reversible thrust: hover inverted, back up. Fragile, fast gun',
    maxHp: 90,
    damage: 18,
    fireRate: 14,
    bulletSpeed: 350,
    hitRadius: 0.75,
    visualScale: 4.8,
  },
  wing: {
    id: 'wing',
    name: 'FPV wing',
    blurb: "Fast, can't hover, hard-hitting long gun. Big target",
    maxHp: 130,
    damage: 30,
    fireRate: 8,
    bulletSpeed: 480,
    hitRadius: 0.9,
    // Base wing model spans ~0.9 m; drawn ~1.8 m.
    visualScale: 2,
  },
};

export const DRONE_ORDER: readonly DroneClassId[] = ['freestyle', 'quad3d', 'wing'];
export const DEFAULT_DRONE: DroneClassId = 'freestyle';

export function isDroneClassId(x: unknown): x is DroneClassId {
  return typeof x === 'string' && x in DRONE_CLASSES;
}

export function droneClass(id: DroneClassId): DroneClass {
  return DRONE_CLASSES[id];
}
