// Connection to the room server (ADR-0005, ADR-0075): create or join a room by two-digit code and share
// lobby picks with the other members through the relay. Online fights will send inputs through here once the
// netcode is decided (roadmap, Phase 2).

import { PROTOCOL_VERSION } from '../../shared/constants';
import type { FighterId } from '../../shared/fighter/fighters';
import { lobbyHost, parseLobbyMessage, type LobbyPick } from '../../shared/lobby';
import type { ClientMessage, ServerMessage } from '../../shared/protocol';

export type NetStatus = 'offline' | 'connecting' | 'online';

export interface RoomInfo {
  code: string;
  /** Your member id in the room. */
  you: number;
  /** Member ids in join order. */
  members: number[];
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
  /** Everyone else's picks, by member id. */
  readonly picks = new Map<number, LobbyPick>();
  me: LobbyPick;
  /** Called whenever anything above changes. */
  onChange: () => void = () => undefined;

  private socket: WebSocket | null = null;
  private pending: ClientMessage[] = [];

  constructor(fighter: FighterId) {
    this.me = { fighter, ready: false };
  }

  get isHost(): boolean {
    return !!this.room && lobbyHost(this.room.members) === this.room.you;
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
    this.picks.clear();
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

  setPick(pick: Partial<LobbyPick>): void {
    this.me = { ...this.me, ...pick };
    this.sharePick();
    this.changed();
  }

  private sharePick(): void {
    if (this.room) this.send({ t: 'relay', data: { t: 'pick', fighter: this.me.fighter, ready: this.me.ready } });
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
        const before = new Set(this.room?.members ?? []);
        this.room = { code: msg.code, you: msg.you, members: msg.members };
        if (joined) {
          this.picks.clear();
          this.me.ready = false;
        }
        for (const id of [...this.picks.keys()]) if (!msg.members.includes(id)) this.picks.delete(id);
        // Tell newcomers (and, on joining, everyone) what we picked.
        if (joined || msg.members.some((id) => !before.has(id))) this.sharePick();
        this.changed();
        return;
      }
      case 'relay': {
        const m = parseLobbyMessage(msg.data);
        if (m && this.room?.members.includes(msg.from)) {
          this.picks.set(msg.from, { fighter: m.fighter, ready: m.ready });
          this.changed();
        }
        return;
      }
      case 'error':
        this.fail(msg.message);
        return;
    }
  }

  private dropped(message: string): void {
    this.socket = null;
    this.status = 'offline';
    this.pending = [];
    this.room = null;
    this.picks.clear();
    this.fail(message);
  }

  private fail(message: string): void {
    this.error = message;
    this.changed();
  }

  private changed(): void {
    this.onChange();
  }
}
