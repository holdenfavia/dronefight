import { beam, boundary, hoop, mulberry32, pads, polyBeam, spawnFacingCenter, strut, water as waterSheet } from './builders.js';
import { coasterTiming, dropTowerTiming, routeFromPoints, type MoverDef, type V3 } from './movers.js';
import type { ArenaBox, ArenaMaterial, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

/**
 * Playground (ADR-0019): a giant playground park, scaled for drones, built only from solid-color
 * grid materials. Center: a playhouse tower on stilts with two big slides. Around it: swings, monkey
 * bars, a climbing lattice, seesaw, merry-go-round, sandbox, crawl tunnel and a climbing wall.
 * Around it (ADR-0049, 3x the area), a fairground: a drop tower with a riding gondola, a Ferris wheel,
 * a carousel, a hedge maze, a pond with an arched bridge, a spiral slide tower, a bouncy castle and two
 * tethered hot-air balloons.
 */

const HALF = 280;
const FENCE = 270;
const DEG = 180 / Math.PI;

type Mat = Extract<ArenaMaterial, `grid${string}`>;

const SPAWNS: readonly SpawnPoint[] = [
  spawnFacingCenter(0, 132),
  spawnFacingCenter(0, -132),
  spawnFacingCenter(132, 0),
  spawnFacingCenter(-132, 0),
  // The fairground (ADR-0049).
  spawnFacingCenter(60, 232),
  spawnFacingCenter(236, -40),
  spawnFacingCenter(-236, 0),
  spawnFacingCenter(-40, -238),
];

/** Drop tower (ADR-0049): where it stands, how high the gondola rides, and the ride's timing. */
const DROP = { x: 0, z: 205, base: 2, height: 58 } as const;
const DROP_TIMING = dropTowerTiming(DROP.height);

const box = (out: ArenaBox[], pos: [number, number, number], size: [number, number, number], mat: Mat, rot?: [number, number, number]) =>
  out.push(rot ? { pos, size, mat, rot } : { pos, size, mat });

/**
 * A slide running along ±X: its top surface goes from (x0, topY) at the top down to the ground `run`
 * metres away, with raised side rails. dir = +1 slides toward +X, -1 toward -X.
 */
function slide(out: ArenaBox[], x0: number, z: number, topY: number, run: number, width: number, dir: 1 | -1, bed: Mat, rails: Mat): void {
  const length = Math.hypot(run, topY);
  const a = Math.atan2(topY, run);
  const t = 0.8;
  // Rotation about Z: tilt so the far end is on the ground.
  const rotZ = -dir * a * DEG;
  // Top-surface midpoint, and the surface normal (tilted back toward the top).
  const mx = x0 + (dir * run) / 2;
  const my = topY / 2;
  const nx = dir * Math.sin(a);
  const ny = Math.cos(a);
  box(out, [mx - nx * (t / 2), my - ny * (t / 2), z], [length, t, width], bed, [0, 0, rotZ]);
  for (const side of [-1, 1]) {
    box(out, [mx + nx * 0.6, my + ny * 0.6, z + side * (width / 2 + 0.2)], [length, 1.2, 0.4], rails, [0, 0, rotZ]);
  }
}

/** A-frame legs (two legs meeting at the top), standing at x, leaning in along Z. */
function aFrame(out: ArenaBox[], x: number, z: number, height: number, spread: number, mat: Mat): void {
  const lean = Math.atan2(spread, height);
  const len = Math.hypot(spread, height);
  for (const side of [-1, 1]) {
    // Leg from (z + side*spread, 0) up to (z, height). Rotation about X tilts local +Y toward +Z for positive angles.
    box(out, [x, height / 2, z + (side * spread) / 2], [1.2, len, 1.2], mat, [-side * lean * DEG, 0, 0]);
  }
}

/** A swing hanging from a top bar at (x, barY, z), swung out by `angle` degrees about the bar. */
function swing(out: ArenaBox[], x: number, barY: number, z: number, angle: number, chainMat: Mat, seatMat: Mat): void {
  const chain = 17;
  const r = (angle * Math.PI) / 180;
  // Point `d` metres down the (rotated) chain from the pivot. Rotating by -angle about X swings the
  // chain's lower end toward +Z for positive angles.
  const at = (d: number): [number, number] => [barY - d * Math.cos(r), z + d * Math.sin(r)];
  for (const dx of [-1.6, 1.6]) {
    const [cy, cz] = at(chain / 2);
    box(out, [x + dx, cy, cz], [0.25, chain, 0.25], chainMat, [-angle, 0, 0]);
  }
  const [sy, sz] = at(chain + 0.2);
  box(out, [x, sy, sz], [4, 0.4, 1.8], seatMat, [-angle, 0, 0]);
}

/** A cubic climbing lattice of `cells`^3 cells, each `cell` metres, with bars along every grid line. */
function lattice(out: ArenaBox[], x: number, z: number, cells: number, cell: number, mat: Mat): void {
  const bar = 0.6;
  const size = cells * cell;
  const x0 = x - size / 2;
  const z0 = z - size / 2;
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      // Verticals, and horizontals along X and Z, each spanning the full lattice plus the bar thickness.
      // Uprights reach the top of the top rails (size + bar), so the top corners close.
      box(out, [x0 + i * cell, (size + bar) / 2, z0 + j * cell], [bar, size + bar, bar], mat);
      box(out, [x, j * cell + bar / 2, z0 + i * cell], [size + bar, bar, bar], mat);
      box(out, [x0 + i * cell, j * cell + bar / 2, z], [bar, bar, size + bar], mat);
    }
  }
}

/** An octagonal disc (two overlapping squares, one turned 45°). */
function octagon(out: ArenaBox[], x: number, y: number, z: number, across: number, thick: number, mat: Mat): void {
  const side = across;
  box(out, [x, y, z], [side, thick, side], mat);
  box(out, [x, y, z], [side, thick, side], mat, [0, 45, 0]);
}

/** A blocky lollipop tree. */
function tree(out: ArenaBox[], x: number, z: number, h: number): void {
  box(out, [x, h / 2, z], [1.6, h, 1.6], 'gridOrange');
  box(out, [x, h + 3, z], [9, 7, 9], 'gridGreen');
  box(out, [x, h + 7.2, z], [5.5, 2.4, 5.5], 'gridGreen');
}

/**
 * Roller coaster (ADR-0020): a hilly loop around the park (an ellipse, 128 x 108 m, between 8 and 36 m
 * up), clear of every other structure. The track is static boxes; the train is a mover.
 */
const COASTER_POINTS: V3[] = [];
for (let i = 0; i < 240; i++) {
  const a = (i / 240) * Math.PI * 2;
  COASTER_POINTS.push([128 * Math.cos(a), 22 + 9 * Math.sin(3 * a) + 5 * Math.sin(2 * a + 1), 108 * Math.sin(a)]);
}
const COASTER_ROUTE = routeFromPoints(COASTER_POINTS);
const COASTER_TIMING = coasterTiming(COASTER_ROUTE, 6);

function coaster(out: ArenaBox[]): void {
  const n = COASTER_POINTS.length;
  for (let i = 0; i < n; i++) {
    const a = COASTER_POINTS[i]!;
    const b = COASTER_POINTS[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const flat = Math.hypot(dx, dz);
    const len = Math.hypot(flat, dy) + 0.35; // slight overlap so segments join without gaps
    // Length along local X: yaw about Y, pitch about Z (Euler XYZ with X = 0).
    const rot: [number, number, number] = [0, Math.atan2(-dz, dx) * DEG, Math.atan2(dy, flat) * DEG];
    const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    box(out, mid, [len, 0.5, 2.6], 'gridRed', rot);
    // Rails either side, level with the bed's top.
    const lx = -dz / flat;
    const lz = dx / flat;
    for (const s of [-1, 1]) box(out, [mid[0] + lx * s * 1.15, mid[1] + 0.4, mid[2] + lz * s * 1.15], [len, 0.3, 0.3], 'gridWhite', rot);
    // Support columns every 8 segments, down to the ground, skipped near spawns.
    if (i % 8 === 0) {
      const nearSpawn = SPAWNS.some((sp) => Math.hypot(sp.pos[0] - a[0], sp.pos[2] - a[2]) < 12);
      if (!nearSpawn) box(out, [a[0], (a[1] - 0.25) / 2, a[2]], [0.9, a[1] - 0.25, 0.9], 'gridWhite');
    }
  }
}

/** The drop tower's gondola: four seats around the tower riding up together and dropping. */
function dropTowerSeats(): MoverDef[] {
  const colors = ['#e5483e', '#f5c63a', '#2f7fe0', '#45b865'];
  return ([[0, 3.6, 0], [3.6, 0, 270], [0, -3.6, 180], [-3.6, 0, 90]] as const).map(([dx, dz, heading], i) => ({
    kind: 'coasterCar' as const,
    route: routeFromPoints([
      [DROP.x + dx, DROP.base, DROP.z + dz],
      [DROP.x + dx, DROP.base + DROP.height, DROP.z + dz],
    ]),
    offset: 0,
    timing: DROP_TIMING,
    heading,
    color: colors[i]!,
    size: [2.6, 1.6, 2.2] as V3,
    lift: 0,
  }));
}

function coasterTrain(): MoverDef[] {
  const colors = ['#f5c63a', '#2f7fe0', '#45b865', '#8a5cd6'];
  return colors.map((color, i) => ({
    kind: 'coasterCar' as const,
    route: COASTER_ROUTE,
    offset: -i * 4,
    timing: COASTER_TIMING,
    color,
    size: [2.2, 1.6, 3.6] as V3,
    lift: 1.05,
  }));
}

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  boundary(out, HALF);
  pads(out, SPAWNS);

  // Perimeter fence: posts and two rails.
  for (const s of [-1, 1]) {
    for (let t = -FENCE; t <= FENCE; t += 10) {
      box(out, [t, 2, s * FENCE], [0.8, 4, 0.8], 'gridWhite');
      box(out, [s * FENCE, 2, t], [0.8, 4, 0.8], 'gridWhite');
    }
    for (const y of [1.4, 3.4]) {
      box(out, [0, y, s * FENCE], [FENCE * 2 + 0.8, 0.4, 0.4], 'gridWhite');
      box(out, [s * FENCE, y, 0], [0.4, 0.4, FENCE * 2 + 0.8], 'gridWhite');
    }
  }

  // --- Playhouse tower on stilts, with a gable roof, a flag and two slides.
  const deckY = 20;
  for (const sx of [-9, 9]) for (const sz of [-9, 9]) box(out, [sx, deckY / 2, sz], [1.6, deckY, 1.6], 'gridBlue');
  box(out, [0, deckY + 0.5, 0], [20, 1, 20], 'gridYellow');
  // Walls with a doorway in the middle of each side (fly straight through the house).
  const wallH = 6;
  const wallY = deckY + 1 + wallH / 2;
  for (const s of [-1, 1]) {
    for (const half of [-1, 1]) {
      box(out, [half * 6.75, wallY, s * 9.6], [6.5, wallH, 0.8], 'gridRed');
      box(out, [s * 9.6, wallY, half * 6.75], [0.8, wallH, 6.5], 'gridRed');
    }
    // Lintel over each doorway.
    box(out, [0, deckY + 1 + wallH - 0.6, s * 9.6], [7, 1.2, 0.8], 'gridRed');
    box(out, [s * 9.6, deckY + 1 + wallH - 0.6, 0], [0.8, 1.2, 7], 'gridRed');
  }
  // Gable roof: two slabs meeting at a ridge along Z.
  const roofBase = deckY + 1 + wallH;
  const pitch = 35;
  const halfSpan = 11;
  const slabW = halfSpan / Math.cos((pitch * Math.PI) / 180);
  const rise = halfSpan * Math.tan((pitch * Math.PI) / 180);
  for (const s of [-1, 1]) {
    box(out, [(s * halfSpan) / 2, roofBase + rise / 2, 0], [slabW, 0.8, 22], 'gridPurple', [0, 0, -s * pitch]);
  }
  box(out, [0, roofBase + rise + 4, 0], [0.4, 8, 0.4], 'gridWhite');
  box(out, [2, roofBase + rise + 6.8, 0], [4, 2.4, 0.2], 'gridOrange');
  // Slides off the east (long, gentle) and west (short, steep) doorways.
  slide(out, 10, 0, deckY + 1, 42, 7, 1, 'gridYellow', 'gridRed');
  slide(out, -10, 0, deckY + 1, 26, 6, -1, 'gridBlue', 'gridWhite');
  // Stairs up the south side.
  for (let i = 0; i < 20; i++) box(out, [0, (i + 0.5) * 1.05, 10 + 20 - i * 1], [6, 1.05, 1.05], 'gridGreen');

  // --- Swing set north of the house: A-frames, top bar, three swings (one mid-swing).
  const barY = 25;
  aFrame(out, -26, 90, barY, 8, 'gridRed');
  aFrame(out, 26, 90, barY, 8, 'gridRed');
  box(out, [0, barY + 0.2, 90], [54, 1.4, 1.4], 'gridRed');
  swing(out, -13, barY, 90, 0, 'gridWhite', 'gridBlue');
  swing(out, 0, barY, 90, 32, 'gridWhite', 'gridYellow');
  swing(out, 13, barY, 90, -12, 'gridWhite', 'gridGreen');

  // --- Monkey bars: two ladder towers joined by rails with rungs.
  const mx = -80;
  const mz = 55;
  const mbY = 14;
  for (const end of [-16, 16]) {
    for (const sx of [-2.2, 2.2]) box(out, [mx + sx, mbY / 2, mz + end], [0.6, mbY, 0.6], 'gridYellow');
    for (let y = 2; y < mbY; y += 2) box(out, [mx, y, mz + end], [4.4, 0.4, 0.4], 'gridYellow');
  }
  for (const sx of [-2.2, 2.2]) box(out, [mx + sx, mbY, mz], [0.6, 0.6, 32.6], 'gridBlue');
  for (let t = -15; t <= 15; t += 2) box(out, [mx, mbY, mz + t], [4.4, 0.35, 0.35], 'gridBlue');

  // --- Climbing lattice.
  lattice(out, 80, 55, 3, 8, 'gridPurple');

  // --- Seesaw.
  box(out, [-60, 2.5, -60], [3, 5, 5], 'gridGreen');
  const plankTilt = 11;
  box(out, [-60, 5.4, -60], [46, 1, 5], 'gridOrange', [0, 0, plankTilt]);
  for (const s of [-1, 1]) {
    const px = -60 + s * 20 * Math.cos((plankTilt * Math.PI) / 180);
    const py = 5.4 + s * 20 * Math.sin((plankTilt * Math.PI) / 180);
    box(out, [px, py + 2, -60], [0.5, 3.4, 4], 'gridRed', [0, 0, plankTilt]);
  }

  // --- Merry-go-round.
  octagon(out, 60, 1.2, -60, 22, 1.2, 'gridRed');
  box(out, [60, 5.8, -60], [1.4, 8, 1.4], 'gridYellow');
  for (let k = 0; k < 4; k++) {
    box(out, [60, 5, -60], [20, 0.5, 0.5], 'gridYellow', [0, k * 45, 0]);
  }

  // --- Sandbox with sandcastles.
  box(out, [0, 0.1, -95], [34, 0.2, 34], 'gridSand');
  for (const s of [-1, 1]) {
    box(out, [0, 0.9, -95 + s * 17], [34.8, 1.8, 0.8], 'gridRed');
    box(out, [s * 17, 0.9, -95], [0.8, 1.8, 34.8], 'gridRed');
  }
  box(out, [-6, 2.2, -98], [7, 4.4, 7], 'gridSand');
  box(out, [-6, 5.6, -98], [3.5, 2.4, 3.5], 'gridSand');
  box(out, [7, 1.6, -90], [5, 3.2, 5], 'gridSand');

  // --- Crawl tunnel (big enough to fly through).
  const tx = -110;
  const tz = -10;
  for (const s of [-1, 1]) box(out, [tx + s * 3.6, 3.6, tz], [0.8, 7.2, 36], 'gridGreen');
  box(out, [tx, 7.6, tz], [8, 0.8, 36], 'gridGreen');
  box(out, [tx, 0.1, tz], [8, 0.2, 36], 'gridYellow');

  // --- Climbing wall, leaning back, with colored holds.
  const wallTilt = 12;
  box(out, [110, 12, -10], [30, 24, 1.5], 'gridBlue', [wallTilt, 0, 0]);
  const holds: Mat[] = ['gridYellow', 'gridRed', 'gridGreen', 'gridOrange', 'gridPurple'];
  let h = 0;
  for (let y = 3; y < 22; y += 3.5) {
    for (let x = -12; x <= 12; x += 6) {
      const jitter = ((h * 7) % 5) - 2;
      // On the face toward -Z, following the lean (the wall's top leans toward +Z).
      const dz = -0.9 + Math.tan((wallTilt * Math.PI) / 180) * (y - 12);
      box(out, [110 + x + jitter, y, -10 + dz], [1.4, 1.1, 0.6], holds[h % holds.length]!, [wallTilt, 0, 0]);
      h++;
    }
  }

  // --- Rope bridge from the playhouse's open (-Z) doorway to a lookout tower, sagging in the middle.
  const lz = -45;
  for (const sx of [-4, 4]) for (const sz of [-4, 4]) box(out, [sx, deckY / 2, lz + sz], [1.2, deckY, 1.2], 'gridOrange');
  box(out, [0, deckY + 0.5, lz], [10, 1, 10], 'gridGreen');
  for (const s of [-1, 1]) box(out, [s * 4.6, deckY + 2, lz], [0.8, 3, 10], 'gridWhite');
  box(out, [0, deckY + 2, lz - 4.6], [10, 3, 0.8], 'gridWhite');
  const bridgeAt = (t: number): [number, number] => [deckY + 1 - 3 * Math.sin(Math.PI * t), -10 - 30 * t];
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const [y1, z1] = bridgeAt(i / segs);
    const [y2, z2] = bridgeAt((i + 1) / segs);
    const len = Math.hypot(y2 - y1, z2 - z1) + 0.2;
    const tilt = Math.atan2(-(y2 - y1), z2 - z1) * DEG;
    box(out, [0, (y1 + y2) / 2 - 0.2, (z1 + z2) / 2], [4, 0.4, len], 'gridYellow', [tilt, 0, 0]);
    // Rope handrails 1.5 m above the planks.
    for (const s of [-1, 1]) strut(out, [s * 2, y1 + 1.5, z1], [s * 2, y2 + 1.5, z2], 0.25, 'gridWhite');
  }

  // --- Rocket climber: a tall column with platform rings, fins and a nose cone.
  const rx = -75;
  const rz = -25;
  box(out, [rx, 14, rz], [2, 28, 2], 'gridWhite');
  for (const [i, y] of [6, 13, 20].entries()) octagon(out, rx, y, rz, 11 - i * 1.5, 0.8, i % 2 === 0 ? 'gridRed' : 'gridBlue');
  for (const [w, h, y] of [[4, 2, 29], [2.6, 2, 31], [1.2, 2, 33]] as const) box(out, [rx, y, rz], [w, h, w], 'gridRed');
  for (const deg of [0, 120, 240]) {
    const a = (deg * Math.PI) / 180;
    box(out, [rx + 3.5 * Math.cos(a), 2.5, rz + 3.5 * Math.sin(a)], [5, 5, 0.6], 'gridOrange', [0, -deg, 0]);
  }

  // --- Rainbow arch climbers east of the house: three hoops to string together.
  const archMats: Mat[] = ['gridRed', 'gridYellow', 'gridGreen'];
  for (const [i, ax] of [68, 76, 84].entries()) {
    const r = 14 - i * 2;
    const n = 12;
    for (let k = 0; k < n; k++) {
      const t1 = (k / n) * Math.PI;
      const t2 = ((k + 1) / n) * Math.PI;
      strut(out, [ax, r * Math.sin(t1), -10 - r * Math.cos(t1)], [ax, r * Math.sin(t2), -10 - r * Math.cos(t2)], 0.9, archMats[i]!);
    }
  }

  // --- Spring riders beside the sandbox.
  for (const [x, z, mat] of [[-32, -86, 'gridPurple'], [-30, -100, 'gridYellow']] as const) {
    box(out, [x, 1.5, z], [0.6, 3, 0.6], 'gridWhite');
    box(out, [x, 4, z], [2.4, 2, 5], mat);
    box(out, [x, 5.6, z - 2], [2, 2.2, 1.6], mat);
  }

  coaster(out);
  fairground(out);

  // --- Trees, benches and hopscotch around the paths.
  for (const [x, z, th] of [
    [-45, 120, 9],
    [45, 120, 11],
    [-125, 60, 10],
    [125, 70, 9],
    [-40, -125, 10],
    [40, -125, 12],
    [-130, -70, 9],
    [130, -60, 11],
  ] as const) {
    tree(out, x, z, th);
  }
  for (const [x, z, yaw] of [
    [-30, 60, 0],
    [30, 60, 0],
    [-40, -30, 90],
    [40, -30, 90],
  ] as const) {
    box(out, [x, 1.3, z], [7, 0.4, 2], 'gridOrange', [0, yaw, 0]);
    box(out, [x, 0.55, z], [6, 1.1, 1.2], 'gridWhite', [0, yaw, 0]);
  }
  return out;
}

// --- The fairground (ADR-0049)

function fairground(out: ArenaBox[]): void {
  dropTower(out);
  ferrisWheel(out, 210, 90);
  carousel(out, -205, 70);
  hedgeMaze(out, -200, -160);
  pond(out, 195, -165);
  spiralSlide(out, 110, -215);
  bouncyCastle(out, -75, 215);
  balloon(out, 150, 200, 58, 'gridRed', 'gridYellow');
  balloon(out, -150, 205, 66, 'gridBlue', 'gridWhite');
}

/** The drop tower: a striped column with a crown; the gondola is a mover. */
function dropTower(out: ArenaBox[]): void {
  const { x, z, base, height } = DROP;
  const top = base + height + 8;
  box(out, [x, 0.5, z], [14, 1, 14], 'gridWhite');
  for (let y = 0; y < top; y += 8) box(out, [x, y + 4, z], [3, 8.05, 3], y % 16 === 0 ? 'gridRed' : 'gridWhite');
  box(out, [x, top + 1, z], [9, 2, 9], 'gridYellow');
  box(out, [x, top + 3, z], [5, 2, 5], 'gridRed');
  box(out, [x, top + 6, z], [0.6, 4, 0.6], 'gridWhite');
}

/** A Ferris wheel facing east: rim, spokes, hanging gondolas, on two A-frame legs. */
function ferrisWheel(out: ArenaBox[], x: number, z: number): void {
  const hubY = 34;
  const r = 28;
  for (const dx of [-2, 2]) hoop(out, [x + dx, hubY, z], r, 90, 0.9, 'gridPurple', 24);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const py = hubY + Math.sin(a) * r;
    const pz = z + Math.cos(a) * r;
    beam(out, [x, hubY, z], [x, py, pz], 0.5, 'gridWhite');
    box(out, [x, py - 2.2, pz], [3.4, 2.4, 2.4], (['gridRed', 'gridYellow', 'gridBlue', 'gridGreen'] as const)[k % 4]);
  }
  box(out, [x, hubY, z], [6, 2, 2], 'gridYellow');
  for (const dx of [-3.5, 3.5]) {
    beam(out, [x + dx, 0, z - 14], [x + dx, hubY, z], 1.2, 'gridWhite');
    beam(out, [x + dx, 0, z + 14], [x + dx, hubY, z], 1.2, 'gridWhite');
  }
}

/** A carousel: platform, center pole, canopy and horses on poles. */
function carousel(out: ArenaBox[], x: number, z: number): void {
  octagon(out, x, 0.6, z, 26, 1.2, 'gridYellow');
  box(out, [x, 6, z], [2.4, 12, 2.4], 'gridRed');
  octagon(out, x, 11.5, z, 30, 1, 'gridRed');
  box(out, [x, 13.2, z], [10, 2.4, 10], 'gridWhite', [0, 45, 0]);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const hx = x + Math.cos(a) * 10;
    const hz = z + Math.sin(a) * 10;
    box(out, [hx, 6.5, hz], [0.25, 10, 0.25], 'gridWhite');
    box(out, [hx, 3 + (k % 2), hz], [1, 1.4, 2.8], (['gridWhite', 'gridBlue', 'gridPurple'] as const)[k % 3], [0, (-a * 180) / Math.PI, 0]);
  }
}

/** A hedge maze (8x8 cells of 8 m, walls 6 m high): fly it low, or skim over the top. */
function hedgeMaze(out: ArenaBox[], cx: number, cz: number): void {
  const n = 8;
  const cell = 8;
  const rand = mulberry32(19);
  const x0 = cx - (n * cell) / 2;
  const z0 = cz - (n * cell) / 2;
  // Carve a perfect maze (depth-first), then knock out a few extra walls so it has loops.
  const east = Array.from({ length: n }, () => Array(n).fill(true) as boolean[]);
  const south = Array.from({ length: n }, () => Array(n).fill(true) as boolean[]);
  const seen = Array.from({ length: n }, () => Array(n).fill(false) as boolean[]);
  const stack: [number, number][] = [[0, 0]];
  seen[0]![0] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1]!;
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([di, dj]) => [i + di, j + dj] as const).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen[a]![b]);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [a, b] = next[Math.floor(rand() * next.length)]!;
    if (a > i) east[i]![j] = false;
    else if (a < i) east[a]![b] = false;
    else if (b > j) south[i]![j] = false;
    else south[a]![b] = false;
    seen[a]![b] = true;
    stack.push([a, b]);
  }
  for (let k = 0; k < 8; k++) east[Math.floor(rand() * (n - 1))]![Math.floor(rand() * n)] = false;
  const h = 6;
  const wall = (x: number, z: number, w: number, d: number) => box(out, [x, h / 2, z], [w, h, d], 'gridGreen');
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      if (i < n - 1 && east[i]![j]) wall(x + cell, z + cell / 2, 1, cell + 1);
      if (j < n - 1 && south[i]![j]) wall(x + cell / 2, z + cell, cell + 1, 1);
    }
  }
  // Outer walls with an entrance and an exit.
  for (let k = 0; k < n; k++) {
    if (k !== 0) wall(x0 + k * cell + cell / 2, z0, cell + 1, 1);
    if (k !== n - 1) wall(x0 + k * cell + cell / 2, z0 + n * cell, cell + 1, 1);
    wall(x0, z0 + k * cell + cell / 2, 1, cell + 1);
    wall(x0 + n * cell, z0 + k * cell + cell / 2, 1, cell + 1);
  }
}

/** A pond with an arched wooden bridge, lily pads and a little fountain. */
function pond(out: ArenaBox[], x: number, z: number): void {
  waterSheet(out, x, z, 60, 44);
  waterSheet(out, x, z, 44, 56);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([x - 36 + 72 * t, 0.4 + 7 * Math.sin(Math.PI * t), z]);
  }
  for (const dz of [-2.5, 2.5]) polyBeam(out, pts.map(([px, py, pz]) => [px, py + 1.2, pz + dz] as [number, number, number]), 0.4, 'gridWhite');
  for (let i = 0; i < 8; i++) beam(out, pts[i]!, pts[i + 1]!, 0.5, 'gridOrange', 5);
  for (const [dx, dz] of [[-15, 12], [12, -14], [18, 10], [-20, -12]] as const) box(out, [x + dx, 0.18, z + dz], [3, 0.12, 3], 'gridGreen');
  box(out, [x + 12, 2, z + 14], [1.2, 4, 1.2], 'gridBlue');
}

/** A spiral slide winding down around a tall tower. */
function spiralSlide(out: ArenaBox[], x: number, z: number): void {
  const height = 34;
  box(out, [x, height / 2, z], [4, height, 4], 'gridYellow');
  box(out, [x, height + 0.5, z], [9, 1, 9], 'gridBlue');
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 2 * 2.5;
    pts.push([x + Math.cos(a) * 9, height - t * (height - 1), z + Math.sin(a) * 9]);
  }
  for (let i = 0; i < 40; i++) beam(out, pts[i]!, pts[i + 1]!, 0.5, 'gridRed', 3.2);
}

/** A bouncy castle: a blocky castle with four turrets and battlements. */
function bouncyCastle(out: ArenaBox[], x: number, z: number): void {
  box(out, [x, 4, z], [24, 8, 18], 'gridPurple');
  for (const [dx, dz] of [[-12, -9], [12, -9], [-12, 9], [12, 9]] as const) {
    box(out, [x + dx, 7, z + dz], [5, 14, 5], 'gridYellow');
    box(out, [x + dx, 15, z + dz], [6, 2, 6], 'gridRed');
  }
  for (let k = -10; k <= 10; k += 4) box(out, [x + k, 9, z - 9], [2, 2, 1], 'gridYellow');
  // A doorway arch on the front to fly into.
  box(out, [x, 3, z - 9.2], [8, 6, 0.6], 'gridBlue');
}

/** A tethered hot-air balloon: an envelope of stacked boxes, a basket, and a tether to the ground. */
function balloon(out: ArenaBox[], x: number, z: number, y: number, a: Mat, b: Mat): void {
  [[10, 0], [14, 4], [15, 9], [13, 14], [8, 18]].forEach(([w, dy], i) => box(out, [x, y + dy!, z], [w!, 5, w!], i % 2 ? b : a, [0, i * 22, 0]));
  box(out, [x, y - 7, z], [3, 2.4, 3], 'gridOrange');
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, 1.2]] as const) strut(out, [x + dx, y - 5.8, z + dz], [x + dx * 3, y - 1.5, z + dz * 3], 0.15, 'gridWhite');
  strut(out, [x, y - 8.2, z], [x + 6, 0, z + 6], 0.15, 'gridWhite');
  box(out, [x + 6, 0.5, z + 6], [2, 1, 2], 'gridWhite');
}

/** Things that burst or blow up when shot (ADR-0023): mostly water barrels, a few fuel drums. */
const water = (x: number, y: number, z: number, color: string): ExplosiveDef => ({ kind: 'water', pos: [x, y + 1.1, z], size: [1.6, 2.2, 1.6], color });
const EXPLOSIVES: ExplosiveDef[] = [
  // On the lookout tower's deck (top at 21).
  water(-2.5, 21, -47, '#2f7fe0'),
  water(2.5, 21, -47, '#45b865'),
  // By the swings, the slide end and the sandbox.
  water(-34, 0, 90, '#f5c63a'),
  water(34, 0, 90, '#8a5cd6'),
  water(58, 0, 9, '#2f7fe0'),
  water(20, 0, -88, '#e5483e'),
  // Fuel drums by the tunnel mouth.
  ...[[-103, 12], [-101.6, 12], [-102.3, 13.2]].map(([x, z]) => ({ kind: 'fuel' as const, pos: [x!, 0.8, z!] as [number, number, number], size: [1.2, 1.6, 1.2] as [number, number, number] })),
];

/** Painted hopscotch squares: flat, never collided with. */
function buildDecor(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const colors: Mat[] = ['gridRed', 'gridBlue', 'gridYellow', 'gridGreen', 'gridPurple', 'gridOrange'];
  const cells: [number, number][] = [[0, 0], [0, 1], [-0.55, 2], [0.55, 2], [0, 3], [-0.55, 4], [0.55, 4], [0, 5]];
  cells.forEach(([cx, cz], i) => {
    out.push({ pos: [cx * 5, 0.02, 45 + cz * 5], size: [4.4, 0.04, 4.4], mat: colors[i % colors.length]! });
  });
  return out;
}

export const PLAYGROUND: MapDef = {
  id: 'playground',
  name: 'Playground',
  halfSize: HALF,
  boxes: build(),
  decor: buildDecor(),
  spawns: SPAWNS,
  explosives: EXPLOSIVES,
  ground: 'grid',
  movers: [...coasterTrain(), ...dropTowerSeats()],
};
