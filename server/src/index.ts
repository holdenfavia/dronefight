// dronefight room server (ADR-0005): WebSocket, room codes, latest-state-wins relay (ADR-0004).
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION } from '../../shared/constants.js';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { RoomManager } from './rooms.js';

const HEARTBEAT_MS = 10_000;
const MAX_MESSAGE_BYTES = 2048;

export function startServer(port: number): { wss: WebSocketServer; rooms: RoomManager } {
  const rooms = new RoomManager(() => performance.now());
  const wss = new WebSocketServer({ port, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket) => {
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    rooms.connect(socket);
    socket.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL_VERSION, st: performance.now() } satisfies ServerMessage));

    socket.on('message', (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) {
        socket.send(JSON.stringify({ t: 'error', code: 'bad-message', message: 'Unrecognized message' } satisfies ServerMessage));
        return;
      }
      rooms.handle(socket, msg);
    });
    socket.on('close', () => rooms.disconnect(socket));
    socket.on('error', () => rooms.disconnect(socket));
  });

  // Drop connections that stop answering, so dead players leave their room.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.get(socket)) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return { wss, rooms };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const { rooms } = startServer(port);
  console.log(`dronefight server listening on ws://localhost:${port}`);
  setInterval(() => {
    const s = rooms.stats();
    if (s.players > 0) console.log(`rooms=${s.rooms} players=${s.players} droppedSnapshots=${s.droppedSnapshots}`);
  }, 30_000);
}
