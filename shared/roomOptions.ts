// Match settings for a room (ADR-0046): chosen when you create a room, changeable by the host from the pause
// menu. Shared so the server enforces exactly what the menu shows.

import { COMBAT, pilotName } from './combat.js';
import { DRONE_ORDER, isDroneClassId, type DroneClassId } from './drones.js';
import { cleanLoadout, defaultLoadout, type Loadout } from './loadout.js';
import { isMapId, type MapId } from './maps/index.js';
import { isSpecialId, SPECIAL_ORDER, type SpecialId } from './specials.js';
import { isWeaponId, WEAPON_ORDER, WEAPONS, type WeaponId } from './weapons.js';

export interface RoomOptions {
  /** Free-for-all, or two teams (ADR-0047). */
  mode: 'ffa' | 'teams';
  map: MapId;
  /** First pilot to this many kills wins. */
  killsToWin: number;
  /** Minutes; 0 = no time limit. When time runs out, the most kills wins (a tie is a draw). */
  timeLimitMin: number;
  /** What pilots may fly and carry. Never empty for bodies and weapons. */
  bodies: DroneClassId[];
  weapons: WeaponId[];
  specials: SpecialId[];
  /** 'acro': everyone flies Acro (the X8 stays Horizon, ADR-0037). Enforced by each client (flight is client-side). */
  assist: 'any' | 'acro';
}

export const KILL_LIMITS = [5, 10, 15, 20, 30] as const;
export const TIME_LIMITS = [0, 5, 10, 15, 20] as const;

export function defaultRoomOptions(map: MapId = 'downtown'): RoomOptions {
  return {
    mode: 'ffa',
    map,
    killsToWin: COMBAT.killsToWin,
    timeLimitMin: 0,
    bodies: [...DRONE_ORDER],
    weapons: [...WEAPON_ORDER],
    specials: [...SPECIAL_ORDER],
    assist: 'any',
  };
}

/** Validate options from the wire (or storage): unknown values fall back to defaults, lists keep known ids. */
export function cleanRoomOptions(raw: unknown, fallbackMap: MapId = 'downtown'): RoomOptions {
  const d = defaultRoomOptions(fallbackMap);
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const list = <T>(x: unknown, ok: (v: unknown) => v is T, order: readonly T[]): T[] | null => {
    if (!Array.isArray(x)) return null;
    const set = new Set(x.filter(ok));
    return order.filter((v) => set.has(v));
  };
  const bodies = list(r.bodies, isDroneClassId, DRONE_ORDER);
  const weapons = list(r.weapons, isWeaponId, WEAPON_ORDER);
  const specials = list(r.specials, isSpecialId, SPECIAL_ORDER);
  return {
    mode: r.mode === 'teams' ? 'teams' : 'ffa',
    map: isMapId(r.map) ? r.map : d.map,
    killsToWin: (KILL_LIMITS as readonly unknown[]).includes(r.killsToWin) ? (r.killsToWin as number) : d.killsToWin,
    timeLimitMin: (TIME_LIMITS as readonly unknown[]).includes(r.timeLimitMin) ? (r.timeLimitMin as number) : d.timeLimitMin,
    bodies: bodies && bodies.length > 0 ? bodies : d.bodies,
    weapons: weapons && weapons.length > 0 ? weapons : d.weapons,
    specials: specials ?? d.specials,
    assist: r.assist === 'acro' ? 'acro' : 'any',
  };
}

/**
 * The nearest build the room allows (ADR-0046): a body that isn't allowed becomes the first allowed body's
 * default build; a weapon that isn't allowed becomes the first allowed gun (or the first allowed weapon,
 * or nothing); a special that isn't allowed is dropped.
 */
export function restrictLoadout(l: Loadout, o: RoomOptions): Loadout {
  const body = o.bodies.includes(l.body) ? l.body : (o.bodies[0] ?? l.body);
  const base = body === l.body ? l : defaultLoadout(body);
  const swap = o.weapons.find((w) => WEAPONS[w].kind === 'gun') ?? o.weapons[0] ?? null;
  const weapons = base.weapons.map((w) => (w === null || o.weapons.includes(w) ? w : swap));
  const special = base.special && o.specials.includes(base.special) ? base.special : null;
  return cleanLoadout({ ...base, weapons, special }, body);
}

/** Whether a loadout is allowed as is. */
export function loadoutAllowed(l: Loadout, o: RoomOptions): boolean {
  return o.bodies.includes(l.body) && l.weapons.every((w) => w === null || o.weapons.includes(w)) && (l.special === null || o.specials.includes(l.special));
}

/** Teams (ADR-0047): side 0 is Orange, side 1 is Lime; each side wears that pilot color slot. */
export const TEAM_NAMES = ['Orange', 'Lime'] as const;
export type Side = 0 | 1;

/**
 * What to call a pilot (ADR-0047): their callsign, else their color ("Cyan") in free-for-all, or their team
 * and number ("Lime 4") in Teams, where teammates share a color.
 */
export function pilotLabel(p: { id: string; team: number; name?: string; side?: Side }): string {
  if (p.name) return p.name;
  if (p.side !== undefined) return `${TEAM_NAMES[p.side]} ${p.id.replace(/\D/g, '')}`;
  return pilotName(p.team);
}
