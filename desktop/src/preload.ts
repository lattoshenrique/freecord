/**
 * Preload for the main window.
 *
 * The page it loads is remote, so the exposed surface is as small as possible:
 * the "you are inside the app" mark — which the site uses to hide the download
 * button (web/src/lib/platform.ts) — the installed version, `capabilities`
 * (read-only booleans for what this shell can grant that a browser cannot) and
 * `window`, the four calls the page's own title bar needs.
 *
 * Flags are additive-safe — the site treats a missing flag as `false`, so old
 * shells and new pages (and vice versa) keep working. That is what makes the
 * title bar safe to ship on both sides at once: a page that finds no
 * `windowChrome` draws no bar, and a shell whose page draws no bar puts the
 * menu bar back (see window-chrome.ts).
 */
import { contextBridge, ipcRenderer } from 'electron';

const version =
  process.argv.find((arg) => arg.startsWith('--freecord-version='))?.split('=')[1] ?? '';

contextBridge.exposeInMainWorld('freecordDesktop', {
  version,
  platform: process.platform,
  capabilities: {
    // Screen share with system loopback audio — Windows only (see main.ts).
    systemAudio: process.platform === 'win32',
    // The window has no system title bar: the page is expected to draw one.
    windowChrome: true,
    // ...and on macOS to leave room for the traffic lights, which stay.
    trafficLights: process.platform === 'darwin',
  },
  window: {
    /** The bar is on screen. Until this arrives the shell assumes it is not. */
    ready: () => ipcRenderer.send('window:ready'),
    /** Maximized / full screen / focused, for the first paint of the bar. */
    state: () => ipcRenderer.invoke('window:state'),
    /** Subscribes to the same, live. Returns the unsubscribe. */
    onState: (handler: (state: unknown) => void) => {
      const listener = (_event: unknown, state: unknown) => handler(state);
      ipcRenderer.on('window:state', listener);
      return () => ipcRenderer.removeListener('window:state', listener);
    },
    /** One of the verbs in window-chrome.ts; anything else is ignored there. */
    run: (command: string) => ipcRenderer.send('window:command', command),
  },
});
