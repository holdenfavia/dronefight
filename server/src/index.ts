// dronefight server (ADR-0021): serves the built client and the room WebSocket on one port.
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION } from '../../shared/constants.js';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { DT } from '../../shared/fighter/config.js';
import { RoomManager } from './rooms.js';
import { serveStatic } from './static.js';

const HEARTBEAT_MS = 10_000;
const MAX_MESSAGE_BYTES = 4096;
/** How often the fight loop wakes; it steps every fight at a steady 60 Hz (ADR-0076). */
const LOOP_MS = 4;
/** Most frames one wake catches up after a stall, so a hiccup never fast-forwards a fight. */
const MAX_CATCH_UP_FRAMES = 6;

/** The built client (`npm run build`). */
const CLIENT_DIR = fileURLToPath(new URL('../../dist/client/', import.meta.url));

export function startServer(port: number, staticDir: string | null = null): { wss: WebSocketServer; rooms: RoomManager } {
  const rooms = new RoomManager();
  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (staticDir) serveStatic(staticDir, req, res);
    else res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });
  // Port already taken (e.g. `npm run server` running beside `npm run dev`): say so instead of crashing.
  http.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') console.warn(`dronefight server: port ${port} is already in use; using the server already running there`);
    else console.error('dronefight server:', e);
  });
  http.listen(port);
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket) => {
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    socket.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL_VERSION } satisfies ServerMessage));
    socket.on('message', (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) {
        socket.send(JSON.stringify({ t: 'error', code: 'bad-message', message: 'Unrecognized message' } satisfies ServerMessage));
        return;
      }
      rooms.handle(socket, msg);
    });
    socket.on('close', () => rooms.leave(socket));
    socket.on('error', () => rooms.leave(socket));
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
  // Online fights: step at 60 Hz, then send each room what was stepped.
  let last = performance.now();
  let acc = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    acc += (now - last) / 1000;
    last = now;
    let steps = 0;
    while (acc >= DT && steps < MAX_CATCH_UP_FRAMES) {
      rooms.tick();
      acc -= DT;
      steps++;
    }
    if (steps === MAX_CATCH_UP_FRAMES) acc = 0;
    if (steps) rooms.flushAll();
  }, LOOP_MS);
  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(loop);
    http.close();
  });
  return { wss, rooms };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const serveClient = process.env.SERVE_CLIENT === '1';
  startServer(port, serveClient ? CLIENT_DIR : null);
  console.log(`dronefight server listening on port ${port}${serveClient ? ' (serving the client)' : ''}`);
}
