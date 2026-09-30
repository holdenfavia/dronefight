import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
  test: {
    root: '.',
    include: ['client/src/**/*.test.ts', 'shared/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
});
