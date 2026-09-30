import { describe, expect, it } from 'vitest';
import { COMBAT } from '../../shared/combat.js';
import type { DroneState, ServerMessage, Vec3 } from '../../shared/protocol.js';
import { Match, sampleHistory } from './match.js';

function droneAt(p: Vec3, v: Vec3 = [0, 0, 0], crashed = false): DroneState {
  return { ts: 0, p, v, q: [0, 0, 0, 1], m: 0.3, armed: true, crashed };
}

/** Two pilots in open air, A at z=0 facing B 20 m away along -Z, clear of arena geometry. */
function setup() {
  const log: ServerMessage[] = [];
  const match = new Match((msg) => log.push(msg));
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

const afterProtection = COMBAT.spawnProtectionMs + 100;
const shotInterval = 1000 / COMBAT.fireRate;

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
    expect(t.hp('B')).toBe(COMBAT.maxHp - COMBAT.damage);
    expect(t.log.some((m) => m.t === 'hit' && m.shooter === 'A' && m.target === 'B')).toBe(true);
  });

  it('spawn protection blocks damage', () => {
    const t = setup();
    t.advance(100);
    t.fireAt(t.posB());
    t.advance(200);
    expect(t.hp('B')).toBe(COMBAT.maxHp);
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
    expect(t.hp('B')).toBe(COMBAT.maxHp);
  });

  it('enough hits kill, score, and respawn after the delay', () => {
    const t = setup();
    t.advance(afterProtection);
    const hitsToKill = Math.ceil(COMBAT.maxHp / COMBAT.damage);
    for (let i = 0; i < hitsToKill; i++) {
      t.fireAt(t.posB());
      t.advance(shotInterval + 1);
    }
    t.advance(200);
    expect(t.score('A')).toBe(1);
    expect(t.log.some((m) => m.t === 'death' && m.id === 'B' && m.killer === 'A' && m.cause === 'shot')).toBe(true);
    t.advance(COMBAT.respawnMs);
    expect(t.match.state().players.find((p) => p.id === 'B')).toMatchObject({ alive: true, hp: COMBAT.maxHp });
  });

  it('rejects a faster-than-possible gun', () => {
    const t = setup();
    t.advance(afterProtection);
    for (let i = 0; i < 20; i++) t.fireAt(t.posB());
    t.advance(200);
    expect(t.hp('B')).toBe(COMBAT.maxHp - COMBAT.damage);
  });

  it('lag compensation: hits where the shooter saw the target, within the rewind limit', () => {
    const t = setup();
    t.advance(afterProtection);
    // B crossing sideways at 20 m/s.
    t.setB(t.posB(), [20, 0, 0]);
    t.advance(500);
    // A's screen shows B 100 ms in the past (interpolation buffer), and the round takes ~57 ms to fly
    // 20 m, so A leads B to where it will be *on A's screen* when the round arrives. That counts.
    const flight = 20 / COMBAT.bulletSpeed;
    const seen: Vec3 = [t.posB()[0] - 20 * (0.1 - flight), t.posB()[1], t.posB()[2]];
    t.fireAt(seen);
    t.advance(200);
    expect(t.hp('B')).toBe(COMBAT.maxHp - COMBAT.damage);

    // Aiming where B was 600 ms ago is beyond the rewind limit: miss.
    t.advance(shotInterval + 1);
    const stale: Vec3 = [t.posB()[0] - 20 * 0.6, t.posB()[1], t.posB()[2]];
    t.fireAt(stale, t.getNow() - 500);
    t.advance(200);
    expect(t.hp('B')).toBe(COMBAT.maxHp - COMBAT.damage);
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

  it('drops back to waiting when a pilot leaves', () => {
    const t = setup();
    t.match.removePlayer('B', t.getNow());
    expect(t.match.state().phase).toBe('waiting');
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
