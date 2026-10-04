import { describe, expect, it } from 'vitest';
import { SMOKE } from '../../shared/abilities.js';
import { launchMissile, MISSILE, MISSILE_MAX_AGE, quatRotate, stepMissile, type MissileInput, type MissileState } from '../../shared/missile.js';
import { COMBAT } from '../../shared/combat.js';
import { DRONE_CLASSES } from '../../shared/drones.js';
import type { Loadout } from '../../shared/loadout.js';
import { SHIELD } from '../../shared/specials.js';
import { WEAPONS, type WeaponId } from '../../shared/weapons.js';
import type { DroneState, ServerMessage, Vec3 } from '../../shared/protocol.js';
import { interceptTime } from '../../shared/lead.js';
import { MAPS, SPAWN_SAFE_DISTANCE } from '../../shared/maps/index.js';
import { mapProps, PROPS } from '../../shared/props.js';
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
  /** The missile A is flying (ADR-0025): A's client flies it and reports its pose with each state. */
  let missileA: { rid: number; m: MissileState; input: (m: MissileState) => MissileInput } | null = null;
  let posB: Vec3 = [-100, 30, -20];
  let velB: Vec3 = [0, 0, 0];

  /** Advance time, feeding 30 Hz states for both pilots and ticking the match. */
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      const step = Math.min(end, now + 1000 / 30) - now;
      now += step;
      let k: DroneState['k'];
      if (missileA) {
        let alive = true;
        for (let i = 0; i < 4 && alive; i++) alive = stepMissile(missileA.m, missileA.input(missileA.m), step / 4000);
        const { m, rid } = missileA;
        if (alive) k = [rid, m.p[0], m.p[1], m.p[2], m.v[0], m.v[1], m.v[2]];
        else missileA = null; // self-destructed on the client: it stops reporting
      }
      match.onState('A', { ...droneAt(posA), k }, now);
      posB = [posB[0] + (velB[0] * 1000) / 30 / 1000, posB[1], posB[2] + (velB[2] * 1000) / 30 / 1000];
      match.onState('B', droneAt(posB, velB), now);
      match.tick(now);
    }
  };
  /** A fires at a point, with the shot stamped as if A sees the world normally. */
  const fireAt = (target: Vec3, ts = now, w: WeaponId = 'gun') => {
    const d: Vec3 = [target[0] - posA[0], target[1] - posA[1], target[2] - posA[2]];
    const len = Math.hypot(...d);
    match.onShot('A', { ts, p: posA, d: [d[0] / len, d[1] / len, d[2] / len], w }, now);
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
    /** A launches a missile along `dir` and flies it with `input` (ADR-0025). */
    fly: (rid: number, dir: Vec3, input: (m: MissileState) => MissileInput = () => ({ throttle: 1, roll: 0, pitch: 0, yaw: 0 })) => {
      const len = Math.hypot(...dir);
      const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
      match.onShot('A', { ts: now, p: posA, d, w: 'missile', rid }, now);
      missileA = { rid, m: launchMissile(posA, d), input };
    },
    /** A's client stops reporting the missile (e.g. the tab froze). */
    dropMissile: () => {
      missileA = null;
    },
    missile: () => missileA,
  };
}

/** Both test pilots fly the default class unless a test changes it. */
const FS = DRONE_CLASSES.freestyle;
/** The Freestyle's default gun (ADR-0033). */
const GUN = WEAPONS.gun;
const afterProtection = COMBAT.spawnProtectionMs + 100;
const shotInterval = 1000 / GUN.fireRate;

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
    expect(t.hp('B')).toBe(FS.maxHp - GUN.damage);
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
    const hitsToKill = Math.ceil(FS.maxHp / GUN.damage);
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
    const flight = 20 / GUN.speed;
    const seen: Vec3 = [t.posB()[0] - 20 * (0.1 - flight), t.posB()[1], t.posB()[2]];
    t.fireAt(seen);
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - GUN.damage);

    // Aiming where B was 600 ms ago is beyond the rewind limit: miss.
    t.advance(shotInterval + 1);
    const stale: Vec3 = [t.posB()[0] - 20 * 0.6, t.posB()[1], t.posB()[2]];
    t.fireAt(stale, t.getNow() - 500);
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - GUN.damage);
  });

  it('aiming at the lead indicator hits a fast crossing target (ADR-0011)', () => {
    const t = setup();
    t.advance(afterProtection);
    // B crosses at 30 m/s, 40 m away. A sees B 100 ms in the past and aims at the lead point.
    t.setB([-100 - 20, 30, -40], [30, 0, 0]);
    t.advance(300);
    // As many shots as a kill takes: every one must land.
    const shots = Math.ceil(FS.maxHp / GUN.damage);
    let hits = 0;
    for (let i = 0; i < shots; i++) {
      const b = t.posB();
      const seen: Vec3 = [b[0] - 30 * 0.1, b[1], b[2]];
      const d = [seen[0] - t.posA[0], seen[1] - t.posA[1], seen[2] - t.posA[2]] as const;
      const tt = interceptTime(d[0], d[1], d[2], 30, 0, 0, GUN.speed) ?? 0;
      const before = t.hp('B') ?? 0;
      t.fireAt([seen[0] + 30 * tt, seen[1], seen[2]]);
      t.advance(shotInterval + 1);
      t.advance(150);
      if ((t.hp('B') ?? 0) < before || t.log.some((m) => m.t === 'death' && m.id === 'B')) hits++;
    }
    expect(hits).toBe(shots);
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

describe('free-for-all (ADR-0026)', () => {
  it('up to 10 pilots, each with their own color; a late joiner spawns into the running match', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('p0', 0);
    expect(match.state().phase).toBe('waiting');
    match.addPlayer('p1', 0);
    expect(match.state().phase).toBe('playing');
    for (let i = 2; i < 10; i++) match.addPlayer(`p${i}`, 100 * i);
    const slots = match.state().players.map((p) => p.team);
    expect(new Set(slots).size).toBe(10);
    expect(log.some((m) => m.t === 'respawn' && m.id === 'p9')).toBe(true);
    expect(match.state().players.find((p) => p.id === 'p9')?.protected).toBe(true);
  });

  it('a freed color slot is reused by the next pilot', () => {
    const match = new Match('yard', () => {});
    for (let i = 0; i < 4; i++) match.addPlayer(`p${i}`, 0);
    match.removePlayer('p1', 10);
    match.addPlayer('new', 20);
    expect(match.state().players.find((p) => p.id === 'new')?.team).toBe(1);
  });

  it('with more pilots than spawns, nobody spawns on top of anyone', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    for (let i = 0; i < 10; i++) match.addPlayer(`p${i}`, 0);
    // Latest respawn per pilot: the spawn plus any offset.
    const at = new Map<string, Vec3>();
    for (const m of log) {
      if (m.t !== 'respawn') continue;
      const s = MAPS.yard.spawns[m.spawn]!.pos;
      at.set(m.id, [s[0] + (m.o?.[0] ?? 0), s[1], s[2] + (m.o?.[1] ?? 0)]);
    }
    const points = [...at.values()];
    expect(points).toHaveLength(10);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.hypot(points[i]![0] - points[j]![0], points[i]![2] - points[j]![2])).toBeGreaterThan(3);
      }
    }
  });

  it('everyone is an enemy: a third pilot can shoot either of the others', () => {
    const t = setup();
    t.match.addPlayer('C', t.getNow());
    t.advance(afterProtection);
    // C, a third pilot off to the side, shoots B.
    const posC: Vec3 = [-100, 30, -40];
    t.match.onState('C', droneAt(posC), t.getNow());
    t.advance(afterProtection);
    const target = t.posB();
    const d: Vec3 = [target[0] - posC[0], target[1] - posC[1], target[2] - posC[2]];
    const len = Math.hypot(...d);
    t.match.onState('C', droneAt(posC), t.getNow());
    t.match.onShot('C', { ts: t.getNow(), p: posC, d: [d[0] / len, d[1] / len, d[2] / len], w: 'gun' }, t.getNow());
    t.advance(200);
    expect(t.log.some((m) => m.t === 'hit' && m.shooter === 'C' && m.target === 'B')).toBe(true);
  });

  it('drops back to waiting below two pilots', () => {
    const match = new Match('yard', () => {});
    match.addPlayer('a', 0);
    match.addPlayer('b', 0);
    match.addPlayer('c', 0);
    match.removePlayer('b', 10);
    expect(match.state().phase).toBe('playing');
    match.removePlayer('c', 20);
    expect(match.state().phase).toBe('waiting');
  });
});

describe('XP events (ADR-0032)', () => {
  function withProgress() {
    const events: [string, string][] = [];
    const log: ServerMessage[] = [];
    const match = new Match('yard', (m) => log.push(m), Math.random, (id, e) => events.push([id, e]));
    return { match, events, log };
  }

  it('a kill gives the killer a kill, the victim a death, and other recent attackers an assist', () => {
    const { match, events } = withProgress();
    for (const id of ['A', 'B', 'C']) match.addPlayer(id, 0);
    const now = COMBAT.spawnProtectionMs + 100;
    // B and C both wound A; B finishes A off by making A crash.
    const m = match as unknown as { hit(by: string, dmg: number, target: unknown, now: number): void; pilots: Map<string, unknown> };
    m.hit('C', 30, m.pilots.get('A'), now);
    m.hit('B', 30, m.pilots.get('A'), now + 100);
    match.onState('A', droneAt([0, 20, 0], [0, 0, 0], true), now + 200);
    expect(events).toContainEqual(['B', 'kill']);
    expect(events).toContainEqual(['A', 'death']);
    expect(events).toContainEqual(['C', 'assist']);
    expect(events.filter(([, e]) => e === 'assist').map(([id]) => id)).toEqual(['C']);
  });

  it('the match winner gets win, and everyone present gets finish', () => {
    const { match, events } = withProgress();
    for (const id of ['A', 'B', 'C']) match.addPlayer(id, 0);
    const m = match as unknown as { kill(p: unknown, killer: string, cause: string, now: number): void; pilots: Map<string, { score: number }> };
    m.pilots.get('A')!.score = COMBAT.killsToWin - 1;
    m.kill(m.pilots.get('B'), 'A', 'shot', 5000);
    expect(match.state().phase).toBe('ended');
    expect(events).toContainEqual(['A', 'win']);
    for (const id of ['A', 'B', 'C']) expect(events).toContainEqual([id, 'finish']);
  });

  it('nothing counts outside a running match (one pilot waiting)', () => {
    const { match, events } = withProgress();
    match.addPlayer('A', 0);
    match.onState('A', droneAt([0, 20, 0], [0, 0, 0], true), 100);
    expect(events).toEqual([]);
  });

  it('levels show in the match state', () => {
    const { match } = withProgress();
    match.addPlayer('A', 0);
    match.setLevel('A', 4);
    expect(match.state().players.find((p) => p.id === 'A')?.level).toBe(4);
  });
});

describe('fast gun time-to-kill (ADR-0028)', () => {
  const hitsToKill = (weapon: WeaponId, target: keyof typeof DRONE_CLASSES) => Math.ceil(DRONE_CLASSES[target].maxHp / WEAPONS[weapon].damage);

  it('Freestyle gun: 3 hits on quads, 4 on a wing', () => {
    expect(hitsToKill('gun', 'freestyle')).toBe(3);
    expect(hitsToKill('gun', 'quad3d')).toBe(3);
    expect(hitsToKill('gun', 'wing')).toBe(4);
  });

  it('a full close shotgun blast one-shots a quad; the cannon kills in about 0.2 s', () => {
    const sg = WEAPONS.shotgun;
    expect(sg.damage * sg.pellets).toBeGreaterThanOrEqual(DRONE_CLASSES.freestyle.maxHp);
    expect((hitsToKill('cannon', 'freestyle') - 1) / WEAPONS.cannon.fireRate).toBeLessThanOrEqual(0.2);
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
    // The wing's default loadout carries the rotary cannon, not the gun.
    t.fireAt(t.posB(), t.getNow(), 'gun');
    t.advance(200);
    expect(t.hp('B')).toBe(DRONE_CLASSES.quad3d.maxHp);
    t.fireAt(t.posB(), t.getNow(), 'cannon');
    t.advance(200);
    expect(t.hp('B')).toBe(DRONE_CLASSES.quad3d.maxHp - WEAPONS.cannon.damage);
  });

  it('switches immediately outside a running match', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0);
    match.onLoadout('A', 'wing', 0);
    expect(match.state().players[0]).toMatchObject({ drone: 'wing', hp: DRONE_CLASSES.wing.maxHp });
  });

});

/** Autopilot for tests: full throttle, steer the nose at a point (yaw/pitch proportional to the error). */
function homeOn(target: () => Vec3) {
  return (m: MissileState): MissileInput => {
    const t = target();
    const d: Vec3 = [t[0] - m.p[0], t[1] - m.p[1], t[2] - m.p[2]];
    const len = Math.hypot(...d) || 1;
    const inv: [number, number, number, number] = [-m.q[0], -m.q[1], -m.q[2], m.q[3]];
    const local = quatRotate(inv, [d[0] / len, d[1] / len, d[2] / len]);
    const c = (x: number) => Math.max(-1, Math.min(1, x));
    return { throttle: 1, roll: 0, yaw: c(local[0] * 4), pitch: c(-local[1] * 4) };
  };
}

describe('piloted missiles (ADR-0025) and smoke (ADR-0024)', () => {
  it('a missile flown onto the target is a one-shot kill (ADR-0018)', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(1, [0, 0, -1], homeOn(t.posB));
    t.advance(800);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 1)).toBe(true);
    expect(t.log.some((m) => m.t === 'death' && m.id === 'B' && m.killer === 'A')).toBe(true);
    expect(t.score('A')).toBe(1);
  });

  it('one missile also kills the toughest class (130 HP wing)', () => {
    const t = setup();
    t.match.onLoadout('B', 'wing', t.getNow());
    t.match.onState('B', droneAt(t.posB(), [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + 100);
    t.setB([-100, 30, -20]);
    t.advance(afterProtection);
    expect(t.match.state().players.find((p) => p.id === 'B')?.drone).toBe('wing');
    t.fly(7, [0, 0, -1], homeOn(t.posB));
    t.advance(800);
    expect(t.log.some((m) => m.t === 'death' && m.id === 'B' && m.cause === 'shot' && m.killer === 'A')).toBe(true);
  });

  it('flown: launched 45° off, the pilot turns it onto a target 115 m away', () => {
    const t = setup();
    t.advance(afterProtection);
    t.setB([t.posA[0], t.posA[1], t.posA[2] - 115]);
    t.advance(100);
    t.fly(2, [1, 0, -1], homeOn(t.posB));
    t.advance(3000);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 2)).toBe(true);
    expect(t.hp('B')).toBeLessThan(FS.maxHp);
  });

  it('runs out of flight and self-destructs (no endless missiles)', () => {
    const t = setup();
    t.advance(afterProtection);
    // Straight up at idle: the most fuel-saving flight there is.
    t.fly(3, [0, 1, 0], () => ({ throttle: 0, roll: 0, pitch: 0, yaw: 0 }));
    t.advance(MISSILE.fuelSeconds * 1000);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 3)).toBe(false);
    t.advance((MISSILE_MAX_AGE - MISSILE.fuelSeconds) * 1000 + MISSILE.staleMs + 200);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 3)).toBe(true);
    expect(t.hp('B')).toBe(FS.maxHp);
  });

  it('a client that keeps reporting past the flight cap is cut off by the server', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(9, [0, 1, 0], () => ({ throttle: 0, roll: 0, pitch: 0, yaw: 0 }));
    // Cheat: keep the missile alive forever on the client.
    const x = t.missile()!;
    x.m.fuel = Infinity;
    x.m.age = -1e9;
    t.advance(MISSILE_MAX_AGE * 1000 + MISSILE.staleMs + 200);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 9)).toBe(true);
  });

  it('impossible moves are clamped to the speed cap', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(12, [0, 1, 0]);
    t.advance(100);
    const x = t.missile()!;
    const before = [...x.m.p];
    x.m.p[1] += 500; // teleport
    t.advance(34);
    const relayed = t.log.filter((m) => m.t === 'missile' && m.rid === 12).at(-1);
    expect(relayed && relayed.t === 'missile' ? relayed.p[1] - before[1]! : Infinity).toBeLessThan(MISSILE.maxSpeed * 0.2 + 10);
  });

  it('a missile that goes quiet explodes where it was', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(13, [0, 1, 0]);
    t.advance(300);
    t.dropMissile();
    t.advance(MISSILE.staleMs + 100);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 13)).toBe(true);
  });

  it('detonate on demand, at the reported point if it is plausible', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(14, [0, 1, 0]);
    t.advance(300);
    const x = t.missile()!;
    t.match.onDetonate('A', 14, [x.m.p[0], x.m.p[1], x.m.p[2]], t.getNow());
    const boom = t.log.find((m) => m.t === 'boom' && m.rid === 14);
    expect(boom && boom.t === 'boom' ? Math.hypot(boom.p[0] - x.m.p[0], boom.p[1] - x.m.p[1], boom.p[2] - x.m.p[2]) : Infinity).toBeLessThan(1);
    // A far-away claim is ignored: it blows at the last accepted position instead.
    t.fly(15, [0, 1, 0]);
    t.advance(300);
    t.match.onDetonate('A', 15, [0, 0, 0], t.getNow());
    const far = t.log.find((m) => m.t === 'boom' && m.rid === 15);
    expect(far && far.t === 'boom' ? far.p[1] : 0).toBeGreaterThan(30);
  });

  it('if your drone dies while you fly it, the missile blows', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(16, [0, 1, 0]);
    t.advance(200);
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow() + 1);
    t.advance(50);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 16)).toBe(true);
  });

  it('sends missile positions to the other pilot while it flies', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(4, [0, 1, 0]);
    t.advance(500);
    expect(t.log.filter((m) => m.t === 'missile' && m.rid === 4).length).toBeGreaterThanOrEqual(5);
  });

  it('one missile in flight: a new launch replaces the old one (it detonates where it is)', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fly(10, [0, 1, 0]);
    t.advance(200);
    const before = t.log.length;
    t.fly(11, [0, 1, 0]);
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
      t.fly(rid, [0, 1, 0]);
      t.advance(100);
    }
    t.advance(MISSILE.staleMs + 200);
    const launched = new Set(t.log.filter((m) => m.t === 'boom' && m.rid >= 20).map((m) => (m.t === 'boom' ? m.rid : -1)));
    expect(launched.has(22)).toBe(true);
    expect(launched.has(23)).toBe(false);
    t.advance(MISSILE.regenMs);
    t.fly(24, [0, 1, 0]);
    t.advance(300);
    t.dropMissile();
    t.advance(MISSILE.staleMs + 200);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 24)).toBe(true);
  });

  it('a refused missile is never shown to the other pilot', () => {
    const t = setup();
    t.advance(afterProtection);
    for (let rid = 30; rid < 34; rid++) t.fly(rid, [0, 1, 0]);
    const relayed = t.log.filter((m) => m.t === 'shot' && m.s.w === 'missile').map((m) => (m.t === 'shot' ? m.s.rid : -1));
    expect(relayed).toEqual([30, 31, 32]);
  });

  it('missiles do no damage outside a running match', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0);
    match.onState('A', droneAt([0, 20, 0]), 0);
    match.onShot('A', { ts: 0, p: [0, 20, 0], d: [0, 0, -1], w: 'missile', rid: 1 }, 0);
    for (let now = 0; now < 2000; now += 16) match.tick(now);
    expect(log.some((m) => m.t === 'boom' && m.rid === 1)).toBe(true);
    expect(log.some((m) => m.t === 'hit')).toBe(false);
  });

  it('only the Freestyle can fire missiles', () => {
    const t = setup();
    t.match.onLoadout('A', 'wing', t.getNow());
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + afterProtection);
    t.fly(5, [0, 1, 0]);
    t.advance(500);
    expect(t.log.some((m) => (m.t === 'boom' || m.t === 'missile') && m.rid === 5)).toBe(false);
  });

  it('smoke: 3D quad only, with a cooldown', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0, 'quad3d');
    match.addPlayer('B', 0);
    match.onState('A', droneAt([0, 10, 0]), 0);
    match.onAbility('A', 'smoke', [0, 10, 0], 100);
    match.onAbility('A', 'smoke', [0, 10, 0], 5000);
    match.onAbility('A', 'smoke', [0, 10, 0], 100 + SMOKE.cooldownMs + 1);
    match.onAbility('B', 'smoke', [0, 10, 0], 200);
    const smokes = log.filter((m) => m.t === 'ability');
    expect(smokes).toHaveLength(2);
    expect(smokes.every((m) => m.t === 'ability' && m.id === 'A')).toBe(true);
  });
});

describe('destructible props (ADR-0023)', () => {
  // The Yard's propane tank in the open at (-20, 1.2, 20).
  const tank = mapProps(MAPS.yard).findIndex((p) => p.explosive?.kind === 'propane' && p.explosive.pos[0] === -20);
  const tankPos: Vec3 = [-20, 1.2, 20];

  it('rounds blow up a prop, everyone is told, and it comes back later', () => {
    const t = setup();
    expect(tank).toBeGreaterThanOrEqual(0);
    t.setB([100, 30, 100]);
    t.advance(afterProtection);
    for (let i = 0; i < 3; i++) {
      t.fireAt(tankPos);
      t.advance(shotInterval + 1);
    }
    t.advance(500);
    expect(t.log.some((m) => m.t === 'prop' && m.i === tank && m.by === 'A')).toBe(true);
    expect(t.match.state().props).toContain(tank);
    t.advance(PROPS.respawnMs);
    expect(t.match.state().props).not.toContain(tank);
  });

  it('the blast hurts a pilot nearby, credited to whoever set it off', () => {
    const t = setup();
    t.advance(afterProtection);
    t.setB([-20, 1.5, 25]);
    t.advance(200);
    for (let i = 0; i < 3; i++) {
      t.fireAt(tankPos);
      t.advance(shotInterval + 1);
    }
    t.advance(500);
    expect(t.hp('B')).toBeLessThan(FS.maxHp);
    expect(t.log.some((m) => m.t === 'hit' && m.target === 'B' && m.shooter === 'A')).toBe(true);
  });

  it('props can be shot before the match starts, but blasts only hurt during it', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (msg) => log.push(msg));
    match.addPlayer('A', 0);
    const p: Vec3 = [-100, 30, 0];
    let now = 0;
    for (let i = 0; i < 4; i++) {
      now += 200;
      match.onState('A', droneAt(p), now);
      const d: Vec3 = [tankPos[0] - p[0], tankPos[1] - p[1], tankPos[2] - p[2]];
      const len = Math.hypot(...d);
      match.onShot('A', { ts: now, p, d: [d[0] / len, d[1] / len, d[2] / len], w: 'gun' }, now);
      match.tick(now);
    }
    match.tick(now + 1000);
    expect(match.state().phase).toBe('waiting');
    expect(log.some((m) => m.t === 'prop' && m.i === tank)).toBe(true);
    expect(log.some((m) => m.t === 'hit')).toBe(false);
  });
});

describe('fire-rate token bucket (ADR-0014, ADR-0033)', () => {
  const pilotWith = (...weapons: (WeaponId | null)[]) => ({ loadout: { body: 'x8', weapons, special: null } as Loadout, ammo: new Map() });
  /** Try to fire every `stepMs` for `ms`. Returns rounds accepted. */
  function spam(pilot: ReturnType<typeof pilotWith>, id: WeaponId, ms: number, stepMs: number): number {
    let accepted = 0;
    for (let t = 0; t < ms; t += stepMs) if (takeRound(pilot, id, t)) accepted++;
    return accepted;
  }

  for (const id of ['gun', 'shotgun', 'cannon', 'rail', 'burst'] as const) {
    it(`${id}: sustained rate is capped at its rounds per second (plus a small burst)`, () => {
      const w = WEAPONS[id];
      const perSecond = w.fireRate * w.pellets;
      const capacity = Math.max(w.pellets * 2, perSecond * 0.2, (w.burst?.rounds ?? 0) + 1);
      const accepted = spam(pilotWith(id), id, 1000, 1);
      expect(accepted).toBeGreaterThanOrEqual(perSecond);
      expect(accepted).toBeLessThanOrEqual(Math.ceil(perSecond + capacity));
    });
  }

  it('two of the same gun fire twice as fast; an unmounted weapon never fires', () => {
    const one = spam(pilotWith('gun'), 'gun', 2000, 1);
    const two = spam(pilotWith('gun', 'gun'), 'gun', 2000, 1);
    expect(two).toBeGreaterThan(one * 1.8);
    expect(spam(pilotWith('gun'), 'rail', 2000, 1)).toBe(0);
  });

  it('a 50/s cannon arriving in network bunches is not dropped', () => {
    const pilot = pilotWith('cannon');
    let accepted = 0;
    for (let t = 0; t < 2000; t += 100) for (let i = 0; i < 5; i++) if (takeRound(pilot, 'cannon', t)) accepted++;
    expect(accepted).toBe(100);
  });

  it('a full shotgun blast (8 pellets at once) and a whole rifle burst are accepted', () => {
    const sg = pilotWith('shotgun');
    let accepted = 0;
    for (let i = 0; i < WEAPONS.shotgun.pellets; i++) if (takeRound(sg, 'shotgun', 0)) accepted++;
    expect(accepted).toBe(WEAPONS.shotgun.pellets);
    const rifle = pilotWith('burst');
    let burst = 0;
    for (let i = 0; i < 3; i++) if (takeRound(rifle, 'burst', i * 65)) burst++;
    expect(burst).toBe(3);
  });
});

describe('loadouts on the server (ADR-0033)', () => {
  it('a shot from a weapon you do not carry is ignored', () => {
    const t = setup();
    t.advance(afterProtection);
    t.fireAt(t.posB(), t.getNow(), 'rail');
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp);
  });

  it('a custom loadout uses its weapons: a rail gun does 75', () => {
    const t = setup();
    t.match.onLoadout('A', { body: 'freestyle', weapons: ['rail', 'gun'], special: null, propeller: 'tri' }, t.getNow());
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + 100);
    t.match.onState('A', droneAt(t.posA), t.getNow());
    t.setB([-100, 30, -20]);
    t.advance(afterProtection);
    expect(t.match.state().players.find((p) => p.id === 'A')?.loadout.weapons).toEqual(['rail', 'gun']);
    t.fireAt(t.posB(), t.getNow(), 'rail');
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - WEAPONS.rail.damage);
  });

  it('bad loadouts are cleaned: extra weapons dropped, specials that do not fit removed', () => {
    const match = new Match('yard', () => {});
    match.addPlayer('A', 0, { body: 'racer', weapons: ['rail', 'rail'], special: 'maneuver', propeller: 'tri' });
    expect(match.state().players[0]?.loadout).toEqual({ body: 'racer', weapons: ['rail'], special: null, propeller: 'tri' });
  });

  it('missile pods: a loadout without one cannot launch; two pods hold six', () => {
    const log: ServerMessage[] = [];
    const match = new Match('yard', (m) => log.push(m));
    match.addPlayer('A', 0, { body: 'x8', weapons: ['missile', 'missile', null, null], special: null, propeller: 'tri' });
    match.addPlayer('B', 0, 'racer');
    for (const [id, p] of [['A', [0, 30, 0]], ['B', [50, 30, 0]]] as const) match.onState(id, droneAt([...p] as Vec3), 10);
    let launched = 0;
    for (let rid = 1; rid <= 8; rid++) {
      const before = log.filter((m) => m.t === 'shot').length;
      match.onShot('A', { ts: 10, p: [0, 30, 0], d: [0, 1, 0], w: 'missile', rid }, 10);
      if (log.filter((m) => m.t === 'shot').length > before) launched++;
    }
    expect(launched).toBe(6);
    const before = log.filter((m) => m.t === 'shot').length;
    match.onShot('B', { ts: 10, p: [50, 30, 0], d: [0, 1, 0], w: 'missile', rid: 1 }, 10);
    expect(log.filter((m) => m.t === 'shot').length).toBe(before);
  });

  it('shield: soaks the next 40 damage for 3 s, then cools down', () => {
    const t = setup();
    t.match.onLoadout('B', { body: 'freestyle', weapons: ['gun', null], special: 'shield', propeller: 'tri' }, t.getNow());
    t.match.onState('B', droneAt(t.posB(), [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + 100);
    t.setB([-100, 30, -20]);
    t.advance(afterProtection);
    t.match.onAbility('B', 'shield', t.posB(), t.getNow());
    expect(t.match.state().players.find((p) => p.id === 'B')?.shielded).toBe(true);
    t.fireAt(t.posB());
    t.advance(200);
    // 34 absorbed, shield has 6 left.
    expect(t.hp('B')).toBe(FS.maxHp);
    t.fireAt(t.posB());
    t.advance(200);
    expect(t.hp('B')).toBe(FS.maxHp - (2 * GUN.damage - SHIELD.absorb));
    // Can't raise it again until the cooldown is over.
    t.match.onAbility('B', 'shield', t.posB(), t.getNow());
    expect(t.match.state().players.find((p) => p.id === 'B')?.shielded).toBeFalsy();
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

describe('grenade launcher (ADR-0034)', () => {
  function withLauncher() {
    const t = setup();
    t.match.onLoadout('A', { body: 'freestyle', weapons: ['grenade', 'gun'], special: null, propeller: 'tri' }, t.getNow());
    t.match.onState('A', droneAt(t.posA, [0, 0, 0], true), t.getNow());
    t.advance(COMBAT.respawnMs + 100);
    t.match.onState('A', droneAt(t.posA), t.getNow());
    t.advance(afterProtection);
    return t;
  }
  const lob = (t: ReturnType<typeof setup>, rid: number, d: Vec3) => t.match.onShot('A', { ts: t.getNow(), p: t.posA, d, w: 'grenade', rid }, t.getNow());

  it('flies under gravity, the server reports where it is, and Fire again sets it off there', () => {
    const t = withLauncher();
    lob(t, 1, [0, 0, -1]);
    t.advance(300);
    const updates = t.log.filter((m) => m.t === 'grenade' && m.rid === 1);
    expect(updates.length).toBeGreaterThanOrEqual(3);
    const last = updates.at(-1);
    expect(last && last.t === 'grenade' ? last.p[1] : 99).toBeLessThan(t.posA[1]);
    t.match.onDetonateGrenade('A', 1, t.getNow());
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 1 && m.kind === 'grenade')).toBe(true);
  });

  it('a big splash: hurts a pilot 8 m away, nothing at 15 m', () => {
    const t = withLauncher();
    // Lob straight up so it hangs near A, then set it off with B nearby.
    t.setB([t.posA[0] + 8, t.posA[1], t.posA[2]]);
    lob(t, 2, [0, 1, 0]);
    t.advance(100);
    t.match.onDetonateGrenade('A', 2, t.getNow());
    expect(t.hp('B')).toBeLessThan(FS.maxHp);
    const t2 = withLauncher();
    t2.setB([t2.posA[0] + 15, t2.posA[1], t2.posA[2]]);
    lob(t2, 3, [0, 1, 0]);
    t2.advance(100);
    t2.match.onDetonateGrenade('A', 3, t2.getNow());
    expect(t2.hp('B')).toBe(FS.maxHp);
  });

  it('one out per launcher; the fuse sets off a forgotten one', () => {
    const t = withLauncher();
    lob(t, 4, [0, 1, 0]);
    t.advance(1100);
    lob(t, 5, [0, 1, 0]);
    expect(t.log.filter((m) => m.t === 'shot' && m.s.w === 'grenade').map((m) => (m.t === 'shot' ? m.s.rid : 0))).toEqual([4]);
    t.advance(9000);
    expect(t.log.some((m) => m.t === 'boom' && m.rid === 4)).toBe(true);
  });

  it('only a pilot carrying a launcher can lob', () => {
    const t = setup();
    t.advance(afterProtection);
    lob(t, 9, [0, 0, -1]);
    expect(t.log.some((m) => m.t === 'shot' && m.s.w === 'grenade')).toBe(false);
  });
});
