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
 *
 * Both windows are frameless: the title bar is drawn by the page, in the
 * product's own type and colours, instead of by the operating system. See
 * window-chrome.ts for the contract, and web/src/components/TitleBar.tsx for
 * the bar the app page draws.
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
import { pathToFileURL } from 'node:url';
import {
  createTranslator,
  pickerStrings,
  resolveLocale,
  videoPickStrings,
  type Locale,
  type StringKey,
} from './i18n';
import {
  attachDeepLinks,
  deepLinkFromArgv,
  deepLinkTarget,
  installDeepLinks,
  registerScheme,
} from './deep-link';
import { openVideoPicker } from './video-picker';
import { startUpdater } from './updater';
import { attachWindowChrome, installWindowChrome } from './window-chrome';

/** Production by default; `FREECORD_URL=http://localhost:5173` for dev. */
const APP_URL = process.env.FREECORD_URL ?? 'https://freecord.lattoshenrique.workers.dev';
const APP_ORIGIN = new URL(APP_URL).origin;
const SOURCE_URL = 'https://github.com/lattoshenrique/freecord';

const STATIC_DIR = path.join(__dirname, '..', 'static');
/** The same directory as a URL prefix — what `loadFile` puts in the address. */
const STATIC_URL = pathToFileURL(STATIC_DIR).href;

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
/** The tag our own pages get in `lang`: CJK line breaking depends on it. */
let locale: Locale = 'en-US';

function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * How a window of ours asks the system for no chrome.
 *
 * Windows and Linux get a frameless window and the page draws everything.
 * macOS keeps its traffic lights — they are the platform's own affordance and
 * an app without them reads as broken — and hides the rest of the bar; the
 * page leaves a gap for them (see `--titlebar-lights` in web/src/styles.css).
 * `trafficLightPosition` centres the three buttons in the bar's height.
 */
function frameOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
  return process.platform === 'darwin'
    ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 12 } }
    : { frame: false };
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
      width: 900,
      height: 660,
      minWidth: 560,
      minHeight: 460,
      title: t('pickerTitle'),
      backgroundColor: '#0b0d12',
      show: false,
      // Same chrome as the main window: the picker is part of the app, not a
      // system dialog that happens to be ours.
      ...frameOptions(),
      // A child window inherits the application menu on Windows and Linux;
      // a modal sheet with a File menu in it is nobody's design.
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.removeMenu();

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
      win.webContents.send('picker:sources', {
        sources,
        strings: pickerStrings(t),
        locale,
        // The page draws its own chrome, and what that costs differs per
        // platform: room for the traffic lights on macOS, our own close
        // button everywhere else.
        platform: process.platform,
        // Only Windows loops system audio into the capture (see below), so
        // only there may the picker promise it.
        systemAudio: process.platform === 'win32',
      });
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
 * Video picker
 * ------------------------------------------------------------------ */

/** One picking window at a time: a second would collect into the first. */
let pickingWindow = false;

/**
 * The page's way of asking for a window that can watch a site play.
 *
 * The video tool can read a page's markup from the edge, but a site that
 * builds its player only after a click hands a reader nothing. Here the
 * page is opened for real and we write down the media it asks for
 * (video-picker.ts). Two guards, both worth stating: only the app's own
 * window may ask — a stranger's page inside a picker must not be able to
 * open another one — and only one window at a time.
 */
function installVideoPicker(): void {
  ipcMain.handle('video:pick', async (event, url: unknown) => {
    const asking = BrowserWindow.fromWebContents(event.sender);
    if (asking !== mainWindow || !isAppUrl(event.sender.getURL())) {
      return [];
    }
    if (pickingWindow || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return [];
    }
    pickingWindow = true;
    try {
      return await openVideoPicker({
        parent: mainWindow,
        url,
        staticDir: STATIC_DIR,
        preload: path.join(__dirname, 'video-pick-preload.js'),
        strings: videoPickStrings(t),
        locale,
        frameOptions: frameOptions(),
      });
    } finally {
      pickingWindow = false;
    }
  });
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
          // Big enough to stay sharp on a HiDPI screen at card width.
          thumbnailSize: { width: 640, height: 360 },
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

/**
 * Opens a `freecord://` link in the window that is already there. Assigned on
 * ready; until then a link has nowhere to go and waits in `pendingLink`.
 */
let openDeepLink: ((raw: string) => void) | null = null;
/** A link that arrived before there was a window — macOS does that routinely. */
let pendingLink: string | null = null;

/** Hands a link to the window, or makes the window it needs. */
function handleDeepLink(raw: string): void {
  if (!openDeepLink) {
    // Before ready, which on macOS is where a link that launched the app
    // arrives: it waits, and opens the first window on the room itself.
    pendingLink = raw;
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    // macOS again: closing the window does not quit the app, and a link that
    // arrives then has nowhere to land until we build one.
    const target = deepLinkTarget(raw, APP_URL);
    if (target) {
      mainWindow = createWindow(target);
    }
    return;
  }
  openDeepLink(raw);
}

function createWindow(startUrl: string = APP_URL): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    title: 'Freecord',
    ...frameOptions(),
    // The menu still exists off screen on Windows and Linux — it is where the
    // accelerators live, and Alt is the fire exit if the page's own bar ever
    // fails to draw (window-chrome.ts arms that fallback).
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
          locale,
          // The window has no frame: this page carries the bar, so it needs
          // the labels and the platform to draw it (see offline.html).
          platform: process.platform,
          minimize: t('windowMinimize'),
          maximize: t('windowMaximize'),
          close: t('windowClose'),
        },
      });
    }
  });

  // Window buttons, live window state, and the fallback for a page that never
  // draws a bar: without a frame, that would be a window nobody can close.
  attachWindowChrome(win, (target) => {
    if (process.platform !== 'darwin') {
      target.setAutoHideMenuBar(false);
      target.setMenuBarVisibility(true);
    }
  });

  // Belt and braces with the mDNS switch above: 'default' exposes all
  // interfaces, so ICE can offer real host candidates for direct connections.
  win.webContents.setWebRTCIPHandlingPolicy('default');

  // A room link may reach this window at any moment; this is the half that
  // forgets the page's promise to route one when the page goes away.
  attachDeepLinks(win);

  void win.loadURL(startUrl);
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
  // Windows and Linux launch a whole second process for a `freecord://` link
  // and it lands here, in the instance that holds the lock, with the URL at
  // the end of its arguments.
  app.on('second-instance', (_event, argv) => {
    // The window comes forward either way: somebody just tried to open this
    // app, and a link we do not recognize is no reason to ignore them.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
    const link = deepLinkFromArgv(argv);
    if (link) {
      handleDeepLink(link);
    }
  });

  // macOS has no second process: it delivers the link to the running app, and
  // at cold start it does so *before* `whenReady` — which is why this listener
  // is out here and the link can wait.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  void app.whenReady().then(() => {
    // Locale is only reliable after the app is ready.
    t = createTranslator(app.getLocale());
    locale = resolveLocale(app.getLocale());
    configureSession();
    installVideoPicker();
    installWindowChrome({
      appUrl: APP_URL,
      sourceUrl: SOURCE_URL,
      // Only a window we opened, showing either the app's origin or one of
      // the pages we ship, may drive its window.
      isTrusted: (contents) => {
        const url = contents.getURL();
        return isAppUrl(url) || url.startsWith(STATIC_URL);
      },
    });
    registerScheme();
    const opener = installDeepLinks({
      appUrl: APP_URL,
      window: () => mainWindow,
      isTrusted: (contents) =>
        contents === mainWindow?.webContents && isAppUrl(contents.getURL()),
    });
    buildMenu();

    // A link that started the app opens the window straight on the room,
    // rather than loading the home and navigating off it a moment later. On
    // Windows and Linux it is in our own arguments; on macOS `open-url` has
    // already fired and left it in `pendingLink`.
    const startLink = pendingLink ?? deepLinkFromArgv(process.argv);
    pendingLink = null;
    const start = startLink ? deepLinkTarget(startLink, APP_URL) : null;
    mainWindow = createWindow(start ?? APP_URL);
    // Only now is there a window to open one in — and a link may have arrived
    // while it was being built.
    openDeepLink = opener;
    if (pendingLink) {
      opener(pendingLink);
      pendingLink = null;
    }
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
