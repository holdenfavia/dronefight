// Rooms by two-digit code (ADR-0005). Each room keeps its lobby (members' picks and Ready, the host's settings)
// and runs its online fight (ADR-0076): `tick()` steps every fight one frame, 60 times a second.

import type { BotLevel } from '../../shared/fighter/bot.js';
import { MATCH } from '../../shared/fighter/config.js';
import { FIGHTER_IDS, type FighterId } from '../../shared/fighter/fighters.js';
import { defaultRoomSettings, serializeWorld, SNAPSHOT_EVERY_FRAMES, type MatchFighter, type RoomSettings } from '../../shared/online.js';
import { MAX_ROOM_MEMBERS, type ClientMessage, type RoomMember, type ServerMessage } from '../../shared/protocol.js';
import { OnlineMatch } from './match.js';

export interface Peer {
  send(data: string): void;
}

/** Level of the CPU that takes over from a player who leaves mid-fight. */
const STAND_IN_LEVEL: BotLevel = 2;

interface Member {
  peer: Peer;
  fighter: FighterId;
  ready: boolean;
}

interface Room {
  code: string;
  members: Map<number, Member>;
  nextId: number;
  settings: RoomSettings;
  match: OnlineMatch | null;
  /** Frame inputs stepped this tick, not yet sent. */
  pending: number[][];
  pendingFrom: number;
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
        const room: Room = { code, members: new Map(), nextId: 0, settings: defaultRoomSettings(), match: null, pending: [], pendingFrom: 0 };
        this.rooms.set(code, room);
        this.add(peer, room);
        return;
      }
      case 'join': {
        const room = this.rooms.get(msg.code);
        if (!room) return send(peer, { t: 'error', code: 'no-room', message: `No room ${msg.code}` });
        if (this.peerRoom.get(peer)?.room === room) return;
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
        for (const [id, other] of at.room.members) if (id !== at.id) other.peer.send(out);
        return;
      }
      case 'pick': {
        const at = this.peerRoom.get(peer);
        if (!at) return;
        const m = at.room.members.get(at.id)!;
        m.fighter = msg.fighter;
        m.ready = msg.ready;
        this.broadcastRoom(at.room);
        return;
      }
      case 'settings': {
        const at = this.peerRoom.get(peer);
        if (!at) return;
        if (at.id !== hostOf(at.room)) return send(peer, { t: 'error', code: 'not-host', message: 'Only the host changes the settings' });
        at.room.settings = msg.settings;
        trimCpus(at.room);
        this.broadcastRoom(at.room);
        return;
      }
      case 'start': {
        const at = this.peerRoom.get(peer);
        if (!at || at.room.match) return;
        if (at.id !== hostOf(at.room)) return send(peer, { t: 'error', code: 'not-host', message: 'Only the host starts the fight' });
        const members = [...at.room.members.values()];
        if (!members.every((m) => m.ready)) return send(peer, { t: 'error', code: 'not-ready', message: 'Not everyone is ready' });
        if (members.length + at.room.settings.cpus.length < 2) return send(peer, { t: 'error', code: 'not-ready', message: 'Add a CPU or wait for a friend' });
        this.startMatch(at.room);
        return;
      }
      case 'in': {
        const at = this.peerRoom.get(peer);
        at?.room.match?.input(at.id, msg.b);
        return;
      }
    }
  }

  leave(peer: Peer): void {
    const at = this.peerRoom.get(peer);
    if (!at) return;
    const room = at.room;
    this.peerRoom.delete(peer);
    room.members.delete(at.id);
    if (room.members.size === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.match) {
      const slot = room.match.replaceWithCpu(at.id, STAND_IN_LEVEL);
      if (slot >= 0) this.broadcast(room, { t: 'cpu', slot, level: STAND_IN_LEVEL });
      // Only people watching are left: the fight is over.
      if (!room.match.hasPlayers) this.endMatch(room);
    }
    this.broadcastRoom(room);
  }

  /** Step every running fight one frame and send the frames to each room. */
  tick(): void {
    for (const room of this.rooms.values()) {
      const match = room.match;
      if (!match) continue;
      if (!room.pending.length) room.pendingFrom = match.world.frame;
      room.pending.push(match.step());
      if (match.world.frame % SNAPSHOT_EVERY_FRAMES === 0) {
        this.flush(room);
        this.broadcast(room, { t: 'snap', frame: match.world.frame, world: serializeWorld(match.world) });
      }
      if (match.finished) this.endMatch(room);
    }
  }

  /** Send the frames stepped so far (call after a batch of ticks). */
  flushAll(): void {
    for (const room of this.rooms.values()) this.flush(room);
  }

  stats(): { rooms: number; players: number; fights: number } {
    let fights = 0;
    for (const r of this.rooms.values()) if (r.match) fights++;
    return { rooms: this.rooms.size, players: this.peerRoom.size, fights };
  }

  private flush(room: Room): void {
    if (!room.pending.length) return;
    this.broadcast(room, { t: 'frames', from: room.pendingFrom, inputs: room.pending });
    room.pending = [];
  }

  private startMatch(room: Room): void {
    const fighters: MatchFighter[] = [...room.members.entries()].map(([id, m]) => ({ fighter: m.fighter, member: id, level: 0 }));
    for (const level of room.settings.cpus) {
      if (fighters.length >= MATCH.maxFighters) break;
      fighters.push({ fighter: FIGHTER_IDS[Math.floor(this.random() * FIGHTER_IDS.length)]!, member: -1, level });
    }
    const start = { stage: room.settings.stage, stocks: room.settings.stocks, seed: Math.floor(this.random() * 1e9), fighters };
    room.match = new OnlineMatch(start);
    room.pending = [];
    for (const [id, m] of room.members) send(m.peer, { t: 'match', start, you: room.match.slotOf(id) });
    this.broadcastRoom(room);
  }

  private endMatch(room: Room): void {
    this.flush(room);
    room.match = null;
    room.pending = [];
    for (const m of room.members.values()) m.ready = false;
    this.broadcast(room, { t: 'end' });
    this.broadcastRoom(room);
  }

  private add(peer: Peer, room: Room): void {
    const id = room.nextId++;
    const taken = new Set([...room.members.values()].map((m) => m.fighter));
    const fighter = FIGHTER_IDS.find((f) => !taken.has(f)) ?? FIGHTER_IDS[0]!;
    room.members.set(id, { peer, fighter, ready: false });
    this.peerRoom.set(peer, { room, id });
    trimCpus(room);
    this.broadcastRoom(room);
    // Joining mid-fight: watch it from now on.
    const match = room.match;
    if (match) {
      this.flush(room);
      send(peer, { t: 'match', start: match.start, you: -1 });
      send(peer, { t: 'snap', frame: match.world.frame, world: serializeWorld(match.world) });
    }
  }

  private broadcastRoom(room: Room): void {
    const members: RoomMember[] = [...room.members.entries()].map(([id, m]) => ({ id, fighter: m.fighter, ready: m.ready }));
    const host = hostOf(room);
    for (const [id, m] of room.members) {
      send(m.peer, { t: 'room', code: room.code, you: id, members, host, settings: room.settings, playing: !!room.match });
    }
  }

  private broadcast(room: Room, msg: ServerMessage): void {
    const out = JSON.stringify(msg);
    for (const m of room.members.values()) m.peer.send(out);
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

/** The member who has been in the room longest hosts it. */
function hostOf(room: Room): number {
  return room.members.size ? Math.min(...room.members.keys()) : -1;
}

/** People come first: drop CPUs that no longer fit in four fighters. */
function trimCpus(room: Room): void {
  const room4 = MATCH.maxFighters - room.members.size;
  if (room.settings.cpus.length > room4) room.settings = { ...room.settings, cpus: room.settings.cpus.slice(0, Math.max(0, room4)) };
}

function send(peer: Peer, msg: ServerMessage): void {
  peer.send(JSON.stringify(msg));
}
