import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { DRONE_CLASSES } from '../../shared/drones.js';
import { launchMissile, MISSILE, quatRotate, stepMissile, type MissileState } from '../../shared/missile.js';
import type { ServerMessage, Vec3 } from '../../shared/protocol.js';
import { startServer } from './index.js';

/**
 * Pressure tests against the real server over real WebSockets: garbage and hostile input must not
 * break it, and a full guided-missile engagement must behave end to end (ADR-0016).
 */

type Client = { ws: WebSocket; inbox: ServerMessage[]; send: (m: unknown) => void; waitFor: (pred: (m: ServerMessage) => boolean, ms?: number) => Promise<ServerMessage> };

async function connect(port: number): Promise<Client> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox: ServerMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString()) as ServerMessage));
  await new Promise((r) => ws.once('open', r));
  return {
    ws,
    inbox,
    send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    waitFor: async (pred, ms = 3000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = inbox.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('timed out');
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function state(p: Vec3, k?: number[]) {
  return { t: 'state', s: { ts: 0, p, q: [0, 0, 0, 1], v: [0, 0, 0], m: 0.3, armed: true, crashed: false, ...(k ? { k } : {}) } };
}

describe('server pressure tests', () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  async function room() {
    const { wss } = startServer(0);
    close = () => wss.close();
    await new Promise((r) => wss.once('listening', r));
    const port = (wss.address() as { port: number }).port;
    const a = await connect(port);
    const b = await connect(port);
    a.send({ t: 'create', map: 'yard' });
    const joined = (await a.waitFor((m) => m.t === 'joined')) as Extract<ServerMessage, { t: 'joined' }>;
    b.send({ t: 'join', room: joined.room });
    await b.waitFor((m) => m.t === 'joined');
    return { a, b, port };
  }

  it('survives thousands of random, malformed and hostile messages', async () => {
    const { a, b } = await room();
    const junk = () => {
      const r = Math.random();
      const n = () => (Math.random() < 0.1 ? [NaN, Infinity, -1e308, 1e308, 'x', null][Math.floor(Math.random() * 6)] : (Math.random() - 0.5) * 400);
      if (r < 0.1) return '{not json';
      if (r < 0.2) return { t: 'state', s: { ts: n(), p: [n(), n(), n()], q: [0, 0, 0, 1], v: [n(), n(), n()], m: n(), armed: true, crashed: Math.random() < 0.1, k: Math.random() < 0.5 ? [n(), n(), n(), n(), n(), n(), n()] : undefined } };
      if (r < 0.25) return { t: 'detonate', rid: n(), p: [n(), n(), n()] };
      if (r < 0.35) return { t: 'shot', s: { ts: n(), p: [n(), n(), n()], d: [n(), n(), n()] } };
      if (r < 0.5) return { t: 'shot', s: { ts: n(), p: [n(), n(), n()], d: [n(), n(), n()], w: 'rocket', rid: n() } };
      if (r < 0.6) return { t: 'ability', kind: 'smoke', p: [n(), n(), n()] };
      if (r < 0.7) return { t: 'loadout', drone: ['freestyle', 'quad3d', 'wing', 'tank', 42][Math.floor(Math.random() * 5)] };
      if (r < 0.8) return { t: ['create', 'join', 'leave', 'ping', 'bogus'][Math.floor(Math.random() * 5)], room: 'ZZZZ', id: n(), ct: n() };
      return { t: 'state', s: 'nope' };
    };
    for (let i = 0; i < 3000; i++) {
      const who = i % 2 === 0 ? a : b;
      const m = junk();
      // Don't let the fuzzer leave/join rooms: keep both pilots in the room under test.
      if (typeof m === 'object' && (m.t === 'leave' || m.t === 'create' || m.t === 'join')) continue;
      who.send(m);
    }
    await sleep(500);
    // Still alive and answering.
    const before = a.inbox.length;
    a.send({ t: 'ping', id: 123456, ct: 1 });
    await a.waitFor((m) => m.t === 'pong' && m.id === 123456);
    expect(a.inbox.length).toBeGreaterThan(before);
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
    expect(b.ws.readyState).toBe(WebSocket.OPEN);
    a.ws.close();
    b.ws.close();
  });

  it('a missile flown by a real client (ADR-0025) hits the moving target, not the shooter', async () => {
    const { a, b } = await room();
    // Both default to Freestyle. Find who is who in the match, then wait out spawn protection.
    const match = (await a.waitFor((m) => m.t === 'match' && m.m.phase === 'playing')) as Extract<ServerMessage, { t: 'match' }>;
    const aId = (a.inbox.find((m) => m.t === 'joined') as Extract<ServerMessage, { t: 'joined' }>).you;
    const bId = match.m.players.find((p) => p.id !== aId)!.id;

    // Open air in the Yard, clear of structures: A at the west, B 110 m east, crossing north-south.
    const posA: Vec3 = [-100, 40, 60];
    let posB: Vec3 = [10, 40, 40];
    let running = true;
    /** A's client flies the missile: a simple autopilot that keeps the nose on B. */
    let missile = null as MissileState | null;
    const pilot = (m: MissileState) => {
      const d: Vec3 = [posB[0] - m.p[0], posB[1] - m.p[1], posB[2] - m.p[2]];
      const l = Math.hypot(...d) || 1;
      const local = quatRotate([-m.q[0], -m.q[1], -m.q[2], m.q[3]], [d[0] / l, d[1] / l, d[2] / l]);
      const c = (x: number) => Math.max(-1, Math.min(1, x));
      return { throttle: 1, roll: 0, yaw: c(local[0] * 4), pitch: c(-local[1] * 4) };
    };
    let last = performance.now();
    const pump = (async () => {
      let t = 0;
      while (running) {
        posB = [10, 40, 40 - 12 * Math.sin(t)];
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        if (missile) for (let i = 0; i < 4; i++) stepMissile(missile, pilot(missile), dt / 4);
        a.send(state(posA, missile ? [1, ...missile.p, ...missile.v] : undefined));
        b.send(state(posB));
        t += 1 / 30;
        await sleep(1000 / 30);
      }
    })();
    await sleep(2300); // spawn protection

    // Launch pointed ~30° off the target: the pilot has to fly it in.
    const dx = posB[0] - posA[0];
    const dz = posB[2] - posA[2];
    const l = Math.hypot(dx, dz);
    const dir: Vec3 = [(dx / l) * 0.87, 0, dz / l + 0.5];
    a.send({ t: 'shot', s: { ts: 0, p: posA, d: dir, w: 'rocket', rid: 1 } });
    missile = launchMissile(posA, dir);
    last = performance.now();
    const boom = (await a.waitFor((m) => m.t === 'boom' && m.rid === 1, 4000)) as Extract<ServerMessage, { t: 'boom' }>;
    running = false;
    await pump;

    const fromA = Math.hypot(boom.p[0] - posA[0], boom.p[1] - posA[1], boom.p[2] - posA[2]);
    const fromB = Math.hypot(boom.p[0] - posB[0], boom.p[1] - posB[1], boom.p[2] - posB[2]);
    expect(fromA).toBeGreaterThan(50); // did not go off on the shooter
    expect(fromB).toBeLessThan(MISSILE.proximity + 4);
    await sleep(100);
    const hit = a.inbox.find((m) => m.t === 'hit' && m.target === bId);
    expect(hit).toBeDefined();
    expect(a.inbox.some((m) => m.t === 'hit' && m.target === aId)).toBe(false);
    // The other pilot saw the launch and the missile's flight.
    expect(b.inbox.some((m) => m.t === 'shot' && m.s.w === 'rocket')).toBe(true);
    expect(b.inbox.filter((m) => m.t === 'missile').length).toBeGreaterThan(3);
    expect(DRONE_CLASSES.freestyle.maxHp).toBeGreaterThan(0);
    a.ws.close();
    b.ws.close();
  }, 15000);

  it('free-for-all (ADR-0026): 6 pilots in one room all see each other, each in their own color', async () => {
    const { a, b, port } = await room();
    const code = (a.inbox.find((m) => m.t === 'joined') as Extract<ServerMessage, { t: 'joined' }>).room;
    const others: Client[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await connect(port);
      c.send({ t: 'join', room: code });
      await c.waitFor((m) => m.t === 'joined');
      others.push(c);
    }
    const all = [a, b, ...others];
    const ids = all.map((c) => (c.inbox.find((m) => m.t === 'joined') as Extract<ServerMessage, { t: 'joined' }>).you);
    for (let tick = 0; tick < 5; tick++) {
      all.forEach((c, i) => c.send(state([i * 10, 30, 0])));
      await sleep(40);
    }
    await sleep(100);
    for (const [i, c] of all.entries()) {
      const seen = new Set(c.inbox.filter((m) => m.t === 'snap').map((m) => (m.t === 'snap' ? m.id : '')));
      expect(seen.size, `pilot ${i} sees`).toBe(5);
      expect(seen.has(ids[i]!)).toBe(false);
    }
    const match = [...a.inbox].reverse().find((m) => m.t === 'match') as Extract<ServerMessage, { t: 'match' }>;
    expect(match.m.players).toHaveLength(6);
    expect(new Set(match.m.players.map((p) => p.team)).size).toBe(6);
    expect(match.m.phase).toBe('playing');
    for (const c of all) c.ws.close();
  });
});
