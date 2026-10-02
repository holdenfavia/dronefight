import { describe, expect, it } from 'vitest';
import { eulerXYZMatrix } from '../raycast.js';
import { explosiveBoxes } from '../props.js';
import { MAP_ORDER, MAPS } from './index.js';
import { moverPose, type V3 } from './movers.js';
import type { ArenaBox } from './types.js';

/** Moving props must never drive or ride through anything solid, or over a spawn pad (ADR-0020). */

function inside(box: ArenaBox, p: V3): boolean {
  const m = eulerXYZMatrix(...(box.rot ?? [0, 0, 0]));
  const d = [p[0] - box.pos[0], p[1] - box.pos[1], p[2] - box.pos[2]];
  const lx = m[0]! * d[0]! + m[3]! * d[1]! + m[6]! * d[2]!;
  const ly = m[1]! * d[0]! + m[4]! * d[1]! + m[7]! * d[2]!;
  const lz = m[2]! * d[0]! + m[5]! * d[1]! + m[8]! * d[2]!;
  return Math.abs(lx) <= box.size[0] / 2 && Math.abs(ly) <= box.size[1] / 2 && Math.abs(lz) <= box.size[2] / 2;
}

/** The track itself (rotated bed and rails) is allowed to be under the train. */
const isTrack = (b: ArenaBox) => !!b.rot && (b.mat === 'gridRed' || b.mat === 'gridWhite') && b.size[1] <= 0.5;

for (const id of MAP_ORDER) {
  const map = MAPS[id];
  if (!map.movers?.length) continue;
  describe(`${map.name} movers`, () => {
    const solid = [...map.boxes.filter((b) => b.mat !== 'invisible' && !isTrack(b)), ...explosiveBoxes(map)];

    it('never pass through anything solid', () => {
      const pos: V3 = [0, 0, 0];
      const dir: V3 = [0, 0, 0];
      for (const m of map.movers!) {
        const [w, h, l] = m.size;
        // Sample one lap: body center plus its four corners at mid-height.
        const lap = m.timing ? m.timing.lapSeconds : m.route.length / (m.speed ?? 1);
        for (let t = 0; t < lap; t += lap / 400) {
          moverPose(m, t, pos, dir);
          const flat = Math.hypot(dir[0], dir[2]) || 1;
          const fx = dir[0] / flat;
          const fz = dir[2] / flat;
          const points: V3[] = [[pos[0], pos[1], pos[2]]];
          for (const a of [-1, 1]) for (const s of [-1, 1]) points.push([pos[0] + fx * a * (l / 2) - fz * s * (w / 2), pos[1] + h * 0.1, pos[2] + fz * a * (l / 2) + fx * s * (w / 2)]);
          for (const p of points) {
            const hit = solid.find((b) => inside(b, p));
            expect(hit, `${m.kind} at ${p.map((v) => v.toFixed(1))} hits ${hit?.mat} at ${hit?.pos}`).toBeUndefined();
          }
        }
      }
    });

    it('ground vehicles keep clear of spawn pads', () => {
      const pos: V3 = [0, 0, 0];
      const dir: V3 = [0, 0, 0];
      for (const m of map.movers!.filter((x) => x.lift < 3)) {
        for (let d = 0; d < m.route.length; d += 1) {
          moverPose({ ...m, speed: 1, offset: 0 }, d, pos, dir);
          for (const s of map.spawns) {
            // Car edge (half width 1-1.3 m) must stay at least 1 m from the pad center.
            expect(Math.hypot(pos[0] - s.pos[0], pos[2] - s.pos[2])).toBeGreaterThan(m.size[0] / 2 + 1);
          }
        }
      }
    });
  });
}
