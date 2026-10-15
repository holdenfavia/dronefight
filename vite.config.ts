import { defineConfig } from 'vitest/config';

/**
 * Big libraries get their own chunks, so a game-code change doesn't make players re-download them
 * and they load in parallel. Supabase is only ever loaded on demand (sign-in or a saved session).
 */
const VENDOR_CHUNKS = [
  { name: 'three', test: /node_modules[\\/]three[\\/]/ },
  { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/ },
  { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
];

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rolldownOptions: {
      output: { codeSplitting: { groups: VENDOR_CHUNKS } },
    },
  },
  server: {
    port: 5173,
  },
  test: {
    root: '.',
    include: ['client/src/**/*.test.ts', 'shared/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
});
