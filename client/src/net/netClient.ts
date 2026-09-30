import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION } from '../../../shared/constants';
import { NET, normalizeRoomCode, parseServerMessage, type ClientMessage, type DroneState } from '../../../shared/protocol';
import { ClockSync } from './clockSync';
import { SnapshotBuffer } from './snapshotBuffer';

/**
 * Connection to the room server (ADR-0005) and remote-player state (ADR-0004).
 * Receiving only ever overwrites bounded buffers; sending skips (never queues) when the socket is backed up.
 */

export type NetStatus = 'offline' | 'connecting' | 'in-room' | 'reconnecting' | 'error';

export interface Peer {
  id: string;
  buffer: SnapshotBuffer;
  /** Local time the latest snapshot arrived. */
  lastRecv: number;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export function defaultServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.hostname}:${DEFAULT_SERVER_PORT}`;
}

export class NetClient {
  status: NetStatus = 'offline';
  room: string | null = null;
  you: string | null = null;
  error: string | null = null;
  readonly peers = new Map<string, Peer>();
  readonly clock = new ClockSync();

  private socket: WebSocket | null = null;
  private sendAccumulator = 0;
  private pingTimer = 0;
  private pingId = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantRoom: { kind: 'create' } | { kind: 'join'; code: string } | null = null;

  constructor(
    private readonly url: string,
    private readonly onChange: () => void,
  ) {}

  get inRoom(): boolean {
    return this.status === 'in-room';
  }

  /** Server time in ms, estimated from ping/pong. */
  serverNow(): number {
    return this.clock.serverNow(performance.now());
  }

  createRoom(): void {
    this.wantRoom = { kind: 'create' };
    this.ensureConnected();
  }

  joinRoom(code: string): void {
    this.wantRoom = { kind: 'join', code: normalizeRoomCode(code) };
    this.ensureConnected();
  }

  leave(): void {
    this.wantRoom = null;
    this.send({ t: 'leave' });
    this.clearReconnect();
    this.socket?.close();
    this.socket = null;
    this.room = null;
    this.peers.clear();
    this.setStatus('offline');
  }

  /** Call once per frame. Sends local state at NET.sendHz and pings for clock sync. */
  update(frameDt: number, getState: () => DroneState): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const now = performance.now();

    if (now - this.pingTimer >= NET.pingIntervalMs) {
      this.pingTimer = now;
      this.send({ t: 'ping', id: ++this.pingId, ct: now });
    }

    if (!this.inRoom) return;
    const interval = 1 / NET.sendHz;
    this.sendAccumulator += frameDt;
    if (this.sendAccumulator >= interval) {
      // One send per frame at most; a long frame is not "made up" with a burst.
      this.sendAccumulator = Math.min(this.sendAccumulator - interval, interval);
      this.send({ t: 'state', s: getState() });
    }
  }

  private ensureConnected(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.requestRoom();
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) return;
    this.open();
  }

  private open(): void {
    this.clearReconnect();
    this.error = null;
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.clock.reset();
      // A quick burst of pings gets clock sync settled before the first snapshot matters.
      for (let i = 0; i < 4; i++) this.send({ t: 'ping', id: ++this.pingId, ct: performance.now() });
      this.pingTimer = performance.now();
      this.requestRoom();
    };
    socket.onmessage = (e) => this.receive(String(e.data));
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.peers.clear();
      if (this.wantRoom) this.scheduleReconnect();
      else this.setStatus('offline');
    };
    socket.onerror = () => {
      // onclose follows and handles reconnecting.
    };
  }

  private requestRoom(): void {
    const want = this.wantRoom;
    if (!want) return;
    this.send(want.kind === 'create' ? { t: 'create' } : { t: 'join', room: want.code });
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 8000;
    this.reconnectAttempt++;
    if (this.reconnectAttempt > RECONNECT_DELAYS_MS.length + 3) {
      this.error = "Can't reach the server.";
      this.wantRoom = null;
      this.setStatus('error');
      return;
    }
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private receive(raw: string): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;
    switch (msg.t) {
      case 'hello':
        if (msg.protocol !== PROTOCOL_VERSION) {
          this.error = 'Game and server versions differ. Refresh the page.';
          this.wantRoom = null;
          this.socket?.close();
          this.setStatus('error');
          return;
        }
        this.clock.seed(msg.st, performance.now());
        break;
      case 'pong':
        this.clock.onPong(msg.ct, msg.st, performance.now());
        break;
      case 'joined':
        this.room = msg.room;
        this.you = msg.you;
        this.reconnectAttempt = 0;
        // Rejoin the same room if the connection drops.
        this.wantRoom = { kind: 'join', code: msg.room };
        this.peers.clear();
        for (const id of msg.peers) this.addPeer(id);
        this.setStatus('in-room');
        break;
      case 'peer-joined':
        this.addPeer(msg.id);
        this.onChange();
        break;
      case 'peer-left':
        this.peers.delete(msg.id);
        this.onChange();
        break;
      case 'snap': {
        const peer = this.peers.get(msg.id) ?? this.addPeer(msg.id);
        if (peer.buffer.push({ st: msg.st, s: msg.s })) peer.lastRecv = performance.now();
        break;
      }
      case 'error':
        this.error = msg.message;
        if (msg.code === 'room-not-found' || msg.code === 'room-full') this.wantRoom = null;
        this.setStatus(this.room ? 'in-room' : 'error');
        break;
    }
  }

  private addPeer(id: string): Peer {
    const peer: Peer = { id, buffer: new SnapshotBuffer(), lastRecv: 0 };
    this.peers.set(id, peer);
    return peer;
  }

  private send(msg: ClientMessage): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // Latest state wins on the way out too: if the socket is backed up, skip this message.
    if (msg.t === 'state' && socket.bufferedAmount > NET.maxBufferedBytes) return;
    socket.send(JSON.stringify(msg));
  }

  private setStatus(status: NetStatus): void {
    this.status = status;
    this.onChange();
  }
}
