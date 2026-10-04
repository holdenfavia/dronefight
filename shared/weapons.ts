// Weapon modules (ADR-0033): each goes on a hardpoint, has a weight, and its own ballistics. Shared so the
// server judges every round with the stats of the weapon that fired it.

export type WeaponId = 'gun' | 'shotgun' | 'cannon' | 'missile' | 'rail' | 'burst' | 'grenade';

/** How a weapon sounds (ADR-0010, ADR-0014). */
export type GunSound = 'standard' | 'vulcan' | 'shotgun' | 'rail';

export interface Weapon {
  id: WeaponId;
  name: string;
  blurb: string;
  /** Weight on the hardpoint (kg). */
  kg: number;
  /** Guns fire rounds; the missile pod launches the flown missile (ADR-0025); the launcher lobs grenades (ADR-0034). */
  kind: 'gun' | 'missile' | 'grenade';
  /** Damage per round or pellet. */
  damage: number;
  /** Shots per second, sustained (a burst rifle's 3-round bursts average out to this). */
  fireRate: number;
  /** Rounds per shot: 1, or several pellets for a shotgun. */
  pellets: number;
  /** Pellet cone half-angle (deg). */
  spreadDeg: number;
  /** Round speed (m/s) and reach (m). */
  speed: number;
  range: number;
  sound: GunSound;
  /** Burst fire: rounds per burst and their spacing (ms); the gap until the next burst comes from fireRate. */
  burst?: { rounds: number; spacingMs: number };
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  gun: {
    id: 'gun',
    name: 'Gun',
    blurb: 'Fast, accurate. 3 hits kill a Freestyle (ADR-0028)',
    kg: 0.12,
    kind: 'gun',
    damage: 34,
    fireRate: 12,
    pellets: 1,
    spreadDeg: 0,
    speed: 350,
    range: 300,
    sound: 'standard',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Choked shotgun',
    blurb: '8 pellets, twice a second. A full close blast one-shots a quad',
    kg: 0.3,
    kind: 'gun',
    damage: 14,
    fireRate: 2,
    pellets: 8,
    spreadDeg: 1.5,
    speed: 320,
    range: 150,
    sound: 'shotgun',
  },
  cannon: {
    id: 'cannon',
    name: 'Rotary cannon',
    blurb: '50 light rounds a second. BRRRT',
    kg: 0.35,
    kind: 'gun',
    damage: 10,
    fireRate: 50,
    pellets: 1,
    spreadDeg: 0,
    speed: 480,
    range: 300,
    sound: 'vulcan',
  },
  missile: {
    id: 'missile',
    name: 'Missile pod',
    blurb: 'Three missiles you fly yourself. One-shot within 5 m',
    kg: 0.25,
    kind: 'missile',
    damage: 0,
    fireRate: 0,
    pellets: 0,
    spreadDeg: 0,
    speed: 0,
    range: 0,
    sound: 'standard',
  },
  rail: {
    id: 'rail',
    name: 'Rail gun',
    blurb: '75 damage, near-instant, once a second. Very heavy',
    kg: 2.8,
    kind: 'gun',
    damage: 75,
    fireRate: 1,
    pellets: 1,
    spreadDeg: 0,
    speed: 1500,
    range: 500,
    sound: 'rail',
  },
  burst: {
    id: 'burst',
    name: 'Burst rifle',
    blurb: '3-round bursts of 30. Land the burst',
    kg: 0.3,
    kind: 'gun',
    damage: 30,
    // 3 rounds every 0.6 s.
    fireRate: 5,
    pellets: 1,
    spreadDeg: 0,
    speed: 420,
    range: 300,
    sound: 'standard',
    burst: { rounds: 3, spacingMs: 65 },
  },
  grenade: {
    id: 'grenade',
    name: 'Grenade launcher',
    blurb: 'Lob a bouncing grenade; press Fire again to set it off. Huge blast',
    kg: 0.8,
    kind: 'grenade',
    // The blast is in shared/grenade.ts; this is the launch cadence.
    damage: 0,
    fireRate: 1,
    pellets: 1,
    spreadDeg: 0,
    speed: 42,
    range: 0,
    sound: 'standard',
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = ['gun', 'burst', 'shotgun', 'cannon', 'rail', 'grenade', 'missile'];

export function isWeaponId(x: unknown): x is WeaponId {
  return typeof x === 'string' && x in WEAPONS;
}
