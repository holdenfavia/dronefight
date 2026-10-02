import {
  generateRoomCode,
  ROOM_CODE_COUNT,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  NET,
  type ClientMessage,
  type ServerMessage,
} from '../../shared/protocol.js';
import type { MapId } from '../../shared/maps/index.js';
import { Match } from './match.js';

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
  map: MapId;
  players: Map<string, Player>;
  match: Match;
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
        this.joinRoom(player, this.createRoom(msg.map));
        break;
      case 'join': {
        const room = isValidRoomCode(msg.room) ? this.rooms.get(msg.room) : undefined;
        if (!room) {
          send(conn, { t: 'error', code: 'room-not-found', message: `No room called ${msg.room}` });
        } else if (room === player.room) {
          send(conn, { t: 'joined', room: room.code, you: player.id, peers: this.peerIds(room, player), map: room.map });
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
        // The missile pose goes out separately (as 'missile' messages, ADR-0025), not in every snapshot.
        const { k: _missile, ...drone } = msg.s;
        const snap = JSON.stringify({ t: 'snap', id: player.id, st: this.now(), s: drone } satisfies ServerMessage);
        for (const other of room.players.values()) {
          if (other === player) continue;
          if (other.conn.bufferedAmount > NET.maxBufferedBytes) {
            this.dropped++;
            continue;
          }
          other.conn.send(snap);
        }
        room.match.onState(player.id, msg.s, this.now());
        break;
      }
      case 'shot':
        player.room?.match.onShot(player.id, msg.s, this.now());
        break;
      case 'loadout':
        player.room?.match.onLoadout(player.id, msg.drone, this.now());
        break;
      case 'ability':
        player.room?.match.onAbility(player.id, msg.p, this.now());
        break;
      case 'detonate':
        player.room?.match.onDetonate(player.id, msg.rid, msg.p, this.now());
        break;
      case 'ping':
        send(conn, { t: 'pong', id: msg.id, ct: msg.ct, st: this.now() });
        break;
    }
  }

  /** Advance timers and in-flight rounds in every room. Call at a fixed rate. */
  tick(): void {
    const now = this.now();
    for (const room of this.rooms.values()) room.match.tick(now);
  }

  stats(): RoomStats {
    return { rooms: this.rooms.size, players: this.players.size, droppedSnapshots: this.dropped };
  }

  private createRoom(map: MapId): Room {
    // A random free code; with only 100 codes, fall back to scanning for any free one.
    let code = generateRoomCode(this.random);
    for (let n = 0; this.rooms.has(code) && n < ROOM_CODE_COUNT; n++) {
      code = String((Number(code) + 1) % ROOM_CODE_COUNT).padStart(ROOM_CODE_LENGTH, '0');
    }
    const players = new Map<string, Player>();
    // Match events are gameplay-critical (unlike snapshots), so they're always sent.
    const match = new Match(map, (msg, opts) => {
      const data = JSON.stringify(msg);
      for (const p of players.values()) {
        if (opts?.to && p.id !== opts.to) continue;
        if (opts?.except && p.id === opts.except) continue;
        p.conn.send(data);
      }
    });
    const room: Room = { code, map, players, match };
    this.rooms.set(code, room);
    return room;
  }

  private joinRoom(player: Player, room: Room): void {
    room.players.set(player.id, player);
    player.room = room;
    send(player.conn, { t: 'joined', room: room.code, you: player.id, peers: this.peerIds(room, player), map: room.map });
    for (const other of room.players.values()) {
      if (other !== player) send(other.conn, { t: 'peer-joined', id: player.id });
    }
    room.match.addPlayer(player.id, this.now());
  }

  private leaveRoom(player: Player): void {
    const room = player.room;
    if (!room) return;
    room.players.delete(player.id);
    player.room = null;
    for (const other of room.players.values()) send(other.conn, { t: 'peer-left', id: player.id });
    room.match.removePlayer(player.id, this.now());
    if (room.players.size === 0) this.rooms.delete(room.code);
  }

  private peerIds(room: Room, self: Player): string[] {
    return [...room.players.keys()].filter((id) => id !== self.id);
  }
}

function send(conn: Connection, msg: ServerMessage): void {
  conn.send(JSON.stringify(msg));
}
