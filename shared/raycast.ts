import type { ArenaBox } from './arena.js';

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
