/**
 * Main process of the Freecord desktop app.
 *
 * The app is a **shell**: it loads the same page Cloudflare serves instead of
 * bundling a copy of the build. Every Worker deploy therefore reaches installed
 * apps immediately, and the client never drifts away from the server's
 * signaling protocol (both ends ship together — see docs/architecture.md).
 *
 * What the app adds over a browser, and why it exists at all:
 *
 * - **Its own screen picker.** In Electron `getDisplayMedia` has no native
 *   picker: without `setDisplayMediaRequestHandler`, screen sharing simply
 *   fails. Here it becomes a window of ours (`static/picker.html`).
 * - Media permissions decided in the main process, only for the app's origin.
 * - A dedicated window, a dock/taskbar icon and system shortcuts.
 */
import {
  BrowserWindow,
  Menu,
  app,
  desktopCapturer,
  dialog,
  ipcMain,
  session,
  shell,
  systemPreferences,
  webContents,
  type DesktopCapturerSource,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { createTranslator, pickerStrings, type StringKey } from './i18n';
import { startUpdater } from './updater';

/** Production by default; `FREECORD_URL=http://localhost:5173` for dev. */
const APP_URL = process.env.FREECORD_URL ?? 'https://freecord.lattoshenrique.workers.dev';
const APP_ORIGIN = new URL(APP_URL).origin;
const SOURCE_URL = 'https://github.com/lattoshenrique/freecord';

const STATIC_DIR = path.join(__dirname, '..', 'static');

// Command-line switches must land before `app.whenReady()` — Chromium reads
// them once, at startup, and only honors the *last* occurrence of each flag
// (so any future value must merge into these, comma-separated).
//
// mDNS masking hides host ICE candidates behind `.local` names, which breaks
// or degrades direct LAN connections on many networks. Dropping the mask
// reveals local IPs to peers — acceptable here because media is P2P-direct by
// design and the product already tells users a peer sees their IP.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
if (process.platform === 'linux') {
  // VA-API encode/decode is off by default in Chromium on Linux, and software
  // encode is the latency/CPU bottleneck for 1080p screen share. A harmless
  // no-op on machines without VA-API.
  app.commandLine.appendSwitch(
    'enable-features',
    'VaapiVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks',
  );
}

let mainWindow: BrowserWindow | null = null;
let t: (key: StringKey) => string = createTranslator('en-US');

function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Screen picker
 * ------------------------------------------------------------------ */

interface PickerSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
}

function toPickerSource(source: DesktopCapturerSource): PickerSource {
  return {
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
  };
}

/** Opens the chooser and resolves with the chosen id (null = cancelled). */
function openPicker(parent: BrowserWindow | null, sources: PickerSource[]): Promise<string | null> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      parent: parent ?? undefined,
      modal: Boolean(parent),
      width: 880,
      height: 640,
      minWidth: 520,
      minHeight: 420,
      title: t('pickerTitle'),
      backgroundColor: '#0b0d12',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });

    let settled = false;
    const finish = (id: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeListener('picker:choose', onChoose);
      resolve(id);
      if (!win.isDestroyed()) {
        win.close();
      }
    };
    // Closing the window is a cancellation — same path as the Cancel button.
    const onChoose = (event: Electron.IpcMainEvent, id: unknown) => {
      if (event.sender === win.webContents) {
        finish(typeof id === 'string' ? id : null);
      }
    };

    ipcMain.on('picker:choose', onChoose);
    win.on('closed', () => finish(null));
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('picker:sources', { sources, strings: pickerStrings(t) });
      win.show();
    });
    void win.loadFile(path.join(STATIC_DIR, 'picker.html'));
  });
}

/**
 * Screen capture permission on macOS. `not-determined` is deliberately let
 * through: it is `getSources()` that raises the system prompt, so blocking here
 * would mean never asking.
 */
async function screenAccessBlocked(parent: BrowserWindow | null): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status !== 'denied' && status !== 'restricted') {
    return false;
  }
  const options = {
    type: 'info' as const,
    title: t('screenPermissionTitle'),
    message: t('screenPermissionMessage'),
    detail: t('screenPermissionDetail'),
    buttons: [t('screenPermissionOpen'), t('screenPermissionLater')],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (response === 0) {
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Session: permissions and capture
 * ------------------------------------------------------------------ */

function configureSession(): void {
  const appSession = session.defaultSession;

  appSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const asking = request.frame ? webContents.fromFrame(request.frame) : null;
      const parent = (asking && BrowserWindow.fromWebContents(asking)) ?? mainWindow;
      if (await screenAccessBlocked(parent)) {
        callback({});
        return;
      }
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 480, height: 270 },
          fetchWindowIcons: true,
        });
        const chosen = await openPicker(parent, sources.map(toPickerSource));
        const source = sources.find((candidate) => candidate.id === chosen);
        // An empty object means cancelled: the site already treats that as
        // "the user closed the picker" and leaves the server's lock alone.
        //
        // Windows is the one platform where Chromium can capture system audio
        // ('loopback'); granting it here costs nothing — the track only exists
        // if the page asked for `audio: true` in getDisplayMedia.
        if (source) {
          callback(
            process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source },
          );
        } else {
          callback({});
        }
      } catch {
        callback({});
      }
    },
    // Our own picker on all three platforms: one behaviour to debug.
    { useSystemPicker: false },
  );

  // 'fullscreen' is here because Chromium asks for it on every
  // requestFullscreen(): without it the stage's fullscreen button does nothing
  // inside the app, while working in the browser.
  const MEDIA = new Set([
    'media',
    'display-capture',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
  ]);

  appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!MEDIA.has(permission) || !isAppUrl(details.requestingUrl || contents.getURL())) {
      callback(false);
      return;
    }
    if (permission !== 'media' || process.platform !== 'darwin') {
      callback(true);
      return;
    }
    // On macOS the permission that matters is the system one; ask only for
    // what is actually being used.
    const kinds = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    const wanted: Array<'camera' | 'microphone'> = kinds.map((kind) =>
      kind === 'video' ? 'camera' : 'microphone',
    );
    void Promise.all([...new Set(wanted)].map((kind) => systemPreferences.askForMediaAccess(kind)))
      .then((granted) => callback(granted.every(Boolean)))
      .catch(() => callback(false));
  });

  // Synchronous checks (enumerateDevices, autoplay): same origin rule.
  appSession.setPermissionCheckHandler((_contents, permission, origin) =>
    MEDIA.has(permission) && origin === APP_ORIGIN,
  );
}

/* ------------------------------------------------------------------ *
 * Window and menu
 * ------------------------------------------------------------------ */

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    title: 'Freecord',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      // The page is remote: the preload exposes nothing beyond the app version.
      additionalArguments: [`--freecord-version=${app.getVersion()}`],
    },
  });

  // External links (a pasted invite, GitHub) open in the browser; the app's own
  // navigation stays pinned to its origin.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Offline should not be a white screen: a local page with a retry link
  // (pointing at APP_URL, and navigating back to it is allowed).
  win.webContents.on('did-fail-load', (_event, errorCode, _desc, url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && isAppUrl(url)) {
      void win.loadFile(path.join(STATIC_DIR, 'offline.html'), {
        query: {
          url: APP_URL,
          title: t('offlineTitle'),
          body: t('offlineBody'),
          retry: t('offlineRetry'),
        },
      });
    }
  });

  // Belt and braces with the mDNS switch above: 'default' exposes all
  // interfaces, so ICE can offer real host candidates for direct connections.
  win.webContents.setWebRTCIPHandlingPolicy('default');

  void win.loadURL(APP_URL);
  return win;
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[])
      : ([
          {
            label: t('menuFile'),
            submenu: [{ role: 'quit', label: t('menuQuit') }],
          },
        ] satisfies MenuItemConstructorOptions[])),
    // Without an Edit menu, Cmd+C/Cmd+V stop working on macOS.
    { role: 'editMenu', label: t('menuEdit') },
    {
      label: t('menuView'),
      submenu: [
        { role: 'reload', label: t('menuReload') },
        { role: 'forceReload', label: t('menuForceReload') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menuResetZoom') },
        { role: 'zoomIn', label: t('menuZoomIn') },
        { role: 'zoomOut', label: t('menuZoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menuFullscreen') },
        { role: 'toggleDevTools', label: t('menuDevTools') },
      ],
    },
    { role: 'windowMenu', label: t('menuWindow') },
    {
      role: 'help',
      label: t('menuHelp'),
      submenu: [
        { label: t('menuOpenInBrowser'), click: () => void shell.openExternal(APP_URL) },
        { label: t('menuSourceCode'), click: () => void shell.openExternal(SOURCE_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

// A second instance only brings the existing window forward: two windows in
// the same room would mean two participants sharing one microphone.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    // Locale is only reliable after the app is ready.
    t = createTranslator(app.getLocale());
    configureSession();
    buildMenu();
    mainWindow = createWindow();
    // The page updates on every deploy; this keeps the shell itself fresh.
    // First check ~10 s after ready — it never competes with startup.
    startUpdater(APP_URL, t, () => mainWindow);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
