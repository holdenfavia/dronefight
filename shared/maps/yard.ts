import { boundary, cubeFrame, gate, mulberry32, pads, spawnFacingCenter, tower } from './builders.js';
import type { ArenaBox, ArenaMaterial, MapDef, SpawnPoint } from './types.js';

// The Yard: the original industrial arena (ADR-0007). Open space, scaffolding, an overpass, gates.

const HALF = 120;

/** 8 open ground spots, all facing the middle (ADR-0012). */
const SPAWNS: readonly SpawnPoint[] = [
  spawnFacingCenter(0, 70),
  spawnFacingCenter(0, -95),
  spawnFacingCenter(-100, -25),
  spawnFacingCenter(105, 20),
  spawnFacingCenter(-45, -105),
  spawnFacingCenter(40, 95),
  spawnFacingCenter(95, -100),
  spawnFacingCenter(-100, 30),
];

function build(): ArenaBox[] {
  const out: ArenaBox[] = [];
  const rand = mulberry32(7);
  boundary(out, HALF, 6);
  pads(out, SPAWNS);

  // Central scaffolding cluster.
  tower(out, -8, 0, 6, 20);
  tower(out, 6, -6, 6, 28);
  tower(out, 8, 10, 5, 12);

  // Overpass: a long concrete deck on pillars. Dive under, flip over.
  const deckZ = -45;
  out.push({ pos: [0, 12, deckZ], size: [80, 1.2, 10], mat: 'concrete' });
  for (let x = -36; x <= 36; x += 12) {
    out.push({ pos: [x, 6, deckZ], size: [1.6, 12, 1.6], mat: 'concrete' });
  }
  out.push({ pos: [0, 13.2, deckZ - 4.6], size: [80, 1.2, 0.3], mat: 'orange' });
  out.push({ pos: [0, 13.2, deckZ + 4.6], size: [80, 1.2, 0.3], mat: 'orange' });

  // Raised platform with a ramp.
  out.push({ pos: [55, 3, 25], size: [24, 6, 24], mat: 'concrete' });
  out.push({ pos: [55, 3, 44.5], size: [8, 0.5, 16], rot: [21, 0, 0], mat: 'concrete' });
  tower(out, 82, 5, 4, 14, 5);

  // Tall stacks: the big vertical dive spots.
  out.push({ pos: [-60, 22, -60], size: [5, 44, 5], mat: 'concrete' });
  out.push({ pos: [-60, 44.5, -60], size: [5.4, 1, 5.4], mat: 'orange' });
  out.push({ pos: [70, 18, -70], size: [4, 36, 4], mat: 'concrete' });
  out.push({ pos: [70, 36.5, -70], size: [4.4, 1, 4.4], mat: 'orange' });

  // Gates of different sizes and angles.
  gate(out, 0, 35, 10, 7, 0);
  gate(out, -35, 15, 7, 5, 35);
  gate(out, 30, -15, 8, 9, -20);
  gate(out, -30, -80, 12, 10, 10);
  gate(out, 55, 25, 5, 4, 90, 6);
  gate(out, -80, 40, 6, 12, 60);

  // Floating cube frames.
  cubeFrame(out, -40, 14, -20, 8);
  cubeFrame(out, 35, 22, 60, 6);

  // The gap: two walls with a narrow slot.
  out.push({ pos: [-70, 5, 10], size: [2, 10, 16], mat: 'concrete' });
  out.push({ pos: [-70, 5, -8.5], size: [2, 10, 16], mat: 'concrete' });

  // Shipping-container yard, deterministic scatter.
  const containerMats: ArenaMaterial[] = ['orange', 'white', 'steel'];
  for (let i = 0; i < 14; i++) {
    const x = -95 + rand() * 50;
    const z = 55 + rand() * 50;
    const yaw = rand() < 0.5 ? 0 : 90;
    const stack = rand() < 0.3 ? 2 : 1;
    const mat = containerMats[Math.floor(rand() * containerMats.length)] ?? 'orange';
    for (let level = 0; level < stack; level++) {
      out.push({ pos: [x, 1.3 + level * 2.6, z], size: [6, 2.6, 2.4], rot: [0, yaw, 0], mat });
    }
  }

  // Jersey barriers along a lane.
  for (let i = 0; i < 10; i++) {
    out.push({ pos: [90, 0.5, -40 + i * 9], size: [0.6, 1, 3], mat: 'concrete' });
  }

  return out;
}

export const YARD: MapDef = {
  id: 'yard',
  name: 'Yard',
  halfSize: HALF,
  boxes: build(),
  decor: [],
  spawns: SPAWNS,
  ground: 'concrete',
};
