import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

/** Port of the room server in development (shared/constants.ts DEFAULT_SERVER_PORT). */
const ROOM_SERVER_PORT = 8787;

/**
 * `npm run dev` also starts the room server (ADR-0075), so the Online lobby works with one command.
 * The page reaches it through the `/ws` proxy below; production serves both on one port (ADR-0021).
 */
function roomServer(): Plugin {
  return {
    name: 'dronefight-room-server',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.VITEST) return;
      const entry = fileURLToPath(new URL('./server/src/index.ts', import.meta.url));
      const mod = (await server.ssrLoadModule(entry)) as typeof import('./server/src/index');
      mod.startServer(ROOM_SERVER_PORT);
    },
  };
}

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  plugins: [roomServer()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${ROOM_SERVER_PORT}`, ws: true },
    },
  },
  test: {
    root: '.',
    include: ['client/src/**/*.test.ts', 'shared/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
});
