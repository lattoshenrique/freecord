import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { version } from './package.json';

/**
 * The build id is the short commit hash, stamped at build time. Uncommitted
 * changes get a '+' so a screenshot of the footer never lies about being a
 * released build. Outside a git checkout (a source tarball) it says so.
 */
function buildId(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return dirty ? `${sha}+` : sha;
  } catch {
    return 'nogit';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(buildId()),
  },
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
