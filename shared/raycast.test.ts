import { Euler, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS } from './maps/index.js';
import { buildColliders, eulerXYZMatrix, raycastArena, raycastArenaHit, segmentPointDistance } from './raycast.js';

describe('raycast', () => {
  it('matches the rotation matrix Three.js builds', () => {
    const ours = eulerXYZMatrix(21, -35, 10);
    const e = new Matrix4().makeRotationFromEuler(new Euler((21 * Math.PI) / 180, (-35 * Math.PI) / 180, (10 * Math.PI) / 180)).elements;
    // Three.js stores column-major; ours is row-major.
    const threeRowMajor = [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
    ours.forEach((v, i) => expect(v).toBeCloseTo(threeRowMajor[i] ?? NaN));
  });

  it('hits the face of a box and misses beside it', () => {
    const boxes = buildColliders([{ pos: [0, 5, -10], size: [2, 2, 2], mat: 'concrete' }]);
    expect(raycastArena(boxes, 0, 5, 0, 0, 0, -1, 100)).toBeCloseTo(9);
    expect(raycastArena(boxes, 3, 5, 0, 0, 0, -1, 100)).toBe(100);
  });

  it('respects box rotation', () => {
    // A 10 m long, thin wall rotated 90° about Y now runs along Z.
    const boxes = buildColliders([{ pos: [0, 5, 0], size: [10, 2, 0.2], rot: [0, 90, 0], mat: 'concrete' }]);
    expect(raycastArena(boxes, -5, 5, 3, 1, 0, 0, 100)).toBeCloseTo(4.9);
    expect(raycastArena(boxes, -5, 5, 6, 1, 0, 0, 100)).toBe(100);
  });

  it('stops at the ground', () => {
    const down = Math.SQRT1_2;
    expect(raycastArena([], 0, 10, 0, 0, -down, -down, 100)).toBeCloseTo(10 / down);
  });

  it('is blocked by the overpass in the real arena', () => {
    const arena = buildColliders(MAPS.yard.boxes);
    // From above the overpass deck straight down: hits the deck top (y = 12.6), not the ground.
    expect(raycastArena(arena, 0, 30, -45, 0, -1, 0, 100)).toBeCloseTo(30 - 12.6, 1);
  });

  it('measures segment-to-point distance', () => {
    expect(segmentPointDistance(0, 0, 0, 10, 0, 0, 5, 1, 0)).toBeCloseTo(1);
    expect(segmentPointDistance(0, 0, 0, 10, 0, 0, 12, 0, 0)).toBeCloseTo(2);
  });
});

describe('spatial grid (ADR-0053)', () => {
  it('finds exactly what testing every collider finds, on every map', async () => {
    const { MAPS } = await import('./maps/index.js');
    const { mulberry32 } = await import('./maps/builders.js');
    for (const map of Object.values(MAPS)) {
      const gridded = buildColliders(map.boxes);
      const plain = [...gridded]; // a copy has no grid: the brute-force answer
      const rand = mulberry32(7);
      for (let k = 0; k < 1500; k++) {
        const o: [number, number, number] = [(rand() * 2 - 1) * map.halfSize, rand() * 80, (rand() * 2 - 1) * map.halfSize];
        let d = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
        // Some straight-down and straight-along-an-axis rays too.
        if (k % 50 === 0) d = [0, -1, 0];
        if (k % 50 === 1) d = [1, 0, 0];
        const len = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
        const [dx, dy, dz] = [d[0]! / len, d[1]! / len, d[2]! / len];
        expect(raycastArena(gridded, ...o, dx, dy, dz, 300)).toBeCloseTo(raycastArena(plain, ...o, dx, dy, dz, 300), 6);
        const a = raycastArenaHit(gridded, ...o, dx, dy, dz, 300);
        const b = raycastArenaHit(plain, ...o, dx, dy, dz, 300);
        expect(a?.dist ?? null).toBe(b?.dist ?? null);
      }
    }
  });
});
