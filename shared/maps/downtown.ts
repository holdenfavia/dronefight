import { BEAM, beam, boundary, cubeFrame, gate, hoop, mulberry32, pads, polyBeam, spawnFacingCenter, tower, water } from './builders.js';
import type { GroundHole } from './ground.js';
import { COTA_CENTERLINE } from './cota.js';
import { applyTerrain, drapeRoute, paintGroundCover, type Grouping } from './drape.js';
import { makeTerrain, terrainHeight, type Terrain } from './terrain.js';
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
 * The main map (ADR-0054, 1,120 m across since ADR-0055): an airport with a jet flying touch-and-go laps in the
 * east, Central Park with a lake in the north, the Circuit of the Americas with race cars in the south (ADR-0055),
 * and a megaproject in the west
 * (a half-built supertall, tower cranes and a deep excavation pit you can fly down into).
 */

const HALF = 560;
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
  spawnFacingCenter(-445, -475),
  spawnFacingCenter(320, -130),
  spawnFacingCenter(-290, 0),
];

/** The megaproject's excavation (ADR-0054): a 90 m square hole in the ground, PIT_DEPTH deep. */
const PIT = { x: -355, z: 105, w: 90, d: 90 } as const;
const PIT_DEPTH = 24;
const HOLES: readonly GroundHole[] = [PIT];

// --- Rolling ground (ADR-0059): SF / Rio hills under the city, the parks and the suburb; flat where it must be.

/** Flat on purpose: [x0, x1, z0, z1, falloff (m)]. The ground rises gently away from each. */
const FLAT_ZONES: readonly (readonly [number, number, number, number, number])[] = [
  [-HALF, HALF, 150, 282, 60], // the river, its bridges, the riverside boulevard, the park's south wall
  [-226, -184, -HALF, HALF, 45], // the elevated highway
  [-226, -138, -50, -30, 30], // its on-ramps into the city
  [-226, -138, 50, 70, 30],
  [-305, 270, -216, -160, 45], // the rail viaduct and the south avenue
  [-HALF, 275, -HALF, -215, 45], // the Circuit of the Americas
  [262, HALF, -HALF, 285, 50], // the airport
  [352, HALF, -HALF, HALF, 40], // the runway strip and the airliner's climb-out
  [150, 290, -190, 50, 45], // the stadium and the sports park
  [-425, -295, -125, 165, 35], // the megaproject
  [-HALF, -420, -205, 145, 30], // the favela (it's terraced already)
  [-200, -40, 330, 410, 40], // the lake
];

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The ground's height before anything is built on it: rolling hills, smoothed down to 0 in the flat zones. */
function groundHeight(x: number, z: number): number {
  // Flat at the map's edge too, to meet the backdrop.
  let mask = smooth01((HALF - Math.max(Math.abs(x), Math.abs(z)) - 25) / 80);
  for (const [x0, x1, z0, z1, f] of FLAT_ZONES) {
    if (mask <= 0) return 0;
    const dx = Math.max(x0 - x, 0, x - x1);
    const dz = Math.max(z0 - z, 0, z - z1);
    mask = Math.min(mask, smooth01(Math.hypot(dx, dz) / f));
  }
  if (mask <= 0) return 0;
  // In the city long, smooth swells (its blocks step down them as terraces); outside, fuller rolling hills.
  const outside = smooth01((Math.max(Math.abs(x), Math.abs(z)) - CITY) / 60);
  // The city's swell rises from the stadium and the bay (east) toward the west.
  const swell = 0.5 + 0.38 * Math.sin(x / 170 - 2.45) * Math.cos(z / 150 - 0.4);
  const hills = 0.5 + 0.22 * Math.sin(x / 105 + 0.7) * Math.cos(z / 131 - 0.4) + 0.16 * Math.sin((x + z) / 83 + 2.1) + 0.12 * Math.sin((x - 1.7 * z) / 57 + 0.3);
  const b = swell + (hills - swell) * outside;
  const amp = 10 + 6 * outside;
  return mask * amp * Math.pow(Math.min(1, Math.max(0, b)), 1.5);
}

/** The terrain, made when the map is built (5 m grid). */
let TERRAIN: Terrain = makeTerrain(HALF, 5, () => 0);
/** What moves onto the terrain together (ADR-0059): a building, a city block, a house, a sculpture. */
const GROUPING: Grouping = { groupOf: new Map(), anchors: [] };
/** The map's solid parts while it's being built (for `grouped`). */
let OUT: ArenaBox[] = [];
/** The skybridge pair spans two blocks, which move together. */
const SKYBRIDGE_ANCHOR: [number, number] = [-30, -60];

/** Everything `fn` adds (solid, decor, props) moves onto the terrain as one, by the ground at `anchor`. */
function grouped(fn: () => void, anchor: [number, number] | null = null): void {
  const b0 = OUT.length;
  const d0 = DECOR.length;
  const e0 = EXPLOSIVES.length;
  fn();
  const id = GROUPING.anchors.length;
  GROUPING.anchors.push(anchor);
  for (let k = b0; k < OUT.length; k++) GROUPING.groupOf.set(OUT[k]!, id);
  for (let k = d0; k < DECOR.length; k++) GROUPING.groupOf.set(DECOR[k]!, id);
  for (let k = e0; k < EXPLOSIVES.length; k++) GROUPING.groupOf.set(EXPLOSIVES[k]!, id);
}

/** Street trees on a block's sidewalk (ADR-0059), between the street lamps, clear of spawns. */
function blockTrees(out: ArenaBox[], cx: number, cz: number): void {
  for (const t of [-13, -7, 7, 13]) {
    for (const s of [-1, 1]) {
      for (const [x, z] of [[cx + t, cz + s * 22.6], [cx + s * 22.6, cz + t]] as const) {
        if (SPAWNS.some((p) => Math.hypot(p.pos[0] - x, p.pos[2] - z) < 9)) continue;
        streetTree(out, x, z, 6 + (Math.abs(Math.round(x * 7 + z * 3)) % 3) * 0.6);
      }
    }
  }
}

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
        // Railings stand just proud of the slab's edges, so their faces never share a plane with it.
        e([bx, y + 0.85, fz + face * 1.0], [4.2, 1, 0.1], 'steel');
        for (const s of [-1, 1]) e([bx + s * 2.05, y + 0.85, fz], [0.1, 1, 2.1], 'steel');
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
  out.push({ pos: [cx, 0.32, cz], size: [11, 0.62, 11], mat: 'water' });
  out.push({ pos: [cx, 2.8, cz], size: [1.4, 5, 1.4], mat: 'white' });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * 15;
    const z = cz + Math.sin(a) * 15;
    out.push({ pos: [x, 2, z], size: [0.5, 4, 0.5], mat: 'bark' });
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
  OUT = out;
  TERRAIN = makeTerrain(HALF, 5, groundHeight);
  const rand = mulberry32(2026);
  boundary(out, HALF);
  pads(out, SPAWNS);
  DECOR.push(...buildDecor());

  // Each block, with its sidewalk and street trees, moves onto the terrain as one: a level terrace (ADR-0059).
  for (let i = 0; i < BLOCKS.length; i++) {
    for (let j = 0; j < BLOCKS.length; j++) {
      const x = BLOCKS[i] ?? 0;
      const z = BLOCKS[j] ?? 0;
      const key = `${i},${j}`;
      const skybridge = key === '1,1' || key === '2,1';
      grouped(() => {
        out.push({ pos: [x, 0.1, z], size: [48, 0.2, 48], mat: 'sidewalk' });
        if (key === '2,2') plaza(out, x, z);
        else if (key === '1,3') garage(out, rand, x, z);
        else if (key === '3,1') constructionSite(out, x, z);
        else if (!skybridge) {
          // Taller buildings toward the corners, lower toward the plaza.
          const corner = Math.abs(i - 2) + Math.abs(j - 2) >= 3;
          cityBlock(out, rand, x, z, corner);
        }
        blockTrees(out, x, z);
      }, skybridge ? SKYBRIDGE_ANCHOR : [x, z]);
    }
  }
  // The skybridge pair (its two blocks' buildings) after the loop, as before, so the city keeps its layout.
  grouped(() => skybridgePair(out, rand), SKYBRIDGE_ANCHOR);
  streetLamps(out);
  parkedCars(rand);
  outskirts(out, rand);
  // Lawns and trees over whatever ground is still bare (ADR-0058).
  fillGaps(out);
  // Last: lawns become the terrain's grass, and everything moves onto the rolling ground (ADR-0059).
  paintGroundCover(TERRAIN, [out, DECOR]);
  applyTerrain(TERRAIN, out, DECOR, EXPLOSIVES, GROUPING);
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
  suburb(out);
  favela(out);
  sportsPark(out);
  airportSouth(out);
  boulevards(out);
  sculptureGarden(out);
  airportLandside(out);
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
  for (let x = -536; x <= 250; x += 24) {
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
  grouped(() => hoop(out, [180, 22, 70], 18, 0, 1.4, 'orange'));
  grouped(() => hoop(out, [215, 30, 110], 14, 50, 1.2, 'white'));
  grouped(() => hoop(out, [185, 40, 140], 10, -30, 1, 'orange'));
  // A leaning steel spike sculpture.
  grouped(() => beam(out, [235, 0, 60], [222, 46, 70], 2, 'steel'), [235, 60]);
}

/** An elevated highway on piers along the west side, crossing the river, with two on-ramps from the city. */
function highway(out: ArenaBox[]): void {
  const x = -205;
  const y = 12;
  const w = 18;
  const z0 = -250;
  const z1 = 250;
  out.push({ pos: [x, y, (z0 + z1) / 2], size: [w, 1, z1 - z0], mat: 'concrete' });
  for (const s of [-1, 1]) out.push({ pos: [x + s * (w / 2 - 0.35), y + 1, (z0 + z1) / 2], size: [0.4, 1.2, z1 - z0], mat: 'white' });
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
    out.push({ pos: [x, y / 2, z], size: [3, y, 9.6], mat: 'masonry' });
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
  out.push({ pos: [RUNWAY_X, 0.03, 0], size: [44, 0.06, RUNWAY_HALF_LEN * 2], mat: 'road' });
  out.push({ pos: [372, 0.03, 0], size: [16, 0.06, RUNWAY_HALF_LEN * 2], mat: 'road' });
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
    edged(out, [288.5, 9, hz], [1, 18, 44], 'corrugatedWhite');
    for (const s of [-1, 1]) edged(out, [310, 9, hz + s * 21.5], [44, 18, 1], 'corrugatedWhite');
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
  for (let z = -544; z <= 544; z += 32) palm(out, SEA_WALL_X + 7, z + ((z / 32) % 2 ? 6 : -6), z % 64 ? 1 : -1);
}

/** A palm: a leaning trunk and a crown of crossed fronds. */
function palm(out: ArenaBox[], x: number, z: number, lean: number): void {
  const top: [number, number, number] = [x + lean * 1.6, 10, z + 0.8];
  beam(out, [x, 0, z], top, 0.55, 'bark');
  for (const yaw of [0, 60, 120]) out.push({ pos: [top[0], top[1] + 0.3, top[2]], size: [7, 0.3, 1.4], rot: [0, yaw, -8], mat: 'foliage' });
  out.push({ pos: [top[0], top[1] + 0.4, top[2]], size: [1.4, 1, 1.4], mat: 'foliage' });
}

/** A park tree: a trunk and a blocky canopy. */
function tree(out: ArenaBox[], x: number, z: number, h: number): void {
  out.push({ pos: [x, h * 0.25, z], size: [0.6, h * 0.5, 0.6], mat: 'bark' });
  const c = h * 0.55;
  out.push({ pos: [x, h * 0.72, z], size: [c, h * 0.5, c], mat: 'foliage' });
}

/** Central Park, north of the river: lawns, a lake with a stone bridge and a boathouse, groves, rocks, a bandshell. */
function centralPark(out: ArenaBox[]): void {
  const rand = mulberry32(54);
  const PX0 = -556;
  const PX1 = 240;
  const PZ0 = 270;
  const PZ1 = 540;
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
  grouped(() => {
    edged(out, [-30, 3, 345], [14, 6, 10], 'brickHouse');
    edged(out, [-30, 6.4, 345], [16, 0.8, 12], 'roof');
  });
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
  grouped(() => {
    edged(out, [-250, 15, 415], [3, 30, 3], 'concrete');
    out.push({ pos: [-250, 30.9, 415], size: [2.1, 2.1, 2.1], rot: [45, 0, 35.26], mat: 'concrete' });
  });

  // A gazebo: eight posts in a ring under a roof.
  const gx = -300;
  const gz = 330;
  grouped(() => {
    out.push({ pos: [gx, 0.25, gz], size: [13, 0.5, 13], mat: 'concrete' });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      out.push({ pos: [gx + Math.cos(a) * 5.6, 2.7, gz + Math.sin(a) * 5.6], size: [0.4, 4.4, 0.4], mat: 'white' });
    }
    edged(out, [gx, 5.2, gz], [13, 0.6, 13], 'white', [0, 22.5, 0]);
    edged(out, [gx, 6.2, gz], [8, 1.4, 8], 'white', [0, 22.5, 0]);
  }, [gx, gz]);

  // The bandshell: a stage and nested half-arches opening south, onto the lawn.
  const bx = 100;
  const bz = 385;
  grouped(() => {
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
  }, [bx, bz]);

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
  for (let k = 0; k < 330; k++) {
    const x = PX0 + 8 + rand() * (PX1 - PX0 - 16);
    const z = PZ0 + 8 + rand() * (PZ1 - PZ0 - 16);
    const h = 9 + rand() * 9;
    if (clear(x, z)) continue;
    tree(out, x, z, h);
  }
}

/**
 * The racetrack (ADR-0055): the Circuit of the Americas, from its real centerline at 41% scale (2.26 km a lap),
 * turned to fit the south strip. Turn 1 is a tight uphill hairpin on a grassy hill; barriers line both edges
 * (left open on the inside of tight bends), with kerbs inside the corners and striped run-off outside. The main
 * grandstand and the pit building face the start/finish straight; the observation tower's red veil of steel
 * tubes sweeps down over an amphitheater in the infield.
 */
const CIRCUIT = { cx: -140, cz: -384.5, yawDeg: 25, scale: 0.41, half: 7, hill: 12 } as const;

interface TrackPoint {
  x: number;
  y: number;
  z: number;
  /** Unit normal toward the infield. */
  nx: number;
  nz: number;
  /** Signed curvature (1/m): positive turns toward the infield side. */
  k: number;
}

/** The circuit's centerline in map coordinates, smoothed, with heights (Turn 1 hill), infield normals and curvature. */
function circuitPoints(): { pts: TrackPoint[]; t1: number; sf: number } {
  const a = (CIRCUIT.yawDeg * Math.PI) / 180;
  let raw: V3[] = COTA_CENTERLINE.map(([x, z]) => [(x * Math.cos(a) - z * Math.sin(a)) * CIRCUIT.scale, 0, (x * Math.sin(a) + z * Math.cos(a)) * CIRCUIT.scale]);
  // Center its bounding box on the strip.
  const xs = raw.map((p) => p[0]);
  const zs = raw.map((p) => p[2]);
  const ox = CIRCUIT.cx - (Math.max(...xs) + Math.min(...xs)) / 2;
  const oz = CIRCUIT.cz - (Math.max(...zs) + Math.min(...zs)) / 2;
  raw = raw.map((p) => [p[0] + ox, 0, p[2] + oz]);
  // The data's first point is the start/finish line; its sixth is the apex of Turn 1.
  const sfAt = raw[0]!;
  const t1At = raw[6]!;
  const smooth = smoothLoop(raw, 2);
  const n = smooth.length;
  const near = (q: V3) => smooth.reduce((best, p, i) => (Math.hypot(p[0] - q[0], p[2] - q[2]) < Math.hypot(smooth[best]![0] - q[0], smooth[best]![2] - q[2]) ? i : best), 0);
  const t1 = near(t1At);
  const sf = near(sfAt);
  // Distance along the lap, to shape the hill: up the straight into Turn 1, down through Turn 2.
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(smooth[i]![0] - smooth[i - 1]![0], smooth[i]![2] - smooth[i - 1]![2]));
  const lap = cum[n - 1]! + Math.hypot(smooth[0]![0] - smooth[n - 1]![0], smooth[0]![2] - smooth[n - 1]![2]);
  const height = (i: number) => {
    let d = cum[i]! - cum[t1]!;
    if (d > lap / 2) d -= lap;
    if (d < -lap / 2) d += lap;
    if (d < -90 || d > 150) return 0;
    const u = d < 0 ? 1 + d / 90 : 1 - d / 150;
    return (CIRCUIT.hill * (1 - Math.cos(Math.PI * u))) / 2;
  };
  // Which side is the infield: the circuit runs counter-clockwise, but measure it rather than assume.
  let area = 0;
  for (let i = 0; i < n; i++) area += smooth[i]![0] * smooth[(i + 1) % n]![2] - smooth[(i + 1) % n]![0] * smooth[i]![2];
  const inward = area > 0 ? 1 : -1;
  const pts: TrackPoint[] = smooth.map((p, i) => {
    const prev = smooth[(i - 1 + n) % n]!;
    const next = smooth[(i + 1) % n]!;
    const tx = next[0] - prev[0];
    const tz = next[2] - prev[2];
    const len = Math.hypot(tx, tz) || 1;
    return { x: p[0], y: height(i), z: p[2], nx: (-tz / len) * inward, nz: (tx / len) * inward, k: 0 };
  });
  // Curvature at each point, from its neighbours.
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n]!;
    const q = pts[i]!;
    const r = pts[(i + 1) % n]!;
    const a1 = Math.atan2(q.z - p.z, q.x - p.x);
    const a2 = Math.atan2(r.z - q.z, r.x - q.x);
    const turn = ((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const arc = Math.hypot(q.x - p.x, q.z - p.z) + Math.hypot(r.x - q.x, r.z - q.z);
    // Turning toward the infield normal is positive.
    const cross = Math.cos(a1) * q.nz - Math.sin(a1) * q.nx;
    q.k = (Math.abs(turn) / Math.max(arc, 1e-3)) * Math.sign(turn) * Math.sign(cross || 1);
  }
  return { pts, t1, sf };
}

const CIRCUIT_TRACK = circuitPoints();

/** A point on the circuit moved sideways: + toward the infield. */
function across(p: TrackPoint, off: number, y = p.y): V3 {
  return [p.x + p.nx * off, y, p.z + p.nz * off];
}

/** Yaw (degrees) of a box whose length runs from a to b. */
function yawAlong(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (Math.atan2(-(b.z - a.z), b.x - a.x) * 180) / Math.PI;
}

/** Turn angle (radians) of the circuit at point i. */
function turnAt(pts: readonly TrackPoint[], i: number): number {
  const n = pts.length;
  const p = pts[(i - 1 + n) % n]!;
  const q = pts[i]!;
  const r = pts[(i + 1) % n]!;
  const a1 = Math.atan2(q.z - p.z, q.x - p.x);
  const a2 = Math.atan2(r.z - q.z, r.x - q.x);
  return Math.abs(((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
}

/**
 * A flat strip from a to b (track surface, kerb, run-off), `width` wide. Pieces are straight, so on a bend each one
 * is lengthened to close the wedge-shaped gap to its neighbour (through which the neighbour's end wall showed as a
 * flickering dark line), and every other piece sits 3 mm higher so no end wall stops exactly in its neighbour's
 * surface. A piece whose offset line has folded back on itself (the inside of a bend tighter than the offset)
 * is skipped.
 */
function strip(out: ArenaBox[], a: V3, b: V3, centerA: TrackPoint, centerB: TrackPoint, turnA: number, turnB: number, i: number, thick: number, width: number, mat: ArenaMaterial): void {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  const centerLen = Math.hypot(centerB.x - centerA.x, centerB.z - centerA.z);
  // Folded back, or squeezed/stretched so much that the offset has jumped across the bend.
  if (len < 1e-3 || dx * (centerB.x - centerA.x) + dz * (centerB.z - centerA.z) <= 0 || len < centerLen * 0.4 || len > centerLen * 3 + 1) return;
  const ux = dx / len;
  const uz = dz / len;
  const extA = (width / 2) * Math.tan(Math.min(turnA, 1.2) / 2);
  const extB = (width / 2) * Math.tan(Math.min(turnB, 1.2) / 2);
  const lift = (i % 2) * 0.003;
  beam(out, [a[0] - ux * extA, a[1] + lift, a[2] - uz * extA], [b[0] + ux * extB, b[1] + lift, b[2] + uz * extB], thick, mat, width);
}

function racetrack(out: ArenaBox[]): void {
  const { pts, t1, sf } = CIRCUIT_TRACK;
  const n = pts.length;
  const H = CIRCUIT.half;
  const turns = pts.map((_, i) => turnAt(pts, i));
  // Grass over the whole circuit area (decor), under the track.
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const [gx0, gx1, gz0, gz1] = [Math.min(...xs) - 14, Math.max(...xs) + 14, Math.min(...zs) - 12, Math.max(...zs) + 12];
  DECOR.push({ pos: [(gx0 + gx1) / 2, 0.012, (gz0 + gz1) / 2], size: [gx1 - gx0, 0.024, gz1 - gz0], mat: 'foliage' });

  const stripes: ArenaMaterial[] = ['red', 'white', 'blue'];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const raised = Math.max(a.y, b.y) > 0.15;
    if (raised) {
      // On the hill: a solid road slab on a grassy embankment.
      beam(out, [a.x, a.y - 0.3, a.z], [b.x, b.y - 0.3, b.z], 0.6, 'road', H * 2);
      const berm = Math.min(a.y, b.y) - 0.3;
      if (berm > 0.3) beam(out, [a.x, berm / 2, a.z], [b.x, berm / 2, b.z], berm, 'foliage', H * 2 + 8);
    } else strip(DECOR, [a.x, 0.04, a.z], [b.x, 0.04, b.z], a, b, turns[i]!, turns[(i + 1) % n]!, i, 0.04, H * 2, 'road');
    for (const side of [1, -1] as const) {
      // How tightly this stretch (and the points around it) bends toward this side.
      let toward = -Infinity;
      for (let j = -4; j <= 5; j++) toward = Math.max(toward, pts[(i + j + n) % n]!.k * side);
      // Barriers, except on the inside of tight bends (where an offset wall would fold over the track).
      if (toward < 1 / 13) {
        const wa = across(a, side * (H + 1.5), a.y + 0.5);
        const wb = across(b, side * (H + 1.5), b.y + 0.5);
        // Never a wall whose offset line folded back across the track.
        if ((wb[0] - wa[0]) * (b.x - a.x) + (wb[2] - wa[2]) * (b.z - a.z) > 0) beam(out, wa, wb, 1, 'concrete', 0.6);
      }
      // Kerbs inside corners, striped run-off outside them (decor).
      // Neighbouring stripes of different colours overlap where they join, so each colour sits at its own height.
      if (toward > 1 / 70 && toward < 1 / (H + 1)) strip(DECOR, across(a, side * (H - 0.6), a.y + 0.07 + (i % 2) * 0.012), across(b, side * (H - 0.6), b.y + 0.07 + (i % 2) * 0.012), a, b, turns[i]!, turns[(i + 1) % n]!, i, 0.05, 1.2, i % 2 ? 'red' : 'white');
      if (toward < -1 / 70 && !raised) strip(DECOR, across(a, side * (H + 4), 0.05 + (i % 3) * 0.012), across(b, side * (H + 4), 0.05 + (i % 3) * 0.012), a, b, turns[i]!, turns[(i + 1) % n]!, i, 0.03, 4.5, stripes[i % 3]!);
    }
  }

  // Start / finish: a checkered line and a gantry over the track.
  const s = pts[sf]!;
  const s2 = pts[(sf + 1) % n]!;
  const across90 = (Math.atan2(-s.nz, s.nx) * 180) / Math.PI;
  const along = yawAlong(s, s2);
  for (let k = -6; k <= 6; k++) DECOR.push({ pos: across(s, k * 1.1, 0.08), size: [1, 0.02, 1.1], rot: [0, along, 0], mat: k % 2 ? 'white' : 'rubber' });
  gate(out, s.x, s.z, H * 2 + 6, 9, across90);
  edged(out, [s.x, 8.6, s.z], [H * 2 + 4, 1.6, 1.2], 'steel', [0, across90, 0]);

  // Along the main straight: the main grandstand outside, the pit building inside.
  const back = pts[(sf - 12 + n) % n]!;
  const fwd = pts[(sf + 12) % n]!;
  const yaw = yawAlong(back, fwd);
  const len = 150;
  // Centered a little behind the line, so they stay beside the flat part of the straight.
  const ul = Math.hypot(fwd.x - back.x, fwd.z - back.z);
  const g: TrackPoint = { ...s, x: s.x - ((fwd.x - back.x) / ul) * 40, z: s.z - ((fwd.z - back.z) / ul) * 40 };
  for (const [off, h] of [[-(H + 12), 2], [-(H + 16), 4.5], [-(H + 20), 7], [-(H + 24), 9.5]] as const) {
    edged(out, across(g, off, h / 2), [len, h, 4], h > 5 ? 'white' : 'concrete', [0, yaw, 0]);
  }
  edged(out, across(g, -(H + 27), 9), [len, 18, 1.2], 'concrete', [0, yaw, 0]);
  for (let k = -3; k <= 3; k++) {
    const [px, , pz] = across(g, -(H + 26), 0);
    const dx = Math.cos((yaw * Math.PI) / 180) * k * 24;
    const dz = -Math.sin((yaw * Math.PI) / 180) * k * 24;
    out.push({ pos: [px + dx, 10, pz + dz], size: [0.8, 20, 0.8], rot: [0, yaw, 0], mat: 'steel' });
  }
  // A cantilevered roof over the stands, tipped up toward the track.
  edged(out, across(g, -(H + 18), 20), [len + 6, 0.8, 22], 'white', [0, yaw, 0]);
  // Pit building: glass over white, a long roof terrace.
  edged(out, across(g, H + 20, 4), [len, 8, 12], 'white', [0, yaw, 0]);
  edged(out, across(g, H + 20, 10), [len, 4, 10], 'glass', [0, yaw, 0]);
  edged(out, across(g, H + 20, 12.4), [len + 2, 0.8, 14], 'orange', [0, yaw, 0]);

  // Turn 1: a grandstand on the hilltop, outside the hairpin.
  const top = pts[t1]!;
  const tYaw = yawAlong(pts[(t1 - 2 + n) % n]!, pts[(t1 + 2) % n]!);
  const outSide = top.k >= 0 ? -1 : 1;
  for (const [off, h] of [[H + 14, top.y + 1.5], [H + 18, top.y + 3.5], [H + 22, top.y + 5.5]] as const) {
    edged(out, across(top, outSide * off, h / 2), [60, h, 4], 'concrete', [0, tYaw, 0]);
  }

  // The observation tower and its veil, over the amphitheater stage in the infield.
  const tx = -392;
  const tz = -362;
  const dir = [0.8, -0.6] as const;
  const deckY = 64;
  edged(out, [tx, deckY / 2, tz], [5, deckY, 5], 'white');
  edged(out, [tx, deckY + 2.5, tz], [15, 5, 15], 'glass');
  edged(out, [tx, deckY + 5.4, tz], [17, 0.8, 17], 'white');
  edged(out, [tx, deckY - 0.4, tz], [17, 0.8, 17], 'white');
  out.push({ pos: [tx, deckY + 9, tz], size: [0.5, 6.4, 0.5], mat: 'steel' });
  edged(out, [tx, 3, tz], [12, 6, 12], 'glass');
  // Seventeen red tubes fanning from the top of the tower down to the ground beyond the stage.
  const base = Math.atan2(dir[1], dir[0]);
  for (let k = 0; k < 17; k++) {
    const ang = base + ((k - 8) / 8) * 0.62;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const curve: V3[] = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      // Quadratic curve: out from the deck, sagging down to the ground ~40 m away.
      const r = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 30 + t * t * 40;
      const y = (1 - t) * (1 - t) * (deckY + 3) + 2 * (1 - t) * t * (deckY - 8) + t * t * 0.3;
      curve.push([tx + c * r, y, tz + sn * r]);
    }
    polyBeam(out, curve, 0.6, 'red');
  }
  // The amphitheater: a stage under the veil and curved rows facing it.
  const sx = tx + dir[0] * 28;
  const sz = tz + dir[1] * 28;
  edged(out, [sx, 0.8, sz], [18, 1.6, 10], 'concrete', [0, (-base * 180) / Math.PI + 90, 0]);
  for (const [r, h] of [[14, 0.6], [18, 1.2], [22, 1.8], [26, 2.4]] as const) {
    const row: V3[] = [];
    for (let j = 0; j <= 8; j++) {
      const ang = base + ((j - 4) / 4) * 0.8;
      row.push([sx + Math.cos(ang) * r, h / 2, sz + Math.sin(ang) * r]);
    }
    for (let j = 0; j < row.length - 1; j++) beam(out, row[j]!, row[j + 1]!, h, 'concrete', 3.4);
  }
}

/** Race cars lapping the circuit (ADR-0055): two lanes, each at its own speed, so they never touch. */
function raceCars(): MoverDef[] {
  const cars: MoverDef[] = [];
  const size: V3 = [2, 1.1, 4.6];
  const lanes = [
    { off: 2.5, speed: 38, colors: ['#e5483e', '#2f7fe0', '#f5c63a'] },
    { off: -2.5, speed: 35, colors: ['#ff8a2a', '#eeeeec', '#45b865'] },
  ];
  for (const lane of lanes) {
    const route = routeFromPoints(CIRCUIT_TRACK.pts.map((p) => across(p, lane.off)));
    lane.colors.forEach((color, i) => cars.push({ kind: 'car', route, offset: (route.length / lane.colors.length) * i, speed: lane.speed, color, size, lift: 0.55 }));
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
        [400, 130, 525],
        [-530, 140, 530],
        [-534, 140, -530],
        [250, 55, -536],
        [x, 22, -536],
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
    edged(out, [tx, fy + 2.4, tz - 4.2], [2.8, 2.4, 1.8], 'orange');
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
    // Set just inside the slab edges, so glass and concrete never share a face (no z-fighting).
    edged(out, [sx, 24, sz + s * (half - 0.35)], [half * 2 - 0.4, 48, 0.4], 'glass');
    edged(out, [sx + s * (half - 0.35), 16, sz], [0.4, 32, half * 2 - 0.4], 'glass');
  }
  // A construction hoist up the east face.
  tower(out, sx + half + 2.5, sz + 10, 3, top - 4, 8, 0, false);
  towerCrane(out, sx + 30, sz - 40, 150, 56, 1);
  towerCrane(out, sx - 35, sz + 20, 162, 44, 1);
  // Site cabins: stacked containers.
  for (const [cx, cz, y] of [[-410, -140, 1.3], [-410, -132, 1.3], [-410, -136, 3.9]] as const) edged(out, [cx, y, cz], [6, 2.6, 2.4], 'orange');
}

// --- Filling the last bare asphalt (ADR-0056): a suburb, a favela hill, a sports park, the airport's south side.

/**
 * A house with a gable roof: walls, a 45° gable (a square prism turned on its long axis, its upper half above
 * the walls), two roof slabs, sometimes a chimney. The ridge runs along X (or Z when `alongZ`).
 */
function house(out: ArenaBox[], x: number, z: number, w: number, d: number, h: number, wall: ArenaMaterial, roof: ArenaMaterial, alongZ: boolean, chimney: boolean): void {
  // The whole house moves onto the terrain as one (ADR-0059).
  grouped(() => {
    // Footprint: `w` along the ridge, `d` across it.
    const [sx, sz] = alongZ ? [d, w] : [w, d];
    edged(out, [x, h / 2, z], [sx, h, sz], wall);
    const g = d / Math.SQRT2;
    edged(out, [x, h, z], alongZ ? [g, g, w] : [w, g, g], wall, alongZ ? [0, 0, 45] : [45, 0, 0]);
    // Roof slabs over the two sloping faces, just proud of them, with a little overhang.
    const slab = d / Math.SQRT2 + 0.6;
    const off = d / 4 + 0.15 * Math.SQRT1_2;
    for (const s of [-1, 1]) {
      const y = h + d / 4 + 0.15 * Math.SQRT1_2;
      if (alongZ) edged(out, [x + s * off, y, z], [slab, 0.3, w + 0.6], roof, [0, 0, -s * 45]);
      else edged(out, [x, y, z + s * off], [w + 0.6, 0.3, slab], roof, [s * 45, 0, 0]);
    }
    if (chimney) out.push({ pos: alongZ ? [x + d * 0.2, h + d * 0.45, z + w * 0.3] : [x + w * 0.3, h + d * 0.45, z + d * 0.2], size: [0.9, d * 0.6, 0.9], mat: 'masonry' });
  }, [x, z]);
}

/** A suburb between Central Park and the runway: three streets of family houses with yards, pools and cars. */
function suburb(out: ArenaBox[]): void {
  const rand = mulberry32(56);
  const walls: ArenaMaterial[] = ['siding', 'plasterWhite', 'brickHouse', 'siding', 'plasterYellow'];
  const roofs: ArenaMaterial[] = ['shingle', 'shingle', 'clayTile'];
  for (const street of [340, 420, 500]) {
    // Street paint (decor) and a few lamps.
    for (let x = 256; x <= 420; x += 8) DECOR.push({ pos: [x, 0.015, street], size: [3, 0.02, 0.25], mat: 'paint' });
    for (let x = 262; x <= 420; x += 44) {
      out.push({ pos: [x, 3, street - 6], size: [0.2, 6, 0.2], mat: 'steel' });
      out.push({ pos: [x, 6, street - 5.4], size: [0.25, 0.2, 1.4], mat: 'steel' });
    }
    for (const side of [-1, 1]) {
      const lz = street + side * 17.5;
      for (let x = 262; x <= 418; x += 22) {
        // Clear of the runway's north end and the taxiway.
        if (lz < 345 && x > 355) continue;
        // The lot: lawn, a driveway to the street, a fence along the back.
        DECOR.push({ pos: [x, 0.025, lz], size: [20, 0.05, 25], mat: 'foliage' });
        const dx = x + (rand() < 0.5 ? -6 : 6);
        DECOR.push({ pos: [dx, 0.06, street + side * 8], size: [4, 0.04, 7], mat: 'concrete' });
        const back = lz + side * 12.3;
        out.push({ pos: [x, 0.7, back], size: [20.2, 1.4, 0.15], mat: 'white' });
        for (const fs of [-1, 1]) out.push({ pos: [x + fs * 10.1, 0.7, lz + side * 6], size: [0.15, 1.4, 12.6], mat: 'white' });
        // The house, set back from the street.
        const w = 9 + rand() * 4;
        const dd = 7 + rand() * 2;
        const floors = rand() < 0.35 ? 2 : 1;
        house(out, x + (dx > x ? -2.5 : 2.5), lz - side * 1.5, w, dd, floors * 3.2, walls[Math.floor(rand() * walls.length)]!, roofs[Math.floor(rand() * roofs.length)]!, false, rand() < 0.4);
        if (rand() < 0.6) EXPLOSIVES.push({ kind: 'car', pos: [dx, 0.83, street + side * 8.5], size: [2, 1.5, 4.4], color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
        // Backyard: a pool (with a concrete edge) or a tree.
        if (rand() < 0.3) {
          const pz = lz + side * 8.2;
          const px = x + (rand() - 0.5) * 6;
          grouped(() => {
            water(out, px, pz, 5, 3);
            for (const es of [-1, 1]) {
              out.push({ pos: [px, 0.12, pz + es * 1.75], size: [6, 0.24, 0.5], mat: 'concrete' });
              out.push({ pos: [px + es * 2.75, 0.12, pz], size: [0.5, 0.24, 3], mat: 'concrete' });
            }
          }, [px, pz]);
        } else tree(out, x + (rand() - 0.5) * 12, lz + side * 9, 7 + rand() * 4);
      }
    }
  }
}

/**
 * A favela on a terraced hill against the west edge: ten steps up to 30 m, packed with small brick and painted
 * houses (alleys about a metre wide between them), blue water tanks and bare rebar on the roofs, stairways up.
 */
function favela(out: ArenaBox[]): void {
  const rand = mulberry32(57);
  const Z0 = -195;
  const Z1 = 135;
  const STEP = 13.5;
  const mats: ArenaMaterial[] = ['brickHouse', 'brickHouse', 'brickHouse', 'brickHouse', 'masonry', 'plasterWhite', 'plasterPink', 'plasterYellow', 'plasterBlue', 'plasterYellow', 'plasterGreen'];
  const stairs = (z: number) => Math.abs(((z - Z0) % 66) - 33) < 3.5;
  for (let k = 0; k < 10; k++) {
    const x1 = -425 - STEP * k;
    const x0 = x1 - STEP;
    const top = 3 * (k + 1);
    // The terrace: a solid step of hillside with a concrete retaining wall.
    out.push({ pos: [(x0 + x1) / 2, top / 2, (Z0 + Z1) / 2], size: [STEP, top, Z1 - Z0], mat: 'concrete' });
    // A stair up to the next terrace every 66 m.
    if (k < 9) for (let z = Z0 + 33; z < Z1; z += 66) beam(out, [x0 + 4, top, z], [x0 - 4, top + 3, z], 0.5, 'concrete', 3);
    // Houses on a 7 m grid, two columns per terrace.
    for (const cx of [x0 + 3.5, x0 + 10]) {
      for (let z = Z0 + 3.5; z < Z1 - 3; z += 7) {
        if (stairs(z) || rand() < 0.22) continue;
        const w = 5.2 + rand() * 1.1;
        const d = 5.2 + rand() * 1.1;
        const floors = 1 + Math.floor(rand() * 3);
        const h = floors * 3;
        const x = cx + (rand() - 0.5) * 0.6;
        const zz = z + (rand() - 0.5) * 0.6;
        out.push({ pos: [x, top + h / 2, zz], size: [w, h, d], mat: mats[Math.floor(rand() * mats.length)]! });
        const roofY = top + h;
        const r = rand();
        if (r < 0.35) out.push({ pos: [x + (rand() - 0.5) * 2, roofY + 0.7, zz + (rand() - 0.5) * 2], size: [1.4, 1.4, 1.4], mat: 'blue' });
        else if (r < 0.6) for (const [px, pz] of [[-1, -1], [1, 1], [1, -1]] as const) out.push({ pos: [x + px * (w / 2 - 0.4), roofY + 0.6, zz + pz * (d / 2 - 0.4)], size: [0.12, 1.2, 0.12], mat: 'steel' });
      }
    }
    // A few trees growing out of the gaps.
    for (let t = 0; t < 3; t++) {
      const z = Z0 + 10 + rand() * (Z1 - Z0 - 20);
      if (stairs(z)) continue;
      tree(out, x0 + 6.75, z + 3.5, 5 + rand() * 3);
    }
  }
}

/** East of the stadium: a lit soccer pitch with bleachers, a skatepark and two tennis courts. */
function sportsPark(out: ArenaBox[]): void {
  // --- Soccer pitch.
  const fx = 222;
  const fz = -148;
  const L = 90;
  const W = 56;
  DECOR.push({ pos: [fx, 0.02, fz], size: [L + 8, 0.04, W + 8], mat: 'foliage' });
  for (const s of [-1, 1]) {
    DECOR.push({ pos: [fx, 0.05, fz + s * (W / 2)], size: [L, 0.02, 0.3], mat: 'paint' });
    DECOR.push({ pos: [fx + s * (L / 2), 0.05, fz], size: [0.3, 0.02, W], mat: 'paint' });
    // Penalty boxes and goals.
    DECOR.push({ pos: [fx + s * (L / 2 - 8), 0.05, fz], size: [0.3, 0.02, 30], mat: 'paint' });
    for (const t of [-1, 1]) DECOR.push({ pos: [fx + s * (L / 2 - 4), 0.05, fz + t * 15], size: [8, 0.02, 0.3], mat: 'paint' });
    for (const t of [-1, 1]) out.push({ pos: [fx + s * (L / 2), 1.2, fz + t * 3.6], size: [0.2, 2.4, 0.2], mat: 'white' });
    out.push({ pos: [fx + s * (L / 2), 2.45, fz], size: [0.22, 0.2, 7.6], mat: 'white' });
  }
  DECOR.push({ pos: [fx, 0.05, fz], size: [0.3, 0.02, W], mat: 'paint' });
  const circle: V3[] = [];
  for (let i = 0; i <= 16; i++) circle.push([fx + Math.cos((i / 16) * Math.PI * 2) * 9, 0.05, fz + Math.sin((i / 16) * Math.PI * 2) * 9]);
  for (let i = 0; i < 16; i++) beam(DECOR, circle[i]!, circle[i + 1]!, 0.02, 'paint', 0.3);
  // Bleachers along the north touchline, and light towers at the corners.
  for (const [dz, h] of [[0, 0.8], [2, 1.6], [4, 2.4]] as const) edged(out, [fx, h / 2, fz + W / 2 + 6 + dz], [60, h, 2], 'concrete');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push({ pos: [fx + sx * (L / 2 + 4), 13, fz + sz * (W / 2 + 4)], size: [0.8, 26, 0.8], mat: 'steel' });
    edged(out, [fx + sx * (L / 2 + 4), 26.5, fz + sz * (W / 2 + 4)], [4, 2, 1], 'white');
  }

  // --- Skatepark: a half-pipe, a funbox with ramps, rails and a quarter pipe on a concrete pad.
  const kx = 217;
  const kz = 15;
  DECOR.push({ pos: [kx, 0.02, kz], size: [50, 0.04, 40], mat: 'concrete' });
  const hp = kx - 12;
  for (const s of [-1, 1]) {
    // A quarter circle of 4 m radius rising away from the middle, 14 m long, with a deck on top.
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push([hp, 4 - Math.cos(a) * 4 + 0.2, kz + s * (3 + Math.sin(a) * 4)]);
    }
    for (let i = 0; i < 6; i++) beam(out, pts[i]!, pts[i + 1]!, 0.4, 'concrete', 14);
    edged(out, [hp, 4, kz + s * 9], [14, 0.4, 3.6], 'concrete');
    for (const ex of [-1, 1]) out.push({ pos: [hp + ex * 6.8, 2, kz + s * 10.6], size: [0.3, 4, 0.3], mat: 'steel' });
  }
  edged(out, [kx + 12, 0.6, kz - 8], [6, 1.2, 6], 'concrete');
  for (const s of [-1, 1]) beam(out, [kx + 12 + s * 3, 1.2, kz - 8], [kx + 12 + s * 7, 0.1, kz - 8], 0.3, 'concrete', 6);
  for (const rz of [kz + 4, kz + 10]) {
    out.push({ pos: [kx + 10, 0.9, rz], size: [10, 0.12, 0.12], mat: 'steel' });
    for (const ex of [-1, 1]) out.push({ pos: [kx + 10 + ex * 4.5, 0.45, rz], size: [0.12, 0.9, 0.12], mat: 'steel' });
  }
  const qp: V3[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    qp.push([kx + 22 + Math.sin(a) * 3, 3 - Math.cos(a) * 3 + 0.2, kz]);
  }
  for (let i = 0; i < 6; i++) beam(out, qp[i]!, qp[i + 1]!, 0.4, 'concrete', 20);

  // --- Two tennis courts, long side north-south, with nets.
  for (const cx of [253, 271]) {
    const cz = 20;
    DECOR.push({ pos: [cx, 0.03, cz], size: [14, 0.05, 30], mat: 'court' });
    for (const s of [-1, 1]) {
      DECOR.push({ pos: [cx + s * 5.5, 0.07, cz], size: [0.12, 0.02, 23.8], mat: 'paint' });
      DECOR.push({ pos: [cx, 0.07, cz + s * 11.9], size: [11, 0.02, 0.12], mat: 'paint' });
    }
    out.push({ pos: [cx, 0.5, cz], size: [12, 1, 0.05], mat: 'white' });
    for (const s of [-1, 1]) out.push({ pos: [cx + s * 6.1, 0.55, cz], size: [0.15, 1.1, 0.15], mat: 'steel' });
  }
}

/** South of the hangars: a car park with a rental canopy, a cargo terminal and containers, fuel tankers, a cargo jet. */
function airportSouth(out: ArenaBox[]): void {
  const rand = mulberry32(58);
  // Car park: stall lines (decor) and parked cars that blow up.
  for (const row of [-548, -535, -505, -492]) {
    for (let x = 272; x <= 330; x += 3.2) {
      DECOR.push({ pos: [x - 1.6, 0.015, row], size: [0.15, 0.02, 5], mat: 'paint' });
      if (rand() < 0.45) EXPLOSIVES.push({ kind: 'car', pos: [x, 0.75, row], size: [2, 1.5, 4.4], color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
    }
  }
  // A rental-car canopy over one row.
  for (let x = 272; x <= 332; x += 15) for (const s of [-1, 1]) out.push({ pos: [x, 1.8, -505 + s * 3.4], size: [0.3, 3.6, 0.3], mat: 'steel' });
  edged(out, [302, 3.75, -505], [64, 0.3, 8], 'white');
  // Cargo terminal with dock doors on its west face.
  edged(out, [345, 6, -400], [40, 12, 30], 'white');
  edged(out, [345, 12.3, -400], [41, 0.6, 31], 'orange');
  for (let z = -410; z <= -390; z += 6) DECOR.push({ pos: [324.95, 2.5, z], size: [0.1, 5, 4], mat: 'steel' });
  // Container stacks, one to three high, with gaps between the stacks to fly down.
  const boxes: ArenaMaterial[] = ['corrugatedOrange', 'corrugatedGrey', 'corrugatedWhite', 'corrugatedBlue'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) out.push({ pos: [292 + i * 9, 1.3 + k * 2.6, -445 + j * 6], size: [6, 2.6, 2.4], mat: boxes[Math.floor(rand() * boxes.length)]! });
    }
  }
  // Fuel tankers: their tanks blow up (ADR-0023).
  for (const tz of [-360, -368, -376]) {
    out.push({ pos: [300, 0.9, tz], size: [10, 1, 2.6], mat: 'white' });
    edged(out, [306.4, 1.7, tz], [2.6, 2.6, 2.4], 'orange');
    EXPLOSIVES.push({ kind: 'propane', pos: [299, 2.62, tz], size: [2.4, 2.4, 6], yawDeg: 90 });
  }
  // A cargo jet parked by the terminal.
  parkedAirliner(out, 350, -460, 'steel');
}

// --- Flow (ADR-0058): boulevards that tie the districts together, a sculpture garden, and no bare ground.

/** A street tree: a slim trunk and a rounded canopy (a smaller version of the park's). */
function streetTree(out: ArenaBox[], x: number, z: number, h: number): void {
  out.push({ pos: [x, h * 0.3, z], size: [0.45, h * 0.6, 0.45], mat: 'bark' });
  out.push({ pos: [x, h * 0.72, z], size: [h * 0.42, h * 0.45, h * 0.42], mat: 'foliage' });
  out.push({ pos: [x, h * 0.72, z], size: [h * 0.3, h * 0.6, h * 0.3], mat: 'foliage', rot: [0, 45, 0] });
}

/**
 * A straight boulevard from (x0, z) to (x1, z) or (x, z0) to (x, z1): a dark road with centre dashes, sidewalks,
 * and rows of trees and lamps on both sides. `skip(t)` leaves gaps (under bridges, at the highway).
 */
function boulevard(out: ArenaBox[], along: 'x' | 'z', at: number, t0: number, t1: number, skip: (t: number) => boolean): void {
  const W = 14;
  const len = t1 - t0;
  const mid = (t0 + t1) / 2;
  const pos = (t: number, off: number, y: number): [number, number, number] => (along === 'x' ? [t, y, at + off] : [at + off, y, t]);
  const size = (l: number, h: number, w: number): [number, number, number] => (along === 'x' ? [l, h, w] : [w, h, l]);
  DECOR.push({ pos: pos(mid, 0, 0.03), size: size(len, 0.04, W), mat: 'road' });
  for (const s of [-1, 1]) DECOR.push({ pos: pos(mid, s * (W / 2 + 1.75), 0.06), size: size(len, 0.06, 3.5), mat: 'sidewalk' });
  for (let t = t0 + 3; t < t1 - 3; t += 9) DECOR.push({ pos: pos(t, 0, 0.065), size: size(4, 0.02, 0.3), mat: 'paint' });
  for (let t = t0 + 8; t < t1 - 8; t += 16) {
    if (skip(t)) continue;
    for (const s of [-1, 1]) streetTree(out, ...([pos(t, s * (W / 2 + 2.6), 0)[0], pos(t, s * (W / 2 + 2.6), 0)[2]] as const), 7 + ((t * 7) % 3));
  }
  for (let t = t0 + 16; t < t1 - 8; t += 32) {
    if (skip(t)) continue;
    for (const s of [-1, 1]) {
      const [lx, , lz] = pos(t + 8, s * (W / 2 + 0.6), 0);
      out.push({ pos: [lx, 3.5, lz], size: [0.22, 7, 0.22], mat: 'steel' });
      out.push({ pos: [lx, 7.1, lz], size: [0.6, 0.3, 0.6], mat: 'white' });
    }
  }
}

/** The riverside boulevard (between the river and Central Park) and the south avenue (between the city and the viaduct). */
function boulevards(out: ArenaBox[]): void {
  const near = (t: number, xs: readonly number[], r: number) => xs.some((x) => Math.abs(t - x) < r);
  boulevard(out, 'x', 246, -545, 300, (t) => near(t, [-60, 110], 12) || near(t, [-205], 16));
  boulevard(out, 'x', -175, -300, 160, (t) => near(t, [-205], 16));
}

/**
 * A sculpture garden in the strip between the megaproject and the highway: a winding path through lawns and
 * hedges, a reflecting pool with stepping stones, and solid sculptures to fly through and around.
 */
function sculptureGarden(out: ArenaBox[]): void {
  const X0 = -300;
  const X1 = -224;
  const Z0 = -160;
  const Z1 = 132;
  const cx = (X0 + X1) / 2;
  const rand = mulberry32(58_1);
  DECOR.push({ pos: [cx, 0.025, (Z0 + Z1) / 2], size: [X1 - X0, 0.05, Z1 - Z0], mat: 'foliage' });
  // The winding path (decor) with low hedges along stretches of it.
  const pathX = (z: number) => cx + 18 * Math.sin((z - Z0) / 38);
  const path: V3[] = [];
  for (let z = Z0; z <= Z1; z += 6) path.push([pathX(z), 0.07, z]);
  for (let i = 0; i < path.length - 1; i++) beam(DECOR, path[i]!, path[i + 1]!, 0.03, 'sidewalk', 4);
  for (let i = 0; i < path.length - 1; i += 3) {
    if (i % 2) continue;
    for (const s of [-1, 1]) beam(out, [path[i]![0] + s * 3.4, 0.6, path[i]![2]], [path[i + 1]![0] + s * 3.4, 0.6, path[i + 1]![2]], 1.2, 'foliage', 0.9);
  }
  // Sculptures, alternating sides of the path. Each stays in its own spot clear of the path.
  const spot = (z: number, side: 1 | -1): [number, number] => [pathX(z) + side * 17, z];
  // 1. A tower of five cubes, each smaller and turned further.
  grouped(() => {
    const [x, z] = spot(-140, 1);
    let y = 0;
    for (let k = 0; k < 5; k++) {
      const sz = 7 - k * 1.1;
      edged(out, [x, y + sz / 2, z], [sz, sz, sz], k % 2 ? 'white' : 'orange', [0, k * 18, 0]);
      y += sz;
    }
  });
  // 2. A twisting spine: thin slabs stacked and turned 9° each.
  grouped(() => {
    const [x, z] = spot(-110, -1);
    for (let k = 0; k < 16; k++) edged(out, [x, 1 + k * 1.6, z], [9, 0.5, 2.2], 'white', [0, k * 9, 0]);
    out.push({ pos: [x, 13, z], size: [0.8, 26, 0.8], mat: 'steel' });
  });
  // 3. Two tilted rings, interlocked, big enough to fly through.
  grouped(() => {
    const [x, z] = spot(-78, 1);
    hoop(out, [x, 11, z], 9, 20, 0.9, 'steel', 20);
    hoop(out, [x + 3, 11, z + 3], 9, 110, 0.9, 'orange', 20);
  });
  // 4. Balanced rocks: a heavy stone on a small one, on a plinth.
  grouped(() => {
    const [x, z] = spot(-46, -1);
    out.push({ pos: [x, 0.5, z], size: [6, 1, 6], mat: 'concrete' });
    out.push({ pos: [x, 2.6, z], size: [2.4, 3.2, 2.4], rot: [10, 30, -8], mat: 'rock' });
    out.push({ pos: [x + 0.6, 7.6, z], size: [7, 6, 5.5], rot: [-14, 60, 22], mat: 'rock' });
  });
  // 5. A forest of steel poles of different heights to weave through.
  grouped(() => {
    const [x, z] = spot(-14, 1);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const h = 4 + rand() * 18;
      out.push({ pos: [x - 8 + i * 4, h / 2, z - 8 + j * 4], size: [0.35, h, 0.35], mat: (i + j) % 3 ? 'steel' : 'orange' });
    }
  });
  // (The megaproject spawn sits in a clearing at z = 0.)
  // 6. A giant cube balanced on one corner.
  grouped(() => {
    const [x, z] = spot(30, 1);
    const sz = 8;
    edged(out, [x, (sz * Math.sqrt(3)) / 2, z], [sz, sz, sz], 'yellow', [45, 0, 35.26]);
  });
  // 7. A reflecting pool with stepping stones across it.
  grouped(() => {
    const [x, z] = [pathX(58), 58];
    water(out, x, z, 22, 14);
    for (let k = -3; k <= 3; k++) out.push({ pos: [x + k * 3, 0.35, z + (k % 2) * 1.2], size: [1.8, 0.5, 1.8], mat: 'rock' });
  });
  // 8. An arch of three leaning slabs.
  grouped(() => {
    const [x, z] = spot(86, -1);
    beam(out, [x - 7, 0, z], [x - 2, 12, z], 1.6, 'concrete', 3);
    beam(out, [x + 7, 0, z], [x + 2, 12, z], 1.6, 'concrete', 3);
    edged(out, [x, 12.6, z], [6.4, 1.6, 3], 'concrete');
  });
  // 9. A helix climbing around a mast.
  grouped(() => {
    const [x, z] = spot(116, 1);
    const pts: V3[] = [];
    for (let k = 0; k <= 36; k++) {
      const a = (k / 36) * Math.PI * 4;
      pts.push([x + Math.cos(a) * 5, 1 + k * 0.6, z + Math.sin(a) * 5]);
    }
    polyBeam(out, pts, 0.6, 'red');
    out.push({ pos: [x, 11.5, z], size: [0.6, 23, 0.6], mat: 'white' });
  });
  // Benches and lamps along the path, clear of the sculptures.
  for (let z = Z0 + 20; z < Z1 - 10; z += 32) {
    const x = pathX(z) + 3.4;
    out.push({ pos: [x, 0.25, z], size: [0.6, 0.5, 2.2], mat: 'wood' });
    out.push({ pos: [pathX(z + 16) - 3.2, 2.5, z + 16], size: [0.2, 5, 0.2], mat: 'steel' });
    out.push({ pos: [pathX(z + 16) - 3.2, 5.1, z + 16], size: [0.6, 0.3, 0.6], mat: 'white' });
  }
}

/** The airport's landside, where the riverside boulevard ends: a fountain roundabout and a hotel tower. */
function airportLandside(out: ArenaBox[]): void {
  const rx = 330;
  const rz = 246;
  // The roundabout: a ring of road around a planted island with a fountain.
  const ring: V3[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ring.push([rx + Math.cos(a) * 15, 0.03, rz + Math.sin(a) * 15]);
  }
  for (let k = 0; k < 24; k++) beam(DECOR, ring[k]!, ring[k + 1]!, 0.04, 'road', 9);
  DECOR.push({ pos: [rx, 0.07, rz], size: [14, 0.06, 14], rot: [0, 22.5, 0], mat: 'foliage' });
  water(out, rx, rz, 6, 6, 45);
  out.push({ pos: [rx, 2.5, rz], size: [0.8, 5, 0.8], mat: 'white' });
  out.push({ pos: [rx, 5.2, rz], size: [2.6, 0.4, 2.6], rot: [0, 45, 0], mat: 'white' });
  // The hotel: a glass tower on a podium, south of the roundabout.
  building(out, mulberry32(59), 330, 192, 26, 22, 36, 'glass');
}

/**
 * No bare ground (ADR-0058): every 20 m patch of the map with nothing on it gets a lawn and something growing:
 * a tree, a cluster of trees, shrubs, or a bench. Patches near spawns, the runway and the airliner's approach,
 * and anything already built or drawn stay as they are.
 */
function fillGaps(out: ArenaBox[]): void {
  /** Which cells of a `C` m grid have anything on them (or near them, within margin `M`). */
  const occupancy = (C: number, M: number) => {
    const n = Math.round((HALF * 2) / C);
    const used = new Uint8Array(n * n);
    const mark = (x0: number, x1: number, z0: number, z1: number) => {
      const i0 = Math.max(0, Math.floor((x0 + HALF) / C));
      const i1 = Math.min(n - 1, Math.floor((x1 + HALF) / C));
      const j0 = Math.max(0, Math.floor((z0 + HALF) / C));
      const j1 = Math.min(n - 1, Math.floor((z1 + HALF) / C));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) used[j * n + i] = 1;
    };
    for (const b of [...out, ...DECOR]) {
      if (b.mat === 'invisible') continue;
      const r = b.rot ? Math.hypot(b.size[0], b.size[1], b.size[2]) / 2 : 0;
      const hx = b.rot ? r : b.size[0] / 2;
      const hz = b.rot ? r : b.size[2] / 2;
      mark(b.pos[0] - hx - M, b.pos[0] + hx + M, b.pos[2] - hz - M, b.pos[2] + hz + M);
    }
    for (const e of EXPLOSIVES) {
      const r = Math.max(...e.size) / 2 + M;
      mark(e.pos[0] - r, e.pos[0] + r, e.pos[2] - r, e.pos[2] + r);
    }
    // Paved on purpose: the city's streets (traffic), the airport's car park and cargo apron.
    mark(-CITY, CITY, -CITY, CITY);
    mark(266, 338, -HALF, -484);
    mark(282, 372, -472, -336);
    return { n, used, mark };
  };

  // 1. Lawn up to everything, on a fine grid. It sits lower than every other ground layer, so it never shares
  //    a face with one (ADR-0055).
  const fine = occupancy(10, 0.5);
  const coarse = occupancy(20, 1.5);
  for (let j = 0; j < fine.n; j++) {
    for (let i = 0; i < fine.n; i++) {
      if (fine.used[j * fine.n + i]) continue;
      DECOR.push({ pos: [-HALF + (i + 0.5) * 10, 0.016, -HALF + (j + 0.5) * 10], size: [10, 0.032, 10], mat: 'foliage' });
    }
  }
  // 2. Something growing on every clear 20 m patch (measured before step 1's lawns, which don't count).
  for (const s of SPAWNS) coarse.mark(s.pos[0] - 16, s.pos[0] + 16, s.pos[2] - 16, s.pos[2] + 16);
  // The runway, the taxiway and the airliner's low approach from the south: grass only, nothing tall.
  coarse.mark(355, HALF, -HALF, HALF);
  const rand = mulberry32(60);
  const C = 20;
  for (let j = 0; j < coarse.n; j++) {
    for (let i = 0; i < coarse.n; i++) {
      if (coarse.used[j * coarse.n + i]) continue;
      const x = -HALF + (i + 0.5) * C;
      const z = -HALF + (j + 0.5) * C;
      const r = rand();
      const jx = (rand() - 0.5) * 6;
      const jz = (rand() - 0.5) * 6;
      if (r < 0.5) tree(out, x + jx, z + jz, 9 + rand() * 6);
      else if (r < 0.72) for (const [dx, dz] of [[-4, -3], [4, -2], [0, 4]] as const) tree(out, x + dx + jx * 0.3, z + dz + jz * 0.3, 7 + rand() * 4);
      else if (r < 0.88) for (const [dx, dz] of [[-3, 0], [2, 2], [1, -3]] as const) out.push({ pos: [x + dx + jx * 0.4, 0.8, z + dz + jz * 0.4], size: [2.4, 1.6, 2.4], rot: [0, rand() * 90, 0], mat: 'foliage' });
      else {
        out.push({ pos: [x + jx * 0.5, 0.25, z + jz * 0.5], size: [2.2, 0.5, 0.6], mat: 'wood' });
        tree(out, x - jx, z - jz, 10 + rand() * 4);
      }
    }
  }
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
    // On the rolling streets (ADR-0059).
    const route = routeFromPoints(drapeRoute(TERRAIN, roundedRect(-loop.half, -loop.half, loop.half, loop.half, 5, 0, loop.clockwise)));
    for (let i = 0; i < loop.count; i++) {
      cars.push({ kind: 'car', route, offset: (route.length / loop.count) * i, speed: loop.speed, color: CAR_COLORS[c++ % CAR_COLORS.length]!, size, lift: 0.75 });
    }
  }
  return cars;
}

/** Builds the map. Call it through getMap(), which builds each map once, on first use. */
export function buildDowntown(): MapDef {
  return {
    id: 'downtown',
    name: 'Downtown',
    halfSize: HALF,
    boxes: build(),
    decor: DECOR,
    // On the rolling ground (ADR-0059), like their pads.
    spawns: SPAWNS.map((s) => ({ ...s, pos: [s.pos[0], terrainHeight(TERRAIN, s.pos[0], s.pos[2]) + 0.1, s.pos[2]] as [number, number, number] })),
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
    terrain: TERRAIN,
  };
}
