import { describe, expect, it } from 'vitest';
import { createWorld, step } from '../../shared/fighter/sim.js';
import { decodeInput, deserializeWorld, encodeInput, serializeWorld, type MatchStart } from '../../shared/online.js';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { RoomManager, type Peer } from './rooms.js';

function peer(): Peer & { got: ServerMessage[] } {
  const got: ServerMessage[] = [];
  return { got, send: (d: string) => got.push(JSON.parse(d) as ServerMessage) };
}

function last<T extends ServerMessage['t']>(p: { got: ServerMessage[] }, t: T): Extract<ServerMessage, { t: T }> | undefined {
  return p.got.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined;
}

/** Two friends in room 42, both ready. */
function readyRoom() {
  const rooms = new RoomManager(() => 0.42);
  const a = peer();
  const b = peer();
  rooms.handle(a, { t: 'create' });
  rooms.handle(b, { t: 'join', code: '42' });
  rooms.handle(a, { t: 'pick', fighter: 'ninja', ready: true });
  rooms.handle(b, { t: 'pick', fighter: 'titan', ready: true });
  return { rooms, a, b };
}

describe('rooms', () => {
  it('creates a room, lets a friend join by code and shares picks', () => {
    const { rooms, a, b } = readyRoom();
    const room = last(b, 'room')!;
    expect(room.code).toBe('42');
    expect(room.you).toBe(1);
    expect(room.host).toBe(0);
    expect(room.members).toEqual([
      { id: 0, fighter: 'ninja', ready: true, team: 0, bans: [], tag: '', color: -1 },
      { id: 1, fighter: 'titan', ready: true, team: 1, bans: [], tag: '', color: -1 },
    ]);
    rooms.leave(a);
    rooms.leave(b);
    expect(rooms.stats()).toEqual({ rooms: 0, players: 0, fights: 0 });
  });

  it('shares each member\'s tag and color with the room and the fight (ADR-0083)', () => {
    const rooms = new RoomManager(() => 0.42);
    const a = peer();
    const b = peer();
    rooms.handle(a, parseClientMessage('{"t":"create","profile":{"tag":"hf","color":4}}')!);
    rooms.handle(b, parseClientMessage('{"t":"join","code":"42","profile":{"tag":"cpu9","color":77}}')!);
    expect(last(a, 'room')!.members.map((m) => [m.tag, m.color])).toEqual([['HF', 4], ['', -1]]);
    rooms.handle(a, { t: 'pick', fighter: 'ninja', ready: true });
    rooms.handle(b, { t: 'pick', fighter: 'titan', ready: true });
    rooms.handle(a, { t: 'start' });
    expect(last(b, 'match')!.start.fighters.map((f) => [f.tag, f.color])).toEqual([['HF', 4], ['', -1]]);
  });

  it('rejects unknown rooms and bad messages', () => {
    const rooms = new RoomManager();
    const a = peer();
    rooms.handle(a, { t: 'join', code: '07' });
    expect(a.got.at(-1)?.t).toBe('error');
    expect(parseClientMessage('{"t":"join","code":"7"}')).toBeNull();
    expect(parseClientMessage('{"t":"pick","fighter":"nobody","ready":true}')).toBeNull();
    expect(parseClientMessage('{"t":"in","b":-1}')).toBeNull();
    expect(parseClientMessage('{"t":"settings","settings":{"stage":"rooftop","stocks":9,"cpus":[]}}')).toBeNull();
    expect(parseClientMessage('nope')).toBeNull();
  });

  it('lets only the host change settings and start, and only when everyone is ready', () => {
    const { rooms, a, b } = readyRoom();
    rooms.handle(b, { t: 'settings', settings: { stage: 'helipad', stocks: 1, cpus: [] } });
    expect(last(b, 'error')?.code).toBe('not-host');
    rooms.handle(b, { t: 'start' });
    expect(last(b, 'error')?.code).toBe('not-host');
    rooms.handle(b, { t: 'pick', fighter: 'titan', ready: false });
    rooms.handle(a, { t: 'start' });
    expect(last(a, 'error')?.code).toBe('not-ready');
    rooms.handle(b, { t: 'pick', fighter: 'titan', ready: true });
    // Ten fighters at most (ADR-0086): the ninth CPU doesn't fit beside two people.
    rooms.handle(a, { t: 'settings', settings: { stage: 'helipad', stocks: 2, cpus: [1, 3, 2, 2, 2, 2, 2, 2, 1] } });
    expect(last(b, 'room')?.settings).toEqual({ stage: 'helipad', stocks: 2, cpus: [1, 3, 2, 2, 2, 2, 2, 2] });
    rooms.handle(a, { t: 'start' });
    const m = last(b, 'match')!;
    expect(m.you).toBe(1);
    expect(m.start.fighters.map((f) => f.member)).toEqual([0, 1, -1, -1, -1, -1, -1, -1, -1, -1]);
    expect(m.start.fighters.map((f) => f.level)).toEqual([0, 0, 1, 3, 2, 2, 2, 2, 2, 2]);
    expect(last(a, 'room')?.playing).toBe(true);
  });

  it('stage pick and ban: everyone\'s bans count only when the host turns it on (ADR-0085)', () => {
    const { rooms, a, b } = readyRoom();
    rooms.handle(b, parseClientMessage(JSON.stringify({ t: 'pick', fighter: 'titan', ready: true, bans: ['helipad', 'nowhere', 'helipad'] }))!);
    expect(last(a, 'room')!.members[1]!.bans).toEqual(['helipad']);
    // Off: the host's stage stands even though it's banned.
    rooms.handle(a, { t: 'settings', settings: { stage: 'helipad', stocks: 1, cpus: [] } });
    rooms.handle(a, { t: 'start' });
    expect(last(a, 'match')!.start.stage).toBe('helipad');
  });

  it('stage pick and ban on: a banned or Random stage is drawn from the open ones (ADR-0085)', () => {
    // 0.42 of the way through the open stages; November, so the Harvest Farm is on offer.
    const rooms = new RoomManager(() => 0.42, () => new Date('2026-11-19T18:00:00Z'));
    const a = peer();
    const b = peer();
    rooms.handle(a, { t: 'create' });
    rooms.handle(b, { t: 'join', code: '42' });
    rooms.handle(a, { t: 'pick', fighter: 'ninja', ready: true, bans: ['rooftop'] });
    rooms.handle(b, { t: 'pick', fighter: 'titan', ready: true, bans: ['helipad'] });
    rooms.handle(a, { t: 'settings', settings: { stage: 'helipad', stagePick: true, stocks: 1, cpus: [] } });
    rooms.handle(a, { t: 'start' });
    // Open: Crane Yard and Harvest Farm; 0.42 picks the first.
    expect(last(a, 'match')!.start.stage).toBe('cranes');
  });

  it('team battles: players pick their team, the host sets the CPUs\' teams and friendly fire (ADR-0081)', () => {
    const { rooms, a, b } = readyRoom();
    // Newcomers are spread over the first two teams; everyone on one team can't start.
    rooms.handle(b, { t: 'pick', fighter: 'titan', ready: true, team: 0 });
    rooms.handle(a, { t: 'settings', settings: { stage: 'rooftop', stocks: 2, cpus: [2], teams: true, cpuTeams: [0] } });
    rooms.handle(a, { t: 'start' });
    expect(last(a, 'error')?.code).toBe('not-ready');
    expect(last(a, 'match')).toBeUndefined();
    rooms.handle(a, { t: 'settings', settings: { stage: 'rooftop', stocks: 2, cpus: [2], teams: true, friendlyFire: true, cpuTeams: [1] } });
    rooms.handle(a, { t: 'start' });
    const m = last(b, 'match')!;
    expect(m.start.fighters.map((f) => f.team)).toEqual([0, 0, 1]);
    expect(m.start.rules.friendlyFire).toBe(true);
  });

  it('a free-for-all room sends no teams', () => {
    const { rooms, a } = readyRoom();
    rooms.handle(a, { t: 'settings', settings: { stage: 'rooftop', stocks: 2, cpus: [2], teams: false, friendlyFire: true, cpuTeams: [0] } });
    rooms.handle(a, { t: 'start' });
    const m = last(a, 'match')!;
    expect(m.start.fighters.map((f) => f.team)).toEqual([-1, -1, -1]);
    expect(m.start.rules.friendlyFire).toBe(false);
  });

  it('runs the fight: every client stepping the sent frames ends up with the server world', () => {
    const { rooms, a, b } = readyRoom();
    rooms.handle(a, { t: 'settings', settings: { stage: 'rooftop', stocks: 1, cpus: [3] } });
    rooms.handle(a, { t: 'start' });
    const start: MatchStart = last(a, 'match')!.start;
    const client = createWorld(start.stage, start.fighters.map((f) => ({ id: f.fighter, team: f.team })), start.stocks, start.seed, start.rules);
    let snaps = 0;
    for (let i = 0; i < 1200; i++) {
      // Both players mash something that changes over time.
      rooms.handle(a, { t: 'in', b: encodeInput({ ...decodeInput(0), right: i % 90 < 40, attack: i % 25 === 0, aimRight: i % 25 === 0 }) });
      if (i % 3 === 0) rooms.handle(b, { t: 'in', b: encodeInput({ ...decodeInput(0), left: i % 70 < 30, special: i % 50 === 0, aimUp: i % 50 === 0, up: i % 120 === 5 }) });
      rooms.tick();
      if (i % 2 === 1) rooms.flushAll();
    }
    rooms.flushAll();
    for (const msg of b.got) {
      if (msg.t === 'frames') {
        expect(msg.from).toBe(client.frame);
        for (const bits of msg.inputs) step(client, bits.map(decodeInput));
      }
      if (msg.t === 'snap' && msg.frame === client.frame) {
        expect(serializeWorld(client)).toBe(msg.world);
        snaps++;
      }
    }
    expect(snaps).toBeGreaterThan(10);
  });

  it('hands a leaver\'s fighter to a CPU, lets late joiners watch, and returns to the lobby when it ends', () => {
    const { rooms, a, b } = readyRoom();
    rooms.handle(a, { t: 'settings', settings: { stage: 'rooftop', stocks: 1, cpus: [] } });
    rooms.handle(a, { t: 'start' });
    for (let i = 0; i < 100; i++) rooms.tick();
    const c = peer();
    rooms.handle(c, { t: 'join', code: '42' });
    expect(last(c, 'match')?.you).toBe(-1);
    const snap = last(c, 'snap')!;
    expect(deserializeWorld(snap.world)?.frame).toBe(100);
    rooms.leave(b);
    expect(last(a, 'cpu')).toEqual({ t: 'cpu', slot: 1, level: 2 });
    // The CPU stand-in and the idle host: run it until a stock falls and the room is back in its lobby.
    for (let i = 0; i < 60 * 300 && !last(a, 'end'); i++) rooms.tick();
    expect(last(a, 'end')).toBeTruthy();
    expect(last(a, 'room')?.playing).toBe(false);
    expect(last(a, 'room')?.members.every((m) => !m.ready)).toBe(true);
    // Everyone gone: so is the room.
    rooms.leave(a);
    rooms.leave(c);
    expect(rooms.stats().rooms).toBe(0);
  });
});
