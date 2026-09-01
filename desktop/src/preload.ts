/**
 * Preload for the main window.
 *
 * The page it loads is remote, so the exposed surface is as small as possible:
 * only the "you are inside the app" mark — which the site uses to hide the
 * download button (web/src/lib/platform.ts) — and the installed version.
 */
import { contextBridge } from 'electron';

const version =
  process.argv.find((arg) => arg.startsWith('--freecord-version='))?.split('=')[1] ?? '';

contextBridge.exposeInMainWorld('freecordDesktop', {
  version,
  platform: process.platform,
});
