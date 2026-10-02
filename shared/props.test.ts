import { describe, expect, it } from 'vitest';
import { eulerXYZMatrix } from './raycast.js';
import { MAP_ORDER, MAPS } from './maps/index.js';
import { routeFromPoints, type V3 } from './maps/movers.js';
import type { ArenaBox, MapDef } from './maps/types.js';
import { blastDamage, explosiveBoxes, PROP_STATS, PropField, PROPS } from './props.js';

/** A tiny test map: two fuel drums side by side, a propane tank far away, and a car driving along +X. */
function testMap(): MapDef {
  return {
    id: 'yard',
    name: 'Test',
    halfSize: 200,
    boxes: [],
    decor: [],
    spawns: [],
    ground: 'concrete',
    movers: [{ kind: 'car', route: routeFromPoints([[-100, 0, 0], [100, 0, 0], [100, 0, 10], [-100, 0, 10]]), offset: 0, speed: 20, color: '#fff', size: [2, 1.5, 4.4], lift: 0.75 }],
    explosives: [
      { kind: 'fuel', pos: [0, 0.8, 50], size: [1.2, 1.6, 1.2] },
      { kind: 'fuel', pos: [3, 0.8, 50], size: [1.2, 1.6, 1.2] },
      { kind: 'propane', pos: [0, 1.2, 150], size: [2.4, 2.4, 6], yawDeg: 90 },
    ],
  };
}

describe('destructible props (ADR-0023)', () => {
  it('a round hits the first prop on its path, before the wall', () => {
    const f = new PropField(testMap());
    // Fired from the south toward the first drum (index 1 = first explosive; 0 is the car).
    // At t = 0 the car is far off at x = -100.
    const hit = f.bulletHit([0, 0.8, 0], [0, 0, 1], 500, 0, 350);
    expect(hit?.i).toBe(1);
    expect(hit?.dist).toBeCloseTo(50 - 0.6, 5);
    // A wall in front of it (maxDist) wins.
    expect(f.bulletHit([0, 0.8, 0], [0, 0, 1], 40, 0, 350)).toBeNull();
  });

  it('hits a moving car where it is when the round arrives', () => {
    const f = new PropField(testMap());
    // At t = 5 s the car is at x = 0 (offset 0, 20 m/s, starting at x = -100). Aim at where it will be
    // 0.2 s later from 70 m away: a 350 m/s round takes 0.2 s, by which time the car is at x = 4.
    const t = 5000;
    const shoot = (aimX: number) => {
      const dx = aimX;
      const dz = -70;
      const len = Math.hypot(dx, dz);
      return f.bulletHit([0, 0.75, 70], [dx / len, 0, dz / len], 500, t, 350);
    };
    expect(shoot(4)?.i).toBe(0);
    expect(shoot(-4)).toBeNull();
  });

  it('enough damage blows it up; the blast sets off its neighbour a moment later (a chain)', () => {
    const f = new PropField(testMap());
    f.damage(1, PROP_STATS.fuel.hp, 1000, 'me');
    const first = f.tick(1000);
    expect(first.blasts.map((b) => b.i)).toEqual([1]);
    expect(first.blasts[0]!.by).toBe('me');
    expect(f.isDown(1)).toBe(true);
    // The neighbour (3 m away) goes off after the chain delay, credited to the same shooter.
    expect(f.tick(1000 + PROPS.chainDelayMs - 1).blasts).toHaveLength(0);
    const second = f.tick(1000 + PROPS.chainDelayMs);
    expect(second.blasts.map((b) => b.i)).toEqual([2]);
    expect(second.blasts[0]!.by).toBe('me');
    // The far propane tank survives.
    expect(f.isDown(3)).toBe(false);
  });

  it('comes back after the respawn time, at full health', () => {
    const f = new PropField(testMap());
    f.damage(3, 1000, 0, null);
    f.tick(0);
    expect(f.downList()).toContain(3);
    expect(f.tick(PROPS.respawnMs).respawned).toContain(3);
    expect(f.isDown(3)).toBe(false);
    f.damage(3, PROP_STATS.propane.hp - 1, PROPS.respawnMs, null);
    expect(f.tick(PROPS.respawnMs + 1).blasts).toHaveLength(0);
  });

  it('down props are not hit; syncDown mirrors the server', () => {
    const f = new PropField(testMap());
    f.syncDown([1], 0);
    // Straight through where the drum was, on to the propane tank behind it.
    expect(f.bulletHit([0, 0.8, 0], [0, 0, 1], 500, 0, 350)?.i).toBe(3);
    f.syncDown([], 0);
    expect(f.bulletHit([0, 0.8, 0], [0, 0, 1], 500, 0, 350)?.i).toBe(1);
  });

  it('blast damage falls off to zero at the radius; water is harmless', () => {
    expect(blastDamage('propane', 0)).toBe(PROP_STATS.propane.blastDamage);
    expect(blastDamage('propane', PROP_STATS.propane.blastRadius / 2)).toBe(PROP_STATS.propane.blastDamage / 2);
    expect(blastDamage('propane', PROP_STATS.propane.blastRadius)).toBe(0);
    expect(blastDamage('water', 0)).toBe(0);
  });
});

/** Explosives sit on or beside structures, never inside them. */
function insideTest(box: ArenaBox): (p: V3) => boolean {
  const m = eulerXYZMatrix(...(box.rot ?? [0, 0, 0]));
  const r = Math.hypot(...box.size) / 2;
  return (p) => {
    const d = [p[0] - box.pos[0], p[1] - box.pos[1], p[2] - box.pos[2]];
    if (Math.abs(d[0]!) > r || Math.abs(d[1]!) > r || Math.abs(d[2]!) > r) return false;
    const l = [0, 1, 2].map((c) => m[c]! * d[0]! + m[3 + c]! * d[1]! + m[6 + c]! * d[2]!);
    return l.every((v, i) => Math.abs(v) < box.size[i]! / 2 - 0.02);
  };
}

function samplePoints(box: ArenaBox): V3[] {
  const m = eulerXYZMatrix(...(box.rot ?? [0, 0, 0]));
  const out: V3[] = [];
  for (const fx of [-0.4, 0, 0.4]) for (const fy of [-0.4, 0, 0.4]) for (const fz of [-0.4, 0, 0.4]) {
    const l = [fx * box.size[0], fy * box.size[1], fz * box.size[2]];
    out.push([0, 1, 2].map((r) => box.pos[r]! + m[r * 3]! * l[0]! + m[r * 3 + 1]! * l[1]! + m[r * 3 + 2]! * l[2]!) as V3);
  }
  return out;
}

for (const id of MAP_ORDER) {
  const map = MAPS[id];
  describe(`${map.name} explosives`, () => {
    it('never overlap solid geometry or each other', () => {
      const exp = explosiveBoxes(map);
      const flat = new Set(['invisible', 'pad', 'sidewalk', 'paint']);
      const solid = map.boxes.filter((b) => !flat.has(b.mat)).map((b) => ({ b, inside: insideTest(b) }));
      const others = exp.map((b) => insideTest(b));
      for (const [k, e] of exp.entries()) {
        for (const p of samplePoints(e)) {
          const hit = solid.find((s) => s.inside(p));
          expect(hit, `${map.explosives![k]!.kind} at ${e.pos} overlaps ${hit?.b.mat} at ${hit?.b.pos}`).toBeUndefined();
          const j = others.findIndex((inside, j) => j !== k && inside(p));
          expect(j, `${map.explosives![k]!.kind} at ${e.pos} overlaps explosive ${j}`).toBe(-1);
        }
      }
    });

    it('keep their distance from spawn pads', () => {
      for (const e of map.explosives ?? []) {
        for (const s of map.spawns) expect(Math.hypot(e.pos[0] - s.pos[0], e.pos[2] - s.pos[2]), `${e.kind} at ${e.pos}`).toBeGreaterThan(8);
      }
    });
  });
}
