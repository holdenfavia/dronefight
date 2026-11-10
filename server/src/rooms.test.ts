import { describe, expect, it } from 'vitest';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { RoomManager, type Peer } from './rooms.js';

function peer(): Peer & { got: ServerMessage[] } {
  const got: ServerMessage[] = [];
  return { got, send: (d: string) => got.push(JSON.parse(d) as ServerMessage) };
}

describe('rooms', () => {
  it('creates a room, lets a friend join by code and relays between them', () => {
    const rooms = new RoomManager(() => 0.42);
    const a = peer();
    const b = peer();
    rooms.handle(a, { t: 'create' });
    expect(a.got.at(-1)).toEqual({ t: 'room', code: '42', you: 0, members: [0] });
    rooms.handle(b, { t: 'join', code: '42' });
    expect(b.got.at(-1)).toEqual({ t: 'room', code: '42', you: 1, members: [0, 1] });
    rooms.handle(b, { t: 'relay', data: { hi: 1 } });
    expect(a.got.at(-1)).toEqual({ t: 'relay', from: 1, data: { hi: 1 } });
    rooms.leave(a);
    rooms.leave(b);
    expect(rooms.stats()).toEqual({ rooms: 0, players: 0 });
  });

  it('rejects unknown rooms and bad messages', () => {
    const rooms = new RoomManager();
    const a = peer();
    rooms.handle(a, { t: 'join', code: '07' });
    expect(a.got.at(-1)?.t).toBe('error');
    expect(parseClientMessage('{"t":"join","code":"7"}')).toBeNull();
    expect(parseClientMessage('nope')).toBeNull();
  });
});
