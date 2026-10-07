import { beam, boundary, pads, spawnFacingCenter } from './builders.js';
import type { ArenaBox, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

/**
 * Detail test (temporary): the same tower at five levels of detail in a row, left (1, least) to right
 * (5, most), to judge how 3D building detail looks and costs before reworking Downtown. A post of orange
 * cubes in front of each tower shows its level.
 *
 * - 1: a plain tower with a roof cap, outlined.
 * - 2: + a ledge at every floor; rooftop parapet, AC units and a penthouse.
 * - 3: + a colonnade with a recessed glass storefront, a narrower upper tier with a terrace railing,
 *      balconies on the south face.
 * - 4: + balconies on the east face, a fire escape down the west face, pilasters (visual only).
 * - 5: + window sills and mullions (visual only), an entrance canopy, terrace planters, a helipad,
 *      a water tank and an antenna.
 *
 * Solid detail is in `boxes` (collided, landable, checked by the server for bullets); visual-only detail
 * is in `decor` (drawn, never collided). Everything is outlined (`edge`).
 */

const HALF = 230;
/** Tower shape shared by every level: footprint, floors, floor height, podium floors, setback floor. */
const T = { w: 30, floors: 17, floorH: 4, podium: 2, setback: 13 } as const;
/** Where each level stands, left to right. */
const LEVEL_X = [-170, -85, 0, 85, 170] as const;

const SPAWNS: readonly SpawnPoint[] = [-180, -128, -76, -24, 24, 76, 128, 180].map((x) => spawnFacingCenter(x, 80));

const DECOR: ArenaBox[] = [];
const EXPLOSIVES: ExplosiveDef[] = [];

/** A box with an outline. */
const e = (out: ArenaBox[], pos: [number, number, number], size: [number, number, number], mat: ArenaBox['mat'], rot?: [number, number, number]) =>
  out.push(rot ? { pos, size, mat, rot, edge: true } : { pos, size, mat, edge: true });

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  boundary(out, HALF);
  pads(out, SPAWNS);
  LEVEL_X.forEach((x, i) => {
    const level = i + 1;
    levelTower(out, DECOR, x, 0, level);
    // The level marker: a post with one orange cube per level, in front of the tower.
    out.push({ pos: [x, 1.5, 32], size: [0.4, 3, 0.4], mat: 'steel' });
    for (let k = 0; k < level; k++) out.push({ pos: [x, 3.6 + k * 1.3, 32], size: [1, 1, 1], mat: 'orange' });
  });
  return out;
}

/** The same tower at a level of detail from 1 (plain) to 5 (everything). */
function levelTower(out: ArenaBox[], decor: ArenaBox[], x: number, z: number, level: number): void {
  const { w, floors, floorH, podium, setback } = T;
  const half = w / 2;
  const podiumH = podium * floorH;
  const topH = floors * floorH;
  // Levels 1 and 2 are one block to the roof; 3 and up have a narrower upper tier above the setback.
  const tiered = level >= 3;
  const towerTop = tiered ? setback * floorH : topH;

  // --- Street level: a solid base (1-2), or a recessed storefront behind a colonnade (3+).
  if (level >= 3) {
    e(out, [x, podiumH / 2, z], [w - 2, podiumH, w - 2], 'glass');
    for (let c = -half; c <= half; c += 5) {
      for (const [dx, dz] of [[c, -half], [c, half], [-half, c], [half, c]] as const) e(out, [x + dx, podiumH / 2, z + dz], [0.9, podiumH, 0.9], 'white');
    }
    e(out, [x, podiumH + 0.3, z], [w + 1.2, 0.6, w + 1.2], 'concrete');
  }
  if (level >= 5) {
    e(out, [x, 4.2, z + half + 2], [12, 0.35, 4], 'orange');
    for (const dx of [-5.5, 5.5]) e(out, [x + dx, 2.1, z + half + 3.8], [0.25, 4.2, 0.25], 'steel');
  }

  // --- The shaft: full width (1-2) or a glass core set back behind the facade (3+), and floor ledges (2+).
  const shaftY0 = level >= 3 ? podiumH : 0;
  const shaftH = towerTop - shaftY0;
  e(out, [x, shaftY0 + shaftH / 2, z], level >= 3 ? [w - 1.4, shaftH, w - 1.4] : [w, shaftH, w], 'glass');
  if (level >= 2) for (let f = (level >= 3 ? podium : 0) + 1; f <= towerTop / floorH; f++) e(out, [x, f * floorH, z], [w + 0.8, 0.45, w + 0.8], 'facade');

  // --- Pilasters (4+) and window sills / mullions (5): visual only.
  if (level >= 4) {
    for (let c = -half; c <= half + 0.01; c += 5) {
      for (const [dx, dz] of [[c, -half], [c, half], [-half, c], [half, c]] as const) e(decor, [x + dx, podiumH + shaftH / 2, z + dz], [0.6, shaftH, 0.6], 'facade');
    }
  }
  if (level >= 5) {
    for (let f = podium; f < setback; f++) {
      const y = f * floorH;
      for (let c = -half + 2.5; c < half; c += 5) {
        for (const [dx, dz, along] of [[c, -half, 'x'], [c, half, 'x'], [-half, c, 'z'], [half, c, 'z']] as const) {
          e(decor, [x + dx, y + 1, z + dz], along === 'x' ? [4.2, 0.18, 0.35] : [0.35, 0.18, 4.2], 'white');
          e(decor, [x + dx, y + 1 + (floorH - 1.2) / 2, z + dz], along === 'x' ? [0.12, floorH - 1.2, 0.2] : [0.2, floorH - 1.2, 0.12], 'steel');
        }
      }
    }
  }

  // --- Balconies, every other floor: south face (3+), east face too (4+). Solid.
  if (level >= 3) {
    for (let f = podium + 1; f < setback; f += 2) {
      const y = f * floorH + 0.25;
      for (const bx of [-9, 0, 9]) {
        e(out, [x + bx, y, z + half + 1], [4, 0.3, 2], 'concrete');
        e(out, [x + bx, y + 0.6, z + half + 1.95], [4, 1, 0.1], 'steel');
        for (const s of [-1, 1]) e(out, [x + bx + s * 1.95, y + 0.6, z + half + 1], [0.1, 1, 2], 'steel');
        if (level >= 4) {
          e(out, [x + half + 1, y, z + bx], [2, 0.3, 4], 'concrete');
          e(out, [x + half + 1.95, y + 0.6, z + bx], [0.1, 1, 4], 'steel');
          for (const s of [-1, 1]) e(out, [x + half + 1, y + 0.6, z + bx + s * 1.95], [2, 1, 0.1], 'steel');
        }
      }
    }
  }

  // --- Fire escape down the west face (4+): a landing per floor, zig-zag stairs, outer rail. Solid.
  if (level >= 4) {
    for (let f = podium; f < setback; f++) {
      const y = f * floorH + floorH;
      e(out, [x - half - 1.3, y, z], [2.4, 0.2, 9], 'steel');
      e(out, [x - half - 2.45, y + 0.55, z], [0.1, 1.1, 9], 'steel');
      const s = f % 2 === 0 ? 1 : -1;
      beam(out, [x - half - 1.3, y - floorH + 0.1, z + s * 4], [x - half - 1.3, y, z - s * 4], 0.25, 'steel', 1.8);
    }
  }

  // --- The upper tier above the setback, with a terrace railing (3+) and planters (5).
  let roofW: number = w;
  if (tiered) {
    const upW = 20;
    roofW = upW;
    e(out, [x, towerTop + 0.3, z], [w + 0.8, 0.6, w + 0.8], 'roof');
    const upH = topH - towerTop;
    e(out, [x, towerTop + upH / 2, z], [upW, upH, upW], 'glass');
    for (let f = setback + 1; f <= floors; f++) e(out, [x, f * floorH, z], [upW + 0.8, 0.45, upW + 0.8], 'facade');
    for (const s of [-1, 1]) {
      e(out, [x, towerTop + 1.2, z + s * (half + 0.2)], [w + 0.8, 1.2, 0.15], 'steel');
      e(out, [x + s * (half + 0.2), towerTop + 1.2, z], [0.15, 1.2, w + 0.8], 'steel');
    }
    if (level >= 5) {
      for (const [px, pz] of [[-12, 12], [12, 12], [-12, -12], [12, -12]] as const) {
        e(out, [x + px, towerTop + 1.2, z + pz], [3, 1.2, 3], 'concrete');
        e(out, [x + px, towerTop + 2.4, z + pz], [2.6, 1.4, 2.6], 'foliage');
      }
    }
  }

  // --- Roof: a cap (1+); parapet, AC units, penthouse (2+); helipad, water tank, antenna, trim (5).
  const roof = topH;
  e(out, [x, roof + 0.3, z], [roofW + 0.8, 0.6, roofW + 0.8], 'roof');
  if (level >= 2) {
    for (const s of [-1, 1]) {
      e(out, [x, roof + 1.1, z + s * (roofW / 2 + 0.2)], [roofW + 0.8, 1, 0.4], 'facade');
      e(out, [x + s * (roofW / 2 + 0.2), roof + 1.1, z], [0.4, 1, roofW + 0.8], 'facade');
    }
    e(out, [x - 5, roof + 2.6, z - 5], [8, 4, 6], 'concrete');
    for (const [ax, az] of [[-7, 5], [-4, 6]] as const) e(out, [x + ax, roof + 1.2, z + az], [2, 1.2, 1.5], 'steel');
  }
  if (level >= 5) {
    e(out, [x + 4, roof + 0.75, z + 4], [9, 0.3, 9], 'pad');
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) e(out, [x + 6 + lx, roof + 1.8, z - 6 + lz], [0.2, 2.4, 0.2], 'steel');
    EXPLOSIVES.push({ kind: 'water', pos: [x + 6, roof + 4.6, z - 6], size: [3.4, 3.4, 3.4], color: '#8a5a3c' });
    e(out, [x - 5, roof + 4.6 + 6, z - 5], [0.4, 12, 0.4], 'orange');
    e(out, [x, roof + 1.7, z], [roofW + 1, 0.2, roofW + 1], 'orange');
  }
}

export const LAB: MapDef = {
  id: 'lab',
  name: 'Detail test',
  halfSize: HALF,
  boxes: build(),
  decor: DECOR,
  spawns: SPAWNS,
  ground: 'concrete',
  explosives: EXPLOSIVES,
};
