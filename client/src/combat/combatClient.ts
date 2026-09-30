import * as THREE from 'three/webgpu';
import { DEFAULT_MAP, getMap, type MapDef, type SpawnPoint } from '../../../shared/maps';
import { COMBAT, TEAM_COLORS, TEAM_NAMES } from '../../../shared/combat';
import type { MatchPlayer } from '../../../shared/protocol';
import { buildColliders, raycastArena } from '../../../shared/raycast';
import type { ControlState } from '../input/inputManager';
import type { NetClient } from '../net/netClient';
import type { Tracers } from '../render/tracers';
import type { Drone } from '../sim/drone';
import type { CombatHudInfo, Hud } from '../ui/hud';

/**
 * Client side of combat (ADR-0009). Fires rounds and draws tracers instantly; the server decides
 * hits, damage, deaths and score, and this class reacts to what it says.
 */

const TOAST_MS = 1800;

/** The sounds combat triggers (ADR-0010). */
export interface CombatSounds {
  shot(from?: { x: number; y: number; z: number }): void;
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
  /** Twin guns alternate: -1 left, +1 right (ADR-0011). */
  private barrel = -1;
  private readonly hudInfo: CombatHudInfo = {
    phase: 'waiting',
    myTeam: 0,
    scores: [0, 0],
    killsToWin: COMBAT.killsToWin,
    hp: COMBAT.maxHp,
    maxHp: COMBAT.maxHp,
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
    private readonly onRespawn: (spawn: SpawnPoint) => void,
    private readonly sounds: CombatSounds,
  ) {}

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

  /** Your team color, or orange outside a room. */
  get myColor(): string {
    return TEAM_COLORS[this.net.team ?? 0] ?? TEAM_COLORS[0];
  }

  update(dt: number, control: ControlState, flying: boolean): void {
    const now = performance.now();
    this.handleEvents(now);
    this.drawRemoteShots();

    // Firing: fixed cadence while the fire control is held.
    this.fireCooldown -= dt;
    const me = this.me();
    const canFire = flying && this.drone.armed && !this.drone.crashed && (!this.inMatch || (me?.alive ?? false));
    if (control.fire && canFire) {
      if (this.fireCooldown <= 0) {
        this.fire();
        this.fireCooldown = Math.max(0, this.fireCooldown) + 1 / COMBAT.fireRate;
      }
    } else if (this.fireCooldown < 0) {
      this.fireCooldown = 0;
    }

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
    h.myTeam = me?.team ?? 0;
    h.scores[0] = 0;
    h.scores[1] = 0;
    for (const p of m.players) h.scores[p.team === 1 ? 1 : 0] = p.score;
    h.killsToWin = m.killsToWin;
    h.hp = me?.hp ?? COMBAT.maxHp;
    h.alive = me?.alive ?? true;
    h.protected = me?.protected ?? false;
    h.respawnIn = this.respawnDeadline !== null ? Math.max(0, (this.respawnDeadline - performance.now()) / 1000) : null;
    h.won = m.phase === 'ended' ? m.winner === this.net.you : null;
    h.toast = this.toast?.text ?? null;
    return h;
  }

  private me(): MatchPlayer | undefined {
    return this.net.match?.players.find((p) => p.id === this.net.you);
  }

  private teamName(id: string | null): string {
    const team = this.net.match?.players.find((p) => p.id === id)?.team ?? 0;
    return TEAM_NAMES[team] ?? 'Opponent';
  }

  private fire(): void {
    this.aim(this.origin, this.dir, this.right, this.up);
    // Both guns converge on a point straight ahead of the camera.
    this.converge.copy(this.origin).addScaledVector(this.dir, COMBAT.convergence);
    this.origin
      .addScaledVector(this.dir, COMBAT.muzzleForward)
      .addScaledVector(this.right, COMBAT.gunSide * this.barrel)
      .addScaledVector(this.up, -COMBAT.gunDrop);
    this.dir.subVectors(this.converge, this.origin).normalize();
    this.barrel = -this.barrel;
    const o = this.origin;
    const d = this.dir;
    const maxDist = raycastArena(this.colliders, o.x, o.y, o.z, d.x, d.y, d.z, COMBAT.range);
    this.tracers.spawn(o, d, maxDist, this.myColor);
    this.sounds.shot();
    const r = (x: number) => Math.round(x * 1000) / 1000;
    this.net.sendShot({
      ts: Math.round(this.net.serverNow()),
      p: [r(o.x), r(o.y), r(o.z)],
      d: [r(d.x), r(d.y), r(d.z)],
    });
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
                ? `Shot down by ${this.teamName(ev.killer)}`
                : ev.killer
                  ? `Crashed · kill to ${this.teamName(ev.killer)}`
                  : 'Crashed';
            this.showToast(text, now, COMBAT.respawnMs);
            this.sounds.stinger('death');
          } else if (ev.killer === you) {
            this.sounds.stinger('kill');
            this.showToast(ev.cause === 'shot' ? 'Kill +1' : 'They crashed · kill +1', now);
          } else {
            this.showToast(`${this.teamName(ev.id)} crashed`, now);
          }
          break;
        case 'respawn':
          if (ev.id === you) {
            this.respawnDeadline = null;
            this.onRespawn(this.map.spawns[ev.spawn] ?? this.map.spawns[0]!);
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
      const maxDist = raycastArena(this.colliders, px, py, pz, dx, dy, dz, COMBAT.range);
      const team = this.net.match?.players.find((p) => p.id === shot.id)?.team ?? 1;
      this.tracers.spawn(this.shotOrigin.set(px, py, pz), this.shotDir.set(dx, dy, dz), maxDist, TEAM_COLORS[team] ?? TEAM_COLORS[1]);
      this.sounds.shot(this.shotOrigin);
    }
  }

  private showToast(text: string, now: number, ms: number = TOAST_MS): void {
    this.toast = { text, until: now + ms };
  }
}
