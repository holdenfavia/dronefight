import type { ArenaBox, ArenaMaterial, SpawnPoint } from './types.js';

// Small building blocks for maps. Everything is deterministic, so every client builds the same map.

export const BEAM = 0.35;
/** Invisible boundary walls reach this high so you can't fly out over the top. */
export const BOUNDARY_HEIGHT = 250;

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate a local (x, z) offset by yaw degrees around the origin (Three.js Y-rotation convention). */
export function yawOffset(x: number, z: number, yawDeg: number): [number, number] {
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c + z * s, -x * s + z * c];
}

/** A ground-level spawn at (x, z), facing the middle of the map. */
export function spawnFacingCenter(x: number, z: number): SpawnPoint {
  return { pos: [x, 0.1, z], yawDeg: (Math.atan2(x, z) * 180) / Math.PI };
}

/** A launch pad under every spawn. */
export function pads(out: ArenaBox[], spawns: readonly SpawnPoint[], y = 0.05): void {
  for (const s of spawns) out.push({ pos: [s.pos[0], y, s.pos[2]], size: [4, 0.1, 4], mat: 'pad' });
}

/** Invisible walls around the play area, plus an optional short visible wall. */
export function boundary(out: ArenaBox[], half: number, visibleHeight = 0, mat: ArenaMaterial = 'concrete'): void {
  for (const [x, z, w, d] of [
    [0, -half, half * 2, 2],
    [0, half, half * 2, 2],
    [-half, 0, 2, half * 2],
    [half, 0, 2, half * 2],
  ] as const) {
    if (visibleHeight > 0) out.push({ pos: [x, visibleHeight / 2, z], size: [w, visibleHeight, d], mat });
    out.push({ pos: [x, BOUNDARY_HEIGHT / 2, z], size: [w, BOUNDARY_HEIGHT, d], mat: 'invisible' });
  }
}

/**
 * A scaffolding tower: four corner posts with horizontal rings. Joints close flush: posts rise to the
 * top of the top ring, ring beams end on the posts' outer faces, and there is always a ring at the top.
 */
export function tower(out: ArenaBox[], x: number, z: number, width: number, height: number, levelHeight = 4, y0 = 0, deck = true): void {
  const h = width / 2 - BEAM / 2;
  const postTop = height + BEAM / 2;
  for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]] as const) {
    out.push({ pos: [x + dx, y0 + postTop / 2, z + dz], size: [BEAM, postTop, BEAM], mat: 'orange' });
  }
  const levels: number[] = [];
  for (let y = levelHeight; y < height - levelHeight * 0.4; y += levelHeight) levels.push(y);
  levels.push(height);
  for (const y of levels) {
    out.push({ pos: [x, y0 + y, z - h], size: [width, BEAM, BEAM], mat: 'orange' });
    out.push({ pos: [x, y0 + y, z + h], size: [width, BEAM, BEAM], mat: 'orange' });
    out.push({ pos: [x - h, y0 + y, z], size: [BEAM, BEAM, width], mat: 'orange' });
    out.push({ pos: [x + h, y0 + y, z], size: [BEAM, BEAM, width], mat: 'orange' });
  }
  // Deck resting exactly on the posts.
  if (deck) out.push({ pos: [x, y0 + postTop + 0.15, z], size: [width, 0.3, width], mat: 'steel' });
  // Concrete footings under ground-standing posts, so the tower is anchored rather than stuck on.
  if (y0 === 0) footings(out, [[x - h, z - h], [x + h, z - h], [x - h, z + h], [x + h, z + h]], BEAM * 2.4);
}

/** Small concrete pads under posts that stand on the ground. */
function footings(out: ArenaBox[], at: readonly (readonly [number, number])[], size: number, yawDeg = 0): void {
  for (const [fx, fz] of at) out.push({ pos: [fx, 0.12, fz], size: [size, 0.24, size], rot: yawDeg ? [0, yawDeg, 0] : undefined, mat: 'concrete' });
}

/** A freestanding gate: two posts and a crossbar, rotated by yaw. */
export function gate(out: ArenaBox[], x: number, z: number, width: number, height: number, yawDeg: number, y0 = 0): void {
  const post = 0.6;
  for (const side of [-1, 1]) {
    const [ox, oz] = yawOffset((side * (width + post)) / 2, 0, yawDeg);
    out.push({ pos: [x + ox, y0 + height / 2, z + oz], size: [post, height, post], rot: [0, yawDeg, 0], mat: 'orange' });
  }
  out.push({ pos: [x, y0 + height + post / 2, z], size: [width + post * 2, post, post], rot: [0, yawDeg, 0], mat: 'orange' });
  if (y0 === 0) {
    const feet = [-1, 1].map((side) => {
      const [ox, oz] = yawOffset((side * (width + post)) / 2, 0, yawDeg);
      return [x + ox, z + oz] as const;
    });
    footings(out, feet, post * 2, yawDeg);
  }
}

/**
 * An open cube frame you can fly through from any side. Every edge spans the full outer size
 * (size + BEAM), so the three beams meeting at each corner fill it completely.
 */
export function cubeFrame(out: ArenaBox[], x: number, y: number, z: number, size: number): void {
  const h = size / 2;
  const full = size + BEAM;
  for (const a of [-h, h]) {
    for (const b of [-h, h]) {
      out.push({ pos: [x + a, y, z + b], size: [BEAM, full, BEAM], mat: 'orange' });
      out.push({ pos: [x, y + a, z + b], size: [full, BEAM, BEAM], mat: 'orange' });
      out.push({ pos: [x + a, y + b, z], size: [BEAM, BEAM, full], mat: 'orange' });
    }
  }
}

/**
 * A straight member from point a to point b (a cable, guy wire, brace), with a square cross-section.
 * Length runs along local X; rotation is yaw about Y then pitch about Z (Euler XYZ with X = 0).
 */
export function strut(out: ArenaBox[], a: readonly [number, number, number], b: readonly [number, number, number], thickness: number, mat: ArenaMaterial): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(flat, dy);
  const deg = 180 / Math.PI;
  out.push({
    pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    size: [len, thickness, thickness],
    rot: [0, Math.atan2(-dz, dx) * deg, Math.atan2(dy, flat) * deg],
    mat,
  });
}
