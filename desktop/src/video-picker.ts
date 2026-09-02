/**
 * Picking a video by watching a page play it.
 *
 * The web half of the video tool reads a page's markup and finds what
 * the page admits to (server/src/domain/sources.ts). Plenty of sites
 * admit to nothing: the player is built by a script after somebody
 * clicks, and a fetcher that only reads HTML is handed an empty room.
 * A browser extension would solve it; so does a shell that can open the
 * page for real.
 *
 * That is all this is. The window loads the page, the person presses
 * play, and we write down the addresses of the media it then asks for.
 * Nothing is bypassed and nothing is decrypted — the page is doing
 * exactly what it does when you visit it, and we are reading our own
 * network log while it happens.
 *
 * The page is a stranger, and the window treats it as one:
 *
 *   - its own session, held in memory and gone when the window closes,
 *     so nothing it stores outlives the picking
 *   - no preload and no node integration, so there is no bridge of ours
 *     anywhere near it
 *   - every permission request denied — a page being read for a video
 *     has no business asking for a camera
 *   - new windows denied, so an ad script cannot open one behind the app
 *
 * The strip along the top is ours, in a view of its own: the page never
 * shares a renderer with our controls, and our controls never have to be
 * injected into somebody else's document.
 */
import {
  BaseWindow,
  WebContentsView,
  ipcMain,
  session,
  type BrowserWindow,
  type IpcMainEvent,
} from 'electron';
import path from 'node:path';

/** One thing the page loaded that could be played somewhere else. */
export interface PickedSource {
  play: 'file' | 'hls' | 'dash';
  url: string;
  /** What the address suggests it is — a quality, a file name. */
  label?: string;
  live?: boolean;
}

const MEDIA_EXTENSIONS: Record<string, PickedSource['play']> = {
  m3u8: 'hls',
  mpd: 'dash',
  mp4: 'file',
  m4v: 'file',
  webm: 'file',
  ogv: 'file',
  mov: 'file',
};

/** Content types worth recording when the address gives nothing away. */
function playForType(contentType: string): PickedSource['play'] | null {
  const type = contentType.toLowerCase();
  if (type.includes('mpegurl')) {
    return 'hls';
  }
  if (type.includes('dash+xml')) {
    return 'dash';
  }
  return /^\s*video\//.test(type) ? 'file' : null;
}

function playForUrl(url: string): PickedSource['play'] | null {
  try {
    const extension = /\.([a-z0-9]{2,4})$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
    return extension ? (MEDIA_EXTENSIONS[extension] ?? null) : null;
  } catch {
    return null;
  }
}

/** A quality out of the address, when it wears one. */
function labelFor(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    const numbered = /(?:^|[^\d])(240|360|480|540|576|720|1080|1440|2160)p?(?:[^\d]|$)/i.exec(pathname);
    if (numbered) {
      return `${numbered[1]}p`;
    }
    const named = /\/(sd|hd|fhd|fullhd|uhd|4k)\//i.exec(pathname);
    return named ? named[1]!.toUpperCase() : decodeURIComponent(pathname.split('/').pop() ?? '').slice(0, 40) || undefined;
  } catch {
    return undefined;
  }
}

/** How many sources one window may collect before it stops counting. */
const MAX_SOURCES = 12;
const STRIP_HEIGHT = 56;

export interface VideoPickerOptions {
  parent: BrowserWindow | null;
  url: string;
  staticDir: string;
  preload: string;
  /** Localized strings for the strip, drawn by the shell's own i18n. */
  strings: Record<string, string>;
  locale: string;
  frameOptions: Partial<Electron.BaseWindowConstructorOptions>;
}

/**
 * Opens the page and resolves with whatever it played. An empty list is
 * a perfectly good answer: the person closed the window, or nothing on
 * that page was a video after all.
 */
export function openVideoPicker(options: VideoPickerOptions): Promise<PickedSource[]> {
  return new Promise((resolve) => {
    const found = new Map<string, PickedSource>();

    const win = new BaseWindow({
      parent: options.parent ?? undefined,
      width: 1000,
      height: 720,
      minWidth: 560,
      minHeight: 420,
      title: options.strings.title ?? 'Freecord',
      backgroundColor: '#0b0d12',
      show: false,
      ...options.frameOptions,
      autoHideMenuBar: true,
    });

    const strip = new WebContentsView({
      webPreferences: {
        preload: options.preload,
        contextIsolation: true,
        sandbox: true,
      },
    });
    // A session of its own, with no `persist:` prefix — Electron keeps it
    // in memory, so the cookies a stranger's page sets are gone the
    // moment this window is.
    const siteSession = session.fromPartition(`video-pick-${Date.now()}`);
    const site = new WebContentsView({
      webPreferences: {
        session: siteSession,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    win.contentView.addChildView(strip);
    win.contentView.addChildView(site);

    const layout = (): void => {
      const { width, height } = win.getContentBounds();
      strip.setBounds({ x: 0, y: 0, width, height: STRIP_HEIGHT });
      site.setBounds({ x: 0, y: STRIP_HEIGHT, width, height: Math.max(0, height - STRIP_HEIGHT) });
    };
    layout();
    win.on('resize', layout);

    // Nothing the page asks for is granted. It is here to be watched,
    // not to be trusted.
    siteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    site.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const record = (url: string, play: PickedSource['play']): void => {
      if (found.size >= MAX_SOURCES || found.has(url) || !/^https?:/i.test(url)) {
        return;
      }
      found.set(url, {
        play,
        url,
        label: labelFor(url),
        // A manifest that keeps being re-fetched is a broadcast; one
        // fetched once is a recording. Close enough to say out loud,
        // and the room can always be told otherwise.
        live: play === 'hls' || undefined,
      });
      strip.webContents.send('video-pick:found', [...found.values()]);
    };

    siteSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const play = playForUrl(details.url);
      if (play) {
        record(details.url, play);
      }
      callback({});
    });
    // The address does not always say. The answer does.
    siteSession.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const header = Object.entries(details.responseHeaders ?? {}).find(
        ([name]) => name.toLowerCase() === 'content-type',
      );
      const play = header ? playForType(String(header[1])) : null;
      if (play) {
        record(details.url, play);
      }
      callback({});
    });

    let settled = false;
    const finish = (sources: PickedSource[]): void => {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeListener('video-pick:done', onDone);
      resolve(sources);
      if (!win.isDestroyed()) {
        win.close();
      }
      // The session goes with the window: nothing that page stored is
      // kept, and nothing it cached is offered to the next one.
      void siteSession.clearStorageData().catch(() => undefined);
    };

    /**
     * Who may end the picking, and on what terms.
     *
     * The strip may do either: it is the only view that has seen what
     * was found, so "use these" is its to say. The window that ASKED —
     * the app's own page — may only cancel. It never saw the sources,
     * so letting it claim them would be letting a page take delivery of
     * something it was not shown.
     *
     * Found by driving it: the page's `video.cancel()` went out on this
     * channel from the main window, the guard ignored it, and the
     * promise never resolved — leaving the shelf waiting on a window
     * nobody could dismiss from inside the app.
     */
    const asked = options.parent?.webContents ?? null;
    const onDone = (event: IpcMainEvent, take: unknown): void => {
      if (event.sender === strip.webContents) {
        finish(take === true ? [...found.values()] : []);
        return;
      }
      if (asked && event.sender === asked) {
        finish([]);
      }
    };
    ipcMain.on('video-pick:done', onDone);
    // Closing the window is a cancellation, the same as the Cancel key.
    win.on('closed', () => finish([]));

    strip.webContents.once('did-finish-load', () => {
      strip.webContents.send('video-pick:open', {
        strings: options.strings,
        locale: options.locale,
        url: options.url,
        platform: process.platform,
      });
      win.show();
    });

    void strip.webContents.loadFile(path.join(options.staticDir, 'video-pick.html'));
    // Whatever the page does with it, it does in its own view. A failure
    // to load is not our error to swallow: the strip stays, and the
    // person closes it.
    void site.webContents.loadURL(options.url).catch(() => undefined);
  });
}
