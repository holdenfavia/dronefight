import { describe, expect, it } from 'vitest';
import { applyTerrain, drapeRoute, eulerOnSlope, slopeMatrix, type Grouping } from './drape.js';
import { groundRay, makeTerrain, terrainHeight, terrainNormal, terrainTriangles } from './terrain.js';
import type { ArenaBox, ExplosiveDef } from './types.js';

/** A gentle hill: 0 at the edges, up to 10 m in the middle. */
const hill = () => makeTerrain(100, 5, (x, z) => 10 * Math.max(0, 1 - Math.hypot(x, z) / 90) ** 2);

describe('terrain (ADR-0059)', () => {
  it('interpolates on the same triangles it hands to the physics and the renderer', () => {
    const t = hill();
    const { positions, indices } = terrainTriangles(t);
    // The centroid of every 50th triangle is on the surface terrainHeight describes.
    for (let k = 0; k < indices.length; k += 150) {
      const [a, b, c] = [indices[k]!, indices[k + 1]!, indices[k + 2]!];
      const cx = (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3;
      const cy = (positions[a * 3 + 1]! + positions[b * 3 + 1]! + positions[c * 3 + 1]!) / 3;
      const cz = (positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3;
      expect(terrainHeight(t, cx, cz)).toBeCloseTo(cy, 5);
    }
  });

  it('rays find the ground where the height says it is, with an upward normal', () => {
    const t = hill();
    for (const [x, z] of [[0, 0], [30, -20], [-55, 40]] as const) {
      const hit = groundRay(t, [], x, 50, z, 0, -1, 0, 100)!;
      expect(50 - hit.dist).toBeCloseTo(terrainHeight(t, x, z), 3);
      expect(hit.ny).toBeGreaterThan(0.9);
    }
    // A shallow ray toward the hill hits its side.
    const d = [1, -0.05, 0];
    const l = Math.hypot(...d);
    const hit = groundRay(t, [], -95, 3, 0, d[0]! / l, d[1]! / l, d[2]! / l, 200)!;
    const x = -95 + (hit.dist * d[0]!) / l;
    expect(3 + (hit.dist * d[1]!) / l).toBeCloseTo(terrainHeight(t, x, 0), 2);
    // Outside the map the ground is the plane y = 0.
    expect(groundRay(t, [], 150, 10, 0, 0, -1, 0, 50)!.dist).toBeCloseTo(10, 5);
  });

  it('turns a box to lie on a slope', () => {
    const n = terrainNormal(hill(), 40, 25);
    const m = slopeMatrix(30, n);
    // Column 1 (local up) is the ground normal.
    expect(m[1]).toBeCloseTo(n[0], 5);
    expect(m[4]).toBeCloseTo(n[1], 5);
    expect(m[7]).toBeCloseTo(n[2], 5);
    // Flat ground leaves just the yaw.
    expect(eulerOnSlope(30, [0, 1, 0]).map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 30, 0]);
  });
});

describe('fitting a flat-built map onto terrain (ADR-0059)', () => {
  it('moves a group as one, cuts a level pad under it, and grows foundations', () => {
    const t = hill();
    const wall: ArenaBox = { pos: [40, 5, 0], size: [20, 10, 20], mat: 'brick' };
    const roof: ArenaBox = { pos: [40, 10.2, 0], size: [21, 0.4, 21], mat: 'roof' };
    const tree: ArenaBox = { pos: [-30, 3, 30], size: [0.6, 6, 0.6], mat: 'roof' };
    const boxes = [wall, roof, tree];
    const grouping: Grouping = { groupOf: new Map([[wall, 0], [roof, 0]]), anchors: [null] };
    const before = terrainHeight(t, 40, 0);
    applyTerrain(t, boxes, [], [], grouping);
    const [w, r, tr] = boxes as [ArenaBox, ArenaBox, ArenaBox];
    // The roof moved by the ground height at the group's anchor, and still sits on the walls.
    expect(r.pos[1] - 10.2).toBeCloseTo(before, 5);
    expect(w.pos[1] + w.size[1] / 2).toBeCloseTo(r.pos[1] - 0.2, 5);
    // The pad: level ground across the whole footprint.
    for (const [x, z] of [[30, -10], [50, 10], [40, 0]] as const) expect(terrainHeight(t, x, z)).toBeCloseTo(before, 5);
    // Foundations reach below the ground.
    expect(w.pos[1] - w.size[1] / 2).toBeLessThan(before);
    // The tree moved by the ground under it.
    expect(tr.pos[1] - tr.size[1] / 2).toBeLessThanOrEqual(terrainHeight(t, -30, 30));
  });

  it('drapes flat markings and lifts props and routes', () => {
    const t = hill();
    const path: ArenaBox = { pos: [0, 0.05, -40], size: [40, 0.04, 3], mat: 'sidewalk' };
    const decor = [path];
    const car: ExplosiveDef = { kind: 'car', pos: [20, 0.75, 20], size: [2, 1.5, 4.4] };
    applyTerrain(t, [], decor, [car], { groupOf: new Map(), anchors: [] });
    expect(decor.length).toBe(10);
    for (const p of decor) expect(p.pos[1] - 0.05).toBeCloseTo(terrainHeight(t, p.pos[0], p.pos[2]), 5);
    expect(car.pos[1]).toBeGreaterThan(0.75 + terrainHeight(t, 20, 20) - 1e-6);
    const route = drapeRoute(t, [[-50, 0, 0], [50, 0, 0], [50, 0, 10], [-50, 0, 10]]);
    expect(route.length).toBeGreaterThan(40);
    for (const p of route) expect(p[1]).toBeCloseTo(terrainHeight(t, p[0], p[2]), 5);
  });
});
