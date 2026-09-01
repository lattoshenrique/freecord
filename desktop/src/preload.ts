/**
 * Preload for the main window.
 *
 * The page it loads is remote, so the exposed surface is as small as possible:
 * only the "you are inside the app" mark — which the site uses to hide the
 * download button (web/src/lib/platform.ts) — the installed version, and
 * `capabilities`: read-only booleans for what this shell can grant that a
 * browser cannot. Flags are additive-safe — the site treats a missing flag as
 * `false`, so old shells and new pages (and vice versa) keep working.
 */
import { contextBridge } from 'electron';

const version =
  process.argv.find((arg) => arg.startsWith('--freecord-version='))?.split('=')[1] ?? '';

contextBridge.exposeInMainWorld('freecordDesktop', {
  version,
  platform: process.platform,
  capabilities: {
    // Screen share with system loopback audio — Windows only (see main.ts).
    systemAudio: process.platform === 'win32',
  },
});
