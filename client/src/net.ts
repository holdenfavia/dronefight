// Connection to the room server (ADR-0005, ADR-0075, ADR-0076): create or join a room by two-digit code, pick
// and ready up in its lobby, and play its online fights. The server keeps the lobby and runs the fight; this
// sends your keys every frame and hands the frames it gets back to the game loop (main.ts).

import { PROTOCOL_VERSION } from '../../shared/constants';
import type { BotLevel } from '../../shared/fighter/bot';
import type { FighterId } from '../../shared/fighter/fighters';
import type { MatchStart, MemberPick, RoomSettings } from '../../shared/online';
import type { ClientMessage, RoomMember, ServerMessage } from '../../shared/protocol';

export type NetStatus = 'offline' | 'connecting' | 'online';

export interface RoomInfo {
  code: string;
  /** Your member id in the room. */
  you: number;
  /** Members in join order (their lobby slot). */
  members: RoomMember[];
  host: number;
  settings: RoomSettings;
  /** A fight is going on. */
  playing: boolean;
}

/** What the game loop does with an online fight. */
export interface MatchHandlers {
  onMatch(start: MatchStart, you: number): void;
  onFrames(from: number, inputs: number[][]): void;
  onSnap(frame: number, world: string): void;
  onCpu(slot: number, level: BotLevel): void;
  onEnd(): void;
}

/** Path of the room WebSocket; the Vite dev server proxies it to `npm run server` (vite.config.ts). */
const WS_PATH = '/ws';
const CONNECT_TIMEOUT_MS = 6000;

function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${WS_PATH}`;
}

export class NetClient {
  status: NetStatus = 'offline';
  room: RoomInfo | null = null;
  /** The last problem to show the player, cleared on the next action. */
  error: string | null = null;
  me: MemberPick;
  /** Called whenever anything above changes. */
  onChange: () => void = () => undefined;
  match: MatchHandlers | null = null;
  /** The connection dropped (the game loop leaves an online fight). */
  onDrop: () => void = () => undefined;

  private socket: WebSocket | null = null;
  private pending: ClientMessage[] = [];

  constructor(fighter: FighterId) {
    this.me = { fighter, ready: false };
  }

  get isHost(): boolean {
    return !!this.room && this.room.host === this.room.you;
  }

  create(): void {
    this.send({ t: 'create' });
  }

  join(code: string): void {
    if (!/^\d{2}$/.test(code)) {
      this.fail('Room codes are two digits, like 42');
      return;
    }
    this.send({ t: 'join', code });
  }

  leave(): void {
    if (this.room) this.send({ t: 'leave' });
    this.room = null;
    this.me.ready = false;
    this.changed();
  }

  /** Close the connection (leaving the Online screen). */
  disconnect(): void {
    this.leave();
    this.pending = [];
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.status = 'offline';
    this.changed();
  }

  setPick(pick: Partial<MemberPick>): void {
    this.me = { ...this.me, ...pick };
    this.sharePick();
    this.changed();
  }

  /** Host only: stage, stocks, CPUs. */
  setSettings(settings: RoomSettings): void {
    if (!this.room || !this.isHost) return;
    this.room.settings = settings;
    this.send({ t: 'settings', settings });
    this.changed();
  }

  /** Host only: start the fight. */
  start(): void {
    this.send({ t: 'start' });
  }

  /** Your keys for this frame of an online fight. */
  sendInput(bits: number): void {
    if (this.socket && this.status === 'online' && this.room) this.socket.send(`{"t":"in","b":${bits}}`);
  }

  private sharePick(): void {
    if (this.room) this.send({ t: 'pick', fighter: this.me.fighter, ready: this.me.ready });
  }

  private send(msg: ClientMessage): void {
    this.error = null;
    if (this.socket && this.status === 'online') {
      this.socket.send(JSON.stringify(msg));
      return;
    }
    this.pending.push(msg);
    this.connect();
  }

  private connect(): void {
    if (this.socket) return;
    this.status = 'connecting';
    this.changed();
    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl());
    } catch {
      this.fail("Can't reach the room server");
      return;
    }
    this.socket = socket;
    const timeout = setTimeout(() => {
      if (this.socket === socket && this.status === 'connecting') {
        socket.close();
        this.dropped("Can't reach the room server. Try again in a moment.");
      }
    }, CONNECT_TIMEOUT_MS);
    socket.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (this.socket !== socket) return;
      if (msg.t === 'hello') clearTimeout(timeout);
      this.receive(msg);
    };
    socket.onclose = () => {
      clearTimeout(timeout);
      if (this.socket === socket) this.dropped(this.room ? 'Lost the connection to the room' : "Can't reach the room server");
    };
  }

  private receive(msg: ServerMessage): void {
    switch (msg.t) {
      case 'hello':
        if (msg.protocol !== PROTOCOL_VERSION) {
          this.fail('The server was updated. Refresh the page.');
          this.socket?.close();
          return;
        }
        this.status = 'online';
        for (const m of this.pending.splice(0)) this.socket!.send(JSON.stringify(m));
        this.changed();
        return;
      case 'room': {
        const joined = !this.room || this.room.code !== msg.code;
        this.room = { code: msg.code, you: msg.you, members: msg.members, host: msg.host, settings: msg.settings, playing: msg.playing };
        if (joined) {
          // The server hands each newcomer a fighter nobody else has.
          const mine = msg.members.find((m) => m.id === msg.you);
          this.me = { fighter: mine?.fighter ?? this.me.fighter, ready: false };
        }
        this.changed();
        return;
      }
      case 'match': this.match?.onMatch(msg.start, msg.you); return;
      case 'frames': this.match?.onFrames(msg.from, msg.inputs); return;
      case 'snap': this.match?.onSnap(msg.frame, msg.world); return;
      case 'cpu': this.match?.onCpu(msg.slot, msg.level); return;
      case 'end':
        // The server clears everyone's Ready after a fight.
        this.me.ready = false;
        this.match?.onEnd();
        this.changed();
        return;
      case 'relay': return;
      case 'error':
        this.fail(msg.message);
        return;
    }
  }

  private dropped(message: string): void {
    const wasInRoom = !!this.room;
    this.socket = null;
    this.status = 'offline';
    this.pending = [];
    this.room = null;
    this.fail(message);
    if (wasInRoom) this.onDrop();
  }

  private fail(message: string): void {
    this.error = message;
    this.changed();
  }

  private changed(): void {
    this.onChange();
  }
}
