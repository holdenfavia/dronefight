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
  return boxes.map((box) => {
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

  for (const b of colliders) {
    // Early out: closest approach of the ray to the box's bounding sphere.
    const px = b.cx - ox;
    const py = b.cy - oy;
    const pz = b.cz - oz;
    const along = px * dx + py * dy + pz * dz;
    if (along < -b.radius || along - b.radius > best) continue;
    const perp2 = px * px + py * py + pz * pz - along * along;
    if (perp2 > b.radius * b.radius) continue;

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
  }
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
  for (const b of colliders) {
    const limit = best ? best.dist : maxDist;
    const px = b.cx - ox;
    const py = b.cy - oy;
    const pz = b.cz - oz;
    const along = px * dx + py * dy + pz * dz;
    if (along < -b.radius || along - b.radius > limit) continue;
    const perp2 = px * px + py * py + pz * pz - along * along;
    if (perp2 > b.radius * b.radius) continue;
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
    if (missed || tmin > tmax || tmax < 0 || axis < 0) continue;
    const t = Math.max(0, tmin);
    if (t >= limit) continue;
    // Local face normal to world: world = R * local, R row-major.
    const ln = [0, 0, 0];
    ln[axis] = sign;
    best = {
      dist: t,
      nx: m[0]! * ln[0]! + m[1]! * ln[1]! + m[2]! * ln[2]!,
      ny: m[3]! * ln[0]! + m[4]! * ln[1]! + m[5]! * ln[2]!,
      nz: m[6]! * ln[0]! + m[7]! * ln[1]! + m[8]! * ln[2]!,
    };
  }
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
