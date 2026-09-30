import { getMap, pickSpawn, type MapDef, type MapId } from '../../shared/maps/index.js';
import { COMBAT } from '../../shared/combat.js';
import { DEFAULT_DRONE, droneClass, type DroneClassId } from '../../shared/drones.js';
import {
  NET,
  type DroneState,
  type MatchPhase,
  type MatchState,
  type ServerMessage,
  type Shot,
  type Vec3,
} from '../../shared/protocol.js';
import { buildColliders, raycastArena, segmentPointDistance } from '../../shared/raycast.js';

/**
 * One room's combat (ADR-0009). The server is the referee: it decides hits, damage, deaths and score.
 *
 * Hit detection uses limited lag compensation (ADR-0004): a round is tested against where the shooter
 * *saw* the target (100 ms behind the shot's server time, matching the client's interpolation buffer),
 * rewinding at most MAX_REWIND_MS.
 */

/** Position history kept per pilot for lag compensation. Bounded by time. */
const HISTORY_MS = 1500;
const MAX_REWIND_MS = NET.maxDisplayDelayMs;
/** Bullet simulation step. 350 m/s * 2 ms = 0.7 m, well under the hit sphere diameter. */
const SUBSTEP_MS = 2;
const TEAMS = 2;

interface HistoryEntry {
  st: number;
  p: Vec3;
  v: Vec3;
}

interface Pilot {
  id: string;
  team: number;
  /** Current class, and the one to switch to at next respawn (ADR-0013). */
  drone: DroneClassId;
  pendingDrone: DroneClassId | null;
  score: number;
  hp: number;
  alive: boolean;
  protectedUntil: number;
  respawnAt: number | null;
  lastDamagedBy: string | null;
  lastDamagedAt: number;
  lastCrashed: boolean;
  lastShotAt: number;
  /** Index of the last spawn used, so the next one differs (ADR-0012). */
  lastSpawn: number | null;
  history: HistoryEntry[];
}

interface Bullet {
  shooter: string;
  /** Shooter's class stats at the moment of firing. */
  speed: number;
  damage: number;
  p: Vec3;
  d: Vec3;
  /** Distance to the first wall along the path (or max range). */
  maxDist: number;
  /** Server time on the target's timeline that matches the moment of firing. */
  t0: number;
  traveled: number;
}

export type Emit = (msg: ServerMessage, opts?: { to?: string; except?: string }) => void;

export class Match {
  phase: MatchPhase = 'waiting';
  winner: string | null = null;
  private resultsUntil = 0;
  private readonly pilots = new Map<string, Pilot>();
  private bullets: Bullet[] = [];
  private now = 0;
  private protectedAnnounced = new Set<string>();
  private readonly map: MapDef;
  private readonly colliders: ReturnType<typeof buildColliders>;

  constructor(
    mapId: MapId,
    private readonly emit: Emit,
    private readonly random: () => number = Math.random,
  ) {
    this.map = getMap(mapId);
    this.colliders = buildColliders(this.map.boxes);
  }

  addPlayer(id: string, now: number, drone: DroneClassId = DEFAULT_DRONE): void {
    this.now = now;
    const used = new Set([...this.pilots.values()].map((p) => p.team));
    let team = 0;
    while (used.has(team) && team < TEAMS - 1) team++;
    this.pilots.set(id, {
      id,
      team,
      drone,
      pendingDrone: null,
      score: 0,
      hp: droneClass(drone).maxHp,
      alive: true,
      protectedUntil: 0,
      respawnAt: null,
      lastDamagedBy: null,
      lastDamagedAt: 0,
      lastCrashed: false,
      lastShotAt: -Infinity,
      lastSpawn: null,
      history: [],
    });
    if (this.pilots.size >= TEAMS) this.startMatch(now);
    else this.broadcastState();
  }

  removePlayer(id: string, now: number): void {
    this.now = now;
    this.pilots.delete(id);
    this.bullets = this.bullets.filter((b) => b.shooter !== id);
    if (this.pilots.size < TEAMS) {
      this.phase = 'waiting';
      this.winner = null;
      this.bullets = [];
      for (const p of this.pilots.values()) {
        p.score = 0;
        if (p.pendingDrone) p.drone = p.pendingDrone;
        p.pendingDrone = null;
        p.hp = droneClass(p.drone).maxHp;
        p.alive = true;
        p.respawnAt = null;
      }
    }
    this.broadcastState();
  }

  /** Class change: immediate outside a running match or while dead; otherwise at the next respawn (ADR-0013). */
  onLoadout(id: string, drone: DroneClassId, now: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot || pilot.drone === drone) {
      if (pilot) pilot.pendingDrone = null;
      return;
    }
    this.now = now;
    if (this.phase !== 'playing') {
      pilot.drone = drone;
      pilot.pendingDrone = null;
      pilot.hp = droneClass(drone).maxHp;
    } else {
      pilot.pendingDrone = drone;
    }
    this.broadcastState();
  }

  onState(id: string, s: DroneState, st: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    this.now = st;
    pilot.history.push({ st, p: s.p, v: s.v });
    while (pilot.history.length > 1 && (pilot.history[0]?.st ?? st) < st - HISTORY_MS) pilot.history.shift();

    const crashedNow = s.crashed && !pilot.lastCrashed;
    pilot.lastCrashed = s.crashed;
    if (crashedNow && this.phase === 'playing' && pilot.alive) {
      const creditValid = pilot.lastDamagedBy !== null && st - pilot.lastDamagedAt <= COMBAT.killCreditMs;
      const killer = creditValid && pilot.lastDamagedBy && this.pilots.has(pilot.lastDamagedBy) ? pilot.lastDamagedBy : null;
      this.kill(pilot, killer, 'crash', st);
    }
  }

  onShot(id: string, shot: Shot, st: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    this.now = st;
    // Everyone else sees the tracers, whatever the match phase.
    this.emit({ t: 'shot', id, s: shot }, { except: id });

    if (this.phase !== 'playing' || !pilot.alive) return;
    // Allow jitter in arrival times, but not a faster gun.
    const gun = droneClass(pilot.drone);
    if (st - pilot.lastShotAt < (1000 / gun.fireRate) * 0.5) return;
    const last = pilot.history[pilot.history.length - 1];
    if (!last) return;
    const off = Math.hypot(shot.p[0] - last.p[0], shot.p[1] - last.p[1], shot.p[2] - last.p[2]);
    if (off > COMBAT.maxMuzzleOffset) return;
    pilot.lastShotAt = st;

    if (pilot.protectedUntil > st) {
      // Firing ends your own spawn protection.
      pilot.protectedUntil = 0;
      this.broadcastState();
    }

    const [px, py, pz] = shot.p;
    const [dx, dy, dz] = shot.d;
    const maxDist = raycastArena(this.colliders, px, py, pz, dx, dy, dz, COMBAT.range);
    const seen = shot.ts - NET.interpDelayMs;
    const t0 = Math.min(st, Math.max(seen, st - MAX_REWIND_MS));
    this.bullets.push({ shooter: id, speed: gun.bulletSpeed, damage: gun.damage, p: shot.p, d: shot.d, maxDist, t0, traveled: 0 });
    this.stepBullets(st);
  }

  tick(now: number): void {
    this.now = now;
    if (this.phase === 'ended' && now >= this.resultsUntil) {
      this.startMatch(now);
      return;
    }
    for (const pilot of this.pilots.values()) {
      if (!pilot.alive && pilot.respawnAt !== null && now >= pilot.respawnAt) this.respawn(pilot, now);
      if (this.protectedAnnounced.has(pilot.id) && now >= pilot.protectedUntil) {
        this.protectedAnnounced.delete(pilot.id);
        this.broadcastState();
      }
    }
    this.stepBullets(now);
  }

  state(): MatchState {
    return {
      map: this.map.id,
      phase: this.phase,
      winner: this.winner,
      killsToWin: COMBAT.killsToWin,
      players: [...this.pilots.values()].map((p) => ({
        id: p.id,
        team: p.team,
        drone: p.drone,
        score: p.score,
        hp: p.hp,
        alive: p.alive,
        protected: p.protectedUntil > this.now,
      })),
    };
  }

  /** Advance rounds as far as target history allows (the target timeline can't run past `now`). */
  private stepBullets(now: number): void {
    if (this.bullets.length === 0) return;
    const remaining: Bullet[] = [];

    for (const b of this.bullets) {
      const stepDist = (b.speed * SUBSTEP_MS) / 1000;
      const msPerMeter = 1000 / b.speed;
      let done = false;
      while (!done && b.traveled < b.maxDist) {
        const next = Math.min(b.traveled + stepDist, b.maxDist);
        const targetTime = b.t0 + ((b.traveled + next) / 2) * msPerMeter;
        if (targetTime > now) break;

        const ax = b.p[0] + b.d[0] * b.traveled;
        const ay = b.p[1] + b.d[1] * b.traveled;
        const az = b.p[2] + b.d[2] * b.traveled;
        const bx = b.p[0] + b.d[0] * next;
        const by = b.p[1] + b.d[1] * next;
        const bz = b.p[2] + b.d[2] * next;

        for (const target of this.pilots.values()) {
          if (target.id === b.shooter || !target.alive || target.protectedUntil > now) continue;
          const pos = sampleHistory(target.history, targetTime);
          if (!pos) continue;
          if (segmentPointDistance(ax, ay, az, bx, by, bz, pos[0], pos[1], pos[2]) <= droneClass(target.drone).hitRadius) {
            this.hit(b.shooter, b.damage, target, now);
            done = true;
            break;
          }
        }
        b.traveled = next;
      }
      if (!done && b.traveled < b.maxDist && this.phase === 'playing') remaining.push(b);
    }
    this.bullets = remaining;
  }

  private hit(shooterId: string, damage: number, target: Pilot, now: number): void {
    target.hp = Math.max(0, target.hp - damage);
    target.lastDamagedBy = shooterId;
    target.lastDamagedAt = now;
    this.emit({ t: 'hit', shooter: shooterId, target: target.id, hp: target.hp });
    if (target.hp <= 0) this.kill(target, shooterId, 'shot', now);
    else this.broadcastState();
  }

  private kill(pilot: Pilot, killerId: string | null, cause: 'shot' | 'crash', now: number): void {
    pilot.alive = false;
    pilot.hp = 0;
    pilot.respawnAt = now + COMBAT.respawnMs;
    this.emit({ t: 'death', id: pilot.id, killer: killerId, cause });

    const killer = killerId ? this.pilots.get(killerId) : undefined;
    if (killer) {
      killer.score++;
      if (killer.score >= COMBAT.killsToWin) {
        this.phase = 'ended';
        this.winner = killer.id;
        this.resultsUntil = now + COMBAT.resultsMs;
        this.bullets = [];
        for (const p of this.pilots.values()) p.respawnAt = null;
      }
    }
    this.broadcastState();
  }

  private respawn(pilot: Pilot, now: number): void {
    // Anti spawn-camping (ADR-0012): random spawn away from every living opponent.
    const opponents = [...this.pilots.values()]
      .filter((p) => p !== pilot && p.alive)
      .map((p) => p.history[p.history.length - 1]?.p ?? this.map.spawns[p.lastSpawn ?? 0]?.pos)
      .filter((p): p is Vec3 => !!p);
    const spawn = pickSpawn(this.map.spawns, opponents, pilot.lastSpawn, this.random);
    pilot.lastSpawn = spawn;
    // Until the next state arrives, the pilot is at the spawn: later spawns must avoid it too.
    const at = this.map.spawns[spawn]!.pos;
    pilot.history = [{ st: now, p: [at[0], at[1], at[2]], v: [0, 0, 0] }];
    if (pilot.pendingDrone) pilot.drone = pilot.pendingDrone;
    pilot.pendingDrone = null;
    pilot.alive = true;
    pilot.hp = droneClass(pilot.drone).maxHp;
    pilot.respawnAt = null;
    pilot.protectedUntil = now + COMBAT.spawnProtectionMs;
    pilot.lastDamagedBy = null;
    this.protectedAnnounced.add(pilot.id);
    this.emit({ t: 'respawn', id: pilot.id, spawn, drone: pilot.drone });
    this.broadcastState();
  }

  private startMatch(now: number): void {
    this.phase = 'playing';
    this.winner = null;
    this.bullets = [];
    for (const pilot of this.pilots.values()) {
      pilot.score = 0;
      pilot.lastShotAt = -Infinity;
      this.respawn(pilot, now);
    }
    this.broadcastState();
  }

  private broadcastState(): void {
    this.emit({ t: 'match', m: this.state() });
  }
}

/** Target position at server time `t`: interpolated, or briefly extrapolated past the newest entry. */
export function sampleHistory(history: readonly HistoryEntry[], t: number): Vec3 | null {
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return null;
  if (t >= last.st) {
    const dt = Math.min(t - last.st, NET.maxExtrapolateMs) / 1000;
    return [last.p[0] + last.v[0] * dt, last.p[1] + last.v[1] * dt, last.p[2] + last.v[2] * dt];
  }
  if (t <= first.st) return first.p;
  for (let i = history.length - 1; i > 0; i--) {
    const a = history[i - 1];
    const b = history[i];
    if (a && b && a.st <= t && t <= b.st) {
      const k = b.st > a.st ? (t - a.st) / (b.st - a.st) : 0;
      return [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k];
    }
  }
  return last.p;
}
