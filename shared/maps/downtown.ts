import { BEAM, beam, boundary, cubeFrame, gate, hoop, mulberry32, pads, polyBeam, spawnFacingCenter, tower, water } from './builders.js';
import { routeFromPoints, roundedRect, type MoverDef, type V3 } from './movers.js';
import type { ArenaBox, ArenaMaterial, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

/** Things that blow up when shot (ADR-0023), collected while building: parked cars, rooftop water tanks, barrels. */
const EXPLOSIVES: ExplosiveDef[] = [];
/** Parked-car paint, picked like the old box materials so the layout (random sequence) stays the same. */
const PARKED_COLORS: Record<string, string> = { white: '#e9e9e6', steel: '#8d949b', orange: '#ff8a2a', glass: '#2f6fb8' };

/**
 * Downtown (ADR-0012): a 5x5 grid of city blocks with 16 m streets between them.
 * Towers of mixed heights with alleys to thread, an open parking garage, a skybridge,
 * a construction site with a crane, and a plaza in the middle for open dogfighting.
 * Around it (ADR-0049, 3x the area): a river with a suspension bridge and an arch bridge, a stadium, a
 * sculpture park of giant hoops, an elevated highway with ramps, a radio mast, and a rail viaduct with a train.
 */

const HALF = 260;
/** The old city's edge: the outskirts (ADR-0049) start beyond it. */
const CITY = 150;
/** The river runs east-west across the north (z from 175 to 225). */
const RIVER_Z = 200;
const RIVER_W = 50;
/** Block centers along each axis. Streets run between them at ±30 and ±90. */
const BLOCKS = [-120, -60, 0, 60, 120];
const STREETS = [-90, -30, 30, 90];
/** Buildable half-width of a block (sidewalk runs to ±24). */
const LOT = 20;
const FLOOR = 4;

const SPAWNS: readonly SpawnPoint[] = [
  // Four in the city, four in the outskirts (ADR-0049) so fights spread over the bigger map.
  spawnFacingCenter(-30, 90),
  spawnFacingCenter(30, -90),
  spawnFacingCenter(90, -30),
  spawnFacingCenter(-90, 30),
  spawnFacingCenter(20, 160),
  spawnFacingCenter(168, 30),
  spawnFacingCenter(-165, 100),
  spawnFacingCenter(60, -170),
];

type Rand = () => number;

function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] ?? (items[0] as T);
}

/** A building with a roof cap and rooftop clutter. Tall ones get a setback upper tier. */
function building(out: ArenaBox[], rand: Rand, x: number, z: number, w: number, d: number, height: number, mat: ArenaMaterial): void {
  const h = Math.round(height / FLOOR) * FLOOR;
  let top = h;
  if (h >= 44) {
    const lower = Math.round((h * 0.6) / FLOOR) * FLOOR;
    out.push({ pos: [x, lower / 2, z], size: [w, lower, d], mat });
    out.push({ pos: [x, lower + 0.2, z], size: [w + 0.4, 0.4, d + 0.4], mat: 'roof' });
    const uw = w * 0.7;
    const ud = d * 0.7;
    out.push({ pos: [x, lower + (h - lower) / 2, z], size: [uw, h - lower, ud], mat });
    w = uw;
    d = ud;
  } else {
    out.push({ pos: [x, h / 2, z], size: [w, h, d], mat });
  }
  out.push({ pos: [x, top + 0.2, z], size: [w + 0.4, 0.4, d + 0.4], mat: 'roof' });
  top += 0.4;

  // Air-conditioning units.
  const units = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < units; i++) {
    const ux = x + (rand() - 0.5) * (w - 4);
    const uz = z + (rand() - 0.5) * (d - 4);
    out.push({ pos: [ux, top + 0.6, uz], size: [2.2, 1.2, 1.6], mat: 'steel' });
  }
  // Water tank on legs, on shorter buildings.
  if (h < 40 && rand() < 0.35) {
    const tx = x + (rand() - 0.5) * (w - 6);
    const tz = z + (rand() - 0.5) * (d - 6);
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]] as const) {
      out.push({ pos: [tx + lx, top + 1.5, tz + lz], size: [0.25, 3, 0.25], mat: 'steel' });
    }
    // The tank itself bursts when shot (ADR-0023); its legs stay.
    EXPLOSIVES.push({ kind: 'water', pos: [tx, top + 4.8, tz], size: [3.4, 3.6, 3.4], color: '#8a5a3c' });
  }
  // Rooftop billboard: a white panel in an orange frame.
  if (rand() < 0.22) {
    const bz = z + (rand() < 0.5 ? -1 : 1) * (d / 2 - 1.5);
    out.push({ pos: [x - 4, top + 1.5, bz], size: [BEAM, 3, BEAM], mat: 'orange' });
    out.push({ pos: [x + 4, top + 1.5, bz], size: [BEAM, 3, BEAM], mat: 'orange' });
    out.push({ pos: [x, top + 5, bz], size: [11, 4.4, 0.4], mat: 'orange' });
    out.push({ pos: [x, top + 5, bz], size: [10, 3.6, 0.5], mat: 'white' });
  }
}

/** Ordinary block: 1 to 4 buildings with 4 m alleys between them. */
function cityBlock(out: ArenaBox[], rand: Rand, cx: number, cz: number, tall: boolean): void {
  const layout = rand();
  const mats: ArenaMaterial[] = ['facade', 'facade', 'brick', 'glass'];
  const height = () => (tall ? 36 + rand() * 50 : 10 + rand() * 32);
  if (layout < 0.2) {
    // One big building filling the block.
    const h = height() + 10;
    building(out, rand, cx, cz, LOT * 2, LOT * 2, h, h > 50 ? 'glass' : pick(rand, mats));
  } else if (layout < 0.5) {
    // Two slabs with an alley down the middle, along a random axis.
    const alongX = rand() < 0.5;
    for (const s of [-1, 1]) {
      const [x, z] = alongX ? [cx, cz + s * 11] : [cx + s * 11, cz];
      const [w, d] = alongX ? [LOT * 2, 18] : [18, LOT * 2];
      building(out, rand, x, z, w, d, height(), pick(rand, mats));
    }
  } else {
    // Four lots; one may be left as a low building so the skyline varies.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const h = rand() < 0.2 ? 6 + rand() * 6 : height();
        building(out, rand, cx + sx * 11, cz + sz * 11, 18, 18, h, pick(rand, mats));
      }
    }
  }
}

/** Open parking garage: slabs on columns, open sides to fly through each level. */
function garage(out: ArenaBox[], rand: Rand, cx: number, cz: number): void {
  const levels = [4.5, 9, 13.5];
  for (const y of levels) out.push({ pos: [cx, y, cz], size: [LOT * 2, 0.5, LOT * 2], mat: 'concrete' });
  for (const x of [-18, -6, 6, 18]) {
    for (const z of [-18, -6, 6, 18]) {
      out.push({ pos: [cx + x, 13.5 / 2, cz + z], size: [0.9, 13.5, 0.9], mat: 'concrete' });
    }
  }
  // Orange-striped parapets on two sides only, so two sides stay open.
  for (const y of levels.slice(1)) {
    out.push({ pos: [cx, y + 0.7, cz - LOT + 0.2], size: [LOT * 2, 0.9, 0.3], mat: 'orange' });
    out.push({ pos: [cx - LOT + 0.2, y + 0.7, cz], size: [0.3, 0.9, LOT * 2], mat: 'concrete' });
  }
  // Parked cars on every level.
  for (const y of [0, ...levels]) {
    for (let i = 0; i < 5; i++) {
      const x = cx - 15 + i * 7;
      const paint = pick(rand, ['white', 'steel', 'orange', 'glass'] as const);
      EXPLOSIVES.push({ kind: 'car', pos: [x, y + (y === 0 ? 0 : 0.25) + 0.75, cz + 12], size: [2, 1.5, 4.4], color: PARKED_COLORS[paint] });
    }
  }
}

/** Construction site: an unfinished frame, scaffolding and a tower crane. */
function constructionSite(out: ArenaBox[], cx: number, cz: number): void {
  // Fuel drums and a propane tank on the site (ADR-0023).
  for (const [dx, dz] of [[-8, -16], [-6.6, -16], [-7.3, -14.8], [-8, -13.6]] as const) {
    EXPLOSIVES.push({ kind: 'fuel', pos: [cx + dx, 0.8, cz + dz], size: [1.2, 1.6, 1.2] });
  }
  EXPLOSIVES.push({ kind: 'propane', pos: [cx + 8, 1.2, cz - 16], size: [2.4, 2.4, 6], yawDeg: 90 });
  // Unfinished concrete frame: columns and a few floor slabs, some missing.
  for (const x of [-14, 0, 14]) {
    for (const z of [-14, 0, 14]) out.push({ pos: [cx + x, 12, cz + z], size: [1, 24, 1], mat: 'concrete' });
  }
  for (const [y, w] of [[6, 30], [12, 30], [18, 15]] as const) {
    out.push({ pos: [cx - (30 - w) / 2, y, cz], size: [w, 0.4, 30], mat: 'concrete' });
  }
  // Scaffolding up one side.
  tower(out, cx - 17.5, cz - 6, 3, 20, 4, 0, false);
  tower(out, cx - 17.5, cz + 6, 3, 20, 4, 0, false);

  // Tower crane: lattice mast, long jib, counter-jib and weight, cab, hanging hook.
  const mx = cx + 16;
  const mz = cz + 16;
  const mast = 62;
  tower(out, mx, mz, 2.4, mast, 3, 0, false);
  // Jib resting on the top of the mast (mast top = mast + BEAM / 2).
  const jibY = mast + BEAM / 2 + 0.6;
  out.push({ pos: [mx - 22, jibY, mz], size: [48, 1.2, 1.4], mat: 'orange' });
  out.push({ pos: [mx + 9, jibY, mz], size: [16, 1.2, 1.4], mat: 'orange' });
  out.push({ pos: [mx + 15, jibY - 1.6, mz], size: [3, 2.4, 2.4], mat: 'concrete' });
  out.push({ pos: [mx, jibY + 1.6, mz], size: [2.6, 2.2, 2.6], mat: 'white' });
  out.push({ pos: [mx, jibY + 4.5, mz], size: [0.4, 4, 0.4], mat: 'orange' });
  const hookX = mx - 34;
  // Cable from the underside of the jib down to the top of the hook block.
  const hookTop = jibY - 28.8;
  out.push({ pos: [hookX, (jibY - 0.6 + hookTop) / 2, mz], size: [0.12, jibY - 0.6 - hookTop, 0.12], mat: 'steel' });
  out.push({ pos: [hookX, hookTop - 0.7, mz], size: [1.2, 1.4, 1.2], mat: 'orange' });
}

/** The central plaza: open air for dogfighting, a fountain, trees and an orange arch. */
function plaza(out: ArenaBox[], cx: number, cz: number): void {
  out.push({ pos: [cx, 0.3, cz], size: [12, 0.6, 12], mat: 'concrete' });
  out.push({ pos: [cx, 0.32, cz], size: [11, 0.62, 11], mat: 'glass' });
  out.push({ pos: [cx, 2.8, cz], size: [1.4, 5, 1.4], mat: 'white' });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * 15;
    const z = cz + Math.sin(a) * 15;
    out.push({ pos: [x, 2, z], size: [0.5, 4, 0.5], mat: 'roof' });
    out.push({ pos: [x, 5.2, z], size: [3.6, 3.2, 3.6], mat: 'foliage' });
  }
  gate(out, cx, cz - 19, 14, 11, 0);
  cubeFrame(out, cx, 20, cz, 9);
}

/** Two towers either side of a street, joined by a glass skybridge at 28 m. */
function skybridgePair(out: ArenaBox[], rand: Rand): void {
  building(out, rand, -60, -60, LOT * 2, LOT * 2, 50, 'glass');
  building(out, rand, 0, -60, LOT * 2, LOT * 2, 42, 'brick');
  out.push({ pos: [-30, 28, -60], size: [22, 3.5, 5], mat: 'glass' });
  out.push({ pos: [-30, 26.1, -60], size: [22, 0.3, 5.6], mat: 'steel' });
}

/** Street lamps along every street, clear of intersections. */
function streetLamps(out: ArenaBox[]): void {
  for (const street of STREETS) {
    for (let t = -140; t <= 140; t += 20) {
      if (STREETS.some((s) => Math.abs(t - s) < 10)) continue;
      for (const side of [-1, 1]) {
        const off = street + side * 6.5;
        // Lamp posts on streets running along Z (x = street) and along X (z = street).
        out.push({ pos: [off, 3.5, t], size: [0.25, 7, 0.25], mat: 'steel' });
        out.push({ pos: [off - side * 1, 7, t], size: [2, 0.2, 0.25], mat: 'steel' });
        out.push({ pos: [t, 3.5, off], size: [0.25, 7, 0.25], mat: 'steel' });
        out.push({ pos: [t, 7, off - side * 1], size: [0.25, 0.2, 2], mat: 'steel' });
      }
    }
  }
}

/** Cars parked along the curbs, mid-block. */
function parkedCars(rand: Rand): void {
  const colors = ['white', 'steel', 'orange', 'glass', 'white'] as const;
  for (const street of STREETS) {
    for (const t of BLOCKS) {
      if (rand() < 0.4) continue;
      const side = rand() < 0.5 ? -1 : 1;
      const z = t + (rand() - 0.5) * 20;
      EXPLOSIVES.push({ kind: 'car', pos: [street + side * 4.5, 0.75, z], size: [2, 1.5, 4.4], color: PARKED_COLORS[pick(rand, colors)] });
      if (rand() < 0.5) {
        const x = t + (rand() - 0.5) * 20;
        EXPLOSIVES.push({ kind: 'car', pos: [x, 0.75, street + side * 4.5], size: [2, 1.5, 4.4], yawDeg: 90, color: PARKED_COLORS[pick(rand, colors)] });
      }
    }
  }
}

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const rand = mulberry32(2026);
  boundary(out, HALF);
  pads(out, SPAWNS);

  // Sidewalks around every block.
  for (const x of BLOCKS) {
    for (const z of BLOCKS) out.push({ pos: [x, 0.1, z], size: [48, 0.2, 48], mat: 'sidewalk' });
  }

  for (let i = 0; i < BLOCKS.length; i++) {
    for (let j = 0; j < BLOCKS.length; j++) {
      const x = BLOCKS[i] ?? 0;
      const z = BLOCKS[j] ?? 0;
      const key = `${i},${j}`;
      if (key === '2,2') plaza(out, x, z);
      else if (key === '1,3') garage(out, rand, x, z);
      else if (key === '3,1') constructionSite(out, x, z);
      else if (key === '1,1' || key === '2,1') continue; // skybridge pair, below
      else {
        // Taller buildings toward the corners, lower toward the plaza.
        const corner = Math.abs(i - 2) + Math.abs(j - 2) >= 3;
        cityBlock(out, rand, x, z, corner);
      }
    }
  }
  skybridgePair(out, rand);
  streetLamps(out);
  parkedCars(rand);
  outskirts(out, rand);
  return out;
}

// --- The outskirts (ADR-0049): one-of-a-kind landmarks instead of more blocks.

function outskirts(out: ArenaBox[], rand: Rand): void {
  river(out);
  suspensionBridge(out, -60);
  archBridge(out, 110);
  stadium(out, 205, -60);
  sculpturePark(out);
  highway(out);
  radioMast(out, -222, -215);
  viaduct(out, rand);
}

/** The river: water between two embankment walls, with a little pier and moored boats. */
function river(out: ArenaBox[]): void {
  const z0 = RIVER_Z - RIVER_W / 2;
  const z1 = RIVER_Z + RIVER_W / 2;
  water(out, 0, RIVER_Z, HALF * 2, RIVER_W);
  for (const z of [z0 - 0.75, z1 + 0.75]) out.push({ pos: [0, 0.6, z], size: [HALF * 2, 1.2, 1.5], mat: 'concrete' });
  // Promenade lamps on the city bank.
  for (let x = -240; x <= 240; x += 24) {
    if (Math.abs(x + 60) < 14 || Math.abs(x - 110) < 14) continue;
    out.push({ pos: [x, 3.5, z0 - 4], size: [0.25, 7, 0.25], mat: 'steel' });
    out.push({ pos: [x, 7, z0 - 3.2], size: [0.25, 0.2, 1.8], mat: 'steel' });
  }
  // A pier with two moored boats.
  out.push({ pos: [10, 0.9, z0 + 9], size: [5, 0.6, 18], mat: 'concrete' });
  for (const [x, z, m] of [[2, z0 + 10, 'white'], [18, z0 + 13, 'orange']] as const) {
    out.push({ pos: [x, 0.8, z], size: [3.2, 1.4, 9], mat: m });
    out.push({ pos: [x, 2.2, z + 1], size: [2.2, 1.6, 3], mat: 'glass' });
  }
}

/** A suspension bridge across the river at x: two towers, sagging main cables, hangers and a deck. */
function suspensionBridge(out: ArenaBox[], x: number): void {
  const deckY = 10;
  const half = 7;
  out.push({ pos: [x, deckY, RIVER_Z], size: [half * 2, 0.8, 70], mat: 'concrete' });
  // Approach ramps down to the ground at both ends (clear of the city blocks, inside the boundary).
  for (const s of [-1, 1]) {
    const end = RIVER_Z + s * 35;
    beam(out, [x, deckY, end], [x, 0.2, end + s * 20], 0.8, 'concrete', half * 2);
  }
  const towerZ = [RIVER_Z - 22, RIVER_Z + 22];
  for (const tz of towerZ) {
    for (const lx of [-half - 1, half + 1]) out.push({ pos: [x + lx, 26, tz], size: [2, 52, 2.4], mat: 'orange' });
    for (const y of [24, 50]) out.push({ pos: [x, y, tz], size: [half * 2 + 4, 1.6, 2], mat: 'orange' });
  }
  // Main cables: deck end up to a tower top, a sag between the towers, down to the other end.
  for (const lx of [-half - 1, half + 1]) {
    const cx = x + lx;
    const pts: [number, number, number][] = [[cx, deckY + 0.5, RIVER_Z - 35], [cx, 51, towerZ[0]!]];
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const z = towerZ[0]! + (towerZ[1]! - towerZ[0]!) * t;
      pts.push([cx, 51 - 30 * Math.sin(Math.PI * t) * 0.8, z]);
    }
    pts.push([cx, 51, towerZ[1]!], [cx, deckY + 0.5, RIVER_Z + 35]);
    polyBeam(out, pts, 0.45, 'steel');
    // Hangers from the cable between the towers down to the deck.
    for (let i = 1; i < 6; i++) {
      const p = pts[i + 1]!;
      out.push({ pos: [cx, (p[1] + deckY) / 2, p[2]], size: [0.15, p[1] - deckY, 0.15], mat: 'steel' });
    }
  }
}

/** An orange through-arch bridge: two arch ribs over the deck, joined at the top, with hangers. */
function archBridge(out: ArenaBox[], x: number): void {
  const deckY = 8;
  const half = 6;
  out.push({ pos: [x, deckY, RIVER_Z], size: [half * 2, 0.8, 70], mat: 'concrete' });
  for (const s of [-1, 1]) beam(out, [x, deckY, RIVER_Z + s * 35], [x, 0.2, RIVER_Z + s * 55], 0.8, 'concrete', half * 2);
  const ribs: [number, number, number][][] = [[], []];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const z = RIVER_Z - 34 + 68 * t;
    const y = deckY + 30 * Math.sin(Math.PI * t);
    ribs[0]!.push([x - half - 0.8, y, z]);
    ribs[1]!.push([x + half + 0.8, y, z]);
  }
  for (const rib of ribs) polyBeam(out, rib, 1.4, 'orange');
  for (let i = 2; i <= 8; i++) {
    const [, y, z] = ribs[0]![i]!;
    if (y > deckY + 18) out.push({ pos: [x, y, z], size: [half * 2 + 3, 0.8, 0.8], mat: 'orange' });
    for (const lx of [-half - 0.8, half + 0.8]) out.push({ pos: [x + lx, (y + deckY) / 2, z], size: [0.2, y - deckY, 0.2], mat: 'steel' });
  }
}

/** A stadium: tiered stands around an oval field, two big entrances, light towers, goals. */
function stadium(out: ArenaBox[], cx: number, cz: number): void {
  const RXo = 52;
  const RZo = 42;
  const n = 28;
  const tiers = [
    { inset: 0, depth: 6, h: 14 },
    { inset: 6, depth: 6, h: 9 },
    { inset: 12, depth: 6, h: 4 },
  ];
  for (let k = 0; k < n; k++) {
    // Two entrances, at the ends of the long axis.
    if (k === 0 || k === n / 2) continue;
    const a1 = (k / n) * Math.PI * 2;
    const a2 = ((k + 1) / n) * Math.PI * 2;
    for (const t of tiers) {
      const s = 1 - (t.inset + t.depth / 2) / RXo;
      const p1: [number, number, number] = [cx + Math.cos(a1) * RXo * s, t.h / 2, cz + Math.sin(a1) * RZo * s];
      const p2: [number, number, number] = [cx + Math.cos(a2) * RXo * s, t.h / 2, cz + Math.sin(a2) * RZo * s];
      beam(out, p1, p2, t.h, t.inset === 0 ? 'concrete' : t.inset === 6 ? 'white' : 'orange', t.depth);
    }
  }
  // Light towers on the diagonals.
  for (const a of [0.6, 2.5, 3.8, 5.6]) {
    const x = cx + Math.cos(a) * (RXo + 4);
    const z = cz + Math.sin(a) * (RZo + 4);
    out.push({ pos: [x, 18, z], size: [1.2, 36, 1.2], mat: 'steel' });
    out.push({ pos: [x, 37, z], size: [6, 3, 1], mat: 'white' });
  }
  // Goals at each end of the field.
  for (const s of [-1, 1]) {
    const gx = cx + s * 30;
    for (const dz of [-3.6, 3.6]) out.push({ pos: [gx, 1.2, cz + dz], size: [0.2, 2.4, 0.2], mat: 'white' });
    out.push({ pos: [gx, 2.4, cz], size: [0.2, 0.2, 7.4], mat: 'white' });
  }
}

/** Giant hoops at odd angles, to string together. */
function sculpturePark(out: ArenaBox[]): void {
  hoop(out, [180, 22, 70], 18, 0, 1.4, 'orange');
  hoop(out, [215, 30, 110], 14, 50, 1.2, 'white');
  hoop(out, [185, 40, 140], 10, -30, 1, 'orange');
  // A leaning steel spike sculpture.
  beam(out, [235, 0, 60], [222, 46, 70], 2, 'steel');
}

/** An elevated highway on piers along the west side, crossing the river, with two on-ramps from the city. */
function highway(out: ArenaBox[]): void {
  const x = -205;
  const y = 12;
  const w = 18;
  const z0 = -250;
  const z1 = 250;
  out.push({ pos: [x, y, (z0 + z1) / 2], size: [w, 1, z1 - z0], mat: 'concrete' });
  for (const s of [-1, 1]) out.push({ pos: [x + s * (w / 2 - 0.2), y + 1, (z0 + z1) / 2], size: [0.4, 1.2, z1 - z0], mat: 'white' });
  for (let z = z0 + 10; z <= z1 - 10; z += 26) {
    // No pier in the river.
    if (Math.abs(z - RIVER_Z) < RIVER_W / 2 + 2) continue;
    for (const s of [-1, 1]) out.push({ pos: [x + s * 6, y / 2, z], size: [2, y, 2], mat: 'concrete' });
    out.push({ pos: [x, y - 1, z], size: [w, 1.2, 2.4], mat: 'concrete' });
  }
  // On-ramps sloping down into the city's edge.
  for (const rz of [-40, 60]) beam(out, [x + w / 2 - 1, y, rz], [-CITY, 0.2, rz], 0.8, 'concrete', 12);
}

/** A tall lattice radio mast with a blinking-light top (orange, white bands). */
function radioMast(out: ArenaBox[], x: number, z: number): void {
  tower(out, x, z, 3, 110, 5, 0, false);
  out.push({ pos: [x, 112, z], size: [1.4, 4, 1.4], mat: 'white' });
  // Three dishes on the way up.
  for (const [y, dx] of [[40, 2.4], [62, -2.4], [80, 2.4]] as const) out.push({ pos: [x + dx, y, z], size: [0.6, 3, 3], mat: 'white' });
}

/** A rail viaduct across the south on arched piers, with a stopped train and a station canopy. */
function viaduct(out: ArenaBox[], rand: Rand): void {
  const z = -200;
  const y = 9;
  const x0 = -185;
  const x1 = 255;
  out.push({ pos: [(x0 + x1) / 2, y, z], size: [x1 - x0, 1.2, 10], mat: 'concrete' });
  for (let x = x0 + 8; x <= x1 - 8; x += 22) {
    out.push({ pos: [x, y / 2, z], size: [3, y, 10], mat: 'brick' });
  }
  // A train of six cars, nose east.
  for (let i = 0; i < 6; i++) {
    const cx = 40 + i * 17;
    out.push({ pos: [cx, y + 2.4, z], size: [16, 3.6, 3.2], mat: i === 0 ? 'orange' : 'steel' });
    out.push({ pos: [cx, y + 2.8, z], size: [15, 1, 3.3], mat: 'glass' });
  }
  // Station canopy over the platform.
  for (const x of [-20, -5, 10]) out.push({ pos: [x, y + 3.5, z + 6], size: [0.4, 7, 0.4], mat: 'steel' });
  out.push({ pos: [-5, y + 7.2, z + 4], size: [36, 0.4, 8], mat: 'white' });
  out.push({ pos: [-5, y + 0.6, z + 6.5], size: [36, 1.2, 3], mat: 'concrete' });
  // A tall water tower beside the line (its tank bursts, ADR-0023).
  const tx = 150;
  const tz = -232;
  for (const [lx, lz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]] as const) out.push({ pos: [tx + lx, 12, tz + lz], size: [0.5, 24, 0.5], mat: 'steel' });
  EXPLOSIVES.push({ kind: 'water', pos: [tx, 27, tz], size: [7, 6, 7], color: '#d9d4c8' });
  // Cars parked under the highway.
  for (let i = 0; i < 8; i++) {
    if (rand() < 0.3) continue;
    EXPLOSIVES.push({ kind: 'car', pos: [-212 + (i % 2) * 14, 0.75, -120 + Math.floor(i / 2) * 14], size: [2, 1.5, 4.4], color: CAR_COLORS[i % CAR_COLORS.length] });
  }
}

/** Lane dashes and a distant skyline: drawn, never collided with. */
function buildDecor(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const rand = mulberry32(99);
  for (const street of STREETS) {
    for (let t = -146; t <= 146; t += 6) {
      if (STREETS.some((s) => Math.abs(t - s) < 9)) continue;
      out.push({ pos: [street, 0.015, t], size: [0.25, 0.02, 3], mat: 'paint' });
      out.push({ pos: [t, 0.015, street], size: [3, 0.02, 0.25], mat: 'paint' });
    }
  }
  // Skyline beyond the boundary. Fog fades it into the haze.
  // Beyond the outskirts (ADR-0049): starts past the bigger boundary.
  for (let x = -620; x <= 620; x += 40) {
    for (let z = -620; z <= 620; z += 40) {
      if (Math.max(Math.abs(x), Math.abs(z)) < HALF + 40 || rand() < 0.45) continue;
      const w = 16 + rand() * 18;
      const d = 16 + rand() * 18;
      const nearness = 1 - (Math.max(Math.abs(x), Math.abs(z)) - (HALF + 40)) / 320;
      const h = 20 + rand() * (40 + 100 * nearness);
      const mat: ArenaMaterial = rand() < 0.4 ? 'glass' : rand() < 0.5 ? 'brick' : 'facade';
      out.push({ pos: [x + (rand() - 0.5) * 8, h / 2, z + (rand() - 0.5) * 8], size: [w, h, d], mat });
    }
  }
  return out;
}

/**
 * Traffic (ADR-0020): two loops, each car on the inside lane of its loop (2.2 m in from the street
 * center), which clears parked cars (from 3.5 m out) and passes every intersection center with room.
 */
const LANE = 2.2;
const CAR_COLORS = ['#e5483e', '#2f7fe0', '#f5c63a', '#eeeeec', '#45b865', '#26282b', '#ff8a2a', '#8a5cd6'];

function traffic(): MoverDef[] {
  const cars: MoverDef[] = [];
  const size: V3 = [2, 1.5, 4.4];
  const loops = [
    { half: 30 - LANE, speed: 16, count: 4, clockwise: false },
    { half: 90 - LANE, speed: 20, count: 6, clockwise: true },
  ];
  let c = 0;
  for (const loop of loops) {
    const route = routeFromPoints(roundedRect(-loop.half, -loop.half, loop.half, loop.half, 5, 0, loop.clockwise));
    for (let i = 0; i < loop.count; i++) {
      cars.push({ kind: 'car', route, offset: (route.length / loop.count) * i, speed: loop.speed, color: CAR_COLORS[c++ % CAR_COLORS.length]!, size, lift: 0.75 });
    }
  }
  return cars;
}

export const DOWNTOWN: MapDef = {
  id: 'downtown',
  name: 'Downtown',
  halfSize: HALF,
  boxes: build(),
  decor: buildDecor(),
  spawns: SPAWNS,
  ground: 'asphalt',
  movers: traffic(),
  explosives: EXPLOSIVES,
};
