import * as THREE from 'three/webgpu';

/**
 * Soft billboard particles for smoke clouds, rocket trails and explosion smoke (ADR-0016).
 * Every particle is a camera-facing quad in ONE dynamic mesh (one draw call, Hard rule 2), with
 * per-vertex alpha for fading. A fixed-size ring: when full, the oldest particle is reused.
 */

const CAPACITY = 900;
/** Quad corners (x, y pairs), shared so the per-frame loop doesn't allocate. */
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1] as const;

export interface ParticleSpec {
  /** Radius at birth and at death (m). */
  startSize: number;
  endSize: number;
  lifeMs: number;
  color: string;
  /** Peak opacity. */
  alpha: number;
  /** Drift velocity (m/s). */
  vx?: number;
  vy?: number;
  vz?: number;
}

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
  life: number;
  start: number;
  end: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

function puffTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Particles {
  private readonly pool: Particle[] = [];
  private next = 0;
  private readonly positions = new Float32Array(CAPACITY * 4 * 3);
  private readonly colors = new Float32Array(CAPACITY * 4 * 4);
  private readonly geo = new THREE.BufferGeometry();
  private readonly color = new THREE.Color();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: 0, life: 1, start: 1, end: 1, r: 1, g: 1, b: 1, alpha: 0 });
    }
    const uvs = new Float32Array(CAPACITY * 4 * 2);
    const index: number[] = [];
    for (let i = 0; i < CAPACITY; i++) {
      uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      const v = i * 4;
      index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geo.setIndex(index);
    const mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({ map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: true }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);
  }

  emit(x: number, y: number, z: number, spec: ParticleSpec): void {
    const p = this.pool[this.next]!;
    this.next = (this.next + 1) % CAPACITY;
    this.color.set(spec.color);
    Object.assign(p, {
      alive: true,
      x,
      y,
      z,
      vx: spec.vx ?? 0,
      vy: spec.vy ?? 0,
      vz: spec.vz ?? 0,
      born: performance.now(),
      life: spec.lifeMs,
      start: spec.startSize,
      end: spec.endSize,
      r: this.color.r,
      g: this.color.g,
      b: this.color.b,
      alpha: spec.alpha,
    });
  }

  update(camera: THREE.Camera, dt: number): void {
    const now = performance.now();
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const R = this.right;
    const U = this.up;
    for (let i = 0; i < CAPACITY; i++) {
      const p = this.pool[i]!;
      const o = i * 12;
      const c = i * 16;
      const age = (now - p.born) / p.life;
      if (!p.alive || age >= 1) {
        p.alive = false;
        this.colors.fill(0, c, c + 16);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.start + (p.end - p.start) * Math.sqrt(age);
      // Quick fade-in, long fade-out.
      const a = p.alpha * Math.min(1, age * 8) * (1 - age) * (1 - age);
      for (let k = 0; k < 4; k++) {
        const cx = CORNERS[k * 2]!;
        const cy = CORNERS[k * 2 + 1]!;
        this.positions[o + k * 3] = p.x + (R.x * cx + U.x * cy) * s;
        this.positions[o + k * 3 + 1] = p.y + (R.y * cx + U.y * cy) * s;
        this.positions[o + k * 3 + 2] = p.z + (R.z * cx + U.z * cy) * s;
        this.colors[c + k * 4] = p.r;
        this.colors[c + k * 4 + 1] = p.g;
        this.colors[c + k * 4 + 2] = p.b;
        this.colors[c + k * 4 + 3] = a;
      }
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
  }
}
