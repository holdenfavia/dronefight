import { boundary, gate, pads, spawnFacingCenter, tower } from './builders.js';
import type { ArenaBox, MapDef, SpawnPoint } from './types.js';

/**
 * Training ground (ADR-0017): a shooting range. Spawns line up at the south end (+Z) facing down
 * the lanes; distance posts mark 40 / 80 / 130 / 180 m; some cover and a tower break line of sight.
 * Practice bots are placed by the client (client/src/training/).
 */

const HALF = 150;
/** The firing line: spawns sit here, and lane distances are measured from it. */
export const TRAINING_FIRING_LINE_Z = 125;
/** Distances (m) down the lanes where posts stand and stationary bots hover. */
export const TRAINING_LANE_DISTANCES = [40, 80, 130, 180] as const;

const SPAWNS: readonly SpawnPoint[] = [-105, -75, -45, -15, 15, 45, 75, 105].map((x) => spawnFacingCenter(x, TRAINING_FIRING_LINE_Z));

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  boundary(out, HALF, 4);
  pads(out, SPAWNS);

  // Distance posts either side of the central lane: orange pole with a white board.
  for (const dist of TRAINING_LANE_DISTANCES) {
    const z = TRAINING_FIRING_LINE_Z - dist;
    for (const x of [-32, 32]) {
      out.push({ pos: [x, 5, z], size: [0.6, 10, 0.6], mat: 'orange' });
      out.push({ pos: [x, 10.6, z], size: [4, 1.8, 0.3], mat: 'white' });
    }
    // A painted line across the range at each distance.
    out.push({ pos: [0, 0.02, z], size: [120, 0.04, 0.5], mat: 'paint' });
  }

  // Cover: walls and blocks to break line of sight in the middle of the field.
  for (const [x, z, w, h] of [
    [-55, 55, 14, 6],
    [55, 55, 14, 6],
    [0, 10, 22, 8],
    [-80, -20, 10, 12],
    [80, -30, 10, 12],
    [-25, -70, 16, 5],
    [30, -95, 16, 5],
  ] as const) {
    out.push({ pos: [x, h / 2, z], size: [w, h, 2], mat: 'concrete' });
  }

  // A tall scaffold tower and a couple of arches to fly through while practicing.
  tower(out, -100, -80, 6, 32);
  tower(out, 100, -70, 5, 22);
  gate(out, 0, 70, 14, 10, 0);
  gate(out, -60, -60, 10, 8, 30);
  gate(out, 60, -115, 10, 8, -20);
  return out;
}

export const TRAINING: MapDef = {
  id: 'training',
  name: 'Training',
  halfSize: HALF,
  boxes: build(),
  decor: [],
  spawns: SPAWNS,
  ground: 'concrete',
};
