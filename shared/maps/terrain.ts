// Rolling ground (ADR-0059): a height grid shared by the renderer, the physics floor and the server's ray checks,
// so all three agree on where the ground is. Heights sit on a square grid of `step` metres over the map; each
// cell is two triangles split along the diagonal from its (x0, z0) corner to its (x1, z1) corner, and every
// lookup here interpolates on those same triangles. Outside the map the ground is the flat plane y = 0.

import { inHole, type GroundHole } from './ground.js';

/** What covers a terrain cell: paved (the map's ground), grass or sand. */
export const SURFACE = { paved: 0, grass: 1, sand: 2 } as const;
export type SurfaceCode = (typeof SURFACE)[keyof typeof SURFACE];

export interface Terrain {
  /** Grid spacing (m); vertices at -half + i·step for i = 0..n. */
  step: number;
  half: number;
  n: number;
  /** Heights at the (n+1)² vertices, row by row along z: heights[j·(n+1) + i]. */
  heights: Float32Array;
  /** What covers each of the n² cells: cells[j·n + i]. */
  surface: Uint8Array;
  /** Highest vertex, for skipping rays that stay above everything. */
  maxHeight: number;
}

/** A terrain sampled from `height(x, z)` (which should be 0 at the map's edge, to meet the plane outside). */
export function makeTerrain(half: number, step: number, height: (x: number, z: number) => number): Terrain {
  const n = Math.round((half * 2) / step);
  const heights = new Float32Array((n + 1) * (n + 1));
  let maxHeight = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const h = height(-half + i * step, -half + j * step);
      heights[j * (n + 1) + i] = h;
      maxHeight = Math.max(maxHeight, h);
    }
  }
  return { step, half, n, heights, surface: new Uint8Array(n * n), maxHeight };
}

/** Cell indices and position within the cell (0..1 each way), or null outside the grid. */
function locate(t: Terrain, x: number, z: number): { i: number; j: number; u: number; v: number } | null {
  const gx = (x + t.half) / t.step;
  const gz = (z + t.half) / t.step;
  if (gx < 0 || gz < 0 || gx > t.n || gz > t.n) return null;
  const i = Math.min(t.n - 1, Math.floor(gx));
  const j = Math.min(t.n - 1, Math.floor(gz));
  return { i, j, u: gx - i, v: gz - j };
}

/** Ground height at (x, z): the terrain inside the map, 0 outside it. */
export function terrainHeight(t: Terrain | undefined, x: number, z: number): number {
  if (!t) return 0;
  const c = locate(t, x, z);
  if (!c) return 0;
  const w = t.n + 1;
  const h00 = t.heights[c.j * w + c.i]!;
  const h10 = t.heights[c.j * w + c.i + 1]!;
  const h01 = t.heights[(c.j + 1) * w + c.i]!;
  const h11 = t.heights[(c.j + 1) * w + c.i + 1]!;
  return c.u >= c.v ? h00 + (h10 - h00) * c.u + (h11 - h10) * c.v : h00 + (h11 - h01) * c.u + (h01 - h00) * c.v;
}

/** Upward unit normal of the ground at (x, z). */
export function terrainNormal(t: Terrain | undefined, x: number, z: number): [number, number, number] {
  if (!t) return [0, 1, 0];
  const c = locate(t, x, z);
  if (!c) return [0, 1, 0];
  const w = t.n + 1;
  const h00 = t.heights[c.j * w + c.i]!;
  const h10 = t.heights[c.j * w + c.i + 1]!;
  const h01 = t.heights[(c.j + 1) * w + c.i]!;
  const h11 = t.heights[(c.j + 1) * w + c.i + 1]!;
  const [sx, sz] = c.u >= c.v ? [h10 - h00, h11 - h10] : [h11 - h01, h01 - h00];
  const nx = -sx / t.step;
  const nz = -sz / t.step;
  const len = Math.hypot(nx, 1, nz);
  return [nx / len, 1 / len, nz / len];
}

/** What covers the ground at (x, z); paved outside the map. */
export function terrainSurface(t: Terrain | undefined, x: number, z: number): SurfaceCode {
  if (!t) return SURFACE.paved;
  const c = locate(t, x, z);
  return c ? (t.surface[c.j * t.n + c.i] as SurfaceCode) : SURFACE.paved;
}

/** Lowest ground under a footprint (its corners and centre), for foundations. */
export function terrainMin(t: Terrain | undefined, points: readonly (readonly [number, number])[]): number {
  let m = Infinity;
  for (const [x, z] of points) m = Math.min(m, terrainHeight(t, x, z));
  return m;
}

/** Steepest the ground ever gets (rise per metre), for safe ray-marching steps. */
const MAX_SLOPE = 0.6;

/**
 * Where a ray first meets the ground (terrain inside the map, the plane outside; holes fall through), and the
 * ground's normal there. Null if it never does within `maxDist`, or if it starts below the ground.
 */
export function groundRay(
  t: Terrain | undefined,
  holes: readonly GroundHole[] | undefined,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): { dist: number; nx: number; ny: number; nz: number } | null {
  if (!t) {
    // Flat ground: the plane y = 0.
    if (dy >= 0 || oy < 0) return null;
    const d = -oy / dy;
    if (d > maxDist || (holes && inHole(holes, ox + dx * d, oz + dz * d))) return null;
    return { dist: d, nx: 0, ny: 1, nz: 0 };
  }
  const groundAt = (x: number, z: number) => (holes && inHole(holes, x, z) ? -Infinity : terrainHeight(t, x, z));
  const above = (s: number) => oy + dy * s - groundAt(ox + dx * s, oz + dz * s);
  if (above(0) < 0) return null;
  // Skip straight to where the ray could first reach the highest ground, and stop once it can't come back up.
  let s = 0;
  if (oy > t.maxHeight) {
    if (dy >= 0) return null;
    s = (oy - t.maxHeight) / -dy;
  }
  // Ground is never below y = 0 (holes fall through), so a descending ray is done once it's below that.
  let end = maxDist;
  if (dy < 0) end = Math.min(end, oy / -dy + 0.01);
  let prev = s;
  let fPrev = above(s);
  while (s < end) {
    // A step no longer than the gap to the ground allows (it can't rise faster than MAX_SLOPE).
    // (Over a hole the gap is infinite; cap it. The ground near holes is flat.)
    const gap = Math.min(fPrev, 20);
    s = Math.min(end, s + Math.max(0.4, gap / (MAX_SLOPE + Math.abs(dy) + 1e-3)));
    const f = above(s);
    if (f <= 0) {
      // Bisect between the last point above and this one below.
      let lo = prev;
      let hi = s;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      const x = ox + dx * hi;
      const z = oz + dz * hi;
      const [nx, ny, nz] = terrainNormal(t, x, z);
      return { dist: hi, nx, ny, nz };
    }
    prev = s;
    fPrev = f;
  }
  return null;
}

/**
 * The terrain's triangles, exactly as every lookup above interpolates them, minus the cells inside holes:
 * vertex positions (x, y, z), all indices (wound so faces point up), and the indices split by surface.
 */
export function terrainTriangles(t: Terrain, holes: readonly GroundHole[] = []): { positions: Float32Array; indices: Uint32Array; bySurface: Uint32Array[] } {
  const w = t.n + 1;
  const positions = new Float32Array(w * w * 3);
  for (let j = 0; j <= t.n; j++) {
    for (let i = 0; i <= t.n; i++) {
      const k = j * w + i;
      positions[k * 3] = -t.half + i * t.step;
      positions[k * 3 + 1] = t.heights[k]!;
      positions[k * 3 + 2] = -t.half + j * t.step;
    }
  }
  const all: number[] = [];
  const by: number[][] = [[], [], []];
  for (let j = 0; j < t.n; j++) {
    for (let i = 0; i < t.n; i++) {
      if (holes.length && inHole(holes, -t.half + (i + 0.5) * t.step, -t.half + (j + 0.5) * t.step)) continue;
      const a = j * w + i;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      // Two triangles split along a–d, both facing up: (a, d, b) and (a, c, d).
      const tri = [a, d, b, a, c, d];
      all.push(...tri);
      by[t.surface[j * t.n + i] ?? 0]!.push(...tri);
    }
  }
  return { positions, indices: Uint32Array.from(all), bySurface: by.map((x) => Uint32Array.from(x)) };
}
