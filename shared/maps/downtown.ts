import { BEAM, beam, boundary, cubeFrame, gate, hoop, mulberry32, pads, polyBeam, spawnFacingCenter, tower, water } from './builders.js';
import type { GroundHole } from './ground.js';
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
 * The main map (ADR-0054, 920 m across): an airport with a jet flying touch-and-go laps in the east, Central
 * Park with a lake in the north, a street racetrack with race cars in the south, and a megaproject in the west
 * (a half-built supertall, tower cranes and a deep excavation pit you can fly down into).
 */

const HALF = 460;
/** The old city's edge: the outskirts (ADR-0049) start beyond it. */
const CITY = 150;
/** The river runs east-west across the north (z from 175 to 225). */
const RIVER_Z = 200;
const RIVER_W = 50;
/** The river ends here, short of the airport (ADR-0054). */
const RIVER_E = 268;
/** Block centers along each axis. Streets run between them at ±30 and ±90. */
const BLOCKS = [-120, -60, 0, 60, 120];
const STREETS = [-90, -30, 30, 90];
/** Buildable half-width of a block (sidewalk runs to ±24). */
const LOT = 20;
const FLOOR = 4;

const SPAWNS: readonly SpawnPoint[] = [
  // Four in and around the city, one in each new district (ADR-0054), so fights spread over the map.
  spawnFacingCenter(-30, 90),
  spawnFacingCenter(30, -90),
  spawnFacingCenter(20, 160),
  spawnFacingCenter(168, 30),
  spawnFacingCenter(-20, 300),
  spawnFacingCenter(-120, -375),
  spawnFacingCenter(320, -130),
  spawnFacingCenter(-290, 0),
];

/** The megaproject's excavation (ADR-0054): a 90 m square hole in the ground, PIT_DEPTH deep. */
const PIT = { x: -355, z: 105, w: 90, d: 90 } as const;
const PIT_DEPTH = 24;
const HOLES: readonly GroundHole[] = [PIT];

type Rand = () => number;

function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] ?? (items[0] as T);
}

/**
 * A building at "level 3" detail (ADR-0053, chosen on the Detail test map): a colonnade with a recessed
 * glass storefront at street level, a ledge at every floor, balconies on one street face, a setback upper
 * tier with a terrace railing on tall towers, a rooftop parapet and penthouse, AC units, sometimes a water
 * tank or a billboard. Everything is outlined. The random choices are drawn in the same order as before, so
 * the city keeps its layout.
 */
function building(out: ArenaBox[], rand: Rand, x: number, z: number, w: number, d: number, height: number, mat: ArenaMaterial): void {
  const e = (pos: [number, number, number], size: [number, number, number], m: ArenaMaterial, rot?: [number, number, number]) =>
    out.push(rot ? { pos, size, mat: m, rot, edge: true } : { pos, size, mat: m, edge: true });
  const h = Math.round(height / FLOOR) * FLOOR;
  const ledgeMat: ArenaMaterial = mat === 'brick' ? 'concrete' : 'trim';
  // Street level: a colonnade and a recessed storefront (two floors), on anything taller than three floors.
  const podium = h >= 12 ? 2 * FLOOR : 0;
  if (podium) {
    e([x, podium / 2, z], [w - 2, podium, d - 2], 'glass');
    for (const [len, along] of [[w, 'x'], [d, 'z']] as const) {
      const n = Math.max(2, Math.round(len / 5));
      for (let k = 0; k <= n; k++) {
        const t = -len / 2 + (len * k) / n;
        for (const s of [-1, 1]) {
          const [cx, cz] = along === 'x' ? [x + t, z + s * (d / 2)] : [x + s * (w / 2), z + t];
          e([cx, podium / 2, cz], [0.8, podium, 0.8], 'white');
        }
      }
    }
    e([x, podium + 0.3, z], [w + 1.2, 0.6, d + 1.2], 'concrete');
  }
  // The shaft (two tiers on tall towers), with a ledge at every floor.
  const tiered = h >= 44;
  const lower = tiered ? Math.round((h * 0.6) / FLOOR) * FLOOR : h;
  const shaft = (y0: number, y1: number, sw: number, sd: number) => {
    e([x, (y0 + y1) / 2, z], [sw - (podium ? 1.4 : 0), y1 - y0, sd - (podium ? 1.4 : 0)], mat);
    for (let y = y0 + FLOOR; y <= y1 - 0.01; y += FLOOR) e([x, y, z], [sw + 0.8, 0.45, sd + 0.8], ledgeMat);
  };
  shaft(podium, lower, w, d);
  let topW = w;
  let topD = d;
  if (tiered) {
    e([x, lower + 0.2, z], [w + 0.8, 0.4, d + 0.8], 'roof');
    for (const s of [-1, 1]) {
      e([x, lower + 1, z + s * (d / 2 + 0.2)], [w + 0.8, 1.2, 0.15], 'steel');
      e([x + s * (w / 2 + 0.2), lower + 1, z], [0.15, 1.2, d + 0.8], 'steel');
    }
    topW = w * 0.7;
    topD = d * 0.7;
    shaft(lower, h, topW, topD);
  }
  // Balconies every other floor on one street face (north or south), below any setback.
  if (h >= 16) {
    const face = (Math.round(x + z) / 4) % 2 === 0 ? 1 : -1;
    const per = Math.max(1, Math.floor((w - 4) / 9));
    for (let y = podium + FLOOR; y < lower - 2; y += FLOOR * 2) {
      for (let k = 0; k < per; k++) {
        const bx = x - ((per - 1) * 9) / 2 + k * 9;
        const fz = z + face * (d / 2 + 1);
        e([bx, y + 0.25, fz], [4, 0.3, 2], 'concrete');
        e([bx, y + 0.85, fz + face * 0.95], [4, 1, 0.1], 'steel');
        for (const s of [-1, 1]) e([bx + s * 1.95, y + 0.85, fz], [0.1, 1, 2], 'steel');
      }
    }
  }
  // Roof: cap and parapet.
  e([x, h + 0.2, z], [topW + 0.4, 0.4, topD + 0.4], 'roof');
  for (const s of [-1, 1]) {
    e([x, h + 0.9, z + s * (topD / 2)], [topW + 0.4, 1, 0.3], ledgeMat);
    e([x + s * (topW / 2), h + 0.9, z], [0.3, 1, topD + 0.4], ledgeMat);
  }
  const top = h + 0.4;
  w = topW;
  d = topD;

  // Air-conditioning units.
  const units = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < units; i++) {
    const ux = x + (rand() - 0.5) * (w - 4);
    const uz = z + (rand() - 0.5) * (d - 4);
    e([ux, top + 0.6, uz], [2.2, 1.2, 1.6], 'steel');
  }
  // Water tank on legs, on shorter buildings; otherwise a penthouse.
  let tank = false;
  if (h < 40 && rand() < 0.35) {
    tank = true;
    const tx = x + (rand() - 0.5) * (w - 6);
    const tz = z + (rand() - 0.5) * (d - 6);
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]] as const) {
      out.push({ pos: [tx + lx, top + 1.5, tz + lz], size: [0.25, 3, 0.25], mat: 'steel' });
    }
    // The tank itself bursts when shot (ADR-0023); its legs stay.
    EXPLOSIVES.push({ kind: 'water', pos: [tx, top + 4.8, tz], size: [3.4, 3.6, 3.4], color: '#8a5a3c' });
  }
  if (!tank && w >= 14 && d >= 14) e([x - w / 4, top + 1.8, z - d / 4], [6, 3.6, 5], 'concrete');
  // Rooftop billboard: a white panel in an orange frame.
  if (rand() < 0.22) {
    const bz = z + (rand() < 0.5 ? -1 : 1) * (d / 2 - 1.5);
    e([x - 4, top + 1.5, bz], [BEAM, 3, BEAM], 'orange');
    e([x + 4, top + 1.5, bz], [BEAM, 3, BEAM], 'orange');
    e([x, top + 5, bz], [11, 4.4, 0.4], 'orange');
    e([x, top + 5, bz], [10, 3.6, 0.5], 'white');
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
  airport(out);
  centralPark(out);
  racetrack(out);
  megaproject(out);
}

/** The river: water between two embankment walls, with a little pier and moored boats. */
function river(out: ArenaBox[]): void {
  const z0 = RIVER_Z - RIVER_W / 2;
  const z1 = RIVER_Z + RIVER_W / 2;
  const len = RIVER_E + HALF;
  const mid = (RIVER_E - HALF) / 2;
  water(out, mid, RIVER_Z, len, RIVER_W);
  for (const z of [z0 - 0.75, z1 + 0.75]) out.push({ pos: [mid, 0.6, z], size: [len, 1.2, 1.5], mat: 'concrete' });
  // The east end: a wall short of the airport.
  out.push({ pos: [RIVER_E + 0.75, 0.6, RIVER_Z], size: [1.5, 1.2, RIVER_W + 3], mat: 'concrete' });
  // Promenade lamps on the city bank.
  for (let x = -440; x <= 250; x += 24) {
    if (Math.abs(x + 60) < 14 || Math.abs(x - 110) < 14 || Math.abs(x + 205) < 14) continue;
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
  // Both ends slope down to the ground (ADR-0054), toward the park and the racetrack.
  for (const [end, to] of [[z0, z0 - 38], [z1, z1 + 38]] as const) beam(out, [x, y, end], [x, 0.2, to], 0.8, 'concrete', w);
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
  // A buffer stop at the east end of the line.
  out.push({ pos: [x1 - 1.5, y + 1.6, z], size: [2, 2, 8], mat: 'orange' });
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

// --- The main-map districts (ADR-0054).

/** Visual-only pieces (runway paint, track surface, park paths) collected while building. */
const DECOR: ArenaBox[] = [];
/** The coast (ADR-0054): a sea wall, a beach and the sea along the east edge, the sun setting over the water. */
const SEA_WALL_X = 430;
const SEA_X = 445;
/** The runway runs north-south along the east side; the airliner lands and takes off on it. */
const RUNWAY_X = 405;
const RUNWAY_HALF_LEN = 340;

/** A box with an outline. */
function edged(out: ArenaBox[], pos: [number, number, number], size: [number, number, number], mat: ArenaMaterial, rot?: [number, number, number]): void {
  out.push(rot ? { pos, size, mat, rot, edge: true } : { pos, size, mat, edge: true });
}

/** A static airliner, nose toward -X: fuselage, wings, engines, fin and tailplane. */
function parkedAirliner(out: ArenaBox[], x: number, z: number, tail: ArenaMaterial): void {
  out.push({ pos: [x, 3.4, z], size: [34, 4, 4], mat: 'white' });
  out.push({ pos: [x - 16.5, 3.9, z], size: [1.2, 1.4, 2.8], mat: 'glass' });
  out.push({ pos: [x + 1, 2.4, z], size: [5, 0.4, 30], mat: 'white' });
  for (const s of [-1, 1]) {
    out.push({ pos: [x - 0.5, 1.3, z + s * 7], size: [4, 1.8, 1.8], mat: 'steel' });
    out.push({ pos: [x - 1, 0.4, z + s * 2.2], size: [1, 0.8, 0.8], mat: 'steel' });
  }
  out.push({ pos: [x - 13, 0.7, z], size: [0.6, 1.4, 0.6], mat: 'steel' });
  out.push({ pos: [x + 14, 8, z], size: [4.5, 5.4, 0.4], mat: tail });
  out.push({ pos: [x + 15, 4.6, z], size: [3, 0.3, 11], mat: 'white' });
}

/** The airport on the bay: runway, taxiway, terminal with jet bridges, control tower, hangars, the beach. */
function airport(out: ArenaBox[]): void {
  // Runway and taxiway: dark strips just above the street, with painted markings (decor).
  out.push({ pos: [RUNWAY_X, 0.03, 0], size: [44, 0.06, RUNWAY_HALF_LEN * 2], mat: 'roof' });
  out.push({ pos: [372, 0.03, 0], size: [16, 0.06, RUNWAY_HALF_LEN * 2], mat: 'roof' });
  out.push({ pos: [339, 0.03, 0], size: [50, 0.06, 300], mat: 'concrete' });
  for (let z = -RUNWAY_HALF_LEN + 40; z <= RUNWAY_HALF_LEN - 40; z += 30) DECOR.push({ pos: [RUNWAY_X, 0.07, z], size: [0.9, 0.02, 15], mat: 'paint' });
  for (const s of [-1, 1]) {
    DECOR.push({ pos: [RUNWAY_X + s * 20.5, 0.07, 0], size: [0.6, 0.02, RUNWAY_HALF_LEN * 2 - 4], mat: 'paint' });
    // Threshold bars at both ends.
    for (let k = -7; k <= 7; k++) if (k) DECOR.push({ pos: [RUNWAY_X + k * 2.6, 0.07, s * (RUNWAY_HALF_LEN - 12)], size: [1.4, 0.02, 18], mat: 'paint' });
  }
  for (let z = -300; z <= 300; z += 12) DECOR.push({ pos: [372, 0.07, z], size: [0.3, 0.02, 6], mat: 'paint' });
  // Approach lights south of the runway, on short posts.
  for (let z = -RUNWAY_HALF_LEN - 15; z >= -415; z -= 15) {
    out.push({ pos: [RUNWAY_X, 1, z], size: [0.3, 2, 0.3], mat: 'steel' });
    out.push({ pos: [RUNWAY_X, 2.1, z], size: [8, 0.25, 0.4], mat: 'white' });
  }

  // Terminal: a long glass hall under an overhanging white roof, columns along the airside.
  edged(out, [300, 7, 0], [24, 14, 140], 'glass');
  edged(out, [300, 14.6, 0], [32, 1.2, 148], 'white');
  for (let z = -70; z <= 70; z += 10) edged(out, [315.5, 7, z], [0.8, 14, 0.8], 'white');
  edged(out, [296, 17.5, 0], [12, 4.6, 60], 'trim');
  // Jet bridges out to three parked airliners.
  for (const [z, tail] of [[-45, 'orange'], [0, 'steel'], [45, 'orange']] as const) {
    edged(out, [322, 5, z], [12, 3, 3], 'white');
    out.push({ pos: [327, 1.8, z], size: [0.8, 3.6, 0.8], mat: 'steel' });
    parkedAirliner(out, 346, z, tail);
  }
  // Control tower: a concrete shaft, a glass cab, a roof and an antenna.
  edged(out, [300, 21, 120], [7, 42, 7], 'concrete');
  edged(out, [300, 45, 120], [13, 6, 13], 'glass');
  edged(out, [300, 48.4, 120], [15, 0.8, 15], 'white');
  out.push({ pos: [300, 53, 120], size: [0.4, 8.4, 0.4], mat: 'orange' });
  // Cars in the lot beside the tower.
  for (let i = 0; i < 6; i++) EXPLOSIVES.push({ kind: 'car', pos: [292 + i * 5, 0.75, 150], size: [2, 1.5, 4.4], color: CAR_COLORS[(i * 3) % CAR_COLORS.length] });
  // Hangars: open to the east, big enough to fly through the door and out under the roof.
  for (const hz of [-190, -250]) {
    edged(out, [288.5, 9, hz], [1, 18, 44], 'white');
    for (const s of [-1, 1]) edged(out, [310, 9, hz + s * 21.5], [44, 18, 1], 'white');
    edged(out, [310, 18.5, hz], [46, 1, 46], 'orange');
    // A business jet parked inside.
    out.push({ pos: [306, 1.8, hz], size: [16, 2.4, 2.4], mat: 'white' });
    out.push({ pos: [307, 1.4, hz], size: [3, 0.3, 14], mat: 'white' });
    out.push({ pos: [314, 4.2, hz], size: [2.4, 3, 0.3], mat: 'orange' });
  }
  // Fuel farm: propane tanks south of the hangars (ADR-0023).
  for (const z of [-300, -310, -320]) EXPLOSIVES.push({ kind: 'propane', pos: [300, 1.2, z], size: [2.4, 2.4, 6], yawDeg: 90 });

  // The shore: a sea wall, a strip of beach with palms, and the sea up to the edge of the map.
  out.push({ pos: [SEA_WALL_X, 0.6, 0], size: [1.5, 1.2, HALF * 2], mat: 'concrete' });
  out.push({ pos: [(SEA_WALL_X + SEA_X) / 2 + 0.4, 0.05, 0], size: [SEA_X - SEA_WALL_X - 0.8, 0.1, HALF * 2], mat: 'sand' });
  water(out, (SEA_X + HALF + 2) / 2, 0, HALF + 2 - SEA_X, HALF * 2);
  for (let z = -440; z <= 440; z += 32) palm(out, SEA_WALL_X + 7, z + ((z / 32) % 2 ? 6 : -6), z % 64 ? 1 : -1);
}

/** A palm: a leaning trunk and a crown of crossed fronds. */
function palm(out: ArenaBox[], x: number, z: number, lean: number): void {
  const top: [number, number, number] = [x + lean * 1.6, 10, z + 0.8];
  beam(out, [x, 0, z], top, 0.55, 'roof');
  for (const yaw of [0, 60, 120]) out.push({ pos: [top[0], top[1] + 0.3, top[2]], size: [7, 0.3, 1.4], rot: [0, yaw, -8], mat: 'foliage' });
  out.push({ pos: [top[0], top[1] + 0.4, top[2]], size: [1.4, 1, 1.4], mat: 'foliage' });
}

/** A park tree: a trunk and a blocky canopy. */
function tree(out: ArenaBox[], x: number, z: number, h: number): void {
  out.push({ pos: [x, h * 0.25, z], size: [0.6, h * 0.5, 0.6], mat: 'roof' });
  const c = h * 0.55;
  out.push({ pos: [x, h * 0.72, z], size: [c, h * 0.5, c], mat: 'foliage' });
}

/** Central Park, north of the river: lawns, a lake with a stone bridge and a boathouse, groves, rocks, a bandshell. */
function centralPark(out: ArenaBox[]): void {
  const rand = mulberry32(54);
  const PX0 = -440;
  const PX1 = 240;
  const PZ0 = 270;
  const PZ1 = 440;
  const LAKE = { x: -120, z: 370, w: 150, d: 70 };
  // The lawn: a green sheet over the whole park.
  out.push({ pos: [(PX0 + PX1) / 2, 0.03, (PZ0 + PZ1) / 2], size: [PX1 - PX0, 0.06, PZ1 - PZ0], mat: 'foliage' });
  // A low stone wall along the south edge, open where the highway comes down and at the paths.
  for (const [x0, x1] of [[PX0, -224], [-186, -60], [-40, 100], [120, PX1]] as const) out.push({ pos: [(x0 + x1) / 2, 0.5, PZ0], size: [x1 - x0, 1, 0.8], mat: 'rock' });
  // Paths (decor): the main east-west path and two north-south paths.
  DECOR.push({ pos: [(PX0 + PX1) / 2, 0.08, 300], size: [PX1 - PX0, 0.03, 5], mat: 'sidewalk' });
  for (const x of [-50, 110]) DECOR.push({ pos: [x, 0.08, (PZ0 + PZ1) / 2], size: [4, 0.03, PZ1 - PZ0], mat: 'sidewalk' });
  for (let x = PX0 + 10; x <= PX1 - 10; x += 30) {
    if (Math.abs(x + 205) < 20) continue;
    out.push({ pos: [x, 2.5, 304], size: [0.2, 5, 0.2], mat: 'steel' });
    out.push({ pos: [x, 5.1, 304], size: [0.6, 0.4, 0.6], mat: 'white' });
  }

  // The lake, its stone arch footbridge, a boathouse and rowboats.
  water(out, LAKE.x, LAKE.z, LAKE.w, LAKE.d);
  const arch: [number, number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    arch.push([LAKE.x, 0.3 + 6 * Math.sin(Math.PI * t), LAKE.z - LAKE.d / 2 - 8 + (LAKE.d + 16) * t]);
  }
  for (let i = 0; i < arch.length - 1; i++) beam(out, arch[i]!, arch[i + 1]!, 0.8, 'rock', 7);
  edged(out, [-30, 3, 345], [14, 6, 10], 'brick');
  edged(out, [-30, 6.4, 345], [16, 0.8, 12], 'roof');
  for (const [x, z, m] of [[-70, 350, 'white'], [-95, 390, 'orange'], [-160, 360, 'white'], [-175, 395, 'orange']] as const) {
    out.push({ pos: [x, 0.4, z], size: [1.4, 0.6, 4], rot: [0, (x * 7) % 90, 0], mat: m });
  }

  // Rock outcrops.
  for (const [x, z, n] of [[-380, 390, 5], [0, 420, 4], [190, 330, 4], [-260, 300 + 40, 3]] as const) {
    for (let k = 0; k < n; k++) {
      const s = 5 + rand() * 7;
      out.push({ pos: [x + (rand() - 0.5) * 18, s * 0.35, z + (rand() - 0.5) * 14], size: [s * 1.3, s, s], rot: [rand() * 20 - 10, rand() * 90, rand() * 20 - 10], mat: 'rock' });
    }
  }
  // An obelisk to slalom around.
  edged(out, [-250, 15, 415], [3, 30, 3], 'concrete');
  out.push({ pos: [-250, 30.9, 415], size: [2.1, 2.1, 2.1], rot: [45, 0, 35.26], mat: 'concrete' });

  // A gazebo: eight posts in a ring under a roof.
  const gx = -300;
  const gz = 330;
  out.push({ pos: [gx, 0.25, gz], size: [13, 0.5, 13], mat: 'concrete' });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push({ pos: [gx + Math.cos(a) * 5.6, 2.7, gz + Math.sin(a) * 5.6], size: [0.4, 4.4, 0.4], mat: 'white' });
  }
  edged(out, [gx, 5.2, gz], [13, 0.6, 13], 'white', [0, 22.5, 0]);
  edged(out, [gx, 6.2, gz], [8, 1.4, 8], 'white', [0, 22.5, 0]);

  // The bandshell: a stage and nested half-arches opening south, onto the lawn.
  const bx = 100;
  const bz = 385;
  edged(out, [bx, 0.6, bz], [28, 1.2, 16], 'concrete');
  for (let k = 0; k < 5; k++) {
    const r = 14 - k * 1.8;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pts.push([bx + Math.cos(a) * r, 1.2 + Math.sin(a) * r, bz - 2 + k * 2.2]);
    }
    polyBeam(out, pts, 0.9, k % 2 ? 'orange' : 'white');
  }

  // Groves: trees scattered over the lawn, clear of the lake, paths, landmarks and the spawn.
  const clear = (x: number, z: number) =>
    (Math.abs(x - LAKE.x) < LAKE.w / 2 + 8 && Math.abs(z - LAKE.z) < LAKE.d / 2 + 12) ||
    Math.abs(z - 300) < 8 ||
    Math.abs(x + 50) < 6 ||
    Math.abs(x - 110) < 6 ||
    Math.abs(x + 205) < 22 ||
    Math.hypot(x - gx, z - gz) < 14 ||
    Math.hypot(x - bx, z - bz) < 24 ||
    Math.hypot(x + 250, z - 415) < 8 ||
    Math.hypot(x + 30, z - 345) < 14 ||
    Math.hypot(x + 20, z - 300) < 14;
  for (let k = 0; k < 220; k++) {
    const x = PX0 + 8 + rand() * (PX1 - PX0 - 16);
    const z = PZ0 + 8 + rand() * (PZ1 - PZ0 - 16);
    const h = 9 + rand() * 9;
    if (clear(x, z)) continue;
    tree(out, x, z, h);
  }
}

/** The street racetrack: a rounded circuit with barriers, a start gantry, a grandstand and pit garages. */
const TRACK = { x0: -420, z0: -440, x1: 180, z1: -310, r: 40, half: 9 } as const;

function trackLoop(offset: number, y: number, clockwise = false): V3[] {
  return roundedRect(TRACK.x0 - offset, TRACK.z0 - offset, TRACK.x1 + offset, TRACK.z1 + offset, TRACK.r + offset, y, clockwise);
}

function racetrack(out: ArenaBox[]): void {
  // The track surface (decor) and kerbs, segment by segment along the centerline.
  const center = trackLoop(0, 0.04);
  for (let i = 0; i < center.length; i++) {
    const a = center[i]!;
    const b = center[(i + 1) % center.length]!;
    beam(DECOR, a, b, 0.04, 'roof', TRACK.half * 2);
  }
  // A lawn over the infield (decor).
  DECOR.push({ pos: [(TRACK.x0 + TRACK.x1) / 2, 0.03, (TRACK.z0 + TRACK.z1) / 2], size: [TRACK.x1 - TRACK.x0 - 22, 0.05, TRACK.z1 - TRACK.z0 - 22], mat: 'foliage' });
  // Barriers on both edges: solid concrete walls you can skim.
  for (const off of [TRACK.half + 1.5, -TRACK.half - 1.5]) {
    const loop = trackLoop(off, 0.5);
    for (let i = 0; i < loop.length; i++) beam(out, loop[i]!, loop[(i + 1) % loop.length]!, 1, 'concrete', 0.6);
  }
  // Red and white kerbs along the inside of the corners (decor).
  const kerb = trackLoop(-TRACK.half + 0.6, 0.06);
  for (let i = 0; i < kerb.length; i++) {
    const a = kerb[i]!;
    const b = kerb[(i + 1) % kerb.length]!;
    if (Math.hypot(b[0] - a[0], b[2] - a[2]) > 20) continue;
    beam(DECOR, a, b, 0.05, i % 2 ? 'gridRed' : 'white', 1.2);
  }
  // Start / finish on the north straight: a checkered line and a gantry over the track.
  const sx = 40;
  for (let k = 0; k < 9; k++) for (const r of [0, 1]) DECOR.push({ pos: [sx + r, 0.07, TRACK.z1 - TRACK.half + 1 + k * 2 + r], size: [1, 0.02, 1], mat: 'white' });
  gate(out, sx, TRACK.z1, TRACK.half * 2 + 5, 8, 90);
  edged(out, [sx, 7.2, TRACK.z1], [1.4, 1.4, TRACK.half * 2 + 3], 'steel');
  // Grandstand along the north straight, facing the track, with a canopy.
  const gz = TRACK.z1 + TRACK.half + 6;
  for (const [dz, h] of [[0, 1.5], [4, 3.5], [8, 5.5], [12, 7.5]] as const) edged(out, [-100, h / 2, gz + dz], [150, h, 4], dz % 8 ? 'white' : 'concrete');
  edged(out, [-100, 7, gz + 15], [150, 14, 1], 'concrete');
  for (let x = -170; x <= -30; x += 20) out.push({ pos: [x, 7, gz + 13.6], size: [0.6, 14, 0.6], mat: 'steel' });
  edged(out, [-100, 14.4, gz + 7], [154, 0.8, 18], 'orange', [-8, 0, 0]);
  // Pit garages in the infield, behind the north straight.
  edged(out, [60, 3.5, TRACK.z1 - TRACK.half - 18], [70, 7, 10], 'white');
  edged(out, [60, 7.3, TRACK.z1 - TRACK.half - 18], [72, 0.6, 12], 'orange');
  for (let x = 30; x <= 90; x += 10) DECOR.push({ pos: [x, 3, TRACK.z1 - TRACK.half - 12.95], size: [8, 5, 0.1], mat: 'roof' });
  // Tire stacks on the outside of each corner.
  for (const [cx, cz] of [[TRACK.x1, TRACK.z0], [TRACK.x1, TRACK.z1], [TRACK.x0, TRACK.z1], [TRACK.x0, TRACK.z0]] as const) {
    for (let k = 0; k < 3; k++) out.push({ pos: [cx + Math.sign(cx) * (4 + k * 1.3), 0.6 + k * 0.0, cz + Math.sign(cz + 375) * (4 + k * 1.3)], size: [1.2, 1.2, 1.2], mat: 'roof' });
  }
}

/** Race cars lapping the circuit (ADR-0054): two lanes, each at its own speed, so they never touch. */
function raceCars(): MoverDef[] {
  const cars: MoverDef[] = [];
  const size: V3 = [2, 1.1, 4.6];
  const lanes = [
    { off: 3, speed: 34, count: 3, colors: ['#e5483e', '#2f7fe0', '#f5c63a'] },
    { off: -3, speed: 31, count: 2, colors: ['#ff8a2a', '#eeeeec'] },
  ];
  for (const lane of lanes) {
    const route = routeFromPoints(trackLoop(lane.off, 0));
    for (let i = 0; i < lane.count; i++) {
      cars.push({ kind: 'car', route, offset: (route.length / lane.count) * i, speed: lane.speed, color: lane.colors[i]!, size, lift: 0.55 });
    }
  }
  return cars;
}

/** Corner-cutting smoothing of a closed polyline (Chaikin), so the airliner's route has round turns. */
function smoothLoop(points: V3[], passes: number): V3[] {
  let pts = points;
  for (let p = 0; p < passes; p++) {
    const next: V3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    pts = next;
  }
  return pts;
}

/**
 * The airliner (ADR-0054): touch-and-go laps. It rolls north up the runway, climbs out, circles the
 * map high above everything, and comes back down over the racetrack to land again.
 */
function airliner(): MoverDef {
  const x = RUNWAY_X;
  const route = routeFromPoints(
    smoothLoop(
      [
        [x, 0, -300],
        [x, 0, -60],
        [x, 30, 120],
        [x, 90, 300],
        [400, 130, 425],
        [-435, 140, 430],
        [-438, 140, -430],
        [250, 55, -438],
        [x, 22, -438],
      ],
      3,
    ),
  );
  return { kind: 'plane', route, offset: 0, speed: 45, color: '#ff6a13', size: [4, 4, 34], lift: 3.2 };
}

/** A tower crane: lattice mast, a jib along +X or -X, counter-jib and weight, cab, hook. */
function towerCrane(out: ArenaBox[], x: number, z: number, mast: number, jib: number, dir: 1 | -1): void {
  tower(out, x, z, 2.4, mast, 6, 0, false);
  const y = mast + BEAM / 2 + 0.6;
  out.push({ pos: [x + dir * (jib / 2 - 2), y, z], size: [jib, 1.2, 1.4], mat: 'orange' });
  out.push({ pos: [x - dir * 8, y, z], size: [16, 1.2, 1.4], mat: 'orange' });
  out.push({ pos: [x - dir * 14, y - 1.6, z], size: [3, 2.4, 2.4], mat: 'concrete' });
  out.push({ pos: [x, y + 1.6, z], size: [2.6, 2.2, 2.6], mat: 'white' });
  out.push({ pos: [x, y + 4.5, z], size: [0.4, 4, 0.4], mat: 'orange' });
  const hx = x + dir * jib * 0.7;
  const hookTop = y - 30;
  out.push({ pos: [hx, (y - 0.6 + hookTop) / 2, z], size: [0.12, y - 0.6 - hookTop, 0.12], mat: 'steel' });
  out.push({ pos: [hx, hookTop - 0.7, z], size: [1.2, 1.4, 1.2], mat: 'orange' });
}

/**
 * The megaproject, west of the city: a half-built supertall (floors open to fly through), tower cranes,
 * and a deep excavation pit with shoring struts across it, a ramp down and machines on the floor.
 */
function megaproject(out: ArenaBox[]): void {
  // --- The pit: a floor PIT_DEPTH down, walls, shoring walers and struts, a guard rail around the rim.
  const { x, z, w, d } = PIT;
  const D = PIT_DEPTH;
  out.push({ pos: [x, -D - 0.5, z], size: [w + 2, 1, d + 2], mat: 'rock' });
  for (const s of [-1, 1]) {
    out.push({ pos: [x, -D / 2, z + s * (d / 2 + 0.5)], size: [w + 2, D, 1], mat: 'concrete' });
    out.push({ pos: [x + s * (w / 2 + 0.5), -D / 2, z], size: [1, D, d], mat: 'concrete' });
    for (const y of [-6, -12, -18]) {
      out.push({ pos: [x, y, z + s * (d / 2 - 0.4)], size: [w, 0.8, 0.8], mat: 'orange' });
      out.push({ pos: [x + s * (w / 2 - 0.4), y, z], size: [0.8, 0.8, d - 1.6], mat: 'orange' });
    }
    // Guard rail on the rim.
    out.push({ pos: [x, 1.1, z + s * (d / 2 + 1.2)], size: [w + 3, 0.2, 0.2], mat: 'orange' });
    out.push({ pos: [x + s * (w / 2 + 1.2), 1.1, z], size: [0.2, 0.2, d + 3], mat: 'orange' });
  }
  for (let k = -1; k <= 1; k++) {
    for (const c of [-1, 1]) out.push({ pos: [x + c * (w / 2 + 1.2), 0.55, z + k * 30], size: [0.2, 1.1, 0.2], mat: 'orange' });
  }
  // Cross struts spanning the pit east-west, at two depths.
  for (const [sz, y] of [[-30, -8], [0, -14], [30, -8]] as const) out.push({ pos: [x, y, z + sz], size: [w - 1.6, 1, 1], mat: 'orange' });
  out.push({ pos: [x - 15, -16, z], size: [1, 1, d - 1.6], mat: 'orange' });
  // A haul ramp down along the south wall.
  beam(out, [x + w / 2 - 1, 0, z - d / 2 + 5], [x - 2, -D, z - d / 2 + 5], 0.8, 'concrete', 8);
  // Machines on the floor: an excavator and two dump trucks.
  const fy = -D;
  edged(out, [x - 25, fy + 1.6, z + 20], [4, 2.4, 6], 'orange');
  edged(out, [x - 25, fy + 3.5, z + 18.5], [2.4, 1.6, 2.4], 'glass');
  beam(out, [x - 25, fy + 3, z + 22], [x - 25, fy + 8, z + 28], 0.7, 'orange');
  beam(out, [x - 25, fy + 8, z + 28], [x - 25, fy + 2, z + 33], 0.6, 'orange');
  for (const [tx, tz] of [[x + 15, z + 25], [x + 20, z - 10]] as const) {
    edged(out, [tx, fy + 1.8, tz], [3, 2.4, 7], 'white');
    edged(out, [tx, fy + 2.4, tz - 4.2], [3, 2.4, 1.8], 'orange');
  }
  for (const [dx, dz] of [[-38, -30], [-36.6, -30], [-37.3, -28.8]] as const) EXPLOSIVES.push({ kind: 'fuel', pos: [x + dx, fy + 0.82, z + dz], size: [1.2, 1.6, 1.2] });
  towerCrane(out, x + 55, z + 35, 64, 50, -1);

  // --- The supertall: a concrete core, open floor slabs every two floors on a column grid,
  // curtain wall on the lower floors only.
  const sx = -360;
  const sz = -60;
  const half = 20;
  const top = 128;
  edged(out, [sx, top / 2 + 4, sz], [10, top + 8, 10], 'concrete');
  for (let y = 8; y <= top; y += 8) edged(out, [sx, y, sz], [half * 2, 0.6, half * 2], 'concrete');
  for (const cx of [-half + 0.6, 0, half - 0.6]) {
    for (const cz of [-half + 0.6, 0, half - 0.6]) {
      if (cx === 0 && cz === 0) continue;
      out.push({ pos: [sx + cx, top / 2, sz + cz], size: [1, top, 1], mat: 'concrete' });
    }
  }
  for (const s of [-1, 1]) {
    edged(out, [sx, 24, sz + s * (half - 0.2)], [half * 2, 48, 0.4], 'glass');
    edged(out, [sx + s * (half - 0.2), 16, sz], [0.4, 32, half * 2], 'glass');
  }
  // A construction hoist up the east face.
  tower(out, sx + half + 2.5, sz + 10, 3, top - 4, 8, 0, false);
  towerCrane(out, sx + 30, sz - 40, 150, 56, 1);
  towerCrane(out, sx - 35, sz + 20, 162, 44, 1);
  // Site cabins: stacked containers.
  for (const [cx, cz, y] of [[-300, -110, 1.3], [-300, -102, 1.3], [-300, -106, 3.9]] as const) edged(out, [cx, y, cz], [6, 2.6, 2.4], 'orange');
}

/** Lane dashes: drawn, never collided with. */
function buildDecor(): ArenaBox[] {
  const out: ArenaBox[] = [];
  for (const street of STREETS) {
    for (let t = -146; t <= 146; t += 6) {
      if (STREETS.some((s) => Math.abs(t - s) < 9)) continue;
      out.push({ pos: [street, 0.015, t], size: [0.25, 0.02, 3], mat: 'paint' });
      out.push({ pos: [t, 0.015, street], size: [3, 0.02, 0.25], mat: 'paint' });
    }
  }
  // Beyond the boundary: the coastal hills and the sea (ADR-0054), drawn by the client's scenery.
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
  decor: [...buildDecor(), ...DECOR],
  spawns: SPAWNS,
  ground: 'asphalt',
  // An evening on the coast (ADR-0054): the sun low over the sea to the east, warm light, long views.
  backdrop: 'coast',
  atmosphere: {
    fog: '#dfe7ec',
    fogNear: 450,
    fogFar: 2100,
    hemiSky: '#bcdcff',
    hemiGround: '#a39580',
    hemiIntensity: 1.2,
    sunIntensity: 3.1,
    sunDirection: [0.9, 0.38, 0.12],
    sunColor: '#ffdcb4',
  },
  movers: [...traffic(), ...raceCars(), airliner()],
  explosives: EXPLOSIVES,
  holes: HOLES,
};
