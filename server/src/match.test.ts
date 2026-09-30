import { describe, expect, it } from 'vitest';
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
  let posB: Vec3 = [-100, 30, -20];
  let velB: Vec3 = [0, 0, 0];

  /** Advance time, feeding 30 Hz states for both pilots and ticking the match. */
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 1000 / 30);
      match.onState('A', droneAt(posA), now);
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
