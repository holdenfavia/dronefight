import { BEAM, boundary, cubeFrame, gate, mulberry32, pads, spawnFacingCenter, tower } from './builders.js';
import type { ArenaBox, ArenaMaterial, MapDef, SpawnPoint } from './types.js';

/**
 * Downtown (ADR-0012): a 5x5 grid of city blocks with 16 m streets between them.
 * Towers of mixed heights with alleys to thread, an open parking garage, a skybridge,
 * a construction site with a crane, and a plaza in the middle for open dogfighting.
 */

const HALF = 150;
/** Block centers along each axis. Streets run between them at ±30 and ±90. */
const BLOCKS = [-120, -60, 0, 60, 120];
const STREETS = [-90, -30, 30, 90];
/** Buildable half-width of a block (sidewalk runs to ±24). */
const LOT = 20;
const FLOOR = 4;

const SPAWNS: readonly SpawnPoint[] = [
  spawnFacingCenter(-90, -90),
  spawnFacingCenter(90, 90),
  spawnFacingCenter(-90, 90),
  spawnFacingCenter(90, -90),
  spawnFacingCenter(-30, 90),
  spawnFacingCenter(30, -90),
  spawnFacingCenter(90, -30),
  spawnFacingCenter(-90, 30),
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
    out.push({ pos: [tx, top + 4.8, tz], size: [3.4, 3.6, 3.4], mat: 'brick' });
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
      out.push({ pos: [x, y + (y === 0 ? 0 : 0.25) + 0.75, cz + 12], size: [2, 1.5, 4.4], mat: pick(rand, ['white', 'steel', 'orange', 'glass'] as const) });
    }
  }
}

/** Construction site: an unfinished frame, scaffolding and a tower crane. */
function constructionSite(out: ArenaBox[], cx: number, cz: number): void {
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
  const jibY = mast + 1;
  out.push({ pos: [mx - 22, jibY, mz], size: [48, 1.2, 1.4], mat: 'orange' });
  out.push({ pos: [mx + 9, jibY, mz], size: [16, 1.2, 1.4], mat: 'orange' });
  out.push({ pos: [mx + 15, jibY - 1.6, mz], size: [3, 2.4, 2.4], mat: 'concrete' });
  out.push({ pos: [mx, jibY + 1.6, mz], size: [2.6, 2.2, 2.6], mat: 'white' });
  out.push({ pos: [mx, jibY + 4.5, mz], size: [0.4, 4, 0.4], mat: 'orange' });
  const hookX = mx - 34;
  out.push({ pos: [hookX, jibY - 15, mz], size: [0.12, 28, 0.12], mat: 'steel' });
  out.push({ pos: [hookX, jibY - 29.5, mz], size: [1.2, 1.4, 1.2], mat: 'orange' });
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
function parkedCars(out: ArenaBox[], rand: Rand): void {
  const colors = ['white', 'steel', 'orange', 'glass', 'white'] as const;
  for (const street of STREETS) {
    for (const t of BLOCKS) {
      if (rand() < 0.4) continue;
      const side = rand() < 0.5 ? -1 : 1;
      out.push({ pos: [street + side * 4.5, 0.75, t + (rand() - 0.5) * 20], size: [2, 1.5, 4.4], mat: pick(rand, colors) });
      if (rand() < 0.5) out.push({ pos: [t + (rand() - 0.5) * 20, 0.75, street + side * 4.5], size: [4.4, 1.5, 2], mat: pick(rand, colors) });
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
  parkedCars(out, rand);
  return out;
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
  for (let x = -520; x <= 520; x += 40) {
    for (let z = -520; z <= 520; z += 40) {
      if (Math.max(Math.abs(x), Math.abs(z)) < 190 || rand() < 0.45) continue;
      const w = 16 + rand() * 18;
      const d = 16 + rand() * 18;
      const nearness = 1 - (Math.max(Math.abs(x), Math.abs(z)) - 190) / 330;
      const h = 20 + rand() * (40 + 100 * nearness);
      const mat: ArenaMaterial = rand() < 0.4 ? 'glass' : rand() < 0.5 ? 'brick' : 'facade';
      out.push({ pos: [x + (rand() - 0.5) * 8, h / 2, z + (rand() - 0.5) * 8], size: [w, h, d], mat });
    }
  }
  return out;
}

export const DOWNTOWN: MapDef = {
  id: 'downtown',
  name: 'Downtown',
  halfSize: HALF,
  boxes: build(),
  decor: buildDecor(),
  spawns: SPAWNS,
  ground: 'asphalt',
};
