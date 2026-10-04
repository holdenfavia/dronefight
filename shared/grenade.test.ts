import { describe, expect, it } from 'vitest';
import { buildColliders, raycastArenaHit } from './raycast.js';
import { GRENADE, grenadeDamage, launchGrenade, stepGrenade } from './grenade.js';

describe('raycastArenaHit', () => {
  const wall = buildColliders([{ pos: [0, 5, -10], size: [20, 10, 2], mat: 'concrete' }]);
  it('reports the face normal it hits', () => {
    const hit = raycastArenaHit(wall, 0, 5, 0, 0, 0, -1, 50);
    expect(hit?.dist).toBeCloseTo(9, 5);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([0, 0, 1]);
    const ground = raycastArenaHit([], 0, 5, 0, 0, -1, 0, 50);
    expect(ground).toMatchObject({ dist: 5, ny: 1 });
  });

  it('works on rotated boxes', () => {
    const ramp = buildColliders([{ pos: [0, 0, 0], size: [10, 1, 10], rot: [0, 0, 30], mat: 'concrete' }]);
    const hit = raycastArenaHit(ramp, 0, 10, 0, 0, -1, 0, 50)!;
    expect(hit.ny).toBeCloseTo(Math.cos(Math.PI / 6), 5);
    expect(Math.abs(hit.nx)).toBeCloseTo(0.5, 5);
  });
});

describe('grenade (ADR-0034)', () => {
  it('arcs under gravity', () => {
    const g = launchGrenade([0, 20, 0], [0, 0, -1]);
    stepGrenade(g, [], 1);
    expect(g.p[1]).toBeLessThan(20 - 4);
    expect(g.p[2]).toBeLessThan(-30);
  });

  it('bounces off a wall instead of passing through, losing energy', () => {
    const wall = buildColliders([{ pos: [0, 5, -10], size: [20, 40, 2], mat: 'concrete' }]);
    const g = launchGrenade([0, 15, 0], [0, 0, -1]);
    const { bounces } = stepGrenade(g, wall, 0.5);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(g.p[2]).toBeGreaterThan(-9);
    expect(g.v[2]).toBeGreaterThan(0);
    expect(g.v[2]).toBeLessThan(GRENADE.launchSpeed * GRENADE.restitution + 1);
  });

  it('bounces on the ground and comes to rest', () => {
    const g = launchGrenade([0, 2, 0], [0, -1, -1]);
    stepGrenade(g, [], 6);
    expect(g.resting).toBe(true);
    expect(g.p[1]).toBeGreaterThanOrEqual(0);
    expect(g.p[1]).toBeLessThan(0.1);
  });

  it('inherits the drone velocity', () => {
    const still = launchGrenade([0, 10, 0], [0, 0, -1]);
    const moving = launchGrenade([0, 10, 0], [0, 0, -1], [20, 0, 0]);
    expect(moving.v[0]).toBe(20);
    expect(still.v[0]).toBe(0);
  });

  it('the fuse runs out', () => {
    const g = launchGrenade([0, 1, 0], [0, 1, 0]);
    expect(stepGrenade(g, [], GRENADE.fuseSeconds - 0.1).expired).toBe(false);
    expect(stepGrenade(g, [], 0.2).expired).toBe(true);
  });

  it('a big blast: full damage close, nothing past 12 m', () => {
    expect(grenadeDamage(0)).toBe(GRENADE.damage);
    expect(grenadeDamage(GRENADE.coreRadius)).toBe(GRENADE.damage);
    expect(grenadeDamage(7.5)).toBeGreaterThan(30);
    expect(grenadeDamage(GRENADE.splashRadius)).toBe(0);
  });
});
