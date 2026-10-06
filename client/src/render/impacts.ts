import * as THREE from 'three/webgpu';
import { buildColliders, type BoxCollider } from '../../../shared/raycast';
import type { ArenaMaterial, MapDef } from '../../../shared/maps';
import type { Particles } from './particles';

/**
 * Bullet impacts: a little splash where a round that missed hits the world, matched to what it hit, so
 * the ground kicks up dirt only where there is dirt (a sidewalk chips and dusts, steel sparks, glass glints).
 * Visual only; the server decides hits.
 */
export type Surface = 'dirt' | 'asphalt' | 'concrete' | 'brick' | 'metal' | 'glass' | 'foliage' | 'painted' | 'stone' | 'none';

const SURFACE_OF: Record<ArenaMaterial, Surface> = {
  orange: 'metal',
  steel: 'metal',
  concrete: 'concrete',
  white: 'painted',
  pad: 'concrete',
  facade: 'concrete',
  glass: 'glass',
  brick: 'brick',
  roof: 'concrete',
  sidewalk: 'concrete',
  foliage: 'foliage',
  paint: 'painted',
  gridRed: 'painted',
  gridBlue: 'painted',
  gridYellow: 'painted',
  gridGreen: 'painted',
  gridPurple: 'painted',
  gridOrange: 'painted',
  gridWhite: 'painted',
  gridSand: 'dirt',
  rock: 'stone',
  crystal: 'glass',
  invisible: 'none',
};

/** Chip and dust colors per painted material. */
const PAINT_COLOR: Partial<Record<ArenaMaterial, string>> = {
  white: '#e8e6e0',
  paint: '#d9d4c8',
  gridRed: '#e0473c',
  gridBlue: '#3c78e0',
  gridYellow: '#f2c230',
  gridGreen: '#3fae5a',
  gridPurple: '#8a5ad6',
  gridOrange: '#ff7a2a',
  gridWhite: '#f2f2f2',
};

/** The map's open ground, by its type: Downtown is asphalt, the Yard concrete, the Playground a grassy park (dirt). */
const GROUND: Record<MapDef['ground'], Surface> = { asphalt: 'asphalt', concrete: 'concrete', grid: 'dirt', rock: 'stone' };

export interface SurfaceHit {
  surface: Surface;
  /** Outward surface normal (world). */
  normal: THREE.Vector3;
  /** Paint color for painted surfaces. */
  color: string | null;
}

/** Points slightly outside a box still count as on it (rounds stop at the surface). */
const EPS = 0.06;

export class SurfaceLookup {
  private colliders: BoxCollider[] = [];
  private mats: ArenaMaterial[] = [];
  private ground: Surface = 'concrete';
  private readonly hit: SurfaceHit = { surface: 'none', normal: new THREE.Vector3(), color: null };

  setMap(map: MapDef): void {
    this.colliders = buildColliders(map.boxes);
    this.mats = map.boxes.map((b) => b.mat);
    this.ground = GROUND[map.ground];
  }

  /** What's at a round's stopping point, and which way it faces. */
  at(p: THREE.Vector3): SurfaceHit {
    const h = this.hit;
    h.color = null;
    let best = Infinity;
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i]!;
      const px = p.x - b.cx;
      const py = p.y - b.cy;
      const pz = p.z - b.cz;
      if (px * px + py * py + pz * pz > (b.radius + EPS) ** 2) continue;
      const m = b.m;
      // Into box-local space: local = R^T * (world - center).
      const lx = m[0]! * px + m[3]! * py + m[6]! * pz;
      const ly = m[1]! * px + m[4]! * py + m[7]! * pz;
      const lz = m[2]! * px + m[5]! * py + m[8]! * pz;
      const gx = b.hx - Math.abs(lx);
      const gy = b.hy - Math.abs(ly);
      const gz = b.hz - Math.abs(lz);
      if (gx < -EPS || gy < -EPS || gz < -EPS) continue;
      // The face it's on: the one it's closest to.
      const face = Math.min(gx, gy, gz);
      if (face >= best) continue;
      best = face;
      const mat = this.mats[i]!;
      h.surface = SURFACE_OF[mat];
      h.color = PAINT_COLOR[mat] ?? null;
      const axis = face === gx ? 0 : face === gy ? 1 : 2;
      const sign = Math.sign(axis === 0 ? lx : axis === 1 ? ly : lz) || 1;
      // Local axis k in world space is column k of R.
      h.normal.set(m[axis]! * sign, m[3 + axis]! * sign, m[6 + axis]! * sign);
    }
    if (best === Infinity) {
      // Nothing solid but the open ground (or the air at max range, which never calls this).
      h.surface = p.y < 0.2 ? this.ground : 'none';
      h.normal.set(0, 1, 0);
    }
    return h;
  }
}

interface Look {
  /** Bits thrown off the surface: count, colors, size (m), speed (m/s), life (ms). */
  bits: number;
  bitColors: readonly string[];
  bitSize: number;
  bitSpeed: number;
  bitMs: number;
  /** A dust cloud: color, size at death (m), life (ms), opacity; null for none. */
  dust: { color: string; size: number; ms: number; alpha: number } | null;
}

/** How each surface splashes. */
const LOOKS: Record<Exclude<Surface, 'none' | 'painted'>, Look> = {
  dirt: { bits: 6, bitColors: ['#6b4f32', '#8a6a45', '#5a4128'], bitSize: 0.1, bitSpeed: 4.5, bitMs: 520, dust: { color: '#8f7656', size: 1, ms: 800, alpha: 0.6 } },
  asphalt: { bits: 4, bitColors: ['#2f2f2f', '#474543'], bitSize: 0.06, bitSpeed: 3.5, bitMs: 320, dust: { color: '#6f6b66', size: 0.6, ms: 550, alpha: 0.5 } },
  concrete: { bits: 3, bitColors: ['#cfcac0', '#b8b2a7'], bitSize: 0.05, bitSpeed: 3, bitMs: 300, dust: { color: '#d8d3ca', size: 0.5, ms: 500, alpha: 0.45 } },
  brick: { bits: 3, bitColors: ['#9c4a32', '#b0614a'], bitSize: 0.05, bitSpeed: 3, bitMs: 300, dust: { color: '#b07a62', size: 0.5, ms: 500, alpha: 0.45 } },
  metal: { bits: 4, bitColors: ['#ffd27a', '#fff1c4'], bitSize: 0.04, bitSpeed: 6, bitMs: 160, dust: null },
  glass: { bits: 3, bitColors: ['#eaf6ff', '#ffffff'], bitSize: 0.04, bitSpeed: 3, bitMs: 220, dust: null },
  stone: { bits: 4, bitColors: ['#7a6e63', '#5c5249', '#9a8e80'], bitSize: 0.07, bitSpeed: 3.5, bitMs: 380, dust: { color: '#8c8075', size: 0.6, ms: 600, alpha: 0.5 } },
  foliage: { bits: 4, bitColors: ['#4f8a3a', '#6aa84f'], bitSize: 0.07, bitSpeed: 2.5, bitMs: 500, dust: null },
};

/** Throw the splash for a round that stopped at `at`. */
export function emitImpact(particles: Particles, at: THREE.Vector3, hit: SurfaceHit): void {
  if (hit.surface === 'none') return;
  const look: Look =
    hit.surface === 'painted'
      ? { ...LOOKS.concrete, bitColors: [hit.color ?? '#d9d4c8'], dust: { color: hit.color ?? '#d9d4c8', size: 0.4, ms: 420, alpha: 0.4 } }
      : LOOKS[hit.surface];
  const n = hit.normal;
  for (let k = 0; k < look.bits; k++) {
    // Mostly away from the surface, scattered.
    const sp = look.bitSpeed * (0.5 + Math.random() * 0.7);
    const vx = n.x * sp + (Math.random() - 0.5) * sp;
    const vy = n.y * sp + (Math.random() - 0.5) * sp * 0.6;
    const vz = n.z * sp + (Math.random() - 0.5) * sp;
    const color = look.bitColors[k % look.bitColors.length]!;
    particles.emit(at.x, at.y, at.z, { startSize: look.bitSize, endSize: look.bitSize * 0.6, lifeMs: look.bitMs, color, alpha: 1, vx, vy, vz });
  }
  if (look.dust) {
    const d = look.dust;
    particles.emit(at.x + n.x * 0.05, at.y + n.y * 0.05, at.z + n.z * 0.05, { startSize: d.size * 0.2, endSize: d.size, lifeMs: d.ms, color: d.color, alpha: d.alpha, vx: n.x * 0.6, vy: n.y * 0.6 + 0.3, vz: n.z * 0.6 });
  }
}
