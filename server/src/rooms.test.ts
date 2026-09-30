import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { NET, type DroneState, type ServerMessage } from '../../shared/protocol.js';
import { startServer } from './index.js';
import { RoomManager, type Connection } from './rooms.js';

class FakeConn implements Connection {
  bufferedAmount = 0;
  readonly inbox: ServerMessage[] = [];
  send(data: string): void {
    this.inbox.push(JSON.parse(data) as ServerMessage);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

const drone: DroneState = { ts: 1, p: [0, 1, 0], q: [0, 0, 0, 1], v: [0, 0, 0], m: 0.2, armed: true, crashed: false };

function setup() {
  let time = 1000;
  const rooms = new RoomManager(() => time);
  const a = new FakeConn();
  const b = new FakeConn();
  rooms.connect(a);
  rooms.connect(b);
  rooms.handle(a, { t: 'create' });
  const code = a.last('joined')?.room ?? '';
  return { rooms, a, b, code, advance: (ms: number) => (time += ms) };
}

describe('RoomManager', () => {
  it('creates a room with a readable code and lets a friend join', () => {
    const { rooms, a, b, code } = setup();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    rooms.handle(b, { t: 'join', room: code });
    expect(b.last('joined')?.peers).toHaveLength(1);
    expect(a.last('peer-joined')).toBeDefined();
  });

  it('rejects unknown and full rooms', () => {
    const { rooms, b, code } = setup();
    rooms.handle(b, { t: 'join', room: 'ZZZZ' });
    expect(b.last('error')?.code).toBe('room-not-found');
    rooms.handle(b, { t: 'join', room: code });
    const c = new FakeConn();
    rooms.connect(c);
    rooms.handle(c, { t: 'join', room: code });
    expect(c.last('error')?.code).toBe('room-full');
    expect(NET.maxPlayersPerRoom).toBe(2);
  });

  it('forwards state stamped with server time, only to the other player', () => {
    const { rooms, a, b, code, advance } = setup();
    rooms.handle(b, { t: 'join', room: code });
    advance(50);
    rooms.handle(a, { t: 'state', s: drone });
    const snap = b.last('snap');
    expect(snap?.st).toBe(1050);
    expect(snap?.s).toEqual(drone);
    expect(a.last('snap')).toBeUndefined();
  });

  it('drops (never queues) snapshots for a backed-up connection', () => {
    const { rooms, a, b, code } = setup();
    rooms.handle(b, { t: 'join', room: code });
    const before = b.inbox.length;
    b.bufferedAmount = NET.maxBufferedBytes + 1;
    for (let i = 0; i < 100; i++) rooms.handle(a, { t: 'state', s: drone });
    expect(b.inbox.length).toBe(before);
    expect(rooms.stats().droppedSnapshots).toBe(100);
    b.bufferedAmount = 0;
    rooms.handle(a, { t: 'state', s: { ...drone, ts: 999 } });
    expect(b.inbox.length).toBe(before + 1);
    expect(b.last('snap')?.s.ts).toBe(999);
  });

  it('tells the other player and cleans up when someone leaves', () => {
    const { rooms, a, b, code } = setup();
    rooms.handle(b, { t: 'join', room: code });
    rooms.disconnect(b);
    expect(a.last('peer-left')).toBeDefined();
    rooms.disconnect(a);
    expect(rooms.stats()).toMatchObject({ rooms: 0, players: 0 });
  });
});

describe('server over real WebSockets', () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  it('relays state between two clients in a room', async () => {
    const { wss } = startServer(0);
    close = () => wss.close();
    await new Promise((r) => wss.once('listening', r));
    const port = (wss.address() as { port: number }).port;

    const open = async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const inbox: ServerMessage[] = [];
      ws.on('message', (d) => inbox.push(JSON.parse(d.toString()) as ServerMessage));
      await new Promise((r) => ws.once('open', r));
      const waitFor = async (t: ServerMessage['t']) => {
        for (let i = 0; i < 100; i++) {
          const m = inbox.find((x) => x.t === t);
          if (m) return m;
          await new Promise((r) => setTimeout(r, 10));
        }
        throw new Error(`timed out waiting for ${t}`);
      };
      return { ws, waitFor };
    };

    const a = await open();
    const b = await open();
    a.ws.send(JSON.stringify({ t: 'create' }));
    const joined = (await a.waitFor('joined')) as Extract<ServerMessage, { t: 'joined' }>;
    b.ws.send(JSON.stringify({ t: 'join', room: joined.room.toLowerCase() }));
    await b.waitFor('joined');
    a.ws.send(JSON.stringify({ t: 'state', s: drone }));
    const snap = (await b.waitFor('snap')) as Extract<ServerMessage, { t: 'snap' }>;
    expect(snap.s.p).toEqual([0, 1, 0]);
    a.ws.close();
    b.ws.close();
  });
});
