// Phase 0 scaffold: a bare WebSocket server. Rooms and snapshots arrive in Phase 2 (ADR-0004, ADR-0005).
import { WebSocketServer } from 'ws';
import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION } from '../../shared/constants.js';

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const wss = new WebSocketServer({ port });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION }));
});

console.log(`dronefight server listening on ws://localhost:${port}`);
