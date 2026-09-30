import { getMap, pickSpawn, type MapDef, type MapId } from '../../shared/maps/index.js';
import { SMOKE } from '../../shared/abilities.js';
import { launchMissile, MISSILE, missileImpact, refillPod, splashDamage, stepMissile, type AimRay, type MissileState } from '../../shared/missile.js';
import { COMBAT } from '../../shared/combat.js';
import { DEFAULT_DRONE, droneClass, type DroneClass, type DroneClassId } from '../../shared/drones.js';
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
  /** Token bucket for fire-rate checks (ADR-0014): rounds available, and when it was last refilled. */
  ammo: number;
  ammoAt: number;
  /** Freestyle missile pod, its latest line of sight for guidance, and the 3D smoke cooldown (ADR-0016). */
  missiles: number;
  missilesAt: number;
  aim: AimRay | null;
  smokeReadyAt: number;
  /** Index of the last spawn used, so the next one differs (ADR-0012). */
  lastSpawn: number | null;
  history: HistoryEntry[];
}

/** A guided missile in flight (ADR-0016), flown in server time with the shooter's live aim. */
interface Missile {
  shooter: string;
  rid: number;
  m: MissileState;
  lastSent: number;
}

/** Physics step for missiles (s) and how often their positions go out to clients (ms). */
const MISSILE_STEP = 1 / 120;
const MISSILE_SEND_MS = 50;
/** Missile pod: accept a launch when the server's pod is within this of a full missile (clock skew). */
const POD_GRACE = 0.1;

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
  private missiles: Missile[] = [];
  private missileClock = 0;
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
      ammo: 0,
      ammoAt: now,
      missiles: MISSILE.pod,
      missilesAt: now,
      aim: null,
      smokeReadyAt: 0,
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
    this.missiles = this.missiles.filter((m) => m.shooter !== id);
    if (this.pilots.size < TEAMS) {
      this.phase = 'waiting';
      this.winner = null;
      this.bullets = [];
    this.missiles = [];
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
    pilot.aim = s.g ? { o: [s.g[0], s.g[1], s.g[2]], d: [s.g[3], s.g[4], s.g[5]] } : null;
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
    const last = pilot.history[pilot.history.length - 1];
    const muzzleOk = !!last && Math.hypot(shot.p[0] - last.p[0], shot.p[1] - last.p[1], shot.p[2] - last.p[2]) <= COMBAT.maxMuzzleOffset;

    if (shot.w === 'rocket') {
      // Missiles fly in every phase (they only do damage in a running match), and are relayed to others
      // only once accepted, so nobody sees a ghost launch (ADR-0016).
      if (!pilot.alive || !muzzleOk || !this.takeMissile(pilot, st)) return;
      this.emit({ t: 'shot', id, s: shot }, { except: id });
      this.missiles.push({ shooter: id, rid: shot.rid ?? 0, m: launchMissile(shot.p, shot.d), lastSent: 0 });
      return;
    }

    // Everyone else sees the tracers, whatever the match phase.
    this.emit({ t: 'shot', id, s: shot }, { except: id });
    if (this.phase !== 'playing' || !pilot.alive) return;
    // Allow jitter in arrival times, but not a faster gun.
    const gun = droneClass(pilot.drone);
    if (!takeRound(pilot, gun, st) || !muzzleOk) return;

    if (pilot.protectedUntil > st) {
      // Firing ends your own spawn protection.
      pilot.protectedUntil = 0;
      this.broadcastState();
    }

    const [px, py, pz] = shot.p;
    const [dx, dy, dz] = shot.d;
    const maxDist = raycastArena(this.colliders, px, py, pz, dx, dy, dz, gun.range);
    const seen = shot.ts - NET.interpDelayMs;
    const t0 = Math.min(st, Math.max(seen, st - MAX_REWIND_MS));
    this.bullets.push({
      shooter: id,
      speed: gun.bulletSpeed,
      damage: gun.damage,
      p: shot.p,
      d: shot.d,
      maxDist,
      t0,
      traveled: 0,
    });
    this.stepBullets(st);
  }

  /** 3D smoke screen (ADR-0016): cooldown checked here, then everyone else draws the cloud. */
  onAbility(id: string, p: Vec3, now: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot || pilot.drone !== 'quad3d' || !pilot.alive || now < pilot.smokeReadyAt) return;
    const last = pilot.history[pilot.history.length - 1];
    if (last && Math.hypot(p[0] - last.p[0], p[1] - last.p[1], p[2] - last.p[2]) > COMBAT.maxMuzzleOffset * 2) return;
    pilot.smokeReadyAt = now + SMOKE.cooldownMs;
    this.emit({ t: 'ability', id, kind: 'smoke', p }, { except: id });
  }

  /**
   * Freestyle missile: must fly a Freestyle and have one in the pod. One in flight at a time: the shooter's
   * client ends a missile slightly before the server does (the server started it later by the upload
   * delay), so a new launch *replaces* the old one (it detonates where it is) instead of being refused.
   */
  private takeMissile(pilot: Pilot, now: number): boolean {
    if (pilot.drone !== 'freestyle') return false;
    const pod = refillPod(pilot.missiles, pilot.missilesAt, now);
    pilot.missiles = pod.ammo;
    pilot.missilesAt = pod.at;
    // A little grace: the client's pod mirror and ours tick on slightly different clocks.
    if (pilot.missiles < 1 - POD_GRACE) return false;
    pilot.missiles = Math.max(0, pilot.missiles - 1);
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const old = this.missiles[i]!;
      if (old.shooter !== pilot.id) continue;
      this.missiles.splice(i, 1);
      this.explode(old.shooter, old.rid, [old.m.p[0], old.m.p[1], old.m.p[2]], now);
    }
    return true;
  }

  /**
   * Fly every missile forward to `now` (ADR-0016). Guidance uses the shooter's latest line of sight;
   * if they're dead or switched class, the wire is cut. Explodes on proximity, geometry, or lifetime.
   */
  private stepMissiles(now: number): void {
    if (this.missiles.length === 0) {
      this.missileClock = now;
      return;
    }
    let remaining = Math.min(0.25, (now - this.missileClock) / 1000);
    this.missileClock = now;
    while (remaining > 1e-6 && this.missiles.length > 0) {
      const dt = Math.min(MISSILE_STEP, remaining);
      remaining -= dt;
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const x = this.missiles[i]!;
        const shooter = this.pilots.get(x.shooter);
        const aim = shooter && shooter.alive && shooter.drone === 'freestyle' ? shooter.aim : null;
        const a: Vec3 = [x.m.p[0], x.m.p[1], x.m.p[2]];
        const alive = stepMissile(x.m, aim, dt);
        const b = x.m.p;
        // Enemies only: never the shooter, never the dead or spawn-protected.
        const targets: Vec3[] = [];
        for (const target of this.pilots.values()) {
          if (target.id === x.shooter || !target.alive || target.protectedUntil > now) continue;
          const pos = sampleHistory(target.history, now);
          if (pos) targets.push(pos);
        }
        const impact = missileImpact(a, b, this.colliders, targets);
        let at: Vec3 | null = null;
        if (impact !== null) at = [a[0] + (b[0] - a[0]) * impact, a[1] + (b[1] - a[1]) * impact, a[2] + (b[2] - a[2]) * impact];
        else if (!alive) at = [b[0], b[1], b[2]];
        if (at) {
          this.missiles.splice(i, 1);
          this.explode(x.shooter, x.rid, at, now);
        }
      }
    }
    for (const x of this.missiles) {
      if (now - x.lastSent < MISSILE_SEND_MS) continue;
      x.lastSent = now;
      const r = (n: number) => Math.round(n * 100) / 100;
      this.emit({ t: 'missile', id: x.shooter, rid: x.rid, p: x.m.p.map(r) as Vec3, v: x.m.v.map(r) as Vec3 });
    }
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
    this.stepMissiles(now);
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
          const miss = segmentPointDistance(ax, ay, az, bx, by, bz, pos[0], pos[1], pos[2]);
          if (miss <= droneClass(target.drone).hitRadius) {
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

  /** Missile detonation (ADR-0016): splash everyone nearby (not the shooter), and tell every client where. */
  private explode(shooter: string, rid: number, at: Vec3, now: number): void {
    this.emit({ t: 'boom', id: shooter, rid, p: at });
    // Outside a running match missiles still fly and explode, but do no damage.
    if (this.phase !== 'playing') return;
    for (const target of this.pilots.values()) {
      if (target.id === shooter || !target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = splashDamage(Math.hypot(pos[0] - at[0], pos[1] - at[1], pos[2] - at[2]));
      if (damage > 0) this.hit(shooter, damage, target, now);
    }
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
    this.missiles = [];
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
    this.missiles = [];
    for (const pilot of this.pilots.values()) {
      pilot.score = 0;
      pilot.ammo = 0;
      pilot.ammoAt = now;
      this.respawn(pilot, now);
    }
    this.broadcastState();
  }

  private broadcastState(): void {
    this.emit({ t: 'match', m: this.state() });
  }
}

/**
 * Fire-rate check (ADR-0014): a token bucket per pilot. It refills at the class's rounds per second
 * (shots x pellets) and holds a small burst, so network jitter can't drop legitimate fire, but
 * nobody can shoot faster than their class allows over time.
 */
export function takeRound(pilot: { ammo: number; ammoAt: number }, gun: DroneClass, now: number): boolean {
  const perSecond = gun.fireRate * gun.pellets;
  const burst = Math.max(gun.pellets * 2, perSecond * 0.2);
  pilot.ammo = Math.min(burst, pilot.ammo + ((now - pilot.ammoAt) / 1000) * perSecond);
  pilot.ammoAt = now;
  if (pilot.ammo < 1) return false;
  pilot.ammo -= 1;
  return true;
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
