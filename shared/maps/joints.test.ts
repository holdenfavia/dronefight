import { describe, expect, it } from 'vitest';
import { eulerXYZMatrix } from '../raycast.js';
import { BEAM, cubeFrame, tower } from './builders.js';
import { MAPS } from './index.js';
import type { ArenaBox } from './types.js';

/** Structures must meet flush: no notched corners, no floating parts, no intersecting props. */

function inside(box: ArenaBox, p: [number, number, number], eps = 1e-6): boolean {
  const m = eulerXYZMatrix(...(box.rot ?? [0, 0, 0]));
  const d = [p[0] - box.pos[0], p[1] - box.pos[1], p[2] - box.pos[2]];
  // local = R^T * d
  const lx = m[0]! * d[0]! + m[3]! * d[1]! + m[6]! * d[2]!;
  const ly = m[1]! * d[0]! + m[4]! * d[1]! + m[7]! * d[2]!;
  const lz = m[2]! * d[0]! + m[5]! * d[1]! + m[8]! * d[2]!;
  return Math.abs(lx) <= box.size[0] / 2 + eps && Math.abs(ly) <= box.size[1] / 2 + eps && Math.abs(lz) <= box.size[2] / 2 + eps;
}

const covered = (boxes: readonly ArenaBox[], p: [number, number, number]) => boxes.some((b) => inside(b, p));

describe('structure joints', () => {
  it('cube frames have solid outer corners', () => {
    const out: ArenaBox[] = [];
    cubeFrame(out, 0, 10, 0, 8);
    const e = 4 + BEAM / 2 - 0.01;
    for (const x of [-e, e]) for (const y of [10 - e, 10 + e]) for (const z of [-e, e]) expect(covered(out, [x, y, z]), `corner ${x},${y},${z}`).toBe(true);
  });

  it('tower posts reach the top of the top ring, and the deck sits on them', () => {
    for (const [height, level] of [[20, 4], [14, 5], [28, 4]] as const) {
      const out: ArenaBox[] = [];
      tower(out, 0, 0, 6, height, level);
      const e = 3 - 0.01;
      for (const x of [-e, e]) for (const z of [-e, e]) {
        expect(covered(out, [x, height + BEAM / 2 - 0.01, z]), `top corner of ${height} m tower`).toBe(true);
      }
      const deck = out.find((b) => b.mat === 'steel')!;
      expect(deck.pos[1] - deck.size[1] / 2).toBeCloseTo(height + BEAM / 2, 6);
    }
  });

  it("Yard ramp meets the platform's top edge and the ground", () => {
    const boxes = MAPS.yard.boxes;
    const rampBox = boxes.find((b) => b.rot && Math.abs(b.rot[0]) > 5 && b.mat === 'concrete')!;
    // Just inside the top surface at the platform edge (z = 37, y = 6) and at ground level (z = 53).
    expect(inside(rampBox, [55, 6 - 0.05, 37 + 0.1])).toBe(true);
    expect(inside(rampBox, [55, 0.05, 53 - 0.3])).toBe(true);
  });

  it('Yard containers never intersect each other', () => {
    const cs = MAPS.yard.boxes.filter((b) => b.size[0] === 6 && b.size[1] === 2.6 && b.size[2] === 2.4);
    expect(cs.length).toBeGreaterThan(5);
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i]!;
        const b = cs[j]!;
        const overlap = [0, 1, 2].every((k) => Math.abs(a.pos[k]! - b.pos[k]!) < (a.size[k]! + b.size[k]!) / 2 - 1e-6);
        expect(overlap, `containers ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('Downtown crane jib rests on its mast', () => {
    const boxes = MAPS.downtown.boxes;
    // The jib is the long orange 48 m beam.
    const jib = boxes.find((b) => b.mat === 'orange' && b.size[0] === 48)!;
    const mastPosts = boxes.filter((b) => b.mat === 'orange' && b.size[0] === BEAM && b.size[1] > 60);
    const mastTop = Math.max(...mastPosts.map((b) => b.pos[1] + b.size[1] / 2));
    expect(jib.pos[1] - jib.size[1] / 2).toBeCloseTo(mastTop, 6);
  });
});
