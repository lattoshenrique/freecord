import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
