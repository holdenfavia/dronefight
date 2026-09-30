// The test arena as plain data, shared by client and server. Rendering, flight collisions and
// server-side bullet checks are all generated from this list, so what you see is exactly what you hit.
// Deterministic, so every client builds the same map.

export type ArenaMaterial = 'orange' | 'concrete' | 'steel' | 'white' | 'pad' | 'invisible';

export interface ArenaBox {
  /** Center position (m). */
  pos: [number, number, number];
  /** Full size (m). */
  size: [number, number, number];
  /** Euler rotation in degrees, XYZ order. */
  rot?: [number, number, number];
  mat: ArenaMaterial;
}

export interface SpawnPoint {
  pos: [number, number, number];
  yawDeg: number;
}

/** One launch pad per side, at opposite ends, facing each other (ADR-0009). Index = team. */
export const SPAWNS: readonly SpawnPoint[] = [
  { pos: [0, 0.1, 70], yawDeg: 0 },
  { pos: [0, 0.1, -95], yawDeg: 180 },
];

export const ARENA = {
  halfSize: 120,
  wallHeight: 6,
  /** Invisible collision walls extend this high so you can't fly out over the visible wall. */
  boundaryHeight: 250,
  /** Solo spawn. */
  spawn: SPAWNS[0] as SpawnPoint,
} as const;

const BEAM = 0.35;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate a local (x, z) offset by yaw degrees around the origin. */
function yawOffset(x: number, z: number, yawDeg: number): [number, number] {
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c + z * s, -x * s + z * c];
}

/** A scaffolding tower: four corner posts with horizontal rings every `levelHeight`. */
function tower(out: ArenaBox[], x: number, z: number, width: number, height: number, levelHeight = 4) {
  const h = width / 2 - BEAM / 2;
  for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]] as const) {
    out.push({ pos: [x + dx, height / 2, z + dz], size: [BEAM, height, BEAM], mat: 'orange' });
  }
  for (let y = levelHeight; y <= height + 0.01; y += levelHeight) {
    out.push({ pos: [x, y, z - h], size: [width, BEAM, BEAM], mat: 'orange' });
    out.push({ pos: [x, y, z + h], size: [width, BEAM, BEAM], mat: 'orange' });
    out.push({ pos: [x - h, y, z], size: [BEAM, BEAM, width], mat: 'orange' });
    out.push({ pos: [x + h, y, z], size: [BEAM, BEAM, width], mat: 'orange' });
  }
  // A deck on top to land on.
  out.push({ pos: [x, height + BEAM, z], size: [width, 0.3, width], mat: 'steel' });
}

/** A freestanding gate: two posts and a crossbar, rotated by yaw. */
function gate(out: ArenaBox[], x: number, z: number, width: number, height: number, yawDeg: number, y0 = 0) {
  const post = 0.6;
  for (const side of [-1, 1]) {
    const [ox, oz] = yawOffset((side * (width + post)) / 2, 0, yawDeg);
    out.push({ pos: [x + ox, y0 + height / 2, z + oz], size: [post, height, post], rot: [0, yawDeg, 0], mat: 'orange' });
  }
  out.push({
    pos: [x, y0 + height + post / 2, z],
    size: [width + post * 2, post, post],
    rot: [0, yawDeg, 0],
    mat: 'orange',
  });
}

/** An open cube frame you can fly through from any side. */
function cubeFrame(out: ArenaBox[], x: number, y: number, z: number, size: number) {
  const h = size / 2;
  for (const a of [-h, h]) {
    for (const b of [-h, h]) {
      out.push({ pos: [x + a, y, z + b], size: [BEAM, size, BEAM], mat: 'orange' });
      out.push({ pos: [x, y + a, z + b], size: [size, BEAM, BEAM], mat: 'orange' });
      out.push({ pos: [x + a, y + b, z], size: [BEAM, BEAM, size], mat: 'orange' });
    }
  }
}

function buildArena(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const S = ARENA.halfSize;
  const rand = mulberry32(7);

  // Perimeter: short visible wall plus tall invisible boundary.
  for (const [x, z, w, d] of [
    [0, -S, S * 2, 2],
    [0, S, S * 2, 2],
    [-S, 0, 2, S * 2],
    [S, 0, 2, S * 2],
  ] as const) {
    out.push({ pos: [x, ARENA.wallHeight / 2, z], size: [w, ARENA.wallHeight, d], mat: 'concrete' });
    out.push({ pos: [x, ARENA.boundaryHeight / 2, z], size: [w, ARENA.boundaryHeight, d], mat: 'invisible' });
  }

  // Launch pad.
  for (const spawn of SPAWNS) {
    const [sx, , sz] = spawn.pos;
    out.push({ pos: [sx, 0.05, sz], size: [4, 0.1, 4], mat: 'pad' });
  }

  // Central scaffolding cluster.
  tower(out, -8, 0, 6, 20);
  tower(out, 6, -6, 6, 28);
  tower(out, 8, 10, 5, 12);

  // Overpass: a long concrete deck on pillars. Dive under, flip over.
  const deckZ = -45;
  out.push({ pos: [0, 12, deckZ], size: [80, 1.2, 10], mat: 'concrete' });
  for (let x = -36; x <= 36; x += 12) {
    out.push({ pos: [x, 6, deckZ], size: [1.6, 12, 1.6], mat: 'concrete' });
  }
  out.push({ pos: [0, 13.2, deckZ - 4.6], size: [80, 1.2, 0.3], mat: 'orange' });
  out.push({ pos: [0, 13.2, deckZ + 4.6], size: [80, 1.2, 0.3], mat: 'orange' });

  // Raised platform with a ramp.
  out.push({ pos: [55, 3, 25], size: [24, 6, 24], mat: 'concrete' });
  out.push({ pos: [55, 3, 44.5], size: [8, 0.5, 16], rot: [21, 0, 0], mat: 'concrete' });
  tower(out, 82, 5, 4, 14, 5);

  // Tall stacks: the big vertical dive spots.
  out.push({ pos: [-60, 22, -60], size: [5, 44, 5], mat: 'concrete' });
  out.push({ pos: [-60, 44.5, -60], size: [5.4, 1, 5.4], mat: 'orange' });
  out.push({ pos: [70, 18, -70], size: [4, 36, 4], mat: 'concrete' });
  out.push({ pos: [70, 36.5, -70], size: [4.4, 1, 4.4], mat: 'orange' });

  // Gates of different sizes and angles.
  gate(out, 0, 35, 10, 7, 0);
  gate(out, -35, 15, 7, 5, 35);
  gate(out, 30, -15, 8, 9, -20);
  gate(out, -30, -80, 12, 10, 10);
  gate(out, 55, 25, 5, 4, 90, 6);
  gate(out, -80, 40, 6, 12, 60);

  // Floating cube frames.
  cubeFrame(out, -40, 14, -20, 8);
  cubeFrame(out, 35, 22, 60, 6);

  // The gap: two walls with a narrow slot.
  out.push({ pos: [-70, 5, 10], size: [2, 10, 16], mat: 'concrete' });
  out.push({ pos: [-70, 5, -8.5], size: [2, 10, 16], mat: 'concrete' });

  // Shipping-container yard, deterministic scatter.
  const containerMats: ArenaMaterial[] = ['orange', 'white', 'steel'];
  for (let i = 0; i < 14; i++) {
    const x = -95 + rand() * 50;
    const z = 55 + rand() * 50;
    const yaw = rand() < 0.5 ? 0 : 90;
    const stack = rand() < 0.3 ? 2 : 1;
    const mat = containerMats[Math.floor(rand() * containerMats.length)] ?? 'orange';
    for (let level = 0; level < stack; level++) {
      out.push({ pos: [x, 1.3 + level * 2.6, z], size: [6, 2.6, 2.4], rot: [0, yaw, 0], mat });
    }
  }

  // Jersey barriers along a lane.
  for (let i = 0; i < 10; i++) {
    out.push({ pos: [90, 0.5, -40 + i * 9], size: [0.6, 1, 3], mat: 'concrete' });
  }

  return out;
}

export const ARENA_BOXES: readonly ArenaBox[] = buildArena();
