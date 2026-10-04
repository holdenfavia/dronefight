import * as THREE from 'three/webgpu';
import { SMOKE } from '../../../shared/abilities';
import { GRENADE, launchGrenade, stepGrenade, type GrenadeState } from '../../../shared/grenade';
import { launchMissile, MISSILE, missileImpact, stepMissile, type MissileInput, type MissileState, type Vec3 } from '../../../shared/missile';
import type { BoxCollider } from '../../../shared/raycast';
import type { Particles } from '../render/particles';

/**
 * Visuals for the class specials: smoke trails (which also decide concealment, ADR-0024), guided
 * missiles with smoke trails, and explosions (ADR-0016). The server decides damage; these only show it.
 */

/** 3D quad smoke (ADR-0024): who is smoking, and the thin trail they leave. */
export class SmokeTrails {
  /** Pilot id -> when their smoke ends (performance.now() ms). */
  private readonly until = new Map<string, number>();
  private readonly lastPuff = new Map<string, number>();

  constructor(private readonly particles: Particles) {}

  start(id: string): void {
    this.until.set(id, performance.now() + SMOKE.durationMs);
  }

  /** True while `id` is smoking: the other pilot sees only their frame. */
  smoking(id: string): boolean {
    return (this.until.get(id) ?? 0) > performance.now();
  }

  /** Leave puffs behind every smoking pilot, once per frame. */
  update(pilots: Iterable<{ id: string; position: THREE.Vector3 }>): void {
    const now = performance.now();
    for (const { id, position: p } of pilots) {
      if (!this.smoking(id) || now - (this.lastPuff.get(id) ?? 0) < SMOKE.puffEveryMs) continue;
      this.lastPuff.set(id, now);
      this.particles.emit(p.x, p.y, p.z, {
        startSize: SMOKE.puffStart,
        endSize: SMOKE.puffEnd * (0.8 + Math.random() * 0.4),
        lifeMs: SMOKE.puffLifeMs * (0.8 + Math.random() * 0.4),
        color: Math.random() < 0.5 ? '#c9cdd0' : '#b3b8bc',
        alpha: 0.75,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.3,
        vz: (Math.random() - 0.5) * 0.4,
      });
    }
  }
}

interface FlyingMissile {
  owner: string;
  rid: number;
  /** Ours: predicted locally with the shared missile physics and our live aim. */
  local: MissileState | null;
  /** Theirs: latest server position and velocity, extrapolated between updates. */
  remote: { p: THREE.Vector3; v: THREE.Vector3; at: number } | null;
  lastPuff: number;
  mesh: THREE.Mesh;
}

export interface ExplosionListener {
  (at: THREE.Vector3): void;
}

/** A missile is still drawn until this long after its last server update, then assumed gone (ms). */
const REMOTE_TIMEOUT_MS = 600;
/** Rids of ours that already exploded locally, so the server's boom doesn't draw a second blast. */
const RECENT = 16;

/**
 * Missiles (ADR-0025): ours flown here from the pilot's sticks with the shared physics (we report its
 * pose to the server), theirs drawn from the server's ~20/s updates. The server decides the real
 * explosion (`boom`); ours is drawn the moment we see it hit.
 */
export class Missiles {
  /** Things our missile's proximity fuse reacts to locally (bots, pilots, props). */
  fuseTargets: () => readonly THREE.Vector3[] = () => [];
  /** Our missile ended here (hit, fuse, self-destruct or detonated): tell the server. */
  onLocalEnd: ((rid: number, at: Vec3) => void) | null = null;
  private readonly missiles: FlyingMissile[] = [];
  private readonly pool: THREE.Mesh[] = [];
  private readonly flashes: { sprite: THREE.Sprite; born: number; size: number }[] = [];
  private readonly geo = new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8).rotateX(Math.PI / 2);
  private readonly mat = new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });
  private readonly flashMat: THREE.SpriteMaterial;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly recent: string[] = [];
  private readonly from: Vec3 = [0, 0, 0];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly particles: Particles,
    private readonly colliders: () => readonly BoxCollider[],
    private readonly onExplode: ExplosionListener,
  ) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,245,210,1)');
      g.addColorStop(0.4, 'rgba(255,150,40,0.8)');
      g.addColorStop(1, 'rgba(255,90,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    this.flashMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  }

  /** How many of `owner`'s missiles are flying. */
  inFlight(owner: string): number {
    return this.missiles.filter((m) => m.owner === owner).length;
  }

  /** The missile `owner` is flying locally (ours), or null. */
  local(owner: string): { rid: number; m: MissileState } | null {
    const x = this.missiles.find((m) => m.owner === owner && m.local);
    return x?.local ? { rid: x.rid, m: x.local } : null;
  }

  /** Blow up our missile where it is now (Fire / Special while flying it). */
  detonateLocal(owner: string): void {
    const i = this.missiles.findIndex((m) => m.owner === owner && m.local);
    if (i < 0) return;
    const m = this.missiles[i]!;
    const at: Vec3 = [m.local!.p[0], m.local!.p[1], m.local!.p[2]];
    this.endLocal(i, at);
  }

  /** Ours: fly it locally from launch. */
  launchLocal(owner: string, rid: number, origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.add(owner, rid, launchMissile([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z]), null);
  }

  /** Theirs: start from the launch message, then follow server updates. */
  launchRemote(owner: string, rid: number, origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.add(owner, rid, null, { p: origin.clone(), v: dir.clone().normalize().multiplyScalar(MISSILE.launchSpeed), at: performance.now() });
  }

  /** Server position update for someone else's missile. */
  track(owner: string, rid: number, p: readonly [number, number, number], v: readonly [number, number, number]): void {
    const m = this.missiles.find((x) => x.owner === owner && x.rid === rid);
    if (!m || !m.remote) return;
    m.remote.p.set(p[0], p[1], p[2]);
    m.remote.v.set(v[0], v[1], v[2]);
    m.remote.at = performance.now();
  }

  /** The server says this missile exploded here (proximity, geometry, or burnout). */
  detonate(owner: string, rid: number, at: readonly [number, number, number]): void {
    const i = this.missiles.findIndex((r) => r.owner === owner && r.rid === rid);
    if (i >= 0) this.remove(i);
    else if (this.recent.includes(`${owner}:${rid}`)) return; // we already drew it
    this.explode(this.pos.set(at[0], at[1], at[2]));
  }

  /** Advance: ours from the pilot's sticks (null = centered), theirs by extrapolation. */
  update(dt: number, input: MissileInput | null): void {
    const now = performance.now();
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      if (m.local) {
        this.from[0] = m.local.p[0];
        this.from[1] = m.local.p[1];
        this.from[2] = m.local.p[2];
        const alive = stepMissile(m.local, input, dt);
        const [bx, by, bz] = m.local.p;
        // Same impact rule as the server: geometry, or the proximity fuse.
        const impact = missileImpact(this.from, m.local.p, this.colliders(), this.fuseTargets());
        if (impact !== null || !alive) {
          const f = impact ?? 1;
          const at: Vec3 = [this.from[0] + (bx - this.from[0]) * f, this.from[1] + (by - this.from[1]) * f, this.from[2] + (bz - this.from[2]) * f];
          this.endLocal(i, at);
          continue;
        }
        // We're riding it (the camera is inside), so it isn't drawn.
        m.mesh.visible = false;
        m.mesh.position.set(bx, by, bz);
        this.look.set(m.local.v[0], m.local.v[1], m.local.v[2]);
      } else if (m.remote) {
        const age = now - m.remote.at;
        if (age > REMOTE_TIMEOUT_MS) {
          this.remove(i);
          continue;
        }
        m.mesh.position.copy(m.remote.p).addScaledVector(m.remote.v, age / 1000);
        this.look.copy(m.remote.v);
      }
      if (this.look.lengthSq() > 1e-6) m.mesh.quaternion.setFromUnitVectors(FORWARD, this.look.normalize());
      if (now - m.lastPuff > 22) {
        m.lastPuff = now;
        // A little behind the missile, so the camera riding ours isn't inside the puff.
        const p = this.pos.copy(m.mesh.position).addScaledVector(this.look, -2.5);
        this.particles.emit(p.x, p.y, p.z, { startSize: 0.35, endSize: 1.8, lifeMs: 1100, color: '#cfd2d4', alpha: 0.7, vy: 0.6 });
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      const age = (now - f.born) / 260;
      if (age >= 1) {
        this.scene.remove(f.sprite);
        this.flashes.splice(i, 1);
        continue;
      }
      f.sprite.scale.setScalar((4 + age * 10) * f.size);
      f.sprite.material.opacity = 1 - age;
    }
  }

  /** Our missile ends: draw the blast now, remember it so the server's `boom` isn't drawn twice, report it. */
  private endLocal(i: number, at: Vec3): void {
    const m = this.missiles[i]!;
    this.remember(m);
    this.remove(i);
    this.explode(this.pos.set(at[0], at[1], at[2]));
    this.onLocalEnd?.(m.rid, at);
  }

  private add(owner: string, rid: number, local: MissileState | null, remote: FlyingMissile['remote']): void {
    const mesh = this.pool.pop() ?? new THREE.Mesh(this.geo, this.mat);
    mesh.visible = true;
    this.scene.add(mesh);
    this.missiles.push({ owner, rid, local, remote, lastPuff: 0, mesh });
  }

  private remember(m: FlyingMissile): void {
    this.recent.push(`${m.owner}:${m.rid}`);
    if (this.recent.length > RECENT) this.recent.shift();
  }

  private remove(i: number): void {
    const r = this.missiles[i]!;
    this.scene.remove(r.mesh);
    this.pool.push(r.mesh);
    this.missiles.splice(i, 1);
  }

  /** Draw an explosion without the explosion callback (e.g. a practice bot blowing up). */
  effect(at: THREE.Vector3, size = 1): void {
    this.drawExplosion(at, size);
  }

  private explode(at: THREE.Vector3): void {
    this.drawExplosion(at);
    this.onExplode(at);
  }

  private drawExplosion(at: THREE.Vector3, size = 1): void {
    const sprite = new THREE.Sprite(this.flashMat.clone());
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.flashes.push({ sprite, born: performance.now(), size });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = (2 + Math.random() * 4) * size;
      this.particles.emit(at.x, at.y, at.z, {
        startSize: 0.8 * size,
        endSize: (3 + Math.random() * 2.5) * size,
        lifeMs: 1400 + Math.random() * 900,
        color: i < 4 ? '#6b6258' : '#9a958e',
        alpha: 0.85,
        vx: Math.cos(a) * Math.cos(e) * s,
        vy: Math.sin(e) * s + 0.8,
        vz: Math.sin(a) * Math.cos(e) * s,
      });
    }
  }
}

const FORWARD = new THREE.Vector3(0, 0, -1);

/**
 * Grenades (ADR-0034): ours predicted with the shared physics from launch (bounces, rolling), theirs drawn
 * from the server's ~20/s positions. The server decides where each one really goes off (`boom`).
 */
interface LiveGrenade {
  owner: string;
  rid: number;
  /** Ours: predicted locally. */
  local: GrenadeState | null;
  /** Theirs: where the server last put it, and when. */
  remote: { p: THREE.Vector3; prev: THREE.Vector3; at: number } | null;
  born: number;
  mesh: THREE.Group;
  lastPuff: number;
}

export class Grenades {
  private readonly live: LiveGrenade[] = [];
  /** Ours that already went off locally, so the server's boom doesn't draw a second blast. */
  private readonly recent: string[] = [];
  private readonly shell = new THREE.MeshStandardMaterial({ color: '#3c4a2c', roughness: 0.55, metalness: 0.3 });
  private readonly band = new THREE.MeshStandardMaterial({ color: '#ff6a13', roughness: 0.4 });
  private readonly light = new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false });
  private readonly pos = new THREE.Vector3();
  /** A bounce worth a clink (ours, predicted). */
  onBounce: ((at: THREE.Vector3) => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly particles: Particles,
    private readonly colliders: () => readonly BoxCollider[],
    /** Draws the blast; `big` sized for a grenade. */
    private readonly onExplode: (at: THREE.Vector3) => void,
  ) {}

  /** How many of `owner`'s grenades are out. */
  out(owner: string): number {
    return this.live.filter((g) => g.owner === owner).length;
  }

  /** Our launch: predict it from the same start the server uses. */
  launchLocal(owner: string, rid: number, origin: THREE.Vector3, dir: THREE.Vector3, carrier: THREE.Vector3): void {
    this.add(owner, rid, launchGrenade([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], [carrier.x, carrier.y, carrier.z]), null);
  }

  /** Someone else's launch: shown from the server's updates. */
  launchRemote(owner: string, rid: number, origin: THREE.Vector3): void {
    this.add(owner, rid, null, { p: origin.clone(), prev: origin.clone(), at: performance.now() });
  }

  track(owner: string, rid: number, p: readonly [number, number, number]): void {
    const g = this.live.find((x) => x.owner === owner && x.rid === rid);
    if (!g?.remote) return;
    g.remote.prev.copy(g.mesh.position);
    g.remote.p.set(p[0], p[1], p[2]);
    g.remote.at = performance.now();
  }

  /** Our grenades, to set off (Fire pressed again). Returns where each predicted one is. */
  ours(owner: string): { rid: number; p: [number, number, number] }[] {
    return this.live.filter((g) => g.owner === owner && g.local).map((g) => ({ rid: g.rid, p: [g.local!.p[0], g.local!.p[1], g.local!.p[2]] }));
  }

  /** Blow one of ours up right now (the server's boom follows, and isn't drawn twice). */
  detonateLocal(owner: string, rid: number): void {
    const i = this.live.findIndex((g) => g.owner === owner && g.rid === rid);
    if (i < 0) return;
    this.recent.push(`${owner}:${rid}`);
    if (this.recent.length > 16) this.recent.shift();
    this.pos.copy(this.live[i]!.mesh.position);
    this.remove(i);
    this.onExplode(this.pos);
  }

  /** The server says this grenade went off here. */
  detonate(owner: string, rid: number, at: readonly [number, number, number]): void {
    const i = this.live.findIndex((g) => g.owner === owner && g.rid === rid);
    if (i >= 0) this.remove(i);
    else if (this.recent.includes(`${owner}:${rid}`)) return;
    this.onExplode(this.pos.set(at[0], at[1], at[2]));
  }

  update(dt: number): void {
    const now = performance.now();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i]!;
      const m = g.mesh;
      if (g.local) {
        const { bounces } = stepGrenade(g.local, this.colliders(), dt);
        m.position.set(g.local.p[0], g.local.p[1], g.local.p[2]);
        if (bounces > 0) this.onBounce?.(m.position);
        // Tumble while it flies.
        if (!g.local.resting) m.rotation.x += dt * 9;
      } else if (g.remote) {
        // Ease from where it was drawn toward the latest server position over one update interval.
        const k = Math.min(1, (now - g.remote.at) / 50);
        m.position.lerpVectors(g.remote.prev, g.remote.p, k);
        if (now - g.remote.at > 1500) {
          this.remove(i);
          continue;
        }
      }
      // The light blinks faster as the fuse runs down.
      const left = Math.max(0.05, 1 - (now - g.born) / (GRENADE.fuseSeconds * 1000));
      const lamp = m.children[2];
      if (lamp) lamp.visible = Math.sin((now / 1000) * (6 / left)) > 0;
      if (now - g.lastPuff > 45 && !(g.local?.resting ?? false)) {
        g.lastPuff = now;
        this.particles.emit(m.position.x, m.position.y, m.position.z, { startSize: 0.25, endSize: 1.2, lifeMs: 700, color: '#bdbab3', alpha: 0.55, vy: 0.4 });
      }
    }
  }

  private add(owner: string, rid: number, local: GrenadeState | null, remote: LiveGrenade['remote']): void {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10).scale(1, 1, 1.35), this.shell);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 16), this.band);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), this.light);
    lamp.position.z = -0.66;
    mesh.add(body, ring, lamp);
    mesh.traverse((o) => (o.castShadow = true));
    const p = local ? local.p : [remote!.p.x, remote!.p.y, remote!.p.z];
    mesh.position.set(p[0]!, p[1]!, p[2]!);
    this.scene.add(mesh);
    this.live.push({ owner, rid, local, remote, born: performance.now(), mesh, lastPuff: 0 });
  }

  private remove(i: number): void {
    this.scene.remove(this.live[i]!.mesh);
    this.live.splice(i, 1);
  }
}
