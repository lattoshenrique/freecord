/**
 * Preload for the video picker's strip.
 *
 * Only the strip gets this. The view underneath — a stranger's page —
 * runs with no preload at all, so nothing here is reachable from it.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('videoPick', {
  /** The strings, the locale and the page being opened. */
  onOpen: (handler: (payload: unknown) => void) => {
    ipcRenderer.on('video-pick:open', (_event, payload: unknown) => handler(payload));
  },
  /** Everything the page has played so far, as it happens. */
  onFound: (handler: (sources: unknown) => void) => {
    ipcRenderer.on('video-pick:found', (_event, sources: unknown) => handler(sources));
  },
  /** Take what was found, or leave with nothing. */
  done: (take: boolean) => ipcRenderer.send('video-pick:done', take),
});
