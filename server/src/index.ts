// dronefight room server (ADR-0005): WebSocket, room codes, latest-state-wins relay (ADR-0004).
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION } from '../../shared/constants.js';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { RoomManager } from './rooms.js';
import { serveStatic } from './static.js';

const HEARTBEAT_MS = 10_000;
/** Match timers and in-flight rounds advance at this rate. */
const TICK_HZ = 60;
const MAX_MESSAGE_BYTES = 2048;

/** The built client (`npm run build`). Served from the same port as the WebSocket when present (ADR-0021). */
const CLIENT_DIR = fileURLToPath(new URL('../../dist/client/', import.meta.url));

export function startServer(port: number, staticDir: string | null = null): { wss: WebSocketServer; rooms: RoomManager } {
  const rooms = new RoomManager(() => performance.now());
  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (staticDir) serveStatic(staticDir, req, res);
    else res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });
  http.listen(port);
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
  const tick = setInterval(() => rooms.tick(), 1000 / TICK_HZ);
  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(tick);
    http.close();
  });

  return { wss, rooms };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const serveClient = process.env.SERVE_CLIENT === '1';
  const { rooms } = startServer(port, serveClient ? CLIENT_DIR : null);
  console.log(`dronefight server listening on port ${port}${serveClient ? ' (serving the client)' : ''}`);
  setInterval(() => {
    const s = rooms.stats();
    if (s.players > 0) console.log(`rooms=${s.rooms} players=${s.players} droppedSnapshots=${s.droppedSnapshots}`);
  }, 30_000);
}
