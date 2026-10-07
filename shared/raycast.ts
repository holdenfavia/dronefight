import type { ArenaBox } from './maps/types.js';

/**
 * Ray tests against the arena, with no rendering library, so the server can use it too.
 * Boxes are oriented (Euler XYZ degrees, same convention as Three.js).
 */

export interface BoxCollider {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  /** Rotation matrix, row-major: world = R * local. */
  m: number[];
  /** Bounding sphere radius for a cheap early-out. */
  radius: number;
}

const DEG = Math.PI / 180;

/** Same matrix Three.js builds for Euler order 'XYZ'. */
export function eulerXYZMatrix(xDeg: number, yDeg: number, zDeg: number): number[] {
  const a = Math.cos(xDeg * DEG);
  const b = Math.sin(xDeg * DEG);
  const c = Math.cos(yDeg * DEG);
  const d = Math.sin(yDeg * DEG);
  const e = Math.cos(zDeg * DEG);
  const f = Math.sin(zDeg * DEG);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

export function buildColliders(boxes: readonly ArenaBox[]): BoxCollider[] {
  const list = boxes.map((box) => {
    const [hx, hy, hz] = [box.size[0] / 2, box.size[1] / 2, box.size[2] / 2];
    const rot = box.rot ?? [0, 0, 0];
    return {
      cx: box.pos[0],
      cy: box.pos[1],
      cz: box.pos[2],
      hx,
      hy,
      hz,
      m: eulerXYZMatrix(rot[0], rot[1], rot[2]),
      radius: Math.hypot(hx, hy, hz),
    };
  });
  // A spatial grid for big maps, so a ray only tests what's near its path (ADR-0053).
  if (list.length > GRID_MIN) Object.defineProperty(list, GRID_KEY, { value: buildGrid(list), enumerable: false });
  return list;
}

/**
 * Spatial grid (ADR-0053): colliders bucketed into square columns on the ground plane (each collider in every
 * column its bounding sphere touches). A ray walks the columns it crosses, nearest first, and stops once the
 * next column starts beyond the closest hit so far.
 */
interface Grid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  cells: number[][];
  /** Per collider: the query that last tested it, so a collider in several columns is tested once. */
  stamp: Uint32Array;
  query: number;
}

const GRID_CELL = 16;
const GRID_MIN = 64;
const GRID_KEY = '__grid';

function buildGrid(list: readonly BoxCollider[]): Grid {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.cx - b.radius);
    maxX = Math.max(maxX, b.cx + b.radius);
    minZ = Math.min(minZ, b.cz - b.radius);
    maxZ = Math.max(maxZ, b.cz + b.radius);
  }
  const nx = Math.max(1, Math.ceil((maxX - minX) / GRID_CELL));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / GRID_CELL));
  const cells: number[][] = Array.from({ length: nx * nz }, () => []);
  list.forEach((b, i) => {
    const i0 = Math.max(0, Math.floor((b.cx - b.radius - minX) / GRID_CELL));
    const i1 = Math.min(nx - 1, Math.floor((b.cx + b.radius - minX) / GRID_CELL));
    const j0 = Math.max(0, Math.floor((b.cz - b.radius - minZ) / GRID_CELL));
    const j1 = Math.min(nz - 1, Math.floor((b.cz + b.radius - minZ) / GRID_CELL));
    for (let ix = i0; ix <= i1; ix++) for (let jz = j0; jz <= j1; jz++) cells[jz * nx + ix]!.push(i);
  });
  return { x0: minX, z0: minZ, nx, nz, cells, stamp: new Uint32Array(list.length), query: 0 };
}

function gridOf(colliders: readonly BoxCollider[]): Grid | undefined {
  return (colliders as unknown as Record<string, Grid | undefined>)[GRID_KEY];
}

/** Colliders near a point on the ground plane (its grid column), or all of them without a grid. */
export function collidersNear(colliders: readonly BoxCollider[], x: number, z: number): readonly BoxCollider[] {
  const g = gridOf(colliders);
  if (!g) return colliders;
  const ix = Math.floor((x - g.x0) / GRID_CELL);
  const jz = Math.floor((z - g.z0) / GRID_CELL);
  if (ix < 0 || jz < 0 || ix >= g.nx || jz >= g.nz) return [];
  return g.cells[jz * g.nx + ix]!.map((i) => colliders[i]!);
}

/**
 * Visit every collider that might lie on the ray, nearest columns first. `visit` tests one and returns the
 * closest hit distance so far, so the walk can stop early. Without a grid, visits them all.
 */
function walk(colliders: readonly BoxCollider[], ox: number, oz: number, dx: number, dz: number, maxDist: number, visit: (b: BoxCollider) => number): void {
  const g = gridOf(colliders);
  if (!g) {
    let limit = maxDist;
    for (const b of colliders) limit = visit(b);
    void limit;
    return;
  }
  const q = ++g.query;
  const test = (cell: number[]): number => {
    let limit = maxDist;
    for (const i of cell) {
      if (g.stamp[i] === q) continue;
      g.stamp[i] = q;
      limit = visit(colliders[i]!);
    }
    return limit;
  };
  // Where the ray enters the grid's rectangle (it may start outside).
  const x1 = g.x0 + g.nx * GRID_CELL;
  const z1 = g.z0 + g.nz * GRID_CELL;
  let t0 = 0;
  let t1 = maxDist;
  for (const [o, d, lo, hi] of [[ox, dx, g.x0, x1], [oz, dz, g.z0, z1]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return;
      continue;
    }
    const a = (lo - o) / d;
    const b = (hi - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1) return;
  // Amanatides-Woo walk across the columns from t0.
  const sx = ox + dx * t0;
  const sz = oz + dz * t0;
  let ix = Math.min(g.nx - 1, Math.max(0, Math.floor((sx - g.x0) / GRID_CELL)));
  let jz = Math.min(g.nz - 1, Math.max(0, Math.floor((sz - g.z0) / GRID_CELL)));
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const nextX = g.x0 + (ix + (dx > 0 ? 1 : 0)) * GRID_CELL;
  const nextZ = g.z0 + (jz + (dz > 0 ? 1 : 0)) * GRID_CELL;
  let tMaxX = Math.abs(dx) < 1e-12 ? Infinity : (nextX - ox) / dx;
  let tMaxZ = Math.abs(dz) < 1e-12 ? Infinity : (nextZ - oz) / dz;
  const tDeltaX = Math.abs(dx) < 1e-12 ? Infinity : GRID_CELL / Math.abs(dx);
  const tDeltaZ = Math.abs(dz) < 1e-12 ? Infinity : GRID_CELL / Math.abs(dz);
  let tCell = t0;
  for (;;) {
    const limit = test(g.cells[jz * g.nx + ix]!);
    // Anything in later columns is farther than the closest hit already found.
    if (tCell > limit || tCell > t1) return;
    if (tMaxX < tMaxZ) {
      tCell = tMaxX;
      tMaxX += tDeltaX;
      ix += stepX;
    } else {
      tCell = tMaxZ;
      tMaxZ += tDeltaZ;
      jz += stepZ;
    }
    if (ix < 0 || jz < 0 || ix >= g.nx || jz >= g.nz || tCell > t1) return;
  }
}

/**
 * Distance along a normalized ray to the first arena surface (boxes or the ground plane y=0),
 * or `maxDist` if nothing is hit before then.
 */
export function raycastArena(
  colliders: readonly BoxCollider[],
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): number {
  let best = maxDist;
  if (dy < 0 && oy >= 0) best = Math.min(best, -oy / dy);

  walk(colliders, ox, oz, dx, dz, best, (b) => {
    // Early out: closest approach of the ray to the box's bounding sphere.
    const px = b.cx - ox;
    const py = b.cy - oy;
    const pz = b.cz - oz;
    const along = px * dx + py * dy + pz * dz;
    if (along < -b.radius || along - b.radius > best) return best;
    const perp2 = px * px + py * py + pz * pz - along * along;
    if (perp2 > b.radius * b.radius) return best;

    // Into box-local space: local = R^T * (world - center).
    const m = b.m;
    const lox = -(m[0]! * px + m[3]! * py + m[6]! * pz);
    const loy = -(m[1]! * px + m[4]! * py + m[7]! * pz);
    const loz = -(m[2]! * px + m[5]! * py + m[8]! * pz);
    const ldx = m[0]! * dx + m[3]! * dy + m[6]! * dz;
    const ldy = m[1]! * dx + m[4]! * dy + m[7]! * dz;
    const ldz = m[2]! * dx + m[5]! * dy + m[8]! * dz;

    const t = slab(lox, loy, loz, ldx, ldy, ldz, b.hx, b.hy, b.hz);
    if (t !== null && t < best) best = t;
    return best;
  });
  return best;
}

/** Where a ray first hits the arena, and the surface's outward normal there (world space). */
export interface RayHit {
  dist: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Like raycastArena, but also reports the surface normal, for things that bounce (grenades, ADR-0034).
 * Returns null if nothing is hit before `maxDist`.
 */
export function raycastArenaHit(
  colliders: readonly BoxCollider[],
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): RayHit | null {
  let best: RayHit | null = null;
  if (dy < 0 && oy >= 0 && -oy / dy < maxDist) best = { dist: -oy / dy, nx: 0, ny: 1, nz: 0 };
  walk(colliders, ox, oz, dx, dz, maxDist, (b) => {
    const limit = best ? best.dist : maxDist;
    const px = b.cx - ox;
    const py = b.cy - oy;
    const pz = b.cz - oz;
    const along = px * dx + py * dy + pz * dz;
    if (along < -b.radius || along - b.radius > limit) return limit;
    const perp2 = px * px + py * py + pz * pz - along * along;
    if (perp2 > b.radius * b.radius) return limit;
    const m = b.m;
    const lo = [-(m[0]! * px + m[3]! * py + m[6]! * pz), -(m[1]! * px + m[4]! * py + m[7]! * pz), -(m[2]! * px + m[5]! * py + m[8]! * pz)];
    const ld = [m[0]! * dx + m[3]! * dy + m[6]! * dz, m[1]! * dx + m[4]! * dy + m[7]! * dz, m[2]! * dx + m[5]! * dy + m[8]! * dz];
    const h = [b.hx, b.hy, b.hz];
    // Slab test that remembers which face it entered through.
    let tmin = -Infinity;
    let tmax = Infinity;
    let axis = -1;
    let sign = 0;
    let missed = false;
    for (let k = 0; k < 3; k++) {
      const o = lo[k]!;
      const d = ld[k]!;
      const hk = h[k]!;
      if (Math.abs(d) < 1e-9) {
        if (o < -hk || o > hk) missed = true;
        continue;
      }
      const t1 = (-hk - o) / d;
      const t2 = (hk - o) / d;
      const near = Math.min(t1, t2);
      if (near > tmin) {
        tmin = near;
        axis = k;
        // Entering through the face whose outward normal opposes the ray.
        sign = d > 0 ? -1 : 1;
      }
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (missed || tmin > tmax || tmax < 0 || axis < 0) return limit;
    const t = Math.max(0, tmin);
    if (t >= limit) return limit;
    // Local face normal to world: world = R * local, R row-major.
    const ln = [0, 0, 0];
    ln[axis] = sign;
    best = {
      dist: t,
      nx: m[0]! * ln[0]! + m[1]! * ln[1]! + m[2]! * ln[2]!,
      ny: m[3]! * ln[0]! + m[4]! * ln[1]! + m[5]! * ln[2]!,
      nz: m[6]! * ln[0]! + m[7]! * ln[1]! + m[8]! * ln[2]!,
    };
    return t;
  });
  return best;
}

/** Ray vs axis-aligned box centered at the origin. Entry distance (0 if starting inside), or null. */
function slab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, hx: number, hy: number, hz: number): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: [number, number, number][] = [
    [ox, dx, hx],
    [oy, dy, hy],
    [oz, dz, hz],
  ];
  for (const [o, d, h] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < -h || o > h) return null;
      continue;
    }
    const t1 = (-h - o) / d;
    const t2 = (h - o) / d;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(0, tmin);
}

/**
 * Closest distance between segment AB and point P, all as flat numbers. Used for bullet-vs-drone hits.
 */
export function segmentPointDistance(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + abx * t - px, ay + aby * t - py, az + abz * t - pz);
}
