import { boundary, pads, spawnFacingCenter } from './builders.js';
import type { ArenaBox, ArenaMaterial, MapDef, SpawnPoint } from './types.js';

/**
 * Playground (ADR-0019): a giant playground park, scaled for drones, built only from solid-color
 * grid materials. Center: a playhouse tower on stilts with two big slides. Around it: swings, monkey
 * bars, a climbing lattice, seesaw, merry-go-round, sandbox, crawl tunnel and a climbing wall.
 */

const HALF = 160;
const FENCE = 150;
const DEG = 180 / Math.PI;

type Mat = Extract<ArenaMaterial, `grid${string}`>;

const SPAWNS: readonly SpawnPoint[] = [
  spawnFacingCenter(0, 132),
  spawnFacingCenter(0, -132),
  spawnFacingCenter(132, 0),
  spawnFacingCenter(-132, 0),
  spawnFacingCenter(-120, 120),
  spawnFacingCenter(120, 120),
  spawnFacingCenter(-120, -120),
  spawnFacingCenter(120, -120),
];

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
  ground: 'grid',
};
