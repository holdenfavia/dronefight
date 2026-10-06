import { boundary, mulberry32, pads, spawnFacingCenter } from './builders.js';
import type { ArenaBox, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

/**
 * Cavern (ADR-0048): one huge cave. A main chamber (an oval ~260 x 190 m) under a lumpy rock ceiling
 * 45-70 m up, with loop tunnels north, south and east that leave the chamber and come back, a west
 * tunnel to a crystal grotto, stalactites, stalagmites, columns and floor mounds. Sunlight falls through
 * three holes in the roof (each sealed by an invisible lid); crystals glow in the tunnels and grotto.
 * Everything is boxes, like every map, so the server, physics and renderer share it exactly.
 */

const HALF = 185;
/** Chamber radii (m) along x and z. */
const RX = 130;
const RZ = 95;
/** Chamber wall: segments around the oval, thickness, and height (above the highest ceiling). */
const WALL_SEGMENTS = 40;
const WALL_T = 12;
const WALL_H = 90;
/** Ceiling cells (m) and slab thickness. */
const CELL = 20;
const SLAB = 8;
/** Tunnels: inside width and height, wall thickness, how far beyond the chamber wall they run. */
const TUNNEL_W = 18;
const TUNNEL_H = 18;
const TUNNEL_T = 4;
const TUNNEL_OUT = 26;
const DEG = Math.PI / 180;

/** The wall's wobble, so the chamber isn't a perfect oval (deterministic: the same on every client). */
function wobble(a: number): number {
  return 1 + 0.05 * Math.sin(5 * a) + 0.03 * Math.cos(9 * a);
}

/** The chamber wall's inner line at angle `a` (radians). */
function wallPoint(a: number): [number, number] {
  const k = wobble(a);
  return [RX * k * Math.cos(a), RZ * k * Math.sin(a)];
}

/** Ceiling height (underside) above a point: lumpy, 44-72 m. */
export function ceilingAt(x: number, z: number): number {
  const c = 56 + 9 * Math.sin(x * 0.035) + 7 * Math.cos(z * 0.05 + 0.7) + 4 * Math.sin((x + z) * 0.08);
  return Math.max(44, Math.min(72, c));
}

/** Inside the chamber oval, scaled by `s` (1 = the wall line, roughly). */
function inChamber(x: number, z: number, s = 1): boolean {
  return (x / (RX * s)) ** 2 + (z / (RZ * s)) ** 2 <= 1;
}

const yawOf = (dx: number, dz: number) => (Math.atan2(-dz, dx) * 180) / Math.PI;

/** A box whose length runs from (ax, az) to (bx, bz) (plus `ext` at each end), offset sideways by `side`. */
function along(out: ArenaBox[], ax: number, az: number, bx: number, bz: number, side: number, y: number, h: number, t: number, ext: number, mat: ArenaBox['mat']): void {
  const len = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / len;
  const dz = (bz - az) / len;
  // Perpendicular (local +Z after the yaw): (-dz, dx).
  const cx = (ax + bx) / 2 - dz * side;
  const cz = (az + bz) / 2 + dx * side;
  out.push({ pos: [cx, y, cz], size: [len + ext * 2, h, t], rot: [0, yawOf(dx, dz), 0], mat });
}

/** A tunnel along a path: two walls and a roof per leg, legs overlapping so turns stay closed. */
function tunnel(out: ArenaBox[], path: readonly (readonly [number, number])[]): void {
  const off = TUNNEL_W / 2 + TUNNEL_T / 2;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const wallH = TUNNEL_H + TUNNEL_T;
    along(out, ax, az, bx, bz, off, wallH / 2, wallH, TUNNEL_T, 8, 'rock');
    along(out, ax, az, bx, bz, -off, wallH / 2, wallH, TUNNEL_T, 8, 'rock');
    along(out, ax, az, bx, bz, 0, TUNNEL_H + TUNNEL_T / 2, TUNNEL_T, TUNNEL_W + TUNNEL_T * 2, 8, 'rock');
  }
}

/** Where a tunnel meets the chamber: just inside the wall, and out beyond it, at angle `a` (degrees). */
function mouth(aDeg: number): { inside: [number, number]; outside: [number, number]; wall: [number, number] } {
  const a = aDeg * DEG;
  const [wx, wz] = wallPoint(a);
  const r = Math.hypot(wx, wz);
  const ux = wx / r;
  const uz = wz / r;
  return { inside: [wx - ux * 9, wz - uz * 9], outside: [wx + ux * TUNNEL_OUT, wz + uz * TUNNEL_OUT], wall: [wx, wz] };
}

/** A loop tunnel leaving the chamber at a1 and coming back at a2 (degrees), running just outside the wall. */
function loopPath(a1: number, a2: number): [number, number][] {
  const path: [number, number][] = [mouth(a1).inside];
  const steps = Math.max(2, Math.ceil(Math.abs(a2 - a1) / 9));
  for (let i = 0; i <= steps; i++) path.push(mouth(a1 + ((a2 - a1) * i) / steps).outside);
  path.push(mouth(a2).inside);
  return path;
}

/** Tunnel mouths around the chamber (degrees): the loops' two ends each, and the grotto tunnel. */
const LOOPS = [
  [60, 120],
  [240, 300],
  [-25, 25],
] as const;
const GROTTO_ANGLE = 215;
const MOUTHS = [...LOOPS.flat(), GROTTO_ANGLE];

const SPAWNS: readonly SpawnPoint[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.2;
  // Facing the middle of the chamber.
  return spawnFacingCenter(Math.round(RX * 0.55 * Math.cos(a)), Math.round(RZ * 0.55 * Math.sin(a)));
});

/** Miners' camps (fuel drums and propane, below): formations keep clear of them, as of the spawns. */
const CAMPS = [
  [-24, 71],
  [26, -73],
] as const;

const nearSpawn = (x: number, z: number, d = 14) =>
  SPAWNS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < d) || CAMPS.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 22);

/** A tapering spike of stacked boxes: from y0 going up (dir 1) or down (dir -1). */
function spike(out: ArenaBox[], x: number, z: number, y0: number, length: number, width: number, dir: 1 | -1, yaw: number, mat: ArenaBox['mat'] = 'rock'): void {
  const n = 4;
  const seg = length / n;
  for (let j = 0; j < n; j++) {
    const w = width * (1 - j * 0.22);
    const y = y0 + dir * (seg * j + seg / 2);
    // Each segment overlaps the next a little so the spike reads as one piece.
    out.push({ pos: [x, y, z], size: [w, seg + 0.6, w], rot: [0, yaw + j * 17, 0], mat });
  }
}

/** A cluster of glowing crystals tilted out from a point. */
function crystals(out: ArenaBox[], rand: () => number, x: number, z: number, y0: number, count: number): void {
  for (let k = 0; k < count; k++) {
    const h = 2 + rand() * 3.5;
    const w = 0.5 + rand() * 0.7;
    out.push({
      pos: [x + (rand() - 0.5) * 3, y0 + h * 0.4, z + (rand() - 0.5) * 3],
      size: [w, h, w],
      rot: [(rand() - 0.5) * 50, rand() * 180, (rand() - 0.5) * 50],
      mat: 'crystal',
    });
  }
}

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const rand = mulberry32(48);
  boundary(out, HALF);
  pads(out, SPAWNS);

  // --- Chamber wall, with gaps where tunnels leave. Jambs and a lintel close each mouth around its tunnel.
  const mouths = MOUTHS.map(mouth);
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    const a1 = (i / WALL_SEGMENTS) * Math.PI * 2;
    const a2 = ((i + 1) / WALL_SEGMENTS) * Math.PI * 2;
    const [ax, az] = wallPoint(a1);
    const [bx, bz] = wallPoint(a2);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (mouths.some((m) => Math.hypot(m.wall[0] - mx, m.wall[1] - mz) < 24)) continue;
    // Pushed outward by half its thickness (outward is the right-hand side going around).
    along(out, ax, az, bx, bz, -WALL_T / 2, WALL_H / 2, WALL_H, WALL_T, 2, 'rock');
  }
  for (const aDeg of MOUTHS) {
    const a = aDeg * DEG;
    const [wx, wz] = wallPoint(a);
    // The wall's direction here (tangent), from a little either side.
    const [px, pz] = wallPoint(a - 0.01);
    const [qx, qz] = wallPoint(a + 0.01);
    const tl = Math.hypot(qx - px, qz - pz);
    const tx = (qx - px) / tl;
    const tz = (qz - pz) / tl;
    const half = TUNNEL_W / 2 + TUNNEL_T;
    for (const s of [-1, 1]) {
      const jx = wx + tx * s * (half + 9);
      const jz = wz + tz * s * (half + 9);
      along(out, jx - tx * 9, jz - tz * 9, jx + tx * 9, jz + tz * 9, -WALL_T / 2, WALL_H / 2, WALL_H, WALL_T, 1, 'rock');
    }
    const lintelH = WALL_H - TUNNEL_H - 2;
    along(out, wx - tx * half, wz - tz * half, wx + tx * half, wz + tz * half, -WALL_T / 2, TUNNEL_H + 2 + lintelH / 2, lintelH, WALL_T, 1, 'rock');
  }

  // --- Ceiling: rock slabs at the lumpy height, with three sky holes (sealed by invisible lids).
  const holes = [
    [-60, -20],
    [40, 20],
    [80, -40],
  ];
  for (let gx = -150; gx <= 150; gx += CELL) {
    for (let gz = -120; gz <= 120; gz += CELL) {
      if (!inChamber(gx, gz, 1.3)) continue;
      const c = ceilingAt(gx, gz);
      if (holes.some(([hx, hz]) => hx === gx && hz === gz)) {
        out.push({ pos: [gx, c + SLAB / 2, gz], size: [CELL, SLAB, CELL], mat: 'invisible' });
        continue;
      }
      out.push({ pos: [gx, c + SLAB / 2, gz], size: [CELL + 0.5, SLAB, CELL + 0.5], mat: 'rock' });
    }
  }

  // --- Tunnels: three loops, and one to the grotto.
  for (const [a1, a2] of LOOPS) tunnel(out, loopPath(a1, a2));
  const g = mouth(GROTTO_ANGLE);
  const gr = Math.hypot(g.wall[0], g.wall[1]);
  const ux = g.wall[0] / gr;
  const uz = g.wall[1] / gr;
  const roomHalf = 18;
  const room: [number, number] = [g.wall[0] + ux * 45, g.wall[1] + uz * 45];
  const front: [number, number] = [room[0] - ux * (roomHalf + 2), room[1] - uz * (roomHalf + 2)];
  tunnel(out, [g.inside, front]);
  // The grotto: a 36 m room with its door facing the chamber.
  const local = (a: number, s: number): [number, number] => [room[0] + ux * a - uz * s, room[1] + uz * a + ux * s];
  const roomBox = (a: number, s: number, y: number, along_: number, side: number, h: number) => {
    const [x, z] = local(a, s);
    out.push({ pos: [x, y, z], size: [along_, h, side], rot: [0, yawOf(ux, uz), 0], mat: 'rock' });
  };
  const rh = 28;
  roomBox(roomHalf + 2, 0, (rh + 4) / 2, 4, roomHalf * 2 + 8, rh + 4); // back
  for (const s of [-1, 1]) roomBox(0, s * (roomHalf + 2), (rh + 4) / 2, roomHalf * 2 + 8, 4, rh + 4); // sides
  for (const s of [-1, 1]) roomBox(-(roomHalf + 2), s * 15.5, (rh + 4) / 2, 4, 13, rh + 4); // front either side of the door
  roomBox(-(roomHalf + 2), 0, TUNNEL_H + (rh + 4 - TUNNEL_H) / 2, 4, TUNNEL_W + 2, rh + 4 - TUNNEL_H); // over the door
  roomBox(0, 0, rh + 2, roomHalf * 2 + 8, roomHalf * 2 + 8, 4); // roof
  for (let k = 0; k < 6; k++) {
    const [x, z] = local((rand() - 0.3) * roomHalf * 1.4, (rand() - 0.5) * roomHalf * 1.6);
    crystals(out, rand, x, z, 0, 4 + Math.floor(rand() * 3));
  }
  // Grotto stalactites.
  for (let k = 0; k < 5; k++) {
    const [x, z] = local((rand() - 0.5) * 28, (rand() - 0.5) * 28);
    spike(out, x, z, rh + 0.5, 4 + rand() * 6, 1.6 + rand(), -1, rand() * 90);
  }

  // --- Formations in the chamber: stalactites, stalagmites, columns, floor mounds.
  const spot = (s: number): [number, number] => {
    for (;;) {
      const x = (rand() * 2 - 1) * RX * s;
      const z = (rand() * 2 - 1) * RZ * s;
      if (inChamber(x, z, s) && !nearSpawn(x, z)) return [x, z];
    }
  };
  for (let k = 0; k < 46; k++) {
    const [x, z] = spot(0.88);
    spike(out, x, z, ceilingAt(x, z) + 0.5, 8 + rand() * 18, 2.5 + rand() * 2.5, -1, rand() * 90);
  }
  for (let k = 0; k < 30; k++) {
    const [x, z] = spot(0.86);
    spike(out, x, z, -0.3, 4 + rand() * 13, 2.5 + rand() * 3, 1, rand() * 90);
  }
  for (let k = 0; k < 5; k++) {
    const [x, z] = spot(0.7);
    const c = ceilingAt(x, z) + 0.5;
    // An hourglass column joining floor and ceiling.
    const widths = [8, 5.5, 4, 5.5, 8];
    const seg = c / widths.length;
    widths.forEach((w, j) => out.push({ pos: [x, seg * j + seg / 2, z], size: [w, seg + 0.8, w], rot: [0, j * 23 + k * 11, 0], mat: 'rock' }));
  }
  for (let k = 0; k < 12; k++) {
    const [x, z] = spot(0.85);
    const h = 1.5 + rand() * 3.5;
    out.push({ pos: [x, h / 2 - 0.5, z], size: [8 + rand() * 10, h, 6 + rand() * 8], rot: [0, rand() * 180, 0], mat: 'rock' });
  }

  // --- Crystals along the chamber wall and in the tunnels, and a few small stalactites in the tunnels.
  for (let k = 0; k < 10; k++) {
    const a = rand() * Math.PI * 2;
    const [wx, wz] = wallPoint(a);
    if (nearSpawn(wx * 0.9, wz * 0.9)) continue;
    crystals(out, rand, wx * 0.92, wz * 0.92, 0, 3 + Math.floor(rand() * 4));
  }
  for (const [a1, a2] of LOOPS) {
    const path = loopPath(a1, a2);
    for (let i = 2; i + 2 < path.length; i += 2) {
      const [x, z] = path[i]!;
      crystals(out, rand, x, z, 0, 3);
      spike(out, x + (rand() - 0.5) * 6, z + (rand() - 0.5) * 6, TUNNEL_H + 0.5, 3 + rand() * 3, 1.4, -1, rand() * 90);
    }
  }
  return out;
}

/** Miners' camps: fuel drums and a propane tank near the north and south tunnels (ADR-0023). */
const drums = (x: number, z: number): ExplosiveDef[] =>
  [[0, 0], [1.4, 0], [0.7, 1.2]].map(([dx, dz]) => ({ kind: 'fuel' as const, pos: [x + dx!, 0.8, z + dz!], size: [1.2, 1.6, 1.2] }));
const EXPLOSIVES: ExplosiveDef[] = [
  ...drums(-30, 70),
  ...drums(34, -72),
  { kind: 'propane', pos: [-14, 1.2, 72], size: [2.4, 2.4, 6], yawDeg: 90 },
  { kind: 'propane', pos: [18, 1.2, -74], size: [2.4, 2.4, 6], yawDeg: 90 },
];

export const CAVERN: MapDef = {
  id: 'cavern',
  name: 'Cavern',
  halfSize: HALF,
  boxes: build(),
  decor: [],
  spawns: SPAWNS,
  ground: 'rock',
  explosives: EXPLOSIVES,
  atmosphere: {
    fog: '#323a46',
    fogNear: 70,
    fogFar: 560,
    hemiSky: '#c4d2e6',
    hemiGround: '#9a826e',
    hemiIntensity: 2.4,
    sunIntensity: 4.2,
  },
};
