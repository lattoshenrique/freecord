/** Preload for the screen picker: receives the sources, returns the choice. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('picker', {
  onSources: (handler: (payload: unknown) => void) => {
    ipcRenderer.on('picker:sources', (_event, payload: unknown) => handler(payload));
  },
  choose: (id: string | null) => ipcRenderer.send('picker:choose', id),
});
