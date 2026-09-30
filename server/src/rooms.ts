import {
  generateRoomCode,
  isValidRoomCode,
  NET,
  type ClientMessage,
  type ServerMessage,
} from '../../shared/protocol.js';

/** The slice of a WebSocket the room logic needs. Lets tests use fakes. */
export interface Connection {
  send(data: string): void;
  /** Bytes queued but not yet sent. */
  readonly bufferedAmount: number;
}

interface Player {
  id: string;
  conn: Connection;
  room: Room | null;
}

interface Room {
  code: string;
  players: Map<string, Player>;
}

export interface RoomStats {
  rooms: number;
  players: number;
  /** Snapshots skipped because the receiver's connection was backed up (ADR-0004). */
  droppedSnapshots: number;
}

/**
 * Rooms with codes (ADR-0005) and latest-state-wins relay (ADR-0004).
 * States are stamped with server time and forwarded immediately. Nothing is ever queued:
 * if a receiver can't keep up, that snapshot is dropped and the next one carries the newest state.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly players = new Map<Connection, Player>();
  private nextId = 1;
  private dropped = 0;

  constructor(
    private readonly now: () => number,
    private readonly random: () => number = Math.random,
  ) {}

  connect(conn: Connection): void {
    const player: Player = { id: `p${this.nextId++}`, conn, room: null };
    this.players.set(conn, player);
  }

  disconnect(conn: Connection): void {
    const player = this.players.get(conn);
    if (!player) return;
    this.leaveRoom(player);
    this.players.delete(conn);
  }

  handle(conn: Connection, msg: ClientMessage): void {
    const player = this.players.get(conn);
    if (!player) return;
    switch (msg.t) {
      case 'create':
        this.leaveRoom(player);
        this.joinRoom(player, this.createRoom());
        break;
      case 'join': {
        const room = isValidRoomCode(msg.room) ? this.rooms.get(msg.room) : undefined;
        if (!room) {
          send(conn, { t: 'error', code: 'room-not-found', message: `No room called ${msg.room}` });
        } else if (room === player.room) {
          send(conn, { t: 'joined', room: room.code, you: player.id, peers: this.peerIds(room, player) });
        } else if (room.players.size >= NET.maxPlayersPerRoom) {
          send(conn, { t: 'error', code: 'room-full', message: `Room ${room.code} is full` });
        } else {
          this.leaveRoom(player);
          this.joinRoom(player, room);
        }
        break;
      }
      case 'leave':
        this.leaveRoom(player);
        break;
      case 'state': {
        const room = player.room;
        if (!room) return;
        const snap = JSON.stringify({ t: 'snap', id: player.id, st: this.now(), s: msg.s } satisfies ServerMessage);
        for (const other of room.players.values()) {
          if (other === player) continue;
          if (other.conn.bufferedAmount > NET.maxBufferedBytes) {
            this.dropped++;
            continue;
          }
          other.conn.send(snap);
        }
        break;
      }
      case 'ping':
        send(conn, { t: 'pong', id: msg.id, ct: msg.ct, st: this.now() });
        break;
    }
  }

  stats(): RoomStats {
    return { rooms: this.rooms.size, players: this.players.size, droppedSnapshots: this.dropped };
  }

  private createRoom(): Room {
    let code = generateRoomCode(this.random);
    for (let tries = 0; this.rooms.has(code) && tries < 100; tries++) code = generateRoomCode(this.random);
    const room: Room = { code, players: new Map() };
    this.rooms.set(code, room);
    return room;
  }

  private joinRoom(player: Player, room: Room): void {
    room.players.set(player.id, player);
    player.room = room;
    send(player.conn, { t: 'joined', room: room.code, you: player.id, peers: this.peerIds(room, player) });
    for (const other of room.players.values()) {
      if (other !== player) send(other.conn, { t: 'peer-joined', id: player.id });
    }
  }

  private leaveRoom(player: Player): void {
    const room = player.room;
    if (!room) return;
    room.players.delete(player.id);
    player.room = null;
    for (const other of room.players.values()) send(other.conn, { t: 'peer-left', id: player.id });
    if (room.players.size === 0) this.rooms.delete(room.code);
  }

  private peerIds(room: Room, self: Player): string[] {
    return [...room.players.keys()].filter((id) => id !== self.id);
  }
}

function send(conn: Connection, msg: ServerMessage): void {
  conn.send(JSON.stringify(msg));
}
