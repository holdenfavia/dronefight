import { PROTOCOL_VERSION } from '../../../shared/constants';
import { parseClientMessage, type ServerMessage } from '../../../shared/protocol';
import { RoomManager, type Connection } from '../../../server/src/rooms';

/**
 * Solo runs a room in the page (ADR-0067): the same RoomManager and Match the Fly server runs, reached through a
 * socket-shaped loopback, so solo and Training play by exactly the rules online rooms do. Nothing is queued
 * beyond the current task (Hard rule 1).
 */

/** The slice of a WebSocket NetClient uses. */
export interface SocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export const SOCKET_CONNECTING = 0;
export const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;

/** Match timers and in-flight rounds advance at the same rate as on the server. */
const TICK_HZ = 60;

let rooms: RoomManager | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let open = 0;

function server(): RoomManager {
  // Nobody is away in your own room, and solo earns no XP (ADR-0067).
  rooms ??= new RoomManager(() => performance.now(), Math.random, undefined, { afk: false });
  return rooms;
}

class LocalSocket implements SocketLike {
  readyState = SOCKET_CONNECTING;
  readonly bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly conn: Connection;

  constructor() {
    this.conn = {
      bufferedAmount: 0,
      send: (data: string) => {
        if (this.readyState === SOCKET_OPEN) this.onmessage?.({ data });
      },
    };
    queueMicrotask(() => {
      if (this.readyState !== SOCKET_CONNECTING) return;
      this.readyState = SOCKET_OPEN;
      server().connect(this.conn);
      if (open++ === 0) ticker = setInterval(() => rooms?.tick(), 1000 / TICK_HZ);
      this.onopen?.();
      this.conn.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL_VERSION, st: performance.now() } satisfies ServerMessage));
    });
  }

  send(data: string): void {
    if (this.readyState !== SOCKET_OPEN) return;
    const msg = parseClientMessage(data);
    if (msg) server().handle(this.conn, msg);
  }

  close(): void {
    if (this.readyState === SOCKET_CLOSED) return;
    const wasOpen = this.readyState === SOCKET_OPEN;
    this.readyState = SOCKET_CLOSED;
    if (wasOpen) {
      server().disconnect(this.conn);
      // Nothing to tick while nobody is connected (Hard rule 2).
      if (--open === 0 && ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    }
    this.onclose?.();
  }
}

export function localSocket(): SocketLike {
  return new LocalSocket();
}
