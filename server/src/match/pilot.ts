import { MISSILE } from '../../../shared/missile.js';
import { droneClass, type DroneClassId } from '../../../shared/drones.js';
import { cleanLoadout, count, defaultLoadout, missilePods, type Loadout } from '../../../shared/loadout.js';
import { WEAPONS, type WeaponId } from '../../../shared/weapons.js';
import type { Side } from '../../../shared/roomOptions.js';
import type { DroneLook } from '../../../shared/cosmetics.js';
import type { Bot } from '../../../shared/bots.js';
import type { HistoryEntry } from './history.js';

export interface Pilot {
  id: string;
  team: number;
  /** Body and full loadout (ADR-0033), and the one to switch to at next respawn. */
  loadout: Loadout;
  pendingLoadout: Loadout | null;
  score: number;
  hp: number;
  alive: boolean;
  protectedUntil: number;
  respawnAt: number | null;
  lastDamagedBy: string | null;
  lastDamagedAt: number;
  /** Everyone who damaged this pilot since their last spawn, and when (for assists, ADR-0032). */
  damagedBy: Map<string, number>;
  /** Level, for signed-in pilots (ADR-0032); set by the room. */
  level: number | null;
  /** Paint per body (ADR-0030), if the pilot sent it, and their callsign (ADR-0047). */
  looks: Record<DroneClassId, DroneLook> | null;
  name: string;
  /** Teams mode (ADR-0047): their team; and whether they're ready in the pre-match menu. */
  side: Side;
  ready: boolean;
  lastCrashed: boolean;
  /** Token bucket for fire-rate checks (ADR-0014): rounds available, and when it was last refilled. */
  ammo: Map<WeaponId, { ammo: number; at: number }>;
  /** Shield (ADR-0033): absorbs damage until `shieldUntil` or until `shieldHp` runs out. */
  shieldUntil: number;
  shieldHp: number;
  shieldReadyAt: number;
  /** Freestyle missile pod (ADR-0025) and the 3D smoke cooldown (ADR-0024). */
  missiles: number;
  missilesAt: number;
  smokeReadyAt: number;
  /** Index of the last spawn used, so the next one differs (ADR-0012). */
  lastSpawn: number | null;
  history: HistoryEntry[];
  /** Where they look (their last reported attitude), for bots to know they're being aimed at. */
  q: readonly number[];
  /** A practice bot the server flies (ADR-0067), or null for a person. */
  bot: Bot | null;
}

/** A fresh pilot, alive with full health, as they join the room. */
export function newPilot(id: string, team: number, side: Side, loadout: Loadout, now: number, bot: Bot | null): Pilot {
  return {
    id,
    team,
    loadout,
    pendingLoadout: null,
    score: 0,
    hp: droneClass(loadout.body).maxHp,
    alive: true,
    protectedUntil: 0,
    respawnAt: null,
    lastDamagedBy: null,
    lastDamagedAt: 0,
    damagedBy: new Map(),
    level: null,
    looks: null,
    // Bots are named for how they fly (ADR-0067).
    name: bot ? `${bot.kind[0]!.toUpperCase()}${bot.kind.slice(1)} bot` : '',
    side,
    ready: false,
    lastCrashed: false,
    ammo: new Map(),
    shieldUntil: 0,
    shieldHp: 0,
    shieldReadyAt: 0,
    missiles: podSize(loadout),
    missilesAt: now,
    smokeReadyAt: 0,
    lastSpawn: null,
    history: bot ? [{ st: now, p: [...bot.pos], v: [0, 0, 0] }] : [],
    q: [0, 0, 0, 1],
    bot,
  };
}

/**
 * Fire-rate check (ADR-0014, ADR-0033): a token bucket per weapon type. It refills at that weapon's rounds per
 * second (shots x pellets) times how many are mounted, and holds a small burst, so network jitter can't drop
 * legitimate fire, but nobody can shoot faster than their loadout allows over time.
 */
export function takeRound(pilot: { loadout: Loadout; ammo: Map<WeaponId, { ammo: number; at: number }> }, id: WeaponId, now: number): boolean {
  const gun = WEAPONS[id];
  const n = count(pilot.loadout, id);
  if (n === 0) return false;
  const perSecond = gun.fireRate * gun.pellets * n;
  const capacity = Math.max(gun.pellets * 2 * n, perSecond * 0.2, (gun.burst?.rounds ?? 0) * n + 1);
  // A weapon's first shot finds a full bucket.
  const b = pilot.ammo.get(id) ?? { ammo: capacity, at: now };
  b.ammo = Math.min(capacity, b.ammo + ((now - b.at) / 1000) * perSecond);
  b.at = now;
  pilot.ammo.set(id, b);
  if (b.ammo < 1) return false;
  b.ammo -= 1;
  return true;
}

/** A loadout from a full loadout or a body (its default), validated against the catalog. */
export function asLoadout(choice: Loadout | DroneClassId): Loadout {
  return typeof choice === 'string' ? defaultLoadout(choice) : cleanLoadout(choice);
}

/** Missiles a loadout's pods hold: 3 per pod (ADR-0033). */
export function podSize(l: Loadout): number {
  return MISSILE.pod * missilePods(l);
}

/** Switch to the pending loadout, if any (keeping no more missiles than the new pods hold). */
export function applyPending(p: { loadout: Loadout; pendingLoadout: Loadout | null; missiles: number; ammo: Map<WeaponId, unknown> }): void {
  if (!p.pendingLoadout) return;
  p.loadout = p.pendingLoadout;
  p.pendingLoadout = null;
  p.missiles = Math.min(p.missiles, podSize(p.loadout));
  p.ammo.clear();
}

/** Outside a running match: on the pending build, alive with full health, no respawn due. */
export function refit(p: Pilot): void {
  applyPending(p);
  p.hp = droneClass(p.loadout.body).maxHp;
  p.alive = true;
  p.respawnAt = null;
}
