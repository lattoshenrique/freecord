import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The published package points at dist/ for npm consumers; this app
    // builds from the workspace SOURCE so the relay worker rides the same
    // Vite pipeline (and no stale dist can sneak into the room).
    alias: {
      '@freecord/encoded-relay': fileURLToPath(new URL('../relay/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    // Workspace TS source with a `new Worker(new URL(...))` inside:
    // pre-bundling would flatten the worker away, so Vite must process it.
    exclude: ['@freecord/encoded-relay'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
