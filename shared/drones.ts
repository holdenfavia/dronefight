// Drone classes (ADR-0013): per-class combat stats shared by client and server.
// Flight tuning lives client-side in client/src/sim/ (the server never simulates flight).

export type DroneClassId = 'freestyle' | 'quad3d' | 'wing';

/** How a class's gun sounds (ADR-0014). */
export type GunSound = 'standard' | 'vulcan' | 'shotgun';

export interface DroneClass {
  id: DroneClassId;
  name: string;
  /** Short description for the menu. */
  blurb: string;
  maxHp: number;
  /** Damage each round (or pellet) does. */
  damage: number;
  /** Shots per second. A shotgun shot is several pellets. */
  fireRate: number;
  /** Rounds per shot: 1 for guns, several for a shotgun (ADR-0014). */
  pellets: number;
  /** Pellet spread: half-angle of the cone (degrees). 0 for guns. */
  spreadDeg: number;
  /** This class's round speed (m/s). */
  bulletSpeed: number;
  /** How far rounds travel (m). */
  range: number;
  gunSound: GunSound;
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
    pellets: 1,
    spreadDeg: 0,
    bulletSpeed: 350,
    range: 300,
    gunSound: 'standard',
    hitRadius: 0.75,
    visualScale: 4.8,
  },
  quad3d: {
    id: 'quad3d',
    name: '3D quad',
    blurb: 'Reversible thrust, hover inverted. Choked double-barrel shotgun',
    maxHp: 90,
    // Choked shotgun (ADR-0014): 8 pellets in a tight cone, twice a second.
    damage: 8,
    fireRate: 2,
    pellets: 8,
    spreadDeg: 1.5,
    bulletSpeed: 320,
    range: 150,
    gunSound: 'shotgun',
    hitRadius: 0.75,
    visualScale: 4.8,
  },
  wing: {
    id: 'wing',
    name: 'FPV wing',
    blurb: "Fast, can't hover. Rotary cannon, Cobra on Special (E)",
    maxHp: 130,
    // Rotary cannon (ADR-0014): very fast, light rounds.
    damage: 5,
    fireRate: 50,
    pellets: 1,
    spreadDeg: 0,
    bulletSpeed: 480,
    range: 300,
    gunSound: 'vulcan',
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
