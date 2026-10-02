import { boundary, cubeFrame, gate, pads, spawnFacingCenter, tower } from './builders.js';
import type { ArenaBox, ExplosiveDef, MapDef, SpawnPoint } from './types.js';

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

  // Flight drills on the flanks, clear of the central lanes.
  // West: a slalom of poles running down the field.
  for (let i = 0; i < 6; i++) {
    const x = i % 2 === 0 ? -84 : -96;
    const z = 100 - i * 14;
    out.push({ pos: [x, 7, z], size: [0.8, 14, 0.8], mat: 'orange' });
    out.push({ pos: [x, 14.4, z], size: [1.2, 0.8, 1.2], mat: 'white' });
  }
  // East: floating cube hoops climbing as they go.
  for (const [i, z] of [95, 70, 45, 20].entries()) cubeFrame(out, i % 2 === 0 ? 90 : 80, 10 + i * 6, z, 8);
  // A ladder: two tall posts with bars to thread between.
  for (const px of [45, 70]) {
    out.push({ pos: [px, 20, -40], size: [1, 40, 1], mat: 'orange' });
    out.push({ pos: [px, 0.12, -40], size: [2.4, 0.24, 2.4], mat: 'concrete' });
  }
  for (const y of [8, 16, 24, 32, 39.7]) out.push({ pos: [57.5, y, -40], size: [26, 0.6, 0.6], mat: 'white' });
  // A low tunnel at the far west end.
  for (const s of [-1, 1]) out.push({ pos: [-55 + s * 4.6, 3, -108], size: [0.8, 6, 20], mat: 'concrete' });
  out.push({ pos: [-55, 6.4, -108], size: [10, 0.8, 20], mat: 'orange' });
  return out;
}

/** Practice targets that blow up (ADR-0023): drums at the cover walls, propane, water tanks on the towers. */
const drums = (x: number, z: number): ExplosiveDef[] =>
  [[0, 0], [1.4, 0], [0.7, 1.2]].map(([dx, dz]) => ({ kind: 'fuel' as const, pos: [x + dx!, 0.8, z + dz!], size: [1.2, 1.6, 1.2] }));
const EXPLOSIVES: ExplosiveDef[] = [
  ...drums(-50, 57.6),
  ...drums(53, 57.6),
  ...drums(-80, -17.4),
  ...drums(78, -27.4),
  { kind: 'propane', pos: [0, 1.2, 13], size: [2.4, 2.4, 6], yawDeg: 90 },
  { kind: 'propane', pos: [-25, 1.2, -67], size: [2.4, 2.4, 6], yawDeg: 90 },
  { kind: 'water', pos: [-100, 32.475 + 1.5, -80], size: [3, 3, 3], color: '#e9e9e6' },
  { kind: 'water', pos: [100, 22.475 + 1.5, -70], size: [3, 3, 3], color: '#e9e9e6' },
];

export const TRAINING: MapDef = {
  id: 'training',
  name: 'Training',
  halfSize: HALF,
  boxes: build(),
  decor: [],
  spawns: SPAWNS,
  ground: 'concrete',
  explosives: EXPLOSIVES,
};
