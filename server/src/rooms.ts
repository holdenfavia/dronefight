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
import type { RoomOptions } from '../../shared/roomOptions.js';
import { levelForXp } from '../../shared/progression.js';
import { Match } from './match.js';
import { Progression, type ProgressEvent } from './progression.js';

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
  /** Signed-in pilots (ADR-0032): Supabase user id and XP so far. */
  userId: string | null;
  xp: number;
  /** Still connected (identify() is asynchronous). */
  connected: boolean;
}

interface Room {
  code: string;
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
    private readonly progression: Progression = new Progression(),
  ) {}

  connect(conn: Connection): void {
    const player: Player = { id: `p${this.nextId++}`, conn, room: null, userId: null, xp: 0, connected: true };
    this.players.set(conn, player);
  }

  disconnect(conn: Connection): void {
    const player = this.players.get(conn);
    if (!player) return;
    player.connected = false;
    this.leaveRoom(player);
    this.players.delete(conn);
    if (player.userId) void this.progression.flush(player.userId);
  }

  handle(conn: Connection, msg: ClientMessage): void {
    const player = this.players.get(conn);
    if (!player) return;
    switch (msg.t) {
      case 'create':
        this.leaveRoom(player);
        this.joinRoom(player, this.createRoom(msg.map, undefined, msg.options));
        break;
      case 'join': {
        const valid = isValidRoomCode(msg.room);
        let room = valid ? this.rooms.get(msg.room) : undefined;
        // Rejoining after a server restart: bring the room back under the same code, so everyone
        // reconnecting ends up together again instead of scattered.
        if (!room && valid && msg.map) room = this.createRoom(msg.map, msg.room);
        if (!room) {
          send(conn, { t: 'error', code: 'room-not-found', message: `No room called ${msg.room}` });
        } else if (room === player.room) {
          send(conn, { t: 'joined', room: room.code, you: player.id, peers: this.peerIds(room, player), map: room.match.mapId });
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
        player.room?.match.onLoadout(player.id, msg.loadout, this.now());
        break;
      case 'ability':
        player.room?.match.onAbility(player.id, msg.kind, msg.p, this.now());
        break;
      case 'detonate':
        if (msg.w === 'grenade') player.room?.match.onDetonateGrenade(player.id, msg.rid, this.now());
        else player.room?.match.onDetonate(player.id, msg.rid, msg.p, this.now());
        break;
      case 'looks':
        player.room?.match.setLooks(player.id, msg.looks);
        break;
      case 'options':
        player.room?.match.setOptions(player.id, msg.options, this.now());
        break;
      case 'auth':
        void this.authenticate(player, msg.token);
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

  /** A pilot proved who they are (ADR-0032): from now on their kills earn XP. */
  private async authenticate(player: Player, token: string): Promise<void> {
    if (!this.progression.enabled) return;
    const who = await this.progression.identify(token);
    if (!who || !player.connected) return;
    player.userId = who.userId;
    player.xp = who.xp;
    send(player.conn, { t: 'progress', xp: who.xp });
    player.room?.match.setLevel(player.id, levelForXp(who.xp));
  }

  /** A match event worth XP for this pilot (ADR-0032): record it and tell them. */
  private progress(room: Room, pilotId: string, event: ProgressEvent): void {
    const player = room.players.get(pilotId);
    if (!player?.userId) return;
    const gained = this.progression.award(player.userId, event);
    if (event === 'finish') void this.progression.flush(player.userId);
    if (gained <= 0 || event === 'death') return;
    const before = levelForXp(player.xp);
    player.xp += gained;
    send(player.conn, { t: 'xp', gained, reason: event, xp: player.xp });
    const after = levelForXp(player.xp);
    if (after !== before) room.match.setLevel(player.id, after);
  }

  private createRoom(map: MapId, wanted?: string, options?: RoomOptions): Room {
    // The code asked for (a rejoin), else a random free one; with only 100 codes, fall back to scanning.
    let code = wanted !== undefined && !this.rooms.has(wanted) ? wanted : generateRoomCode(this.random);
    for (let n = 0; this.rooms.has(code) && n < ROOM_CODE_COUNT; n++) {
      code = String((Number(code) + 1) % ROOM_CODE_COUNT).padStart(ROOM_CODE_LENGTH, '0');
    }
    const players = new Map<string, Player>();
    // Match events are gameplay-critical (unlike snapshots), so they're always sent.
    let room: Room | null = null;
    const match = new Match(
      options ? { ...options, map } : map,
      (msg, opts) => {
        const data = JSON.stringify(msg);
        for (const p of players.values()) {
          if (opts?.to && p.id !== opts.to) continue;
          if (opts?.except && p.id === opts.except) continue;
          p.conn.send(data);
        }
      },
      this.random,
      (pilotId, event) => {
        if (room) this.progress(room, pilotId, event);
      },
    );
    room = { code, players, match };
    this.rooms.set(code, room);
    return room;
  }

  private joinRoom(player: Player, room: Room): void {
    room.players.set(player.id, player);
    player.room = room;
    send(player.conn, { t: 'joined', room: room.code, you: player.id, peers: this.peerIds(room, player), map: room.match.mapId });
    for (const other of room.players.values()) {
      if (other !== player) send(other.conn, { t: 'peer-joined', id: player.id });
    }
    room.match.addPlayer(player.id, this.now());
    if (player.userId) room.match.setLevel(player.id, levelForXp(player.xp));
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
