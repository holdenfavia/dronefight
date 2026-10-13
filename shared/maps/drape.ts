// Fitting a map built on flat ground onto rolling terrain (ADR-0059). Maps are still written as if the ground
// were the plane y = 0; this moves everything onto the terrain afterwards:
// - A *group* (a building, a city block, a house, a sculpture) moves as one, by the ground height at its anchor,
//   and big groups cut a level pad into the terrain under them (like a building on a hillside).
// - Anything else moves by the ground height under its own centre.
// - Parts standing on the ground grow down to the lowest ground under them (foundations), so nothing floats.
// - Long low walls and fences are cut into short pieces that step with the ground.
// - Flat things lying on the ground (paths, road markings) are cut into short pieces tilted to lie on it.
// - Lawn and sand sheets become the terrain's own surface instead of sheets on top of it.

import { eulerXYZMatrix } from '../raycast.js';
import type { V3 } from './movers.js';
import { SURFACE, terrainHeight, terrainNormal, type SurfaceCode, type Terrain } from './terrain.js';
import type { ArenaBox, ExplosiveDef } from './types.js';

/** Which things belong together, and where each group is anchored to the ground. */
export interface Grouping {
  groupOf: Map<object, number>;
  /** Per group: the point whose ground height the group moves by (null = the middle of its grounded parts). */
  anchors: ([number, number] | null)[];
}

const DEG = Math.PI / 180;
/** A part counts as standing on the ground if its bottom is this close to y = 0. */
const GROUNDED = 0.35;
/** Foundations reach this far below the lowest ground under a part. */
const FOOTING = 0.3;
/** Groups bigger than this (m² of grounded footprint) cut a level pad into the terrain. */
const PAD_AREA = 30;
/** A pad is level out to this far past the group's footprint, then blends back into the ground by PAD_BLEND. */
const PAD_MARGIN = 1.5;
const PAD_BLEND = 12;

const isTilted = (b: ArenaBox) => !!b.rot && (Math.abs(b.rot[0]) > 0.01 || Math.abs(b.rot[2]) > 0.01);
const grounded = (b: ArenaBox) => !isTilted(b) && b.pos[1] - b.size[1] / 2 <= GROUNDED;

/** The four footprint corners of a box (turned about Y only) plus its centre. */
function footprint(b: ArenaBox): [number, number][] {
  const yaw = (b.rot?.[1] ?? 0) * DEG;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hx = b.size[0] / 2;
  const hz = b.size[2] / 2;
  const pts: [number, number][] = [[b.pos[0], b.pos[2]]];
  for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] as const) pts.push([b.pos[0] + lx * c + lz * s, b.pos[2] - lx * s + lz * c]);
  return pts;
}

/** Inside a box's footprint (turned about Y only)? */
function covers(b: ArenaBox, x: number, z: number): boolean {
  const yaw = (b.rot?.[1] ?? 0) * DEG;
  const dx = x - b.pos[0];
  const dz = z - b.pos[2];
  // Into the box's frame: inverse of the Y rotation.
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.abs(lx) <= b.size[0] / 2 && Math.abs(lz) <= b.size[2] / 2;
}

/** Euler XYZ (degrees) for a box turned by `yawDeg` and then tilted so its up axis is `n`. */
export function eulerOnSlope(yawDeg: number, n: readonly [number, number, number]): [number, number, number] {
  const yaw = yawDeg * DEG;
  // The box's own X axis after the yaw, made to lie in the slope's plane.
  let ax = Math.cos(yaw);
  let ay = 0;
  let az = -Math.sin(yaw);
  const d = ax * n[0] + ay * n[1] + az * n[2];
  ax -= d * n[0];
  ay -= d * n[1];
  az -= d * n[2];
  const l = Math.hypot(ax, ay, az) || 1;
  ax /= l;
  ay /= l;
  az /= l;
  // Z = X × Y.
  const zx = ay * n[2] - az * n[1];
  const zy = az * n[0] - ax * n[2];
  const zz = ax * n[1] - ay * n[0];
  // Rotation matrix with columns X, Y (= n), Z; row-major m11..m33. Three.js 'XYZ' decomposition.
  const m11 = ax;
  const m12 = n[0];
  const m13 = zx;
  const m23 = zy;
  const m33 = zz;
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  const rx = Math.atan2(-m23, m33);
  const rz = Math.atan2(-m12, m11);
  return [rx / DEG, ry / DEG, rz / DEG];
}

/** Split a box along its longest horizontal axis into pieces of at most `piece` m (same rotation). */
function split(b: ArenaBox, piece: number): ArenaBox[] {
  const alongX = b.size[0] >= b.size[2];
  const len = alongX ? b.size[0] : b.size[2];
  const k = Math.ceil(len / piece);
  if (k <= 1) return [b];
  const yaw = (b.rot?.[1] ?? 0) * DEG;
  // The long axis in world space.
  const [ux, uz] = alongX ? [Math.cos(yaw), -Math.sin(yaw)] : [Math.sin(yaw), Math.cos(yaw)];
  const seg = len / k;
  const out: ArenaBox[] = [];
  for (let i = 0; i < k; i++) {
    const t = -len / 2 + seg * (i + 0.5);
    const size: [number, number, number] = alongX ? [seg, b.size[1], b.size[2]] : [b.size[0], b.size[1], seg];
    out.push({ ...b, pos: [b.pos[0] + ux * t, b.pos[1], b.pos[2] + uz * t], size });
  }
  return out;
}

/** Turn ground-level lawn and sand sheets into the terrain's surface, and drop the sheets. */
export function paintGroundCover(t: Terrain, lists: ArenaBox[][]): void {
  const sheets: { b: ArenaBox; code: SurfaceCode }[] = [];
  for (const list of lists) {
    for (let k = list.length - 1; k >= 0; k--) {
      const b = list[k]!;
      const flatSheet = b.size[1] <= 0.12 && b.pos[1] - b.size[1] / 2 <= 0.1 && !isTilted(b);
      if (!flatSheet || (b.mat !== 'foliage' && b.mat !== 'sand')) continue;
      sheets.push({ b, code: b.mat === 'sand' ? SURFACE.sand : SURFACE.grass });
      list.splice(k, 1);
    }
  }
  for (const { b, code } of sheets) {
    const r = Math.hypot(b.size[0], b.size[2]) / 2;
    const i0 = Math.max(0, Math.floor((b.pos[0] - r + t.half) / t.step));
    const i1 = Math.min(t.n - 1, Math.floor((b.pos[0] + r + t.half) / t.step));
    const j0 = Math.max(0, Math.floor((b.pos[2] - r + t.half) / t.step));
    const j1 = Math.min(t.n - 1, Math.floor((b.pos[2] + r + t.half) / t.step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (covers(b, -t.half + (i + 0.5) * t.step, -t.half + (j + 0.5) * t.step)) t.surface[j * t.n + i] = code;
      }
    }
  }
}

/** A route (closed loop of points) cut into steps of at most `step` m, each point moved onto the ground. */
export function drapeRoute(t: Terrain, points: readonly V3[], step = 4): V3[] {
  const out: V3[] = [];
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / step));
    for (let s = 0; s < n; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / n;
      const z = a[2] + ((b[2] - a[2]) * s) / n;
      out.push([x, a[1] + ((b[1] - a[1]) * s) / n + terrainHeight(t, x, z), z]);
    }
  }
  return out;
}

/** Move a flat-built map onto the terrain (see the top of this file). Mutates the terrain (pads) and the lists. */
export function applyTerrain(t: Terrain, boxes: ArenaBox[], decor: ArenaBox[], explosives: ExplosiveDef[], grouping: Grouping): void {
  const hAt = (x: number, z: number) => terrainHeight(t, x, z);
  // Nothing to do where the ground is flat: every footprint point at height 0.
  const onFlat = (pts: readonly [number, number][]) => pts.every(([x, z]) => Math.abs(hAt(x, z)) < 1e-3);

  // 1. Each group's level, from the ground before any pads are cut.
  const members = new Map<number, ArenaBox[]>();
  for (const b of boxes) {
    const g = grouping.groupOf.get(b);
    if (g !== undefined) (members.get(g) ?? members.set(g, []).get(g)!).push(b);
  }
  const level = new Map<number, number>();
  const pads: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  for (const [g, list] of members) {
    const ground = list.filter(grounded);
    const anchor = grouping.anchors[g] ?? centre(ground.length ? ground : list);
    const y = hAt(anchor[0], anchor[1]);
    level.set(g, y);
    if (!ground.length) continue;
    let area = 0;
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const b of ground) {
      area += b.size[0] * b.size[2];
      for (const [x, z] of footprint(b)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
    }
    if (area >= PAD_AREA && !onFlat(ground.flatMap(footprint))) pads.push({ x0: x0 - PAD_MARGIN, x1: x1 + PAD_MARGIN, z0: z0 - PAD_MARGIN, z1: z1 + PAD_MARGIN, y });
  }
  // 2. Cut the pads: level under each footprint, blending back into the ground around it (overlapping
  //    blends average, so a street between two terraces ramps from one to the other).
  const w = t.n + 1;
  for (let j = 0; j <= t.n; j++) {
    for (let i = 0; i <= t.n; i++) {
      const x = -t.half + i * t.step;
      const z = -t.half + j * t.step;
      let weight = 0;
      let sum = 0;
      for (const pd of pads) {
        // Distance outside the pad's level area (0 inside it).
        const dx = Math.max(pd.x0 - x, 0, x - pd.x1);
        const dz = Math.max(pd.z0 - z, 0, z - pd.z1);
        const d = Math.hypot(dx, dz);
        if (d >= PAD_BLEND) continue;
        const k = d <= 0 ? 1 : 1 - d / PAD_BLEND;
        // Inside a pad, that pad wins outright.
        const wk = d <= 0 ? 1e6 : k * k * (3 - 2 * k);
        weight += wk;
        sum += wk * pd.y;
      }
      if (weight <= 0) continue;
      const k = j * w + i;
      t.heights[k] = weight >= 1 ? sum / weight : t.heights[k]! * (1 - weight) + sum;
    }
  }
  t.maxHeight = t.heights.reduce((m, h) => Math.max(m, h), 0);

  /** A group's level; groups with only decor or props take the ground at their anchor or first member. */
  const levelOf = (g: number, x: number, z: number): number => {
    let y = level.get(g);
    if (y === undefined) {
      const a = grouping.anchors[g];
      y = a ? hAt(a[0], a[1]) : hAt(x, z);
      level.set(g, y);
    }
    return y;
  };

  // 3. Solid parts.
  const placed: ArenaBox[] = [];
  for (const b of boxes) {
    const g = grouping.groupOf.get(b);
    const fp = footprint(b);
    if (g === undefined && onFlat(fp)) {
      placed.push(b);
      continue;
    }
    // Long low walls and fences (on their own) step with the ground.
    const long = Math.max(b.size[0], b.size[2]) > 8 && b.size[1] <= 3;
    const pieces = g === undefined && grounded(b) && long ? split(b, 4) : [b];
    for (const p of pieces) placed.push(lift(p, g === undefined ? hAt(p.pos[0], p.pos[2]) : levelOf(g, p.pos[0], p.pos[2])));
  }
  boxes.splice(0, boxes.length, ...placed);

  // 4. Decor: flat things on the ground drape over it; the rest moves like solid parts (but never grows down).
  const draped: ArenaBox[] = [];
  for (const b of decor) {
    const g = grouping.groupOf.get(b);
    if (g !== undefined) {
      draped.push({ ...b, pos: [b.pos[0], b.pos[1] + levelOf(g, b.pos[0], b.pos[2]), b.pos[2]] });
      continue;
    }
    if (onFlat(footprint(b))) {
      draped.push(b);
      continue;
    }
    const flat = b.size[1] <= 0.12 && b.pos[1] - b.size[1] / 2 <= 0.2 && !isTilted(b);
    if (!flat) {
      draped.push({ ...b, pos: [b.pos[0], b.pos[1] + hAt(b.pos[0], b.pos[2]), b.pos[2]] });
      continue;
    }
    // Cut along its length, then (if still wide) across, into pieces no bigger than 4 m.
    for (const p of split(b, 4)) {
      for (const q of split(p, 4)) {
        const x = q.pos[0];
        const z = q.pos[2];
        const n = terrainNormal(t, x, z);
        draped.push({ ...q, pos: [x, q.pos[1] + hAt(x, z), z], rot: eulerOnSlope(q.rot?.[1] ?? 0, n) });
      }
    }
  }
  decor.splice(0, decor.length, ...draped);

  // 5. Things that blow up: with their group, or onto the highest ground under them (never half buried).
  for (const e of explosives) {
    const g = grouping.groupOf.get(e);
    let dy: number;
    if (g !== undefined) dy = levelOf(g, e.pos[0], e.pos[2]);
    else {
      const r = Math.max(e.size[0], e.size[2]) / 2;
      dy = Math.max(hAt(e.pos[0], e.pos[2]), hAt(e.pos[0] + r, e.pos[2]), hAt(e.pos[0] - r, e.pos[2]), hAt(e.pos[0], e.pos[2] + r), hAt(e.pos[0], e.pos[2] - r));
    }
    e.pos = [e.pos[0], e.pos[1] + dy, e.pos[2]];
  }

  /** A part moved up by `dy`; standing parts grow down to the lowest ground under them. */
  function lift(b: ArenaBox, dy: number): ArenaBox {
    const moved: ArenaBox = { ...b, pos: [b.pos[0], b.pos[1] + dy, b.pos[2]] };
    if (!grounded(b)) return moved;
    const top = moved.pos[1] + b.size[1] / 2;
    const bottom = Math.min(moved.pos[1] - b.size[1] / 2, Math.min(...footprint(b).map(([x, z]) => hAt(x, z))) - FOOTING);
    moved.pos = [b.pos[0], (top + bottom) / 2, b.pos[2]];
    moved.size = [b.size[0], top - bottom, b.size[2]];
    return moved;
  }
}

/** Middle of a set of boxes' footprints. */
function centre(list: readonly ArenaBox[]): [number, number] {
  let x = 0;
  let z = 0;
  for (const b of list) {
    x += b.pos[0];
    z += b.pos[2];
  }
  return [x / Math.max(1, list.length), z / Math.max(1, list.length)];
}

/** For tests: the rotation matrix a box gets from eulerOnSlope (same as the renderer and colliders build). */
export function slopeMatrix(yawDeg: number, n: readonly [number, number, number]): number[] {
  return eulerXYZMatrix(...eulerOnSlope(yawDeg, n));
}
