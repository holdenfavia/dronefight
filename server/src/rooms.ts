// Rooms by two-digit code (ADR-0005). Members get a number; messages are relayed to everyone else in the room.

import { MAX_ROOM_MEMBERS, type ClientMessage, type ServerMessage } from '../../shared/protocol.js';

export interface Peer {
  send(data: string): void;
}

interface Room {
  code: string;
  members: Map<number, Peer>;
  nextId: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private peerRoom = new Map<Peer, { room: Room; id: number }>();

  constructor(private random: () => number = Math.random) {}

  handle(peer: Peer, msg: ClientMessage): void {
    switch (msg.t) {
      case 'create': {
        this.leave(peer);
        const code = this.freeCode();
        if (!code) return send(peer, { t: 'error', code: 'no-codes', message: 'Every room code is in use' });
        const room: Room = { code, members: new Map(), nextId: 0 };
        this.rooms.set(code, room);
        this.add(peer, room);
        return;
      }
      case 'join': {
        const room = this.rooms.get(msg.code);
        if (!room) return send(peer, { t: 'error', code: 'no-room', message: `No room ${msg.code}` });
        if (room.members.size >= MAX_ROOM_MEMBERS) return send(peer, { t: 'error', code: 'room-full', message: 'That room is full' });
        this.leave(peer);
        this.add(peer, room);
        return;
      }
      case 'leave':
        this.leave(peer);
        return;
      case 'relay': {
        const at = this.peerRoom.get(peer);
        if (!at) return;
        const out = JSON.stringify({ t: 'relay', from: at.id, data: msg.data } satisfies ServerMessage);
        for (const [id, other] of at.room.members) if (id !== at.id) other.send(out);
        return;
      }
    }
  }

  leave(peer: Peer): void {
    const at = this.peerRoom.get(peer);
    if (!at) return;
    this.peerRoom.delete(peer);
    at.room.members.delete(at.id);
    if (at.room.members.size === 0) this.rooms.delete(at.room.code);
    else this.broadcastRoom(at.room);
  }

  stats(): { rooms: number; players: number } {
    return { rooms: this.rooms.size, players: this.peerRoom.size };
  }

  private add(peer: Peer, room: Room): void {
    const id = room.nextId++;
    room.members.set(id, peer);
    this.peerRoom.set(peer, { room, id });
    this.broadcastRoom(room);
  }

  private broadcastRoom(room: Room): void {
    const members = [...room.members.keys()];
    for (const [id, p] of room.members) send(p, { t: 'room', code: room.code, you: id, members });
  }

  private freeCode(): string | null {
    for (let i = 0; i < 50; i++) {
      const code = String(Math.floor(this.random() * 100)).padStart(2, '0');
      if (!this.rooms.has(code)) return code;
    }
    for (let n = 0; n < 100; n++) {
      const code = String(n).padStart(2, '0');
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }
}

function send(peer: Peer, msg: ServerMessage): void {
  peer.send(JSON.stringify(msg));
}
