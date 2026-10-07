import { getMap, pickSpawn, type MapDef, type MapId } from '../../shared/maps/index.js';
import { SMOKE } from '../../shared/abilities.js';
import { MISSILE, MISSILE_MAX_AGE, missileImpact, refillPod, splashDamage } from '../../shared/missile.js';
import { COMBAT } from '../../shared/combat.js';
import { DEFAULT_DRONE, droneClass, type DroneClassId } from '../../shared/drones.js';
import { cleanLoadout, count, defaultLoadout, launchers, missilePods, type Loadout } from '../../shared/loadout.js';
import { SHIELD } from '../../shared/specials.js';
import { WEAPONS, type WeaponId } from '../../shared/weapons.js';
import { cleanRoomOptions, restrictLoadout, type RoomOptions, type Side } from '../../shared/roomOptions.js';
import type { DroneLook } from '../../shared/cosmetics.js';
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
import { blastDamage, PropField, type Blast } from '../../shared/props.js';
import { grenadeDamage, launchGrenade, stepGrenade, type GrenadeState } from '../../shared/grenade.js';
import type { ProgressEvent } from './progression.js';

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
/** A match runs with at least this many pilots (ADR-0026). */
const MIN_PILOTS = 2;
/** Spawn offsets: a pilot already within `SPAWN_TAKEN_M` of a spawn means the next goes beside it, on rings this far apart. */
const SPAWN_TAKEN_M = 3;
const SPAWN_RING_M = 4;

interface HistoryEntry {
  st: number;
  p: Vec3;
  v: Vec3;
}

interface Pilot {
  id: string;
  team: number;
  /** Current class, and the one to switch to at next respawn (ADR-0013). */
  /** Body and full loadout (ADR-0033), and the one to switch to at next respawn. */
  drone: DroneClassId;
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
}

/**
 * A piloted missile in flight (ADR-0025). The shooter's client flies it and reports its pose with each
 * state; the server checks every reported move (speed cap, lifetime) and decides impacts.
 */
interface Missile {
  shooter: string;
  rid: number;
  p: Vec3;
  v: Vec3;
  /** Server time it launched, and of its last accepted position. */
  born: number;
  updatedAt: number;
  lastSent: number;
}

/** How often missile positions go out to the other clients (ms). */
const MISSILE_SEND_MS = 50;
/** Slack on the speed check: jitter in update timing, plus a few metres (ms are server receive times). */
const MISSILE_SPEED_SLACK = 1.3;
const MISSILE_MOVE_SLACK_M = 3;
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
  /** The prop this round hits at maxDist, if it gets that far (ADR-0023). */
  prop: number | null;
}

export type Emit = (msg: ServerMessage, opts?: { to?: string; except?: string }) => void;

export class Match {
  phase: MatchPhase = 'waiting';
  winner: string | null = null;
  private resultsUntil = 0;
  private readonly pilots = new Map<string, Pilot>();
  private bullets: Bullet[] = [];
  private missiles: Missile[] = [];
  /** Grenades in the air or on the ground (ADR-0034), simulated here, and when they were last stepped. */
  private grenades: { shooter: string; rid: number; g: GrenadeState; lastSent: number }[] = [];
  private grenadeClock = 0;
  private now = 0;
  private protectedAnnounced = new Set<string>();
  private map: MapDef;
  private colliders: ReturnType<typeof buildColliders>;
  /** Cars, barrels, tanks: shot, blown up and respawned here (ADR-0023). */
  private props: PropField;
  /** Match settings (ADR-0046), and the pilot who may change them. */
  private options: RoomOptions;
  private host: string | null = null;
  /** Server time the running match ends by its time limit (null: no limit). */
  private endsAt: number | null = null;
  /** Teams mode: the team that won the last match (ADR-0047). */
  private winnerSide: Side | null = null;

  constructor(
    mapOrOptions: MapId | RoomOptions,
    private readonly emit: Emit,
    private readonly random: () => number = Math.random,
    /** Progress events for XP (ADR-0032), only while a match is running. */
    private readonly onProgress: (pilotId: string, event: ProgressEvent) => void = () => {},
    /**
     * Pre-match menu (ADR-0047): matches start when the host says so, and return to the menu after the
     * results. Off (start at two pilots, restart after results) for a bare match, as in the tests.
     */
    private readonly lobby = false,
  ) {
    this.options = typeof mapOrOptions === 'string' ? cleanRoomOptions(null, mapOrOptions) : mapOrOptions;
    this.map = getMap(this.options.map);
    this.colliders = buildColliders(this.map.boxes, this.map.holes);
    this.props = new PropField(this.map);
  }

  /** The room's map (it can change with the settings). */
  get mapId(): MapId {
    return this.map.id;
  }

  /**
   * The host changes the match settings (ADR-0046). Builds are brought within the new rules, a new map loads,
   * and a running match restarts so everyone plays by the same rules from zero.
   */
  setOptions(id: string, raw: RoomOptions, now: number): void {
    if (id !== this.host) return;
    this.now = now;
    const options = cleanRoomOptions(raw, this.options.map);
    if (options.map !== this.map.id) {
      this.map = getMap(options.map);
      this.colliders = buildColliders(this.map.boxes, this.map.holes);
      this.props = new PropField(this.map);
      this.bullets = [];
      this.missiles = [];
      this.grenades = [];
    }
    const modeChanged = options.mode !== this.options.mode;
    this.options = options;
    if (modeChanged) this.reassignColors();
    for (const p of this.pilots.values()) {
      p.pendingLoadout = restrictLoadout(p.pendingLoadout ?? p.loadout, options);
      p.lastSpawn = null;
    }
    // A running match restarts under the new rules; in the pre-match menu they just apply.
    if (this.pilots.size >= MIN_PILOTS && (!this.lobby || this.phase === 'playing')) this.startMatch(now);
    else {
      for (const p of this.pilots.values()) {
        applyPending(p);
        p.hp = droneClass(p.drone).maxHp;
      }
      this.broadcastState();
    }
  }

  addPlayer(id: string, now: number, choice: Loadout | DroneClassId = DEFAULT_DRONE): void {
    const loadout = restrictLoadout(asLoadout(choice), this.options);
    // The first pilot in (the room's creator) sets the rules (ADR-0046).
    if (this.host === null || !this.pilots.has(this.host)) this.host = id;
    this.now = now;
    // Each pilot gets the lowest free color slot (ADR-0026); in Teams, the smaller team and its color (ADR-0047).
    const side = this.smallerSide();
    const team = this.options.mode === 'teams' ? side : this.freeSlot();
    this.pilots.set(id, {
      id,
      team,
      drone: loadout.body,
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
      name: '',
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
      history: [],
    });
    const pilot = this.pilots.get(id)!;
    if (!this.lobby && this.pilots.size >= MIN_PILOTS && this.phase === 'waiting') this.startMatch(now);
    else if (this.phase !== 'waiting') this.respawn(pilot, now); // joining a running match
    else this.broadcastState();
  }

  removePlayer(id: string, now: number): void {
    this.now = now;
    this.pilots.delete(id);
    // The host left: the next pilot in charge of the settings.
    if (this.host === id) this.host = this.pilots.keys().next().value ?? null;
    this.bullets = this.bullets.filter((b) => b.shooter !== id);
    this.missiles = this.missiles.filter((m) => m.shooter !== id);
    this.grenades = this.grenades.filter((g) => g.shooter !== id);
    if (this.pilots.size < MIN_PILOTS) {
      this.phase = 'waiting';
      this.winner = null;
      this.bullets = [];
      this.missiles = [];
      this.grenades = [];
      for (const p of this.pilots.values()) {
        p.score = 0;
        applyPending(p);
        p.hp = droneClass(p.drone).maxHp;
        p.alive = true;
        p.respawnAt = null;
      }
    }
    this.broadcastState();
  }

  /** A pilot's paint (ADR-0030), shown to everyone on the body they fly, and their callsign (ADR-0047). */
  setLooks(id: string, looks: Record<DroneClassId, DroneLook>, name = ''): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    pilot.looks = looks;
    pilot.name = name;
    this.broadcastState();
  }

  // --- Teams and the pre-match menu (ADR-0047)

  private get teams(): boolean {
    return this.options.mode === 'teams';
  }

  /** The lowest color slot nobody has (free-for-all, ADR-0026). */
  private freeSlot(): number {
    const used = new Set([...this.pilots.values()].map((p) => p.team));
    let team = 0;
    while (used.has(team)) team++;
    return team;
  }

  private smallerSide(): Side {
    let a = 0;
    let b = 0;
    for (const p of this.pilots.values()) p.side === 0 ? a++ : b++;
    return b < a ? 1 : 0;
  }

  /** Two pilots on the same team (never friendly fire). */
  private teammates(a: Pilot, b: Pilot): boolean {
    return this.teams && a !== b && a.side === b.side;
  }

  /** Switch team in the pre-match menu (not mid-match). */
  onSide(id: string, side: Side): void {
    const pilot = this.pilots.get(id);
    if (!pilot || !this.teams || this.phase === 'playing' || pilot.side === side) return;
    pilot.side = side;
    pilot.team = side;
    pilot.ready = false;
    this.broadcastState();
  }

  onReady(id: string, ready: boolean): void {
    const pilot = this.pilots.get(id);
    if (!pilot || pilot.ready === ready) return;
    pilot.ready = ready;
    this.broadcastState();
  }

  /** Whether the host can start now: two pilots, and in Teams someone on each team. */
  get canStart(): boolean {
    if (this.phase === 'playing' || this.pilots.size < MIN_PILOTS) return false;
    if (!this.teams) return true;
    const sides = new Set([...this.pilots.values()].map((p) => p.side));
    return sides.size === 2;
  }

  /** The host starts the match from the pre-match menu. */
  onStart(id: string, now: number): void {
    if (id !== this.host || !this.canStart) return;
    this.startMatch(now);
  }

  /** Color slots and teams after the mode changes: Teams splits everyone evenly; free-for-all gives each their own color. */
  private reassignColors(): void {
    let i = 0;
    for (const p of this.pilots.values()) {
      if (this.teams) {
        p.side = (i++ % 2) as Side;
        p.team = p.side;
      } else p.team = -1;
    }
    if (!this.teams) for (const p of this.pilots.values()) p.team = this.freeSlot();
  }

  /** A team's kills (Teams mode). */
  private sideScore(side: Side): number {
    let n = 0;
    for (const p of this.pilots.values()) if (p.side === side) n += p.score;
    return n;
  }

  /** A signed-in pilot's level (ADR-0032), shown to everyone in the match state. */
  setLevel(id: string, level: number | null): void {
    const pilot = this.pilots.get(id);
    if (!pilot || pilot.level === level) return;
    pilot.level = level;
    this.broadcastState();
  }

  /** Loadout change (ADR-0033): immediate outside a running match; otherwise at the next respawn (ADR-0013). */
  onLoadout(id: string, choice: Loadout | DroneClassId, now: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    // Only what the room allows (ADR-0046).
    const loadout = restrictLoadout(asLoadout(choice), this.options);
    if (sameLoadout(pilot.loadout, loadout)) {
      pilot.pendingLoadout = null;
      return;
    }
    this.now = now;
    pilot.pendingLoadout = loadout;
    if (this.phase !== 'playing') {
      applyPending(pilot);
      pilot.hp = droneClass(pilot.drone).maxHp;
    }
    this.broadcastState();
  }

  onState(id: string, s: DroneState, st: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    this.now = st;
    pilot.history.push({ st, p: s.p, v: s.v });
    while (pilot.history.length > 1 && (pilot.history[0]?.st ?? st) < st - HISTORY_MS) pilot.history.shift();
    if (s.k) this.moveMissile(id, s.k, st);

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

    // Only weapons actually mounted can fire (ADR-0033).
    if (count(pilot.loadout, shot.w) === 0) return;
    if (shot.w === 'grenade') {
      // Launched in every phase (props can be blown up any time); one out per launcher you carry.
      if (!pilot.alive || !muzzleOk || !takeRound(pilot, 'grenade', st)) return;
      if (this.grenades.filter((g) => g.shooter === id).length >= launchers(pilot.loadout)) return;
      this.emit({ t: 'shot', id, s: shot }, { except: id });
      const carrier = last?.v ?? [0, 0, 0];
      if (this.grenades.length === 0) this.grenadeClock = st;
      this.grenades.push({ shooter: id, rid: shot.rid ?? 0, g: launchGrenade(shot.p, shot.d, [carrier[0], carrier[1], carrier[2]]), lastSent: 0 });
      return;
    }
    if (shot.w === 'missile') {
      // Missiles fly in every phase (they only do damage in a running match), and are relayed to others
      // only once accepted, so nobody sees a ghost launch (ADR-0016).
      if (!pilot.alive || !muzzleOk || !this.takeMissile(pilot, st)) return;
      this.emit({ t: 'shot', id, s: shot }, { except: id });
      const v: Vec3 = [shot.d[0] * MISSILE.launchSpeed, shot.d[1] * MISSILE.launchSpeed, shot.d[2] * MISSILE.launchSpeed];
      this.missiles.push({ shooter: id, rid: shot.rid ?? 0, p: [shot.p[0], shot.p[1], shot.p[2]], v, born: st, updatedAt: st, lastSent: 0 });
      return;
    }

    // Everyone else sees the tracers, whatever the match phase.
    this.emit({ t: 'shot', id, s: shot }, { except: id });
    // Rounds fly in every phase (props can be shot any time, ADR-0023); they hit pilots only in a match.
    if (!pilot.alive) return;
    // Allow jitter in arrival times, but not a faster gun.
    const gun = WEAPONS[shot.w];
    if (!takeRound(pilot, shot.w, st) || !muzzleOk) return;

    if (this.phase === 'playing' && pilot.protectedUntil > st) {
      // Firing ends your own spawn protection.
      pilot.protectedUntil = 0;
      this.broadcastState();
    }

    const [px, py, pz] = shot.p;
    const [dx, dy, dz] = shot.d;
    const wall = raycastArena(this.colliders, px, py, pz, dx, dy, dz, gun.range);
    const seen = shot.ts - NET.interpDelayMs;
    const t0 = Math.min(st, Math.max(seen, st - MAX_REWIND_MS));
    // Props move on the shared clock, which the shooter sees live: test them at the claimed fire time.
    const fired = Math.min(st, Math.max(shot.ts, st - MAX_REWIND_MS));
    const prop = this.props.bulletHit(shot.p, shot.d, wall, fired, gun.speed);
    this.bullets.push({
      shooter: id,
      speed: gun.speed,
      damage: gun.damage,
      p: shot.p,
      d: shot.d,
      maxDist: prop ? prop.dist : wall,
      t0,
      traveled: 0,
      prop: prop ? prop.i : null,
    });
    this.stepBullets(st);
  }

  /** Specials the server referees (ADR-0033): smoke (ADR-0024) and shield. Needs that module and its cooldown. */
  onAbility(id: string, kind: 'smoke' | 'shield', p: Vec3, now: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot || !pilot.alive || pilot.loadout.special !== kind) return;
    const last = pilot.history[pilot.history.length - 1];
    if (last && Math.hypot(p[0] - last.p[0], p[1] - last.p[1], p[2] - last.p[2]) > COMBAT.maxMuzzleOffset * 2) return;
    if (kind === 'smoke') {
      if (now < pilot.smokeReadyAt) return;
      pilot.smokeReadyAt = now + SMOKE.cooldownMs;
    } else {
      if (now < pilot.shieldReadyAt) return;
      pilot.shieldReadyAt = now + SHIELD.cooldownMs;
      pilot.shieldUntil = now + SHIELD.durationMs;
      pilot.shieldHp = SHIELD.absorb;
      this.broadcastState();
    }
    this.emit({ t: 'ability', id, kind, p }, { except: id });
  }

  /**
   * Freestyle missile: must fly a Freestyle and have one in the pod. One in flight at a time: if the
   * server still has the old one (its end hasn't arrived yet), a new launch *replaces* it (it detonates
   * where it is) instead of being refused.
   */
  private takeMissile(pilot: Pilot, now: number): boolean {
    if (missilePods(pilot.loadout) === 0) return false;
    const pod = refillPod(pilot.missiles, pilot.missilesAt, now, podSize(pilot.loadout));
    pilot.missiles = pod.ammo;
    pilot.missilesAt = pod.at;
    // A little grace: the client's pod mirror and ours tick on slightly different clocks.
    if (pilot.missiles < 1 - POD_GRACE) return false;
    pilot.missiles = Math.max(0, pilot.missiles - 1);
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const old = this.missiles[i]!;
      if (old.shooter !== pilot.id) continue;
      this.missiles.splice(i, 1);
      this.explode(old.shooter, old.rid, [old.p[0], old.p[1], old.p[2]], now);
    }
    return true;
  }

  /**
   * The shooter reports where their missile is now (ADR-0025). Accept the move if it's physically
   * possible (clamp it if not), then check the path since the last report for geometry, pilots and props.
   */
  private moveMissile(shooter: string, k: readonly number[], now: number): void {
    const x = this.missiles.find((m) => m.shooter === shooter && m.rid === k[0]);
    if (!x) return;
    const a = x.p;
    let b: Vec3 = [k[1]!, k[2]!, k[3]!];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const maxMove = (MISSILE.maxSpeed * MISSILE_SPEED_SLACK * Math.max(0, now - x.updatedAt)) / 1000 + MISSILE_MOVE_SLACK_M;
    if (dist > maxMove) {
      const f = maxMove / dist;
      b = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    const sp = Math.hypot(k[4]!, k[5]!, k[6]!);
    const vf = sp > MISSILE.maxSpeed ? MISSILE.maxSpeed / sp : 1;
    const v: Vec3 = [k[4]! * vf, k[5]! * vf, k[6]! * vf];
    const impact = this.missileImpactAt(shooter, a, b, now);
    if (impact) {
      this.removeMissile(x);
      this.explode(x.shooter, x.rid, impact, now);
      return;
    }
    x.p = b;
    x.v = v;
    x.updatedAt = now;
  }

  /** Where along a -> b the missile hits geometry or trips its fuse (pilots as the shooter saw them, props), or null. */
  private missileImpactAt(shooter: string, a: Vec3, b: Vec3, now: number): Vec3 | null {
    const seen = Math.max(now - NET.interpDelayMs, now - MAX_REWIND_MS);
    const targets: Vec3[] = [];
    for (const target of this.pilots.values()) {
      // Enemies only: never the shooter, never the dead or spawn-protected.
      if (target.id === shooter || !target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, seen);
      if (pos) targets.push(pos);
    }
    // The fuse also reacts to cars, barrels and tanks (ADR-0023).
    targets.push(...this.props.centers(now));
    const f = missileImpact(a, b, this.colliders, targets);
    return f === null ? null : [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  /** The shooter blew up their missile (or their client saw it hit something). Trust the point if it's plausible. */
  /** Set off a grenade where the server has it (the shooter pressed Fire again, ADR-0034). */
  onDetonateGrenade(id: string, rid: number, now: number): void {
    this.stepGrenades(now);
    const x = this.grenades.find((g) => g.shooter === id && g.rid === rid);
    if (!x) return;
    this.grenades.splice(this.grenades.indexOf(x), 1);
    this.explodeGrenade(x.shooter, x.rid, x.g.p, now);
  }

  /** Advance grenades to `now`: they bounce and roll; the fuse sets off any left too long. Positions go out ~20/s. */
  private stepGrenades(now: number): void {
    if (this.grenades.length === 0) {
      this.grenadeClock = now;
      return;
    }
    const dt = Math.min(0.25, Math.max(0, (now - this.grenadeClock) / 1000));
    this.grenadeClock = now;
    for (const x of [...this.grenades]) {
      if (stepGrenade(x.g, this.colliders, dt).expired) {
        this.grenades.splice(this.grenades.indexOf(x), 1);
        this.explodeGrenade(x.shooter, x.rid, x.g.p, now);
      }
    }
    for (const x of this.grenades) {
      if (now - x.lastSent < MISSILE_SEND_MS) continue;
      x.lastSent = now;
      const r = (n: number) => Math.round(n * 100) / 100;
      this.emit({ t: 'grenade', id: x.shooter, rid: x.rid, p: x.g.p.map(r) as Vec3 });
    }
  }

  /** A grenade goes off: a big blast that hurts everyone nearby (the shooter too) and props (ADR-0034). */
  private explodeGrenade(shooter: string, rid: number, at: Vec3, now: number): void {
    const p: Vec3 = [at[0], at[1], at[2]];
    this.emit({ t: 'boom', id: shooter, rid, p, kind: 'grenade' });
    this.props.splash(p, now, shooter, grenadeDamage);
    if (this.phase !== 'playing') return;
    for (const target of [...this.pilots.values()]) {
      if (!target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = grenadeDamage(Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]));
      if (damage > 0) this.hit(shooter, damage, target, now);
    }
  }

  onDetonate(id: string, rid: number, p: Vec3, now: number): void {
    const x = this.missiles.find((m) => m.shooter === id && m.rid === rid);
    if (!x) return;
    const reach = (MISSILE.maxSpeed * MISSILE_SPEED_SLACK * Math.max(0, now - x.updatedAt)) / 1000 + MISSILE_MOVE_SLACK_M;
    const near = Math.hypot(p[0] - x.p[0], p[1] - x.p[1], p[2] - x.p[2]) <= reach;
    // Check the last stretch too, so a detonation can't skip past a wall or a target.
    const at = (near && this.missileImpactAt(id, x.p, p, now)) || (near ? p : x.p);
    this.removeMissile(x);
    this.explode(x.shooter, x.rid, [at[0], at[1], at[2]], now);
  }

  private removeMissile(x: Missile): void {
    const i = this.missiles.indexOf(x);
    if (i >= 0) this.missiles.splice(i, 1);
  }

  /** End missiles that went quiet or outlived their fuel (ADR-0025), and relay positions to everyone else. */
  private stepMissiles(now: number): void {
    for (const x of [...this.missiles]) {
      const shooter = this.pilots.get(x.shooter);
      const expired = now - x.born > MISSILE_MAX_AGE * 1000 + MISSILE.staleMs;
      const stale = now - x.updatedAt > MISSILE.staleMs;
      // The pilot flying it died, or switched off the Freestyle: it blows where it is.
      const orphaned = !shooter || !shooter.alive || missilePods(shooter.loadout) === 0;
      if (expired || stale || orphaned) {
        this.removeMissile(x);
        this.explode(x.shooter, x.rid, x.p, now);
      }
    }
    for (const x of this.missiles) {
      if (now - x.lastSent < MISSILE_SEND_MS) continue;
      x.lastSent = now;
      const r = (n: number) => Math.round(n * 100) / 100;
      this.emit({ t: 'missile', id: x.shooter, rid: x.rid, p: x.p.map(r) as Vec3, v: x.v.map(r) as Vec3 }, { except: x.shooter });
    }
  }

  tick(now: number): void {
    this.now = now;
    if (this.phase === 'ended' && now >= this.resultsUntil) {
      if (this.lobby) this.backToLobby(now);
      else this.startMatch(now);
      return;
    }
    if (this.phase === 'playing' && this.endsAt !== null && now >= this.endsAt) {
      this.endByTime(now);
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
    this.stepGrenades(now);
    this.stepProps(now);
  }

  /** Set off due prop explosions and bring back old ones (ADR-0023). */
  private stepProps(now: number): void {
    const { blasts, respawned } = this.props.tick(now);
    for (const b of blasts) this.propBlast(b, now);
    if (blasts.length > 0 || respawned.length > 0) this.broadcastState();
  }

  /** A prop exploded: everyone draws it; in a match, pilots nearby take blast damage. */
  private propBlast(b: Blast, now: number): void {
    this.emit({ t: 'prop', i: b.i, p: b.p, by: b.by });
    if (this.phase !== 'playing') return;
    if (b.by && this.pilots.has(b.by)) this.onProgress(b.by, 'prop');
    for (const target of [...this.pilots.values()]) {
      if (!target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = blastDamage(b.kind, Math.hypot(pos[0] - b.p[0], pos[1] - b.p[1], pos[2] - b.p[2]));
      if (damage > 0 && this.phase === 'playing') this.hit(b.by && this.pilots.has(b.by) ? b.by : null, damage, target, now);
    }
  }

  state(): MatchState {
    return {
      map: this.map.id,
      props: this.props.downList(),
      phase: this.phase,
      winner: this.winner,
      killsToWin: this.options.killsToWin,
      options: this.options,
      host: this.host,
      ...(this.winnerSide !== null ? { winnerSide: this.winnerSide } : {}),
      ...(this.endsAt !== null && this.phase === 'playing' ? { endsAt: this.endsAt } : {}),
      players: [...this.pilots.values()].map((p) => ({
        id: p.id,
        team: p.team,
        drone: p.drone,
        loadout: p.loadout,
        ...(p.shieldUntil > this.now && p.shieldHp > 0 ? { shielded: true } : {}),
        score: p.score,
        hp: p.hp,
        alive: p.alive,
        protected: p.protectedUntil > this.now,
        ...(p.level !== null ? { level: p.level } : {}),
        ...(p.looks ? { look: p.looks[p.drone] } : {}),
        ...(p.name ? { name: p.name } : {}),
        ...(this.teams ? { side: p.side } : {}),
        ...(p.ready ? { ready: true } : {}),
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
          if (this.phase !== 'playing') break;
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
      if (!done && b.traveled >= b.maxDist && b.prop !== null) this.props.damage(b.prop, b.damage, now, b.shooter);
      else if (!done && b.traveled < b.maxDist) remaining.push(b);
    }
    this.bullets = remaining;
  }

  /** Missile detonation (ADR-0016): splash everyone nearby (not the shooter), and tell every client where. */
  private explode(shooter: string, rid: number, at: Vec3, now: number): void {
    this.emit({ t: 'boom', id: shooter, rid, p: at });
    // Props take the blast in any phase (ADR-0023); they go off on the next tick.
    this.props.splash(at, now, shooter, splashDamage);
    // Outside a running match missiles still fly and explode, but don't hurt pilots.
    if (this.phase !== 'playing') return;
    for (const target of this.pilots.values()) {
      if (target.id === shooter || !target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = splashDamage(Math.hypot(pos[0] - at[0], pos[1] - at[1], pos[2] - at[2]));
      if (damage > 0) this.hit(shooter, damage, target, now);
    }
  }

  /**
   * Damage a pilot. `shooterId` null (or the target themselves, e.g. their own prop blast) gives no
   * credit: a recent attacker keeps theirs (ADR-0023).
   */
  private hit(shooterId: string | null, rawDamage: number, target: Pilot, now: number): void {
    // No friendly fire in Teams (ADR-0047); your own blast still hurts you.
    const shooter = shooterId ? this.pilots.get(shooterId) : undefined;
    if (shooter && this.teammates(shooter, target)) return;
    // A shield soaks damage first (ADR-0033).
    let damage = rawDamage;
    if (target.shieldUntil > now && target.shieldHp > 0) {
      const absorbed = Math.min(target.shieldHp, damage);
      target.shieldHp -= absorbed;
      damage -= absorbed;
      if (target.shieldHp <= 0) target.shieldUntil = 0;
    }
    target.hp = Math.max(0, target.hp - damage);
    const credited = shooterId !== null && shooterId !== target.id;
    if (credited) {
      target.lastDamagedBy = shooterId;
      target.lastDamagedAt = now;
      target.damagedBy.set(shooterId, now);
    }
    this.emit({ t: 'hit', shooter: credited ? shooterId : '', target: target.id, hp: target.hp });
    if (target.hp <= 0) {
      const recent = target.lastDamagedBy && now - target.lastDamagedAt <= COMBAT.killCreditMs && this.pilots.has(target.lastDamagedBy) ? target.lastDamagedBy : null;
      this.kill(target, credited ? shooterId : recent, 'shot', now);
    } else this.broadcastState();
  }

  private kill(pilot: Pilot, killerId: string | null, cause: 'shot' | 'crash', now: number): void {
    pilot.alive = false;
    pilot.hp = 0;
    pilot.respawnAt = now + COMBAT.respawnMs;
    this.emit({ t: 'death', id: pilot.id, killer: killerId, cause });

    // XP (ADR-0032): the kill, and assists for anyone else who hurt them recently.
    if (this.phase === 'playing') {
      this.onProgress(pilot.id, 'death');
      if (killerId && this.pilots.has(killerId)) this.onProgress(killerId, 'kill');
      for (const [id, at] of pilot.damagedBy) {
        if (id !== killerId && id !== pilot.id && now - at <= COMBAT.killCreditMs && this.pilots.has(id)) this.onProgress(id, 'assist');
      }
    }

    const killer = killerId ? this.pilots.get(killerId) : undefined;
    if (killer && !this.teammates(killer, pilot)) {
      killer.score++;
      if (this.teams ? this.sideScore(killer.side) >= this.options.killsToWin : killer.score >= this.options.killsToWin) this.endMatch(killer.id, now);
    }
    this.broadcastState();
  }

  /** Match over (kill limit, or time, ADR-0046): everyone still here finished it; the winner (if any) won it. */
  private endMatch(winnerId: string | null, now: number, side: Side | null = null): void {
    for (const p of this.pilots.values()) this.onProgress(p.id, 'finish');
    // Teams: the whole winning team wins (ADR-0047).
    const winSide = this.teams ? (side ?? (winnerId ? (this.pilots.get(winnerId)?.side ?? null) : null)) : null;
    if (this.teams) {
      for (const p of this.pilots.values()) if (winSide !== null && p.side === winSide) this.onProgress(p.id, 'win');
    } else if (winnerId) this.onProgress(winnerId, 'win');
    this.winnerSide = winSide;
    this.phase = 'ended';
    this.winner = winnerId;
    this.endsAt = null;
    this.resultsUntil = now + COMBAT.resultsMs;
    this.bullets = [];
    this.missiles = [];
    this.grenades = [];
    for (const p of this.pilots.values()) p.respawnAt = null;
  }

  /** Time's up (ADR-0046): the most kills wins; a tie at the top is a draw. */
  private endByTime(now: number): void {
    if (this.teams) {
      const a = this.sideScore(0);
      const b = this.sideScore(1);
      this.endMatch(null, now, a === b ? null : a > b ? 0 : 1);
      this.broadcastState();
      return;
    }
    const ranked = [...this.pilots.values()].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const tie = top && ranked[1] && ranked[1].score === top.score;
    this.endMatch(top && !tie ? top.id : null, now);
    this.broadcastState();
  }

  private respawn(pilot: Pilot, now: number): void {
    // Anti spawn-camping (ADR-0012): random spawn away from every living opponent.
    const opponents = [...this.pilots.values()]
      .filter((p) => p !== pilot && p.alive && !this.teammates(p, pilot))
      .map((p) => p.history[p.history.length - 1]?.p ?? this.map.spawns[p.lastSpawn ?? 0]?.pos)
      .filter((p): p is Vec3 => !!p);
    const spawn = pickSpawn(this.map.spawns, opponents, pilot.lastSpawn, this.random);
    pilot.lastSpawn = spawn;
    const base = this.map.spawns[spawn]!.pos;
    const o = this.spawnOffset(pilot, base);
    // Until the next state arrives, the pilot is at the spawn: later spawns must avoid it too.
    pilot.history = [{ st: now, p: [base[0] + o[0], base[1], base[2] + o[1]], v: [0, 0, 0] }];
    applyPending(pilot);
    pilot.shieldUntil = 0;
    pilot.shieldHp = 0;
    pilot.alive = true;
    pilot.hp = droneClass(pilot.drone).maxHp;
    pilot.respawnAt = null;
    pilot.protectedUntil = now + COMBAT.spawnProtectionMs;
    pilot.lastDamagedBy = null;
    pilot.damagedBy.clear();
    this.protectedAnnounced.add(pilot.id);
    this.emit({ t: 'respawn', id: pilot.id, spawn, loadout: pilot.loadout, ...(o[0] || o[1] ? { o } : {}) });
    this.broadcastState();
  }

  /**
   * With more pilots than spawns (ADR-0026), a spawn can already have someone on it: place this pilot
   * beside it on the first free spot of rings around it, never on top of another pilot.
   */
  private spawnOffset(pilot: Pilot, base: readonly number[]): [number, number] {
    const others = [...this.pilots.values()]
      .filter((p) => p !== pilot && p.alive)
      .map((p) => p.history[p.history.length - 1]?.p)
      .filter((p): p is Vec3 => !!p);
    const free = (dx: number, dz: number) => others.every((p) => Math.hypot(p[0] - base[0]! - dx, p[2] - base[2]! - dz) > SPAWN_TAKEN_M);
    if (free(0, 0)) return [0, 0];
    for (let ring = 1; ring <= 3; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const dx = Math.round(Math.cos(a) * SPAWN_RING_M * ring * 100) / 100;
        const dz = Math.round(Math.sin(a) * SPAWN_RING_M * ring * 100) / 100;
        if (free(dx, dz)) return [dx, dz];
      }
    }
    return [0, 0];
  }

  /** After the results, everyone's back in the pre-match menu (ADR-0047): flying free, nobody ready. */
  private backToLobby(now: number): void {
    this.phase = 'waiting';
    this.winner = null;
    this.winnerSide = null;
    this.endsAt = null;
    for (const p of this.pilots.values()) {
      p.score = 0;
      p.ready = false;
      applyPending(p);
      p.hp = droneClass(p.drone).maxHp;
      p.alive = true;
      p.respawnAt = null;
      p.protectedUntil = now;
    }
    this.broadcastState();
  }

  private startMatch(now: number): void {
    this.phase = 'playing';
    this.winner = null;
    this.winnerSide = null;
    this.endsAt = this.options.timeLimitMin > 0 ? now + this.options.timeLimitMin * 60_000 : null;
    this.bullets = [];
    this.missiles = [];
    this.grenades = [];
    for (const pilot of this.pilots.values()) {
      pilot.score = 0;
      pilot.ammo = new Map();
      this.respawn(pilot, now);
    }
    this.broadcastState();
  }

  private broadcastState(): void {
    this.emit({ t: 'match', m: this.state() });
  }
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
function asLoadout(choice: Loadout | DroneClassId): Loadout {
  return typeof choice === 'string' ? defaultLoadout(choice) : cleanLoadout(choice);
}

function sameLoadout(a: Loadout, b: Loadout): boolean {
  return a.body === b.body && a.special === b.special && a.weapons.join() === b.weapons.join();
}

/** Missiles a loadout's pods hold: 3 per pod (ADR-0033). */
function podSize(l: Loadout): number {
  return MISSILE.pod * missilePods(l);
}

/** Switch to the pending loadout, if any (keeping no more missiles than the new pods hold). */
function applyPending(p: { loadout: Loadout; drone: DroneClassId; pendingLoadout: Loadout | null; missiles: number; ammo: Map<WeaponId, unknown> }): void {
  if (!p.pendingLoadout) return;
  p.loadout = p.pendingLoadout;
  p.drone = p.loadout.body;
  p.pendingLoadout = null;
  p.missiles = Math.min(p.missiles, podSize(p.loadout));
  p.ammo.clear();
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
