import { beam, boundary, hoop, mulberry32, pads, polyBeam, spawnFacingCenter, tower, water } from './builders.js';
import { routeFromPoints, roundedRect, type MoverDef, type V3 } from './movers.js';
import type { ArenaBox, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

/**
 * Cavern (ADR-0048, ADR-0049): one huge cave system. The main chamber (an oval ~260 x 190 m) under a
 * lumpy rock ceiling 45-70 m up, with loop tunnels north and south that leave the chamber and come back,
 * and a west-south tunnel to a crystal grotto. Tunnels lead on to two more chambers (ADR-0049): an
 * underground lake with an island and a stone arch bridge (west), and an old mine with a headframe,
 * timber props, ore piles and a mine-cart train running a loop (east). Stalactites, stalagmites,
 * columns; sunlight through sealed holes in the roof; glowing crystals.
 * Everything is boxes, like every map, so the server, physics and renderer share it exactly.
 */

const HALF = 320;
/** Ceiling cells (m) and slab thickness. */
const CELL = 20;
const SLAB = 8;
/** Tunnels: inside width and height, wall thickness, how far beyond a chamber wall loops run. */
const TUNNEL_W = 18;
const TUNNEL_H = 18;
const TUNNEL_T = 4;
const TUNNEL_OUT = 26;
/** Chamber wall: thickness, and the number of segments around it. */
const WALL_T = 12;
const WALL_SEGMENTS = 40;
const DEG = Math.PI / 180;

interface Chamber {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  /** Ceiling underside between these heights (lumpy), and the wall height above it. */
  ceilMin: number;
  ceilMax: number;
  wallH: number;
  /** Tunnel mouths in the wall (degrees around the chamber). */
  mouths: number[];
  /** Roof holes, as cell offsets from the center (sealed by invisible lids). */
  holes: [number, number][];
}

const MAIN: Chamber = { cx: 0, cz: 0, rx: 130, rz: 95, ceilMin: 44, ceilMax: 72, wallH: 90, mouths: [], holes: [[-3, -1], [2, 1], [4, -2]] };
/** The underground lake (ADR-0049), west. */
const LAKE: Chamber = { cx: -235, cz: 70, rx: 70, rz: 60, ceilMin: 30, ceilMax: 46, wallH: 60, mouths: [], holes: [[-1, 1]] };
/** The old mine (ADR-0049), east. */
const MINE: Chamber = { cx: 240, cz: -40, rx: 66, rz: 56, ceilMin: 32, ceilMax: 46, wallH: 60, mouths: [], holes: [[1, -1]] };

/** The main chamber's mouths: the two loops, the grotto, and the tunnels to the lake (west) and mine (east). */
const LOOPS = [
  [60, 120],
  [240, 300],
] as const;
const GROTTO_ANGLE = 215;
const TO_LAKE = 160;
const TO_MINE = 0;
MAIN.mouths = [...LOOPS.flat(), GROTTO_ANGLE, TO_LAKE, TO_MINE];

/** The wall's wobble, so chambers aren't perfect ovals (deterministic: the same on every client). */
function wobble(a: number): number {
  return 1 + 0.05 * Math.sin(5 * a) + 0.03 * Math.cos(9 * a);
}

/** A chamber wall's inner line at angle `a` (radians). */
function wallPoint(ch: Chamber, a: number): [number, number] {
  const k = wobble(a);
  return [ch.cx + ch.rx * k * Math.cos(a), ch.cz + ch.rz * k * Math.sin(a)];
}

/** Ceiling height (underside) above a point in a chamber: lumpy, between its min and max. */
function ceilingIn(ch: Chamber, x: number, z: number): number {
  const mid = (ch.ceilMin + ch.ceilMax) / 2;
  const amp = (ch.ceilMax - ch.ceilMin) / 2;
  const c = mid + amp * (0.5 * Math.sin(x * 0.035) + 0.4 * Math.cos(z * 0.05 + 0.7) + 0.25 * Math.sin((x + z) * 0.08));
  return Math.max(ch.ceilMin, Math.min(ch.ceilMax, c));
}

/** The main chamber's ceiling height (kept for callers that place things under it). */
export function ceilingAt(x: number, z: number): number {
  return ceilingIn(MAIN, x, z);
}

/** Inside a chamber's oval, scaled by `s` (1 = the wall line, roughly). */
function inChamber(ch: Chamber, x: number, z: number, s = 1): boolean {
  return ((x - ch.cx) / (ch.rx * s)) ** 2 + ((z - ch.cz) / (ch.rz * s)) ** 2 <= 1;
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

/** Where a tunnel meets a chamber at angle `aDeg`: just inside the wall, out beyond it, and the wall point. */
function mouth(ch: Chamber, aDeg: number): { inside: [number, number]; outside: [number, number]; wall: [number, number] } {
  const a = aDeg * DEG;
  const [wx, wz] = wallPoint(ch, a);
  const r = Math.hypot(wx - ch.cx, wz - ch.cz);
  const ux = (wx - ch.cx) / r;
  const uz = (wz - ch.cz) / r;
  return { inside: [wx - ux * 9, wz - uz * 9], outside: [wx + ux * TUNNEL_OUT, wz + uz * TUNNEL_OUT], wall: [wx, wz] };
}

/** The angle (degrees) on chamber `ch` facing the point (x, z). */
function facing(ch: Chamber, x: number, z: number): number {
  return (Math.atan2((z - ch.cz) / ch.rz, (x - ch.cx) / ch.rx) * 180) / Math.PI;
}

/** A loop tunnel leaving the main chamber at a1 and coming back at a2 (degrees), just outside the wall. */
function loopPath(a1: number, a2: number): [number, number][] {
  const path: [number, number][] = [mouth(MAIN, a1).inside];
  const steps = Math.max(2, Math.ceil(Math.abs(a2 - a1) / 9));
  for (let i = 0; i <= steps; i++) path.push(mouth(MAIN, a1 + ((a2 - a1) * i) / steps).outside);
  path.push(mouth(MAIN, a2).inside);
  return path;
}

// The side chambers' mouths face the main chamber's.
const lakeDoor = mouth(MAIN, TO_LAKE).wall;
const mineDoor = mouth(MAIN, TO_MINE).wall;
LAKE.mouths = [facing(LAKE, lakeDoor[0], lakeDoor[1])];
MINE.mouths = [facing(MINE, mineDoor[0], mineDoor[1])];

/** The mine-cart loop (ADR-0049): a rounded rectangle on the mine floor. */
const CART_LOOP = routeFromPoints(roundedRect(MINE.cx - 35, MINE.cz - 30, MINE.cx + 35, MINE.cz + 18, 10, 0, false));

const SPAWNS: readonly SpawnPoint[] = [
  ...[0.2, 0.2 + Math.PI / 2, 0.2 + Math.PI, 0.2 + (3 * Math.PI) / 2].map((a) =>
    spawnFacingCenter(Math.round(MAIN.rx * 0.55 * Math.cos(a)), Math.round(MAIN.rz * 0.55 * Math.sin(a))),
  ),
  spawnFacingCenter(-200, 25),
  spawnFacingCenter(-205, 112),
  spawnFacingCenter(228, 6),
  spawnFacingCenter(284, -78),
];

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

/** A chamber's wall (with mouths), the jambs and lintel around each mouth, and its ceiling with holes. */
function chamberShell(out: ArenaBox[], ch: Chamber): void {
  const mouths = ch.mouths.map((a) => mouth(ch, a));
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    const a1 = (i / WALL_SEGMENTS) * Math.PI * 2;
    const a2 = ((i + 1) / WALL_SEGMENTS) * Math.PI * 2;
    const [ax, az] = wallPoint(ch, a1);
    const [bx, bz] = wallPoint(ch, a2);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (mouths.some((m) => Math.hypot(m.wall[0] - mx, m.wall[1] - mz) < 24)) continue;
    // Pushed outward by half its thickness (outward is the right-hand side going around).
    along(out, ax, az, bx, bz, -WALL_T / 2, ch.wallH / 2, ch.wallH, WALL_T, 2, 'rock');
  }
  for (const aDeg of ch.mouths) {
    const a = aDeg * DEG;
    const [wx, wz] = wallPoint(ch, a);
    // The wall's direction here (tangent), from a little either side.
    const [px, pz] = wallPoint(ch, a - 0.01);
    const [qx, qz] = wallPoint(ch, a + 0.01);
    const tl = Math.hypot(qx - px, qz - pz);
    const tx = (qx - px) / tl;
    const tz = (qz - pz) / tl;
    const half = TUNNEL_W / 2 + TUNNEL_T;
    for (const s of [-1, 1]) {
      const jx = wx + tx * s * (half + 9);
      const jz = wz + tz * s * (half + 9);
      along(out, jx - tx * 9, jz - tz * 9, jx + tx * 9, jz + tz * 9, -WALL_T / 2, ch.wallH / 2, ch.wallH, WALL_T, 1, 'rock');
    }
    const lintelH = ch.wallH - TUNNEL_H - 2;
    along(out, wx - tx * half, wz - tz * half, wx + tx * half, wz + tz * half, -WALL_T / 2, TUNNEL_H + 2 + lintelH / 2, lintelH, WALL_T, 1, 'rock');
  }
  const ni = Math.ceil((ch.rx * 1.25) / CELL);
  const nj = Math.ceil((ch.rz * 1.25) / CELL);
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      const gx = ch.cx + i * CELL;
      const gz = ch.cz + j * CELL;
      if (!inChamber(ch, gx, gz, 1.25)) continue;
      const c = ceilingIn(ch, gx, gz);
      if (ch.holes.some(([hi, hj]) => hi === i && hj === j)) {
        out.push({ pos: [gx, c + SLAB / 2, gz], size: [CELL, SLAB, CELL], mat: 'invisible' });
        continue;
      }
      out.push({ pos: [gx, c + SLAB / 2, gz], size: [CELL + 0.5, SLAB, CELL + 0.5], mat: 'rock' });
    }
  }
}

/** Stalactites, stalagmites, columns and mounds in a chamber, kept clear of spawns, camps and `keepOut`. */
function formations(out: ArenaBox[], rand: () => number, ch: Chamber, counts: { tites: number; mites: number; columns: number; mounds: number }, keepOut: (x: number, z: number) => boolean = () => false): void {
  const spot = (s: number): [number, number] => {
    for (;;) {
      const x = ch.cx + (rand() * 2 - 1) * ch.rx * s;
      const z = ch.cz + (rand() * 2 - 1) * ch.rz * s;
      if (inChamber(ch, x, z, s) && !nearSpawn(x, z) && !keepOut(x, z)) return [x, z];
    }
  };
  for (let k = 0; k < counts.tites; k++) {
    const [x, z] = spot(0.88);
    const c = ceilingIn(ch, x, z);
    spike(out, x, z, c + 0.5, Math.min(c - 12, 8 + rand() * 18), 2.5 + rand() * 2.5, -1, rand() * 90);
  }
  for (let k = 0; k < counts.mites; k++) {
    const [x, z] = spot(0.86);
    spike(out, x, z, -0.3, 4 + rand() * 13, 2.5 + rand() * 3, 1, rand() * 90);
  }
  for (let k = 0; k < counts.columns; k++) {
    const [x, z] = spot(0.7);
    const c = ceilingIn(ch, x, z) + 0.5;
    // An hourglass column joining floor and ceiling.
    const widths = [8, 5.5, 4, 5.5, 8];
    const seg = c / widths.length;
    widths.forEach((w, j) => out.push({ pos: [x, seg * j + seg / 2, z], size: [w, seg + 0.8, w], rot: [0, j * 23 + k * 11, 0], mat: 'rock' }));
  }
  for (let k = 0; k < counts.mounds; k++) {
    const [x, z] = spot(0.85);
    const h = 1.5 + rand() * 3.5;
    out.push({ pos: [x, h / 2 - 0.5, z], size: [8 + rand() * 10, h, 6 + rand() * 8], rot: [0, rand() * 180, 0], mat: 'rock' });
  }
  // Crystals along the wall.
  for (let k = 0; k < 8; k++) {
    const a = rand() * Math.PI * 2;
    const [wx, wz] = wallPoint(ch, a);
    const x = ch.cx + (wx - ch.cx) * 0.92;
    const z = ch.cz + (wz - ch.cz) * 0.92;
    if (nearSpawn(x, z) || keepOut(x, z)) continue;
    crystals(out, rand, x, z, 0, 3 + Math.floor(rand() * 4));
  }
}

/** The crystal grotto off the main chamber: a 36 m room with its door facing the chamber. */
function grotto(out: ArenaBox[], rand: () => number): void {
  const g = mouth(MAIN, GROTTO_ANGLE);
  const gr = Math.hypot(g.wall[0], g.wall[1]);
  const ux = g.wall[0] / gr;
  const uz = g.wall[1] / gr;
  const roomHalf = 18;
  const room: [number, number] = [g.wall[0] + ux * 45, g.wall[1] + uz * 45];
  const front: [number, number] = [room[0] - ux * (roomHalf + 2), room[1] - uz * (roomHalf + 2)];
  tunnel(out, [g.inside, front]);
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
  for (let k = 0; k < 5; k++) {
    const [x, z] = local((rand() - 0.5) * 28, (rand() - 0.5) * 28);
    spike(out, x, z, rh + 0.5, 4 + rand() * 6, 1.6 + rand(), -1, rand() * 90);
  }
}

/** The underground lake (ADR-0049): water over most of the floor, an island, and a stone arch bridge. */
function lake(out: ArenaBox[], rand: () => number): void {
  const { cx, cz } = LAKE;
  water(out, cx - 15, cz, 90, 70);
  water(out, cx - 15, cz, 70, 96);
  // The island: a rock mound with a crystal spire.
  out.push({ pos: [cx - 20, 1.5, cz + 5], size: [18, 3, 14], rot: [0, 25, 0], mat: 'rock' });
  crystals(out, rand, cx - 20, cz + 5, 3, 7);
  // A stone arch bridge across the water from shore to shore.
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push([cx - 62 + 94 * t, 0.5 + 12 * Math.sin(Math.PI * t), cz + 30]);
  }
  for (let i = 0; i < 10; i++) beam(out, pts[i]!, pts[i + 1]!, 1.4, 'rock', 6);
}

/** The old mine (ADR-0049): a headframe with its wheel, timber props, ore piles; the cart train is a mover. */
function mine(out: ArenaBox[], rand: () => number): void {
  const { cx, cz } = MINE;
  // Headframe over the shaft, inside the cart loop.
  tower(out, cx, cz - 6, 6, 26, 6, 0, false);
  hoop(out, [cx, 28, cz - 6], 3.5, 0, 0.5, 'steel', 12);
  beam(out, [cx - 3, 0, cz + 6], [cx, 26, cz - 6], 0.8, 'orange');
  beam(out, [cx + 3, 0, cz + 6], [cx, 26, cz - 6], 0.8, 'orange');
  out.push({ pos: [cx, 0.3, cz - 6], size: [8, 0.6, 8], mat: 'steel' });
  // Timber props along the walls: pairs of posts with a crossbeam.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    const [wx, wz] = wallPoint(MINE, a);
    const x = cx + (wx - cx) * 0.9;
    const z = cz + (wz - cz) * 0.9;
    if (nearSpawn(x, z, 10) || cartNear(x, z)) continue;
    const tx = -Math.sin(a) * 3;
    const tz = Math.cos(a) * 3;
    for (const s of [-1, 1]) out.push({ pos: [x + tx * s, 6, z + tz * s], size: [0.8, 12, 0.8], mat: 'brick' });
    beam(out, [x - tx, 12, z - tz], [x + tx, 12, z + tz], 0.9, 'brick');
  }
  // Ore piles outside the loop.
  for (const [dx, dz] of [[-50, -10], [48, 22], [-45, 30]] as const) {
    out.push({ pos: [cx + dx, 2, cz + dz], size: [10 + rand() * 4, 4, 8 + rand() * 4], rot: [0, rand() * 90, 0], mat: 'rock' });
  }
}

/** Close to the mine-cart track (no props on it). */
function cartNear(x: number, z: number): boolean {
  return CART_LOOP.points.some((p) => Math.hypot(p[0] - x, p[2] - z) < 7);
}

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const rand = mulberry32(48);
  boundary(out, HALF);
  pads(out, SPAWNS);

  for (const ch of [MAIN, LAKE, MINE]) chamberShell(out, ch);
  // Tunnels: two loops, the grotto, and straight runs to the lake and the mine.
  for (const [a1, a2] of LOOPS) tunnel(out, loopPath(a1, a2));
  grotto(out, rand);
  tunnel(out, [mouth(MAIN, TO_LAKE).inside, mouth(LAKE, LAKE.mouths[0]!).inside]);
  tunnel(out, [mouth(MAIN, TO_MINE).inside, mouth(MINE, MINE.mouths[0]!).inside]);

  formations(out, rand, MAIN, { tites: 46, mites: 30, columns: 5, mounds: 12 });
  // The lake's floor is water: stalactites only.
  formations(out, rand, LAKE, { tites: 14, mites: 0, columns: 0, mounds: 0 });
  lake(out, rand);
  // The mine floor stays clear for the cart loop.
  formations(out, rand, MINE, { tites: 12, mites: 0, columns: 0, mounds: 0 }, cartNear);
  mine(out, rand);

  // Small stalactites and crystals along the loop tunnels.
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

/** Rails under the cart loop: drawn, never collided with. */
function buildDecor(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const pts = CART_LOOP.points;
  for (const s of [-0.8, 0.8]) {
    const rail: [number, number, number][] = [];
    for (let i = 0; i <= pts.length; i++) {
      const a = pts[i % pts.length]!;
      const b = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      rail.push([a[0] - ((b[2] - a[2]) / len) * s, 0.08, a[2] + ((b[0] - a[0]) / len) * s]);
    }
    polyBeam(out, rail, 0.15, 'steel');
  }
  return out;
}

/** The mine-cart train (ADR-0049): four carts running the loop. */
function carts(): MoverDef[] {
  const colors = ['#8a5a3c', '#5a5f66', '#8a5a3c', '#ff8a2a'];
  return colors.map((color, i) => ({ kind: 'coasterCar' as const, route: CART_LOOP, offset: -i * 4, speed: 9, color, size: [2, 1.6, 3.2] as V3, lift: 0.85 }));
}

/** Miners' camps: fuel drums and a propane tank near the north and south tunnels, and in the mine (ADR-0023). */
const drums = (x: number, z: number): ExplosiveDef[] =>
  [[0, 0], [1.4, 0], [0.7, 1.2]].map(([dx, dz]) => ({ kind: 'fuel' as const, pos: [x + dx!, 0.8, z + dz!], size: [1.2, 1.6, 1.2] }));
const EXPLOSIVES: ExplosiveDef[] = [
  ...drums(-30, 70),
  ...drums(34, -72),
  ...drums(MINE.cx + 20, MINE.cz + 30),
  { kind: 'propane', pos: [-14, 1.2, 72], size: [2.4, 2.4, 6], yawDeg: 90 },
  { kind: 'propane', pos: [18, 1.2, -74], size: [2.4, 2.4, 6], yawDeg: 90 },
];

export const CAVERN: MapDef = {
  id: 'cavern',
  name: 'Cavern',
  halfSize: HALF,
  boxes: build(),
  decor: buildDecor(),
  spawns: SPAWNS,
  ground: 'rock',
  explosives: EXPLOSIVES,
  movers: carts(),
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
