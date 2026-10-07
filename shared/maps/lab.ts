import { beam, boundary, pads, spawnFacingCenter } from './builders.js';
import type { ArenaBox, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

/**
 * Detail test (temporary): one high-detail tower next to a plain box tower of the same size, to judge
 * how 3D building detail looks and costs before reworking Downtown.
 *
 * Detail comes in two layers so each can be costed:
 * - solid (in `boxes`: collided, landable, checked by the server for bullets): floor ledges, balconies with
 *   railings, the podium canopy, setback terrace, rooftop penthouse, helipad, water tank, fire escape;
 * - visual only (in `decor`: drawn, never collided): pilasters, window sills and mullions.
 * Everything on the detailed tower is outlined (`edge`).
 */

const HALF = 150;
/** The detailed tower: footprint, floors, floor height, and where the upper setback starts. */
const T = { x: 0, z: 0, w: 30, floors: 17, floorH: 4, podium: 2, setback: 13 } as const;

const SPAWNS: readonly SpawnPoint[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.4;
  return spawnFacingCenter(Math.round(Math.cos(a) * 48), Math.round(Math.sin(a) * 48));
});

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  boundary(out, HALF);
  pads(out, SPAWNS);
  detailedTower(out, DECOR);
  // The plain tower beside it: the same size as one box, the way Downtown draws buildings today.
  const h = T.floors * T.floorH;
  out.push({ pos: [80, h / 2, 0], size: [T.w, h, T.w], mat: 'glass' });
  out.push({ pos: [80, h + 0.2, 0], size: [T.w + 0.4, 0.4, T.w + 0.4], mat: 'roof' });
  return out;
}

const DECOR: ArenaBox[] = [];
const EXPLOSIVES: ExplosiveDef[] = [];

/** A box with an outline. */
const e = (out: ArenaBox[], pos: [number, number, number], size: [number, number, number], mat: ArenaBox['mat'], rot?: [number, number, number]) =>
  out.push(rot ? { pos, size, mat, rot, edge: true } : { pos, size, mat, edge: true });

function detailedTower(out: ArenaBox[], decor: ArenaBox[]): void {
  const { x, z, w, floors, floorH, podium, setback } = T;
  const half = w / 2;
  const podiumH = podium * floorH;
  const towerTop = setback * floorH;
  const topH = floors * floorH;

  // --- Podium: a recessed glass storefront behind a colonnade, with an entrance canopy.
  e(out, [x, podiumH / 2, z], [w - 2, podiumH, w - 2], 'glass');
  for (let c = -half; c <= half; c += 5) {
    for (const [dx, dz] of [[c, -half], [c, half], [-half, c], [half, c]] as const) e(out, [x + dx, podiumH / 2, z + dz], [0.9, podiumH, 0.9], 'white');
  }
  e(out, [x, podiumH + 0.3, z], [w + 1.2, 0.6, w + 1.2], 'concrete');
  e(out, [x, 4.2, z + half + 2], [12, 0.35, 4], 'orange');
  for (const dx of [-5.5, 5.5]) e(out, [x + dx, 2.1, z + half + 3.8], [0.25, 4.2, 0.25], 'steel');

  // --- Tower shaft: a glass core set back behind the facade, with a projecting ledge at every floor.
  const shaftH = towerTop - podiumH;
  e(out, [x, podiumH + shaftH / 2, z], [w - 1.4, shaftH, w - 1.4], 'glass');
  for (let f = podium + 1; f <= setback; f++) e(out, [x, f * floorH, z], [w + 0.8, 0.45, w + 0.8], 'facade');
  // Pilasters and window sills / mullions: visual only.
  for (let c = -half; c <= half + 0.01; c += 5) {
    for (const [dx, dz] of [[c, -half], [c, half], [-half, c], [half, c]] as const) e(decor, [x + dx, podiumH + shaftH / 2, z + dz], [0.6, shaftH, 0.6], 'facade');
  }
  for (let f = podium; f < setback; f++) {
    const y = f * floorH;
    for (let c = -half + 2.5; c < half; c += 5) {
      for (const [dx, dz, along] of [[c, -half, 'x'], [c, half, 'x'], [-half, c, 'z'], [half, c, 'z']] as const) {
        const sill: [number, number, number] = along === 'x' ? [4.2, 0.18, 0.35] : [0.35, 0.18, 4.2];
        e(decor, [x + dx, y + 1, z + dz], sill, 'white');
        const mull: [number, number, number] = along === 'x' ? [0.12, floorH - 1.2, 0.2] : [0.2, floorH - 1.2, 0.12];
        e(decor, [x + dx, y + 1 + (floorH - 1.2) / 2, z + dz], mull, 'steel');
      }
    }
  }

  // --- Balconies on the south and east faces, every other floor: slab, front rail, side rails. Solid.
  for (let f = podium + 1; f < setback; f += 2) {
    const y = f * floorH + 0.25;
    for (const bx of [-9, 0, 9]) {
      // South face (+Z).
      e(out, [x + bx, y, z + half + 1], [4, 0.3, 2], 'concrete');
      e(out, [x + bx, y + 0.6, z + half + 1.95], [4, 1, 0.1], 'steel');
      for (const s of [-1, 1]) e(out, [x + bx + s * 1.95, y + 0.6, z + half + 1], [0.1, 1, 2], 'steel');
      // East face (+X).
      e(out, [x + half + 1, y, z + bx], [2, 0.3, 4], 'concrete');
      e(out, [x + half + 1.95, y + 0.6, z + bx], [0.1, 1, 4], 'steel');
      for (const s of [-1, 1]) e(out, [x + half + 1, y + 0.6, z + bx + s * 1.95], [2, 1, 0.1], 'steel');
    }
  }

  // --- Fire escape down the west face: a landing per floor, zig-zag stairs, outer rail. Solid.
  for (let f = podium; f < setback; f++) {
    const y = f * floorH + floorH;
    e(out, [x - half - 1.3, y, z], [2.4, 0.2, 9], 'steel');
    e(out, [x - half - 2.45, y + 0.55, z], [0.1, 1.1, 9], 'steel');
    const s = f % 2 === 0 ? 1 : -1;
    beam(out, [x - half - 1.3, y - floorH + 0.1, z + s * 4], [x - half - 1.3, y, z - s * 4], 0.25, 'steel', 1.8);
  }

  // --- Upper tower above the setback, with a terrace on the setback roof.
  const upW = 20;
  e(out, [x, towerTop + 0.3, z], [w + 0.8, 0.6, w + 0.8], 'roof');
  const upH = topH - towerTop;
  e(out, [x, towerTop + upH / 2, z], [upW, upH, upW], 'glass');
  for (let f = setback + 1; f <= floors; f++) e(out, [x, f * floorH, z], [upW + 0.8, 0.45, upW + 0.8], 'facade');
  for (const [px, pz] of [[-12, 12], [12, 12], [-12, -12], [12, -12]] as const) {
    e(out, [x + px, towerTop + 1.2, z + pz], [3, 1.2, 3], 'concrete');
    e(out, [x + px, towerTop + 2.4, z + pz], [2.6, 1.4, 2.6], 'foliage');
  }
  for (const s of [-1, 1]) {
    e(out, [x, towerTop + 1.2, z + s * (half + 0.2)], [w + 0.8, 1.2, 0.15], 'steel');
    e(out, [x + s * (half + 0.2), towerTop + 1.2, z], [0.15, 1.2, w + 0.8], 'steel');
  }

  // --- Roof: parapet, penthouse, a helipad you can land on, AC units, a water tank and an antenna.
  const roof = topH;
  e(out, [x, roof + 0.3, z], [upW + 0.8, 0.6, upW + 0.8], 'roof');
  for (const s of [-1, 1]) {
    e(out, [x, roof + 1.1, z + s * (upW / 2 + 0.2)], [upW + 0.8, 1, 0.4], 'facade');
    e(out, [x + s * (upW / 2 + 0.2), roof + 1.1, z], [0.4, 1, upW + 0.8], 'facade');
  }
  e(out, [x - 5, roof + 2.6, z - 5], [8, 4, 6], 'concrete');
  e(out, [x + 4, roof + 0.75, z + 4], [9, 0.3, 9], 'pad');
  for (const [ax, az] of [[-7, 5], [-4, 6]] as const) e(out, [x + ax, roof + 1.2, z + az], [2, 1.2, 1.5], 'steel');
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) e(out, [x + 6 + lx, roof + 1.8, z - 6 + lz], [0.2, 2.4, 0.2], 'steel');
  EXPLOSIVES.push({ kind: 'water', pos: [x + 6, roof + 4.6, z - 6], size: [3.4, 3.4, 3.4], color: '#8a5a3c' });
  e(out, [x - 5, roof + 4.6 + 6, z - 5], [0.4, 12, 0.4], 'orange');
  e(out, [x, roof + 1.7, z], [upW + 1, 0.2, upW + 1], 'orange');
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
