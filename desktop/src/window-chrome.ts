/**
 * The window's own chrome.
 *
 * The shell draws no system title bar. A native strip of Windows grey above a
 * Freecord window is the one part of the app the product does not get to
 * design, and it is the first thing anyone sees — so the window is frameless
 * and the page paints the bar itself, in the same type, colours and mark as
 * everything under it (web/src/components/TitleBar.tsx).
 *
 * macOS is the exception that proves the rule: there the traffic lights stay,
 * because on that platform they *are* the identity — an app without them
 * reads as broken. `titleBarStyle: 'hidden'` keeps the three buttons and
 * removes everything else, and the page leaves room for them.
 *
 * This module is the whole contract between the two sides:
 *
 * - the page asks for a window command (`window:command`) — the same verbs the
 *   application menu carries, and nothing else;
 * - the main process answers with the window's state (`window:state`), so the
 *   maximize button can draw itself as restore and the bar can step aside in
 *   full screen;
 * - the page reports that it drew a bar (`window:ready`). A window with no
 *   frame and no bar would be a window nobody can close, so a page that never
 *   reports back gets the menu bar put back (see `attachWindowChrome`).
 *
 * Every command is checked twice: it must name one of the verbs below, and it
 * must come from a window we opened on a page we serve (`isTrusted`).
 */
import { BrowserWindow, app, ipcMain, shell, type WebContents } from 'electron';

/** What the bar needs to know about the window it is drawn on. */
export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
  focused: boolean;
}

/**
 * Everything the page may ask of its window. The view commands mirror the
 * application menu (main.ts) rather than replacing it: the accelerators still
 * come from there, this is the same list with our own face on it.
 */
const COMMANDS = [
  'minimize',
  'toggle-maximize',
  'close',
  'reload',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'fullscreen',
  'devtools',
  'open-browser',
  'source',
  'quit',
] as const;

export type WindowCommand = (typeof COMMANDS)[number];

/** Chromium's own step and a sane ceiling: ±3 is 4× and ¼ of the page. */
const ZOOM_STEP = 0.5;
const ZOOM_LIMIT = 3;

/**
 * How long a page gets to draw its own bar before we assume it never will.
 * Generous on purpose: this only fires on a page that loaded and then failed
 * to run, and the cost of firing early is a menu bar nobody asked for.
 */
const CHROME_TIMEOUT_MS = 12_000;

function isCommand(value: unknown): value is WindowCommand {
  return typeof value === 'string' && (COMMANDS as readonly string[]).includes(value);
}

function stateOf(win: BrowserWindow): WindowState {
  return {
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
    focused: win.isFocused(),
  };
}

function zoomBy(contents: WebContents, step: number): void {
  const next = contents.getZoomLevel() + step;
  contents.setZoomLevel(Math.max(-ZOOM_LIMIT, Math.min(ZOOM_LIMIT, next)));
}

function run(command: WindowCommand, win: BrowserWindow, links: Links): void {
  const contents = win.webContents;
  switch (command) {
    case 'minimize':
      win.minimize();
      return;
    case 'toggle-maximize':
      // Full screen first: the maximize button is the only way back out of a
      // full screen the page itself asked for.
      if (win.isFullScreen()) {
        win.setFullScreen(false);
      } else if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      return;
    case 'close':
      win.close();
      return;
    case 'reload':
      contents.reload();
      return;
    case 'zoom-in':
      zoomBy(contents, ZOOM_STEP);
      return;
    case 'zoom-out':
      zoomBy(contents, -ZOOM_STEP);
      return;
    case 'zoom-reset':
      contents.setZoomLevel(0);
      return;
    case 'fullscreen':
      win.setFullScreen(!win.isFullScreen());
      return;
    case 'devtools':
      contents.toggleDevTools();
      return;
    case 'open-browser':
      void shell.openExternal(links.appUrl);
      return;
    case 'source':
      void shell.openExternal(links.sourceUrl);
      return;
    case 'quit':
      app.quit();
  }
}

interface Links {
  appUrl: string;
  sourceUrl: string;
}

export interface ChromeOptions extends Links {
  /** True only for a window we opened on a page we serve. */
  isTrusted: (contents: WebContents) => boolean;
}

/** Wires the two channels the bar talks over. Call once, after `whenReady`. */
export function installWindowChrome(options: ChromeOptions): void {
  const windowOf = (contents: WebContents): BrowserWindow | null =>
    options.isTrusted(contents) ? BrowserWindow.fromWebContents(contents) : null;

  ipcMain.on('window:command', (event, command: unknown) => {
    const win = windowOf(event.sender);
    if (win && isCommand(command)) {
      run(command, win, options);
    }
  });

  // The bar's first paint needs the state it is drawing, and it mounts long
  // after the window did — hence a request, not only the broadcast below.
  ipcMain.handle('window:state', (event) => {
    const win = windowOf(event.sender);
    return win ? stateOf(win) : null;
  });
}

/**
 * Keeps one window's bar in step, and puts the menu bar back for a page that
 * never draws one.
 *
 * The watchdog is armed on every load, not only the first: an old build
 * cached by the browser, a page whose script failed, our own offline page —
 * any of them would otherwise leave a window with no way to close it. The
 * menu bar is not the design, it is the fire exit.
 */
export function attachWindowChrome(
  win: BrowserWindow,
  onChromeMissing: (win: BrowserWindow) => void,
): void {
  const publish = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window:state', stateOf(win));
    }
  };
  // Everything that can change what the bar draws. 'resized' rather than
  // 'resize': a window snapped to half the screen stops being maximized
  // without ever emitting 'unmaximize' on Windows.
  win.on('maximize', publish);
  win.on('unmaximize', publish);
  win.on('enter-full-screen', publish);
  win.on('leave-full-screen', publish);
  win.on('resized', publish);
  win.on('focus', publish);
  win.on('blur', publish);

  let watchdog: NodeJS.Timeout | null = null;
  const disarm = () => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };

  const onReady = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents) {
      disarm();
      publish();
    }
  };
  ipcMain.on('window:ready', onReady);

  win.webContents.on('did-finish-load', () => {
    disarm();
    watchdog = setTimeout(() => {
      watchdog = null;
      if (!win.isDestroyed()) {
        onChromeMissing(win);
      }
    }, CHROME_TIMEOUT_MS);
  });

  win.on('closed', () => {
    disarm();
    ipcMain.removeListener('window:ready', onReady);
  });
}
