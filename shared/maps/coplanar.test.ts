import { describe, expect, it } from 'vitest';
import { MAPS } from './index.js';
import type { ArenaBox } from './types.js';

/**
 * Z-fighting guard (ADR-0055): two boxes of different materials must not share a visible face. Where they do,
 * both are at exactly the same depth and the GPU shows a flickering mix of the two, which no depth buffer can fix.
 * (Same-material overlaps are fine: tiled materials use world-space UVs, so both draw the same texels.)
 * Checks the tops of boxes turned only about Y, and the sides of boxes turned in 90° steps.
 */
interface Face {
  key: string;
  d: number;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  mat: string;
}

function faces(boxes: readonly ArenaBox[]): Face[] {
  const out: Face[] = [];
  for (const b of boxes) {
    if (b.mat === 'invisible') continue;
    const [rx, ry, rz] = b.rot ?? [0, 0, 0];
    if (Math.abs(rx) > 0.01 || Math.abs(rz) > 0.01) continue;
    const q = ((ry % 90) + 90) % 90;
    const square = q < 0.01 || q > 89.99;
    const swap = Math.round(ry / 90) % 2 !== 0;
    // A turned box's top only counts with its inscribed square (conservative).
    const a = (ry * Math.PI) / 180;
    const inner = Math.min(b.size[0], b.size[2]) / 2 / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
    const hx = square ? (swap ? b.size[2] : b.size[0]) / 2 : inner;
    const hz = square ? (swap ? b.size[0] : b.size[2]) / 2 : inner;
    const hy = b.size[1] / 2;
    const [x, y, z] = b.pos;
    out.push({ key: 'y+', d: y + hy, a0: x - hx, a1: x + hx, b0: z - hz, b1: z + hz, mat: b.mat });
    if (!square) continue;
    for (const s of [1, -1]) {
      out.push({ key: `x${s}`, d: x + s * hx, a0: z - hz, a1: z + hz, b0: y - hy, b1: y + hy, mat: b.mat });
      out.push({ key: `z${s}`, d: z + s * hz, a0: x - hx, a1: x + hx, b0: y - hy, b1: y + hy, mat: b.mat });
    }
  }
  return out;
}

/** Total area (m²) where faces of different materials lie in the same plane and overlap. */
function sharedArea(boxes: readonly ArenaBox[]): { area: number; worst: string } {
  const groups = new Map<string, Face[]>();
  for (const f of faces(boxes)) (groups.get(f.key) ?? groups.set(f.key, []).get(f.key)!).push(f);
  let area = 0;
  let worst = '';
  let worstArea = 0;
  for (const list of groups.values()) {
    list.sort((p, q) => p.d - q.d);
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      for (let j = i + 1; j < list.length && list[j]!.d - f.d < 0.002; j++) {
        const g = list[j]!;
        if (f.mat === g.mat) continue;
        const oa = Math.min(f.a1, g.a1) - Math.max(f.a0, g.a0);
        const ob = Math.min(f.b1, g.b1) - Math.max(f.b0, g.b0);
        if (oa <= 0.01 || ob <= 0.01) continue;
        area += oa * ob;
        if (oa * ob > worstArea) {
          worstArea = oa * ob;
          worst = `${f.mat}/${g.mat} on ${f.key} at ${f.d.toFixed(2)}`;
        }
      }
    }
  }
  return { area, worst };
}

describe('no z-fighting (ADR-0055)', () => {
  it('Downtown: no two materials share a visible face', () => {
    const map = MAPS.downtown;
    const { area, worst } = sharedArea([...map.boxes, ...map.decor]);
    expect(area, `worst: ${worst}`).toBeLessThan(1);
  });
});
