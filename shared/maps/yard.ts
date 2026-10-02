import { boundary, cubeFrame, gate, mulberry32, pads, spawnFacingCenter, strut, tower } from './builders.js';
import { routeFromPoints, roundedRect } from './movers.js';
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

/**
 * A ramp whose top surface runs exactly from a platform's edge (at z = topZ, height topY) down to the
 * ground `run` metres further along +Z: no step at either end.
 */
function ramp(x: number, topZ: number, topY: number, run: number, width: number, thickness = 0.5): ArenaBox {
  const length = Math.hypot(run, topY);
  const angle = Math.atan2(topY, run);
  // Center of the top surface, then pushed down along the surface normal by half the thickness.
  const cz = topZ + run / 2 - (thickness / 2) * Math.sin(angle);
  const cy = topY / 2 - (thickness / 2) * Math.cos(angle);
  return { pos: [x, cy, cz], size: [width, thickness, length], rot: [(angle * 180) / Math.PI, 0, 0], mat: 'concrete' };
}

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
  // Rails flush with the deck's outer edges and ends.
  out.push({ pos: [0, 13.2, deckZ - 4.85], size: [80, 1.2, 0.3], mat: 'orange' });
  out.push({ pos: [0, 13.2, deckZ + 4.85], size: [80, 1.2, 0.3], mat: 'orange' });

  // Raised platform with a ramp.
  out.push({ pos: [55, 3, 25], size: [24, 6, 24], mat: 'concrete' });
  out.push(ramp(55, 37, 6, 16, 8));
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

  // Shipping-container yard: neat rows with aisles to fly down, some slots empty, some stacked two high.
  const containerMats: ArenaMaterial[] = ['orange', 'white', 'steel'];
  for (const x of [-88, -76, -64]) {
    for (const z of [60, 70, 80, 90, 100]) {
      if (rand() < 0.2) continue;
      const stack = rand() < 0.35 ? 2 : 1;
      for (let level = 0; level < stack; level++) {
        const mat = containerMats[Math.floor(rand() * containerMats.length)] ?? 'orange';
        out.push({ pos: [x, 1.3 + level * 2.6, z], size: [6, 2.6, 2.4], mat });
      }
    }
  }

  // Jersey barriers along a lane.
  for (let i = 0; i < 10; i++) {
    out.push({ pos: [90, 0.5, -40 + i * 9], size: [0.6, 1, 3], mat: 'concrete' });
  }

  // Gantry crane over the south-east lot, with a container hanging from the hook: fly under or between.
  for (const gx of [25, 55]) {
    for (const gz of [-82, -98]) out.push({ pos: [gx, 10, gz], size: [1.4, 20, 1.4], mat: 'orange' });
    out.push({ pos: [gx, 20.7, -90], size: [1.6, 1.4, 17.4], mat: 'orange' });
  }
  for (const gz of [-82, -98]) out.push({ pos: [40, 22.1, gz], size: [31.6, 1.4, 1.4], mat: 'orange' });
  out.push({ pos: [40, 23.4, -90], size: [4, 1.2, 17.4], mat: 'steel' });
  strut(out, [40, 22.8, -90], [40, 9.9, -90], 0.2, 'steel');
  out.push({ pos: [40, 9, -90], size: [1.6, 2, 1.6], mat: 'steel' });
  out.push({ pos: [40, 6.7, -90], size: [6, 2.6, 2.4], mat: 'orange' });

  // Pipe rack along the west side: frames every 10 m carrying three long pipes.
  for (let z = -95; z <= -45; z += 10) {
    for (const px of [-99, -91]) out.push({ pos: [px, 4.5, z], size: [0.8, 9, 0.8], mat: 'steel' });
    out.push({ pos: [-95, 9.5, z], size: [8.8, 1, 0.8], mat: 'steel' });
  }
  const pipeMats: ArenaMaterial[] = ['steel', 'orange', 'white'];
  pipeMats.forEach((mat, i) => out.push({ pos: [-97 + i * 2, 10.6, -70], size: [1.2, 1.2, 50.8], mat }));

  // Water tower in the north-east corner: braced legs, platform, tank, roof.
  const wx = 85;
  const wz = 85;
  for (const dx of [-4, 4]) for (const dz of [-4, 4]) out.push({ pos: [wx + dx, 9, wz + dz], size: [0.8, 18, 0.8], mat: 'steel' });
  for (const s of [-4, 4]) {
    strut(out, [wx - 4, 0, wz + s], [wx + 4, 18, wz + s], 0.3, 'steel');
    strut(out, [wx + s, 0, wz - 4], [wx + s, 18, wz + 4], 0.3, 'steel');
  }
  out.push({ pos: [wx, 18.3, wz], size: [10, 0.6, 10], mat: 'steel' });
  out.push({ pos: [wx, 22.6, wz], size: [8, 8, 8], mat: 'white' });
  out.push({ pos: [wx, 27.1, wz], size: [9, 1, 9], mat: 'orange' });

  // Radio mast with guy wires: thread the wires or climb the mast.
  const mx = 105;
  const mz = -55;
  out.push({ pos: [mx, 25, mz], size: [1.2, 50, 1.2], mat: 'steel' });
  out.push({ pos: [mx, 50.8, mz], size: [1.6, 1.6, 1.6], mat: 'orange' });
  for (const deg of [0, 120, 240]) {
    const a = (deg * Math.PI) / 180;
    const ax = mx + 13 * Math.cos(a);
    const az = mz + 13 * Math.sin(a);
    out.push({ pos: [ax, 0.5, az], size: [1.5, 1, 1.5], mat: 'concrete' });
    strut(out, [mx, 40, mz], [ax, 1, az], 0.2, 'steel');
  }

  // A cable from the tall central tower's deck to the top of the west stack.
  strut(out, [6, 28.3, -6], [-60, 44.5, -60], 0.25, 'steel');

  // Slalom poles east of the gates.
  for (const [i, x] of [45, 55, 65, 75].entries()) {
    const z = i % 2 === 0 ? -26 : -32;
    out.push({ pos: [x, 8, z], size: [1, 16, 1], mat: 'orange' });
    out.push({ pos: [x, 16.5, z], size: [1.4, 1, 1.4], mat: 'white' });
  }

  return out;
}

/** Tractor route (ADR-0020): a farm loop in the open ground north of the gates, clear of spawns. */
const TRACTOR_ROUTE = routeFromPoints(roundedRect(-50, 50, 20, 100, 8, 0, false));

export const YARD: MapDef = {
  id: 'yard',
  name: 'Yard',
  halfSize: HALF,
  boxes: build(),
  decor: [],
  spawns: SPAWNS,
  ground: 'concrete',
  movers: [
    { kind: 'tractor', route: TRACTOR_ROUTE, offset: 0, speed: 7, color: '#3f9a4a', size: [2.6, 3, 4.6], lift: 1.5 },
    { kind: 'trailer', route: TRACTOR_ROUTE, offset: -7.2, speed: 7, color: '#c9a24a', size: [2.4, 1.8, 4.2], lift: 0.9 },
  ],
};
