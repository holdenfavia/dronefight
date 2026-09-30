import { describe, expect, it } from 'vitest';
import { SMOKE } from '../../shared/abilities.js';
import { MISSILE, splashDamage } from '../../shared/missile.js';
import { COMBAT } from '../../shared/combat.js';
import { DRONE_CLASSES } from '../../shared/drones.js';
import type { DroneState, ServerMessage, Vec3 } from '../../shared/protocol.js';
import { interceptTime } from '../../shared/lead.js';
import { MAPS, SPAWN_SAFE_DISTANCE } from '../../shared/maps/index.js';
import { Match, sampleHistory, takeRound } from './match.js';

function droneAt(p: Vec3, v: Vec3 = [0, 0, 0], crashed = false): DroneState {
  return { ts: 0, p, v, q: [0, 0, 0, 1], m: 0.3, armed: true, crashed };
}

/** Two pilots in open air, A at z=0 facing B 20 m away along -Z, clear of arena geometry. */
function setup() {
  const log: ServerMessage[] = [];
  // The Yard: tests below use its overpass pillars as cover.
  const match = new Match('yard', (msg) => log.push(msg));
  let now = 10_000;
  match.addPlayer('A', now);
  match.addPlayer('B', now);
  const posA: Vec3 = [-100, 30, 0];
  /** A's line of sight, sent with A's states (guides A's missiles, ADR-0016). */
  let aimA: [number, number, number, number, number, number] | undefined;
  let posB: Vec3 = [-100, 30, -20];
  let velB: Vec3 = [0, 0, 0];

  /** Advance time, feeding 30 Hz states for both pilots and ticking the match. */
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 1000 / 30);
      match.onState('A', { ...droneAt(posA), g: aimA }, now);
      posB = [posB[0] + (velB[0] * 1000) / 30 / 1000, posB[1], posB[2] + (velB[2] * 1000) / 30 / 1000];
      match.onState('B', droneAt(posB, velB), now);
      match.tick(now);
    }
  };
  /** A fires at a point, with the shot stamped as if A sees the world normally. */
  const fireAt = (target: Vec3, ts = now) => {
    const d: Vec3 = [target[0] - posA[0], target[1] - posA[1], target[2] - posA[2]];
    const len = Math.hypot(...d);
    match.onShot('A', { ts, p: posA, d: [d[0] / len, d[1] / len, d[2] / len] }, now);
  };
  const hp = (id: string) => match.state().players.find((p) => p.id === id)?.hp;
  const score = (id: string) => match.state().players.find((p) => p.id === id)?.score;
  return {
    match,
    log,
    advance,
    fireAt,
    hp,
    score,
    getNow: () => now,
    setB: (p: Vec3, v: Vec3 = [0, 0, 0]) => {
      posB = p;
      velB = v;
    },
    posB: () => posB,
    posA,
    /** Point A's line of sight at a spot (or stop guiding with null). */
    aimAt: (target: Vec3 | null) => {
      if (!target) {
        aimA = undefined;
        return;
      }
      const d = [target[0] - posA[0], target[1] - posA[1], target[2] - posA[2]];
      const len = Math.hypot(d[0]!, d[1]!, d[2]!);
      aimA = [posA[0], posA[1], posA[2], d[0]! / len, d[1]! / len, d[2]! / len];
    },
  };
}

/** Both test pilots fly the default class unless a test changes it. */
const FS = DRONE_CLASSES.freestyle;
const afterProtection = COMBAT.spawnProtectionMs + 100;
const shotInterval = 1000 / FS.fireRate;

describe('Match (ADR-0009)', () => {
  it('starts when two pilots join, on opposite teams', () => {
    const { match, log } = setup();
    const s = match.state();
    expect(s.phase).toBe('playing');
    expect(s.players.map((p) => p.team).sort()).toEqual([0, 1]);
    expect(log.filter((m) => m.t === 'respawn')).toHaveLength(2);
  });

  it('a round that reaches the target does damage', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fireAt(t.posB());
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - FS.damage);
    expect(t.log.some((m) => m.t === 'hit' && m.shooter === 'A' && m.target === 'B')).toBe(true);
  });

  it('spawn protection blocks damage', () => {
    const t = setup();
    t.advance(100);
    t.fireAt(t.posB());
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp);
  });

  it('walls are cover', () => {
    const t = setup();
    t.advance(afterProtection);
    // Pillar of the overpass at (0, 6, -45). Put A and B on either side of it.
    t.posA.splice(0, 3, 0, 6, -30);
    t.setB([0, 6, -60]);
    t.advance(100);
    t.fireAt(t.posB());
    t.advance(300);
    expect(t.hp('B')).toBe(FS.maxHp);
  });

  it('enough hits kill, score, and respawn after the delay', () => {
    const t = setup();
    t.advance(afterProtection);
    const hitsToKill = Math.ceil(FS.maxHp / FS.damage);
    for (let i = 0; i < hitsToKill; i++) {
      t.fireAt(t.posB());
      t.advance(shotInterval + 1);
    }
    t.advance(200);
    expect(t.score('A')).toBe(1);
    expect(t.log.some((m) => m.t === 'death' && m.id === 'B' && m.killer === 'A' && m.cause === 'shot')).toBe(true);
    t.advance(COMBAT.respawnMs);
    expect(t.match.state().players.find((p) => p.id === 'B')).toMatchObject({ alive: true, hp: FS.maxHp });
  });

  it('lag compensation: hits where the shooter saw the target, within the rewind limit', () => {
    const t = setup();
    t.advance(afterProtection);
    // B crossing sideways at 20 m/s.
    t.setB(t.posB(), [20, 0, 0]);
    t.advance(500);
    // A's screen shows B 100 ms in the past (interpolation buffer), and the round takes ~57 ms to fly
    // 20 m, so A leads B to where it will be *on A's screen* when the round arrives. That counts.
    const flight = 20 / FS.bulletSpeed;
    const seen: Vec3 = [t.posB()[0] - 20 * (0.1 - flight), t.posB()[1], t.posB()[2]];
    t.fireAt(seen);
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - FS.damage);

    // Aiming where B was 600 ms ago is beyond the rewind limit: miss.
    t.advance(shotInterval + 1);
    const stale: Vec3 = [t.posB()[0] - 20 * 0.6, t.posB()[1], t.posB()[2]];
    t.fireAt(stale, t.getNow() - 500);
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - FS.damage);
  });

  it('aiming at the lead indicator hits a fast crossing target (ADR-0011)', () => {
    const t = setup();
    t.advance(afterProtection);
    // B crosses at 30 m/s, 40 m away. A sees B 100 ms in the past and aims at the lead point.
    t.setB([-100 - 20, 30, -40], [30, 0, 0]);
    t.advance(300);
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const b = t.posB();
      const seen: Vec3 = [b[0] - 30 * 0.1, b[1], b[2]];
      const d = [seen[0] - t.posA[0], seen[1] - t.posA[1], seen[2] - t.posA[2]] as const;
      const tt = interceptTime(d[0], d[1], d[2], 30, 0, 0, FS.bulletSpeed) ?? 0;
      const before = t.hp('B') ?? 0;
      t.fireAt([seen[0] + 30 * tt, seen[1], seen[2]]);
      t.advance(shotInterval + 1);
      t.advance(150);
      if ((t.hp('B') ?? 0) < before) hits++;
    }
    expect(hits).toBe(5);
  });

  it('crash after being hit credits the attacker; a clean crash scores for no one', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fireAt(t.posB());
    t.advance(200);
    t.match.onState('B', droneAt(t.posB(), [0, 0, 0], true), t.getNow());
    expect(t.score('A')).toBe(1);

    t.advance(COMBAT.respawnMs + afterProtection + 100);
    t.advance(COMBAT.killCreditMs + 100);
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow());
    expect(t.score('B')).toBe(0);
    expect(t.log.some((m) => m.t === 'death' && m.id === 'A' && m.killer === null && m.cause === 'crash')).toBe(true);
  });

  it('first to the kill target wins, then a new match starts', () => {
    const t = setup();
    for (let kill = 0; kill < COMBAT.killsToWin; kill++) {
      t.advance(afterProtection);
      t.fireAt(t.posB());
      t.advance(200);
      t.match.onState('B', droneAt(t.posB(), [0, 0, 0], true), t.getNow());
      t.advance(100);
      t.match.onState('B', droneAt(t.posB(), [0, 0, 0], false), t.getNow());
      if (kill < COMBAT.killsToWin - 1) t.advance(COMBAT.respawnMs);
    }
    expect(t.match.state()).toMatchObject({ phase: 'ended', winner: 'A' });
    t.advance(COMBAT.resultsMs + 100);
    expect(t.match.state().phase).toBe('playing');
    expect(t.score('A')).toBe(0);
  });

  it('respawns away from the opponent, never on the same spawn twice in a row (ADR-0012)', () => {
    const spawns = MAPS.yard.spawns;
    for (let round = 0; round < 20; round++) {
      const log: ServerMessage[] = [];
      const match = new Match('yard', (msg) => log.push(msg));
      match.addPlayer('A', 0);
      match.addPlayer('B', 0);
      const first = log.filter((m) => m.t === 'respawn');
      const [a, b] = first.map((m) => (m.t === 'respawn' ? spawns[m.spawn]!.pos : [0, 0, 0]));
      expect(Math.hypot(a![0] - b![0], a![2] - b![2])).toBeGreaterThanOrEqual(SPAWN_SAFE_DISTANCE);

      // A camps B's spawn; B dies and must come back somewhere else, far from A.
      const bSpawn = first.find((m) => m.t === 'respawn' && m.id === 'B');
      const bIndex = bSpawn?.t === 'respawn' ? bSpawn.spawn : -1;
      match.onState('A', droneAt(b as Vec3), 100);
      match.onState('B', droneAt(b as Vec3, [0, 0, 0], true), 100);
      match.tick(100 + COMBAT.respawnMs + 1);
      const again = log.filter((m) => m.t === 'respawn' && m.id === 'B').pop();
      expect(again?.t === 'respawn' && again.spawn).not.toBe(bIndex);
      const at = again?.t === 'respawn' ? spawns[again.spawn]!.pos : [0, 0, 0];
      expect(Math.hypot(at[0] - b![0], at[2] - b![2])).toBeGreaterThanOrEqual(SPAWN_SAFE_DISTANCE);
    }
  });

  it('drops back to waiting when a pilot leaves', () => {
    const t = setup();
    t.match.removePlayer('B', t.getNow());
    expect(t.match.state().phase).toBe('waiting');
  });
});

describe('drone classes (ADR-0013)', () => {
  it("uses the shooter's damage and the target's health", () => {
    const t = setup();
    t.match.onLoadout('A', 'wing', t.getNow());
    t.match.onLoadout('B', 'quad3d', t.getNow());
    // Mid-match: nothing changes until each pilot's next respawn.
    expect(t.match.state().players.find((p) => p.id === 'A')?.drone).toBe('freestyle');
    // Kill both to apply the switch.
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow());
    t.match.onState('B', droneAt(t.posB(), [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + 100);
    const players = t.match.state().players;
    expect(players.find((p) => p.id === 'A')).toMatchObject({ drone: 'wing', hp: DRONE_CLASSES.wing.maxHp });
    expect(players.find((p) => p.id === 'B')).toMatchObject({ drone: 'quad3d', hp: DRONE_CLASSES.quad3d.maxHp });

    // Respawns moved everyone; put them back in the open and fight.
    t.match.onState('A', droneAt(t.posA), t.getNow());
    t.match.onState('B', droneAt(t.posB()), t.getNow());
    t.advance(afterProtection);
    t.fireAt(t.posB());
    t.advance(200);
    expect(t.hp('B')).toBe(DRONE_CLASSES.quad3d.maxHp - DRONE_CLASSES.wing.damage);
  });

  it('switches immediately outside a running match', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0);
    match.onLoadout('A', 'wing', 0);
    expect(match.state().players[0]).toMatchObject({ drone: 'wing', hp: DRONE_CLASSES.wing.maxHp });
  });

});

describe('guided missiles and smoke (ADR-0016)', () => {
  /** A launches a missile in direction `dir`. */
  function launch(t: ReturnType<typeof setup>, dir: Vec3, rid: number) {
    const len = Math.hypot(...dir);
    t.match.onShot('A', { ts: t.getNow(), p: t.posA, d: [dir[0] / len, dir[1] / len, dir[2] / len], w: 'rocket', rid }, t.getNow());
  }

  it('a missile guided onto the target explodes by proximity and does splash damage', () => {
    const t = setup();
    t.advance(afterProtection);
    t.aimAt(t.posB());
    launch(t, [0, 0, -1], 1);
    t.advance(800);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 1)).toBe(true);
    expect(FS.maxHp - (t.hp('B') ?? 0)).toBeGreaterThanOrEqual(splashDamage(MISSILE.proximity));
  });

  it('steers: launched 90° off, the shooter looks at the target and the missile comes onto it', () => {
    const t = setup();
    t.advance(afterProtection);
    // B 115 m straight ahead: far enough for the missile (turn radius ~50 m) to settle onto the line of sight.
    t.setB([t.posA[0], t.posA[1], t.posA[2] - 115]);
    t.advance(100);
    launch(t, [1, 0, 0], 2);
    t.aimAt(t.posB());
    t.advance(3000);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 2)).toBe(true);
    expect(t.hp('B')).toBeLessThan(FS.maxHp);
  });

  it('without guidance it flies straight and self-destructs by its lifetime (no cross-map sniping)', () => {
    const t = setup();
    t.advance(afterProtection);
    t.aimAt(null);
    launch(t, [0, 1, 0], 3); // straight up into empty sky
    t.advance(MISSILE.lifetimeSeconds * 1000 - 300);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 3)).toBe(false);
    t.advance(500);
    const boom = t.log.find((m) => m.t === 'boom' && m.rid === 3);
    expect(boom).toBeDefined();
    expect(t.hp('B')).toBe(FS.maxHp);
  });

  it('sends missile positions to clients while it flies', () => {
    const t = setup();
    t.advance(afterProtection);
    launch(t, [0, 1, 0], 4);
    t.advance(500);
    expect(t.log.filter((m) => m.t === 'missile' && m.rid === 4).length).toBeGreaterThanOrEqual(5);
  });

  it('one missile in flight: a new launch replaces the old one (it detonates where it is)', () => {
    const t = setup();
    t.advance(afterProtection);
    launch(t, [0, 1, 0], 10);
    t.advance(200);
    const before = t.log.length;
    launch(t, [0, 1, 0], 11);
    // 10 went off at once; 11 is the one still flying.
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 10)).toBe(true);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 11)).toBe(false);
    t.advance(300);
    const flying = new Set(t.log.slice(before).filter((m) => m.t === 'missile').map((m) => (m.t === 'missile' ? m.rid : -1)));
    expect([...flying]).toEqual([11]);
  });

  it('pod of 3: a 4th launch in quick succession is refused, then one regenerates', () => {
    const t = setup();
    t.advance(afterProtection);
    for (let rid = 20; rid < 24; rid++) {
      launch(t, [0, 1, 0], rid);
      t.advance(100);
    }
    t.advance(MISSILE.lifetimeSeconds * 1000 + 200);
    const launched = new Set(t.log.filter((m) => m.t === 'boom' && m.rid >= 20).map((m) => (m.t === 'boom' ? m.rid : -1)));
    expect(launched.has(22)).toBe(true);
    expect(launched.has(23)).toBe(false);
    t.advance(MISSILE.regenMs);
    launch(t, [0, 1, 0], 24);
    t.advance(MISSILE.lifetimeSeconds * 1000 + 200);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 24)).toBe(true);
  });

  it('a refused missile is never shown to the other pilot', () => {
    const t = setup();
    t.advance(afterProtection);
    for (let rid = 30; rid < 34; rid++) launch(t, [0, 1, 0], rid);
    const relayed = t.log.filter((m) => m.t === 'shot' && m.s.w === 'rocket').map((m) => (m.t === 'shot' ? m.s.rid : -1));
    expect(relayed).toEqual([30, 31, 32]);
  });

  it('missiles do no damage outside a running match', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0);
    match.onState('A', droneAt([0, 20, 0]), 0);
    match.onShot('A', { ts: 0, p: [0, 20, 0], d: [0, 0, -1], w: 'rocket', rid: 1 }, 0);
    for (let now = 0; now < 6000; now += 16) match.tick(now);
    expect(log.some((m) => m.t === 'boom' && m.rid === 1)).toBe(true);
    expect(log.some((m) => m.t === 'hit')).toBe(false);
  });

  it('only the Freestyle can fire missiles', () => {
    const t = setup();
    t.match.onLoadout('A', 'wing', t.getNow());
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + afterProtection);
    launch(t, [0, 1, 0], 5);
    t.advance(500);
    expect(t.log.some((m) => (m.t === 'boom' || m.t === 'missile') && m.rid === 5)).toBe(false);
  });

  it('smoke: 3D quad only, with a cooldown', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0, 'quad3d');
    match.addPlayer('B', 0);
    match.onState('A', droneAt([0, 10, 0]), 0);
    match.onAbility('A', [0, 10, 0], 100);
    match.onAbility('A', [0, 10, 0], 5000);
    match.onAbility('A', [0, 10, 0], 100 + SMOKE.cooldownMs + 1);
    match.onAbility('B', [0, 10, 0], 200);
    const smokes = log.filter((m) => m.t === 'ability');
    expect(smokes).toHaveLength(2);
    expect(smokes.every((m) => m.t === 'ability' && m.id === 'A')).toBe(true);
  });
});

describe('fire-rate token bucket (ADR-0014)', () => {
  /** Try to fire every `stepMs` for `ms`, starting from a full bucket. Returns rounds accepted. */
  function spam(cls: keyof typeof DRONE_CLASSES, ms: number, stepMs: number): number {
    const gun = DRONE_CLASSES[cls];
    const pilot = { ammo: 0, ammoAt: -100_000 };
    let accepted = 0;
    for (let t = 0; t < ms; t += stepMs) if (takeRound(pilot, gun, t)) accepted++;
    return accepted;
  }

  for (const cls of ['freestyle', 'quad3d', 'wing'] as const) {
    it(`${cls}: sustained rate is capped at its rounds per second (plus a small burst)`, () => {
      const gun = DRONE_CLASSES[cls];
      const perSecond = gun.fireRate * gun.pellets;
      const burst = Math.max(gun.pellets * 2, perSecond * 0.2);
      const accepted = spam(cls, 1000, 1);
      expect(accepted).toBeGreaterThanOrEqual(perSecond);
      expect(accepted).toBeLessThanOrEqual(Math.ceil(perSecond + burst));
    });
  }

  it('a 50/s cannon arriving in network bunches is not dropped', () => {
    // 50 rounds/s arriving as bunches of 5 every 100 ms: all should be accepted.
    const gun = DRONE_CLASSES.wing;
    const pilot = { ammo: 0, ammoAt: -100_000 };
    let accepted = 0;
    for (let t = 0; t < 2000; t += 100) for (let i = 0; i < 5; i++) if (takeRound(pilot, gun, t)) accepted++;
    expect(accepted).toBe(100);
  });

  it('a full shotgun blast (8 pellets at once) is accepted', () => {
    const gun = DRONE_CLASSES.quad3d;
    const pilot = { ammo: 0, ammoAt: -100_000 };
    let accepted = 0;
    for (let i = 0; i < gun.pellets; i++) if (takeRound(pilot, gun, 0)) accepted++;
    expect(accepted).toBe(gun.pellets);
  });
});

describe('sampleHistory', () => {
  const h = [
    { st: 0, p: [0, 0, 0] as Vec3, v: [10, 0, 0] as Vec3 },
    { st: 100, p: [1, 0, 0] as Vec3, v: [10, 0, 0] as Vec3 },
  ];
  it('interpolates and extrapolates briefly', () => {
    expect(sampleHistory(h, 50)?.[0]).toBeCloseTo(0.5);
    expect(sampleHistory(h, 150)?.[0]).toBeCloseTo(1.5);
    expect(sampleHistory(h, 10_000)?.[0]).toBeCloseTo(2.5);
  });
});
