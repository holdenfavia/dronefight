import * as THREE from 'three/webgpu';
import { DEFAULT_MAP, getMap, type MapDef, type SpawnPoint } from '../../../shared/maps';
import { COMBAT, pilotColor, pilotName } from '../../../shared/combat';
import { droneClass } from '../../../shared/drones';
import { guns, launchers, missilePods, type Loadout } from '../../../shared/loadout';
import { SHIELD } from '../../../shared/specials';
import { WEAPONS, type GunSound, type WeaponId } from '../../../shared/weapons';
import type { MatchPlayer } from '../../../shared/protocol';
import { buildColliders, raycastArena } from '../../../shared/raycast';
import type { ControlState } from '../input/inputManager';
import type { NetClient } from '../net/netClient';
import type { Tracers } from '../render/tracers';
import type { Drone } from '../sim/drone';
import type { CombatHudInfo, Hud } from '../ui/hud';
import { SMOKE } from '../../../shared/abilities';
import { MISSILE, quatRotate, refillPod, type MissileInput, type MissileState } from '../../../shared/missile';
import type { Grenades, Missiles, SmokeTrails } from './effects';
import type { PropField } from '../../../shared/props';
import type { V3 } from '../../../shared/maps/movers';

/**
 * Client side of combat (ADR-0009). Fires rounds and draws tracers instantly; the server decides
 * hits, damage, deaths and score, and this class reacts to what it says.
 */

const TOAST_MS = 1800;

/** Most shots fired in one frame, so a hitch can't dump a burst (the server's bucket would drop it anyway). */
const MAX_SHOTS_PER_FRAME = 4;
/** Pellets from one remote shotgun blast arrive together; closer than this (ms) counts as one blast. */
const SAME_BLAST_MS = 30;

/** The sounds combat triggers (ADR-0010, ADR-0014). */
export interface CombatSounds {
  /** One shot from a standard gun or shotgun. With `from`, it's another pilot, heard from where they are. */
  shot(style: Exclude<GunSound, 'vulcan'>, from?: { x: number; y: number; z: number }): void;
  /** Your rotary cannon: on while firing, off otherwise (a continuous BRRRT, not separate shots). */
  cannon(firing: boolean): void;
  /** Another pilot's rotary cannon fired a round just now. */
  remoteCannon(pilotId: string): void;
  /** Rocket launch and smoke deploy (ADR-0016); positional when `from` is given. */
  rocketLaunch(from?: { x: number; y: number; z: number }): void;
  /** Grenade launcher (ADR-0034): the launch thoonk, positional for others. */
  grenadeLaunch(from?: { x: number; y: number; z: number }): void;
  smoke(from?: { x: number; y: number; z: number }): void;
  /** Weapon switch click. */
  weaponSwitch(): void;
  hitConfirm(): void;
  damage(): void;
  countdown(secondsLeft: number): void;
  stinger(kind: 'kill' | 'death' | 'victory' | 'defeat'): void;
}

export class CombatClient {
  private map: MapDef = getMap(DEFAULT_MAP);
  private colliders = buildColliders(this.map.boxes);
  private fireCooldown = 0;
  private toast: { text: string; until: number } | null = null;
  private respawnDeadline: number | null = null;
  private lastPhase: string | null = null;
  private lastCountdown = 0;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly converge = new THREE.Vector3();
  private readonly pelletDir = new THREE.Vector3();
  /** Last shotgun blast time per remote pilot, so 8 pellets make one boom. */
  private readonly lastBlast = new Map<string, number>();
  /** Every round/pellet we fire, for local practice hit checks on the Training map (ADR-0017). */
  onLocalRound: ((origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, maxDist: number) => void) | null = null;
  /** Destructible props (ADR-0023): rounds stop at them; `propClock` is the shared time (ms) they move on. */
  props: PropField | null = null;
  propClock: () => number = () => performance.now();
  /** One of our rounds will hit prop `i` after `travelMs` (solo applies the damage; online the server does). */
  onPropRound: ((i: number, damage: number, travelMs: number, at: THREE.Vector3) => void) | null = null;
  /** The server says prop `i` exploded (ADR-0023). */
  onPropBlast: ((i: number, p: V3, by: string | null) => void) | null = null;
  private readonly propO: V3 = [0, 0, 0];
  private readonly propD: V3 = [0, 0, 0];
  private readonly propAt = new THREE.Vector3();
  /** Weapon group Fire uses (guns or missile pods, ADR-0033), and the missile pod mirror (ADR-0025). */
  weapon: 'guns' | 'missiles' = 'guns';
  /** Per-hardpoint cooldowns (s) and rounds left in a burst (burst rifle). */
  private hardpointCooldown: number[] = [];
  private burstLeft: number[] = [];
  /** Shield (ADR-0033): when it's ready again (performance.now() ms). */
  private shieldReadyAt = 0;
  /** Grenade launcher (ADR-0034): no new lob before this (performance.now() ms). */
  private grenadeCooldownUntil = 0;
  private nextGrenadeId = 1;
  private missilePod: number = MISSILE.pod;
  private missilePodAt = performance.now();
  private nextMissileId = 1;
  /** Fire was held last frame (a new press detonates the missile you're flying). */
  private fireWasHeld = false;
  private readonly missileInput: MissileInput = { throttle: 0.5, roll: 0, pitch: 0, yaw: 0 };
  /** 3D quad: when the smoke trail is ready again (performance.now() ms). */
  private smokeReadyAt = 0;
  private readonly hudInfo: CombatHudInfo = {
    timeLeft: null,
    phase: 'waiting',
    myScore: 0,
    rank: 1,
    pilots: 1,
    leader: null,
    winnerName: null,
    killsToWin: COMBAT.killsToWin,
    hp: 100,
    maxHp: 100,
    alive: true,
    protected: false,
    respawnIn: null,
    won: null,
    toast: null,
  };

  constructor(
    private readonly net: NetClient,
    private readonly drone: Drone,
    private readonly tracers: Tracers,
    private readonly hud: Hud,
    /** The FPV camera's position and axes, which the guns are mounted around (ADR-0009, ADR-0011). */
    private readonly aim: (origin: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) => void,
    /** Server respawned us: at this spawn (moved beside it if taken, ADR-0026), flying this loadout (ADR-0012, ADR-0033). */
    private readonly onRespawn: (spawn: SpawnPoint, loadout: Loadout) => void,
    private readonly sounds: CombatSounds,
    private readonly effects: { smoke: SmokeTrails; missiles: Missiles; grenades: Grenades },
  ) {}

  /** Round speed for the lead indicator: your first gun's; null with missiles selected (you fly them) or no guns. */
  get projectileSpeed(): number | null {
    if (this.missilesSelected) return null;
    const first = guns(this.drone.loadout)[0];
    return first ? WEAPONS[first].speed : null;
  }

  private get missilesSelected(): boolean {
    return this.weapon === 'missiles' && missilePods(this.drone.loadout) > 0;
  }

  /** Missiles your pods hold (3 per pod). */
  private get podSize(): number {
    return MISSILE.pod * missilePods(this.drone.loadout);
  }

  /** Switch Fire between guns and missile pods, if you carry both. */
  private switchWeapon(): void {
    const l = this.drone.loadout;
    if (guns(l).length === 0 || missilePods(l) === 0) return;
    this.weapon = this.weapon === 'guns' ? 'missiles' : 'guns';
    this.sounds.weaponSwitch();
    this.notify(this.weapon === 'missiles' ? 'Missile' : 'Guns');
  }

  private get myId(): string {
    return this.net.you ?? 'me';
  }

  /** The missile we're flying right now (ADR-0025), or null. */
  get flying(): { rid: number; m: MissileState } | null {
    return this.effects.missiles.local(this.myId);
  }

  /** Our missile's pose for the server, sent with our state: id, position, velocity. */
  missilePose(): [number, number, number, number, number, number, number] | null {
    const f = this.flying;
    if (!f) return null;
    const r = (x: number) => Math.round(x * 100) / 100;
    const { p, v } = f.m;
    return [f.rid, r(p[0]), r(p[1]), r(p[2]), r(v[0]), r(v[1]), r(v[2])];
  }

  /** Missile HUD (ADR-0025): speed, throttle, fuel, time left, range to the nearest target ahead. */
  missileHud(targets: readonly THREE.Vector3[]): { speed: number; throttle: number; fuel: number; timeLeft: number; range: number | null } | null {
    const f = this.flying;
    if (!f) return null;
    const { m } = f;
    const nose = quatRotate(m.q, [0, 0, -1]);
    let range: number | null = null;
    for (const t of targets) {
      const dx = t.x - m.p[0];
      const dy = t.y - m.p[1];
      const dz = t.z - m.p[2];
      const d = Math.hypot(dx, dy, dz);
      // Within ~25° of the nose.
      if (d > 0 && (dx * nose[0] + dy * nose[1] + dz * nose[2]) / d > 0.9 && (range === null || d < range)) range = d;
    }
    const burnLeft = m.burnout === null ? Math.min(m.fuel / (MISSILE.idleBurn + (1 - MISSILE.idleBurn) * m.throttle), MISSILE.maxFlightSeconds - m.age) + MISSILE.glideSeconds : MISSILE.glideSeconds - (m.age - m.burnout);
    return {
      speed: Math.hypot(m.v[0], m.v[1], m.v[2]),
      throttle: m.throttle,
      fuel: m.fuel / MISSILE.fuelSeconds,
      timeLeft: Math.max(0, burnLeft),
      range,
    };
  }

  /** HUD readout: your missile group or special (ADR-0033). Maneuver mode is reported by the game. */
  specialReadout(): { label: string; value: string } | null {
    const now = performance.now();
    const l = this.drone.loadout;
    if (this.missilesSelected) {
      if (this.flying) return { label: 'MISSILE', value: 'FIRE: DETONATE' };
      const pod = refillPod(this.missilePod, this.missilePodAt, now, this.podSize).ammo;
      return { label: 'MISSILE', value: `${Math.floor(pod)}/${this.podSize}` };
    }
    // Grenades out: Fire again sets them off (ADR-0034).
    if (launchers(l) > 0 && this.effects.grenades.out(this.myId) > 0) return { label: 'GRENADE', value: 'FIRE: DETONATE' };
    const wait = (until: number) => (until - now > 0 ? `${Math.ceil((until - now) / 1000)}s` : 'READY');
    if (l.special === 'smoke') return { label: 'SMOKE', value: wait(this.smokeReadyAt) };
    if (l.special === 'shield') {
      const up = this.net.match?.players.find((p) => p.id === this.net.you)?.shielded;
      return { label: 'SHIELD', value: up ? 'UP' : wait(this.shieldReadyAt) };
    }
    if (l.special === 'afterburner') return { label: 'BURNER', value: this.drone.afterburnerActive ? 'ON' : `${Math.round(this.drone.afterburnerFuel * 100)}%` };
    if (missilePods(l) > 0 && guns(l).length > 0) return { label: 'WEAPON', value: 'GUNS' };
    return null;
  }

  /** True while pilot `id` is smoking: draw only their frame (ADR-0024). */
  smoking(id: string): boolean {
    return this.effects.smoke.smoking(id);
  }

  /** Our id for effects (ours are keyed by it in and out of rooms). */
  get selfId(): string {
    return this.myId;
  }

  /**
   * Tap specials (ADR-0033): detonate the missile you're flying; smoke; shield; or, with an empty special
   * slot, switch guns/missiles. Holds (maneuver mode, afterburner) are handled by the drone.
   */
  private handleSpecial(control: ControlState, alive: boolean): void {
    if (control.switchPressed) this.switchWeapon();
    if (!control.specialPressed) return;
    if (this.flying) {
      this.effects.missiles.detonateLocal(this.myId);
      return;
    }
    const special = this.drone.loadout.special;
    const now = performance.now();
    const p = this.drone.currPos;
    const r = (x: number) => Math.round(x * 100) / 100;
    if (special === null) this.switchWeapon();
    else if (special === 'smoke') {
      if (!alive || this.drone.crashed || now < this.smokeReadyAt) return;
      this.smokeReadyAt = now + SMOKE.cooldownMs;
      this.effects.smoke.start(this.myId);
      this.sounds.smoke();
      this.net.sendAbility('smoke', [r(p.x), r(p.y), r(p.z)]);
    } else if (special === 'shield') {
      if (!alive || this.drone.crashed || now < this.shieldReadyAt) return;
      this.shieldReadyAt = now + SHIELD.cooldownMs;
      this.sounds.weaponSwitch();
      this.notify('Shield up');
      this.net.sendAbility('shield', [r(p.x), r(p.y), r(p.z)]);
    }
  }

  /** Rounds stop at this map's walls; respawns use its spawn list (ADR-0012). */
  setMap(map: MapDef): void {
    this.map = map;
    this.colliders = buildColliders(map.boxes);
  }

  /** A match is running: the server owns deaths and respawns. */
  get inMatch(): boolean {
    const m = this.net.match;
    return this.net.inRoom && !!m && m.phase !== 'waiting';
  }

  /** Your pilot color, or orange outside a room (ADR-0026). */
  get myColor(): string {
    return pilotColor(this.net.team);
  }

  update(dt: number, control: ControlState, flying: boolean): void {
    const now = performance.now();
    this.handleEvents(now);
    this.drawRemoteShots();

    // Firing: the class's cadence while the fire control is held. Several shots per frame are allowed,
    // so a 50/s cannon keeps its rate at 60 FPS (ADR-0014).
    this.fireCooldown -= dt;
    const me = this.me();
    const loadout = this.drone.loadout;
    // Only a group you carry can be selected.
    if (missilePods(loadout) === 0) this.weapon = 'guns';
    else if (guns(loadout).length === 0) this.weapon = 'missiles';
    const alive = !this.inMatch || (me?.alive ?? false);
    if (flying) this.handleSpecial(control, alive);
    const canFire = flying && this.drone.armed && !this.drone.crashed && alive;
    const firePressed = control.fire && !this.fireWasHeld;
    this.fireWasHeld = control.fire;
    // Flying a missile (ADR-0025): the sticks fly it; a new Fire press (or Special) detonates it; if our
    // drone goes down, it blows where it is.
    const ours = this.flying;
    if (ours && (!alive || this.drone.crashed || (flying && firePressed))) this.effects.missiles.detonateLocal(this.myId);
    const mi = this.missileInput;
    mi.throttle = Math.max(0, Math.min(1, control.throttle));
    mi.roll = control.roll;
    mi.pitch = control.pitch;
    mi.yaw = control.yaw;
    this.effects.missiles.update(dt, flying ? mi : null);
    const firing = control.fire && canFire && !ours;
    if (firing && this.missilesSelected) {
      const pod = refillPod(this.missilePod, this.missilePodAt, performance.now(), this.podSize);
      this.missilePod = pod.ammo;
      this.missilePodAt = pod.at;
      if (firePressed && this.effects.missiles.inFlight(this.myId) < MISSILE.maxInFlight && this.missilePod >= 1 && this.fireCooldown <= 0) {
        this.missilePod -= 1;
        this.fireMissile();
        this.fireCooldown = 0.3;
      }
    }
    // Grenade launcher (ADR-0034): a Fire press sets off the grenades you have out; with none out, it lobs one.
    if (firing && firePressed && !this.missilesSelected && launchers(loadout) > 0) {
      const out = this.effects.grenades.ours(this.myId);
      if (out.length > 0) {
        for (const g of out) {
          this.effects.grenades.detonateLocal(this.myId, g.rid);
          this.net.sendDetonate(g.rid, g.p, 'grenade');
        }
        this.grenadeCooldownUntil = now + 250;
      } else if (now >= this.grenadeCooldownUntil) {
        this.lobGrenade();
        this.grenadeCooldownUntil = now + 1000 / WEAPONS.grenade.fireRate;
      }
    }
    // Guns (ADR-0033): every gun on a hardpoint fires at its own rate while Fire is held.
    const gunsFiring = firing && !this.missilesSelected;
    let soundsThisFrame = 0;
    loadout.weapons.forEach((id, i) => {
      if (!id || WEAPONS[id].kind !== 'gun') return;
      const w = WEAPONS[id];
      this.hardpointCooldown[i] = (this.hardpointCooldown[i] ?? 0) - dt;
      if (!gunsFiring) {
        // Let go: a cooldown never banks up, and a burst stops.
        this.hardpointCooldown[i] = Math.max(0, this.hardpointCooldown[i]!);
        this.burstLeft[i] = 0;
        return;
      }
      const period = 1 / w.fireRate;
      for (let n = 0; n < MAX_SHOTS_PER_FRAME && this.hardpointCooldown[i]! <= 0; n++) {
        this.fire(id, i, soundsThisFrame++ === 0);
        if (w.burst) {
          // A burst: rounds `spacingMs` apart, then the rest of the cycle (rounds per `rounds / fireRate` s).
          const left = (this.burstLeft[i] || w.burst.rounds) - 1;
          this.burstLeft[i] = left;
          this.hardpointCooldown[i]! += left > 0 ? w.burst.spacingMs / 1000 : w.burst.rounds * period - (w.burst.rounds - 1) * (w.burst.spacingMs / 1000);
        } else {
          this.hardpointCooldown[i]! += period;
        }
      }
      this.hardpointCooldown[i] = Math.max(this.hardpointCooldown[i]!, -period);
    });
    if (!firing && this.fireCooldown < 0) this.fireCooldown = 0;
    this.sounds.cannon(gunsFiring && loadout.weapons.includes('cannon'));

    if (this.toast && now > this.toast.until) this.toast = null;

    // Match end stinger.
    const phase = this.net.match?.phase ?? null;
    if (phase === 'ended' && this.lastPhase === 'playing') {
      this.sounds.stinger(this.net.match?.winner === this.net.you ? 'victory' : 'defeat');
    }
    this.lastPhase = phase;

    // Respawn countdown beeps.
    if (this.respawnDeadline !== null) {
      const left = Math.ceil((this.respawnDeadline - now) / 1000);
      if (left !== this.lastCountdown && left >= 1 && left <= 3) this.sounds.countdown(left);
      this.lastCountdown = left;
    }
  }

  hudState(): CombatHudInfo | null {
    const m = this.net.match;
    if (!this.net.inRoom || !m) return this.toast ? { ...this.hudInfo, phase: 'waiting', toast: this.toast.text } : null;
    const me = this.me();
    const h = this.hudInfo;
    h.phase = m.phase;
    // Free-for-all standings (ADR-0026).
    const myScore = me?.score ?? 0;
    h.myScore = myScore;
    h.pilots = m.players.length;
    h.rank = 1 + m.players.filter((p) => p.score > myScore).length;
    const top = m.players.filter((p) => p.id !== this.net.you).sort((a, b) => b.score - a.score)[0];
    h.leader = top && top.score >= myScore ? { name: pilotName(top.team), score: top.score, color: pilotColor(top.team) } : null;
    h.winnerName = m.winner ? this.teamName(m.winner) : null;
    h.killsToWin = m.killsToWin;
    const cls = droneClass(me?.drone ?? this.drone.classId);
    h.maxHp = cls.maxHp;
    h.hp = me?.hp ?? cls.maxHp;
    h.alive = me?.alive ?? true;
    h.protected = me?.protected ?? false;
    h.respawnIn = this.respawnDeadline !== null ? Math.max(0, (this.respawnDeadline - performance.now()) / 1000) : null;
    h.won = m.phase === 'ended' ? m.winner === this.net.you : null;
    h.toast = this.toast?.text ?? null;
    h.timeLeft = m.endsAt !== undefined && m.phase === 'playing' ? Math.max(0, (m.endsAt - this.net.serverNow()) / 1000) : null;
    return h;
  }

  private me(): MatchPlayer | undefined {
    return this.net.match?.players.find((p) => p.id === this.net.you);
  }

  /** A pilot's color name ("Cyan"), which is how pilots are named in a room (ADR-0026). */
  private teamName(id: string | null): string {
    const slot = this.net.match?.players.find((p) => p.id === id)?.team;
    return slot === undefined ? 'Pilot' : pilotName(slot);
  }

  /** Lob a grenade (ADR-0034) from each launcher's corner (they take turns), carrying the drone's velocity. */
  private lobGrenade(): void {
    const slots = this.drone.loadout.weapons.flatMap((w, i) => (w === 'grenade' ? [i] : []));
    const slot = slots[this.nextGrenadeId % Math.max(1, slots.length)] ?? 0;
    this.muzzle(slot);
    const o = this.origin;
    const d = this.dir;
    const rid = this.nextGrenadeId++;
    this.effects.grenades.launchLocal(this.myId, rid, o, d, this.drone.state.linvel);
    this.sounds.grenadeLaunch();
    const r = (x: number) => Math.round(x * 1000) / 1000;
    this.net.sendShot({ ts: Math.round(this.net.serverNow()), p: [r(o.x), r(o.y), r(o.z)], d: [r(d.x), r(d.y), r(d.z)], w: 'grenade', rid });
  }

  /** Launch a missile (ADR-0025) from a missile pod's corner (pods take turns), toward the crosshair. */
  private fireMissile(): void {
    const pods = this.drone.loadout.weapons.flatMap((w, i) => (w === 'missile' ? [i] : []));
    const slot = pods[this.nextMissileId % Math.max(1, pods.length)] ?? 0;
    this.muzzle(slot);
    const o = this.origin;
    const d = this.dir;
    const rid = this.nextMissileId++;
    this.effects.missiles.launchLocal(this.myId, rid, o, d);
    this.sounds.rocketLaunch();
    const r = (x: number) => Math.round(x * 1000) / 1000;
    this.net.sendShot({ ts: Math.round(this.net.serverNow()), p: [r(o.x), r(o.y), r(o.z)], d: [r(d.x), r(d.y), r(d.z)], w: 'missile', rid });
  }

  /**
   * One shot from the weapon on hardpoint `slot` (ADR-0033). Each hardpoint fires from its own corner of
   * your view (1 upper left, 2 upper right, 3 lower left, 4 lower right); all converge on the crosshair.
   */
  private fire(id: WeaponId, slot: number, withSound: boolean): void {
    this.muzzle(slot);

    const gun = WEAPONS[id];
    const o = this.origin;
    const ts = Math.round(this.net.serverNow());
    const r = (x: number) => Math.round(x * 1000) / 1000;
    const spread = (gun.spreadDeg * Math.PI) / 180;
    // One round, or a choked cone of pellets for the shotgun (ADR-0014).
    for (let i = 0; i < gun.pellets; i++) {
      const d = this.pelletDir.copy(this.dir);
      if (spread > 0) {
        // Uniform within the cone: sqrt keeps pellets from bunching in the middle.
        const radius = Math.tan(spread * Math.sqrt(Math.random()));
        const angle = Math.random() * Math.PI * 2;
        d.addScaledVector(this.right, radius * Math.cos(angle)).addScaledVector(this.up, radius * Math.sin(angle)).normalize();
      }
      let maxDist = raycastArena(this.colliders, o.x, o.y, o.z, d.x, d.y, d.z, gun.range);
      const prop = this.propHit(o, d, maxDist, gun.speed);
      if (prop) {
        maxDist = prop.dist;
        this.propAt.copy(o).addScaledVector(d, prop.dist);
        this.onPropRound?.(prop.i, gun.damage, (prop.dist / gun.speed) * 1000, this.propAt);
      }
      if (id !== 'missile' && id !== 'grenade') this.tracers.spawn(o, d, maxDist, this.myColor, gun.speed, id, 0, maxDist < gun.range - 0.01);
      this.onLocalRound?.(o, d, gun.speed, gun.damage, maxDist);
      this.net.sendShot({ ts, p: [r(o.x), r(o.y), r(o.z)], d: [r(d.x), r(d.y), r(d.z)], w: id });
    }
    if (withSound && gun.sound !== 'vulcan') this.sounds.shot(gun.sound);
  }

  /**
   * Muzzle position and direction for hardpoint `slot` into `origin` and `dir` (ADR-0033): 1 upper left,
   * 2 upper right, 3 lower left, 4 lower right of your view, angled to meet at the crosshair.
   */
  private muzzle(slot: number): void {
    this.aim(this.origin, this.dir, this.right, this.up);
    this.converge.copy(this.origin).addScaledVector(this.dir, COMBAT.convergence);
    const side = slot % 2 === 0 ? -1 : 1;
    const height = slot < 2 ? COMBAT.gunRise : -COMBAT.gunDrop;
    this.origin
      .addScaledVector(this.dir, COMBAT.muzzleForward)
      .addScaledVector(this.right, COMBAT.gunSide * side)
      .addScaledVector(this.up, height);
    this.dir.subVectors(this.converge, this.origin).normalize();
  }

  /** The first standing prop a round from `o` along `d` hits before `maxDist`, if any. */
  private propHit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, speed: number, ts = this.propClock()): { i: number; dist: number } | null {
    if (!this.props) return null;
    this.propO[0] = o.x;
    this.propO[1] = o.y;
    this.propO[2] = o.z;
    this.propD[0] = d.x;
    this.propD[1] = d.y;
    this.propD[2] = d.z;
    return this.props.bulletHit(this.propO, this.propD, maxDist, ts, speed);
  }

  private handleEvents(now: number): void {
    const you = this.net.you;
    for (const ev of this.net.events.splice(0)) {
      switch (ev.t) {
        case 'hit':
          if (ev.shooter === you) {
            this.hud.flashHit();
            this.sounds.hitConfirm();
          }
          if (ev.target === you) {
            this.hud.flashDamage();
            this.sounds.damage();
          }
          break;
        case 'death':
          if (ev.id === you) {
            this.drone.kill();
            this.respawnDeadline = now + COMBAT.respawnMs;
            const text =
              ev.cause === 'shot'
                ? ev.killer
                  ? `Shot down by ${this.teamName(ev.killer)}`
                  : 'Caught in a blast'
                : ev.killer
                  ? `Crashed · kill to ${this.teamName(ev.killer)}`
                  : 'Crashed';
            this.showToast(text, now, COMBAT.respawnMs);
            this.sounds.stinger('death');
          } else if (ev.killer === you) {
            this.sounds.stinger('kill');
            this.showToast(ev.cause === 'shot' ? `${this.teamName(ev.id)} down · kill +1` : `${this.teamName(ev.id)} crashed · kill +1`, now);
          } else if (ev.killer) {
            this.showToast(`${this.teamName(ev.killer)} got ${this.teamName(ev.id)}`, now);
          } else {
            this.showToast(`${this.teamName(ev.id)} ${ev.cause === 'shot' ? 'blew up' : 'crashed'}`, now);
          }
          break;
        case 'ability':
          this.effects.smoke.start(ev.id);
          this.sounds.smoke(this.shotOrigin.set(ev.p[0], ev.p[1], ev.p[2]));
          break;
        case 'grenade':
          if (ev.id !== you) this.effects.grenades.track(ev.id, ev.rid, ev.p);
          break;
        case 'boom':
          if (ev.kind === 'grenade') {
            this.effects.grenades.detonate(ev.id === you ? this.myId : ev.id, ev.rid, ev.p);
            break;
          }
          // Server-decided detonation: draw it here, for everyone's missiles including ours.
          this.effects.missiles.detonate(ev.id === you ? this.myId : ev.id, ev.rid, ev.p);
          break;
        case 'missile':
          if (ev.id !== you) this.effects.missiles.track(ev.id, ev.rid, ev.p, ev.v);
          break;
        case 'prop':
          this.onPropBlast?.(ev.i, ev.p, ev.by);
          break;
        case 'respawn':
          if (ev.id === you) {
            this.respawnDeadline = null;
            const base = this.map.spawns[ev.spawn] ?? this.map.spawns[0]!;
            const o = ev.o ?? [0, 0];
            this.onRespawn({ pos: [base.pos[0] + o[0], base.pos[1], base.pos[2] + o[1]], yawDeg: base.yawDeg }, ev.loadout);
            if (this.toast) this.toast = null;
          }
          break;
      }
    }
  }

  private readonly shotOrigin = new THREE.Vector3();
  private readonly shotDir = new THREE.Vector3();

  private drawRemoteShots(): void {
    for (const shot of this.net.remoteShots.splice(0)) {
      const [px, py, pz] = shot.s.p;
      const [dx, dy, dz] = shot.s.d;
      if (shot.s.w === 'grenade') {
        this.effects.grenades.launchRemote(shot.id, shot.s.rid ?? 0, this.shotOrigin.set(px, py, pz));
        this.sounds.grenadeLaunch(this.shotOrigin);
        continue;
      }
      if (shot.s.w === 'missile') {
        this.effects.missiles.launchRemote(shot.id, shot.s.rid ?? 0, this.shotOrigin.set(px, py, pz), this.shotDir.set(dx, dy, dz));
        this.sounds.rocketLaunch(this.shotOrigin);
        continue;
      }
      const shooter = this.net.match?.players.find((p) => p.id === shot.id);
      const team = shooter?.team;
      // Each shot names the weapon that fired it (ADR-0033).
      const gun = WEAPONS[shot.s.w];
      this.shotOrigin.set(px, py, pz);
      this.shotDir.set(dx, dy, dz);
      const wall = raycastArena(this.colliders, px, py, pz, dx, dy, dz, gun.range);
      const maxDist = this.propHit(this.shotOrigin, this.shotDir, wall, gun.speed, shot.s.ts)?.dist ?? wall;
      this.tracers.spawn(this.shotOrigin, this.shotDir, maxDist, pilotColor(team ?? 1), gun.speed, shot.s.w, 0, maxDist < gun.range - 0.01);
      if (gun.sound === 'vulcan') {
        this.sounds.remoteCannon(shot.id);
      } else {
        // Pellets (or several guns) firing together make one sound.
        const key = `${shot.id}:${shot.s.w}`;
        const last = this.lastBlast.get(key) ?? -Infinity;
        if (Math.abs(shot.s.ts - last) > SAME_BLAST_MS) this.sounds.shot(gun.sound, this.shotOrigin);
        this.lastBlast.set(key, shot.s.ts);
      }
    }
  }

  /** A short message in the middle of the screen. */
  notify(text: string): void {
    this.showToast(text, performance.now());
  }

  private showToast(text: string, now: number, ms: number = TOAST_MS): void {
    this.toast = { text, until: now + ms };
  }
}
