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
  rooms.handle(a, { t: 'create', map: 'yard' });
  const code = a.last('joined')?.room ?? '';
  return { rooms, a, b, code, advance: (ms: number) => (time += ms) };
}

describe('RoomManager', () => {
  it('creates a room with a two-digit code and lets a friend join', () => {
    const { rooms, a, b, code } = setup();
    expect(code).toMatch(/^[0-9]{2}$/);
    rooms.handle(b, { t: 'join', room: code });
    expect(b.last('joined')?.peers).toHaveLength(1);
    expect(a.last('peer-joined')).toBeDefined();
  });

  it('codes stay unique: 100 rooms all get different codes', () => {
    const { rooms, code } = setup();
    const codes = new Set<string>();
    for (let i = 0; i < 99; i++) {
      const c = new FakeConn();
      rooms.connect(c);
      rooms.handle(c, { t: 'create', map: 'yard' });
      codes.add(c.last('joined')!.room);
    }
    expect(codes.size).toBe(99);
    expect(codes.has(code)).toBe(false);
  });

  it('after a server restart, pilots rejoining by code end up in the same room again', () => {
    // A fresh server (the old one's rooms are gone).
    const rooms = new RoomManager(() => 0);
    const a = new FakeConn();
    const b = new FakeConn();
    rooms.connect(a);
    rooms.connect(b);
    rooms.handle(a, { t: 'join', room: '42', map: 'playground' });
    rooms.handle(b, { t: 'join', room: '42', map: 'yard' });
    expect(a.last('joined')).toMatchObject({ room: '42', map: 'playground' });
    expect(b.last('joined')).toMatchObject({ room: '42', map: 'playground' });
    expect(b.last('joined')?.peers).toHaveLength(1);
    // Typing a code that doesn't exist (no map) still says so.
    const c = new FakeConn();
    rooms.connect(c);
    rooms.handle(c, { t: 'join', room: '43' });
    expect(c.last('error')?.code).toBe('room-not-found');
  });

  it('rejects unknown and full rooms', () => {
    const { rooms, b, code } = setup();
    rooms.handle(b, { t: 'join', room: 'ZZZZ' });
    expect(b.last('error')?.code).toBe('room-not-found');
    rooms.handle(b, { t: 'join', room: code });
    // Fill the room to 10 (ADR-0026); the 11th is turned away.
    expect(NET.maxPlayersPerRoom).toBe(10);
    for (let i = 2; i < NET.maxPlayersPerRoom; i++) {
      const c = new FakeConn();
      rooms.connect(c);
      rooms.handle(c, { t: 'join', room: code });
      expect(c.last('joined')?.room).toBe(code);
    }
    const late = new FakeConn();
    rooms.connect(late);
    rooms.handle(late, { t: 'join', room: code });
    expect(late.last('error')?.code).toBe('room-full');
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
    a.ws.send(JSON.stringify({ t: 'create', map: 'yard' }));
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
