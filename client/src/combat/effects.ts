import * as THREE from 'three/webgpu';
import { SMOKE, smokeRadius } from '../../../shared/abilities';
import { launchMissile, MISSILE, missileImpact, stepMissile, type AimRay, type MissileState, type Vec3 } from '../../../shared/missile';
import type { BoxCollider } from '../../../shared/raycast';
import type { Particles } from '../render/particles';

/**
 * Visuals for the class specials (ADR-0016): smoke clouds (which also decide concealment),
 * guided missiles with smoke trails, and explosions. The server decides damage; these only show it.
 */

interface Cloud {
  x: number;
  y: number;
  z: number;
  born: number;
}

export class SmokeClouds {
  private readonly clouds: Cloud[] = [];

  constructor(private readonly particles: Particles) {}

  deploy(p: THREE.Vector3 | readonly [number, number, number]): void {
    const [x, y, z] = Array.isArray(p) ? p : [(p as THREE.Vector3).x, (p as THREE.Vector3).y, (p as THREE.Vector3).z];
    this.clouds.push({ x, y, z, born: performance.now() });
    // A thick cluster of big, slow puffs that swell to the cloud's full size.
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * SMOKE.maxRadius * 0.55;
      const h = (Math.random() - 0.4) * SMOKE.maxRadius * 0.6;
      this.particles.emit(x + Math.cos(a) * r * 0.3, y + h * 0.3, z + Math.sin(a) * r * 0.3, {
        startSize: SMOKE.startRadius,
        endSize: SMOKE.maxRadius * (0.55 + Math.random() * 0.3),
        lifeMs: SMOKE.durationMs * (0.85 + Math.random() * 0.15),
        color: i % 3 === 0 ? '#d8dcde' : '#b9bec2',
        alpha: 0.92,
        vx: Math.cos(a) * r * 0.6,
        vy: 0.4 + h * 0.2,
        vz: Math.sin(a) * r * 0.6,
      });
    }
  }

  /** True if any cloud hides `target` from `eye`: target inside a cloud, or the line of sight crosses one. */
  conceals(eye: THREE.Vector3, target: THREE.Vector3): boolean {
    const now = performance.now();
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]!;
      const radius = smokeRadius(now - c.born);
      if (radius === 0) {
        if (now - c.born > SMOKE.durationMs) this.clouds.splice(i, 1);
        continue;
      }
      // Distance from the cloud center to the segment eye -> target.
      const dx = target.x - eye.x;
      const dy = target.y - eye.y;
      const dz = target.z - eye.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((c.x - eye.x) * dx + (c.y - eye.y) * dy + (c.z - eye.z) * dz) / len2)) : 0;
      const d = Math.hypot(eye.x + dx * t - c.x, eye.y + dy * t - c.y, eye.z + dz * t - c.z);
      if (d < radius * 0.85) return true;
    }
    return false;
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
 * Guided missiles (ADR-0016): ours predicted locally with shared physics (steering feels instant),
 * theirs drawn from the server's ~20/s updates. The server decides the real explosion (`boom`).
 */
export class Missiles {
  /** Extra things our missiles' proximity fuse reacts to locally (practice bots, ADR-0017). */
  fuseTargets: () => readonly THREE.Vector3[] = () => [];
  private readonly missiles: FlyingMissile[] = [];
  private readonly pool: THREE.Mesh[] = [];
  private readonly flashes: { sprite: THREE.Sprite; born: number }[] = [];
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

  /** Ours: fly it locally from launch. */
  launchLocal(owner: string, rid: number, origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.add(owner, rid, launchMissile([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z]), null);
  }

  /** Theirs: start from the launch message, then follow server updates. */
  launchRemote(owner: string, rid: number, origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.add(owner, rid, null, { p: origin.clone(), v: dir.clone().normalize().multiplyScalar(MISSILE.speed), at: performance.now() });
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

  /** Advance: our missiles with our live aim (null = no guidance), theirs by extrapolation. */
  update(dt: number, ourAim: AimRay | null): void {
    const now = performance.now();
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      if (m.local) {
        this.from[0] = m.local.p[0];
        this.from[1] = m.local.p[1];
        this.from[2] = m.local.p[2];
        const alive = stepMissile(m.local, ourAim, dt);
        const [bx, by, bz] = m.local.p;
        // Same impact rule as the server: geometry, or the proximity fuse on practice targets.
        const impact = missileImpact(this.from, m.local.p, this.colliders(), this.fuseTargets());
        if (impact !== null || !alive) {
          // Predicted impact: draw it now; the server's damage follows.
          this.pos.set(this.from[0], this.from[1], this.from[2]).lerp(this.look.set(bx, by, bz), impact ?? 1);
          this.remember(m);
          this.remove(i);
          this.explode(this.pos);
          continue;
        }
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
        const p = m.mesh.position;
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
      f.sprite.scale.setScalar(4 + age * 10);
      f.sprite.material.opacity = 1 - age;
    }
  }

  private add(owner: string, rid: number, local: MissileState | null, remote: FlyingMissile['remote']): void {
    const mesh = this.pool.pop() ?? new THREE.Mesh(this.geo, this.mat);
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
  effect(at: THREE.Vector3): void {
    this.drawExplosion(at);
  }

  private explode(at: THREE.Vector3): void {
    this.drawExplosion(at);
    this.onExplode(at);
  }

  private drawExplosion(at: THREE.Vector3): void {
    const sprite = new THREE.Sprite(this.flashMat.clone());
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.flashes.push({ sprite, born: performance.now() });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = 2 + Math.random() * 4;
      this.particles.emit(at.x, at.y, at.z, {
        startSize: 0.8,
        endSize: 3 + Math.random() * 2.5,
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
