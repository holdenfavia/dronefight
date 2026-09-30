import { Euler, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_BOXES } from './arena.js';
import { buildColliders, eulerXYZMatrix, raycastArena, segmentPointDistance } from './raycast.js';

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
    const arena = buildColliders(ARENA_BOXES);
    // From above the overpass deck straight down: hits the deck top (y = 12.6), not the ground.
    expect(raycastArena(arena, 0, 30, -45, 0, -1, 0, 100)).toBeCloseTo(30 - 12.6, 1);
  });

  it('measures segment-to-point distance', () => {
    expect(segmentPointDistance(0, 0, 0, 10, 0, 0, 5, 1, 0)).toBeCloseTo(1);
    expect(segmentPointDistance(0, 0, 0, 10, 0, 0, 12, 0, 0)).toBeCloseTo(2);
  });
});
