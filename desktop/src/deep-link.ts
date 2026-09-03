/**
 * Opening a room link in the app instead of in a browser.
 *
 * The link is the product: somebody pastes `https://…/r/<slug>#k=…` into a
 * chat and everyone clicks it. Installing the app must not make that link
 * worse, so the shell registers a scheme of its own — `freecord://r/<slug>` —
 * and the website hands off to it (`web/src/lib/deep-link.ts`).
 *
 * A link arrives from outside the app, which is the whole reason this file is
 * careful. Three rules it does not bend:
 *
 * 1. **A link only ever names a path, never a URL.** Whatever arrives is
 *    reduced to a path and matched against the routes the app actually has;
 *    the destination is then built against `APP_URL`. There is no input that
 *    makes this window load a page we do not serve — the origin is not taken
 *    from the link, it is not in the link at all.
 * 2. **The fragment is carried verbatim, and nothing else is.** `#k=…` is the
 *    chat key: drop it and the room opens unreadable. It never reaches a
 *    server, and the charset below refuses anything that could smuggle a
 *    second URL through it. The query string is dropped — no route reads one.
 * 3. **A link never opens a second window.** Two windows in one room is two
 *    participants sharing one microphone (the same reason the app takes the
 *    single-instance lock in main.ts).
 *
 * How the link reaches the window is per platform, and main.ts owns that:
 * macOS delivers `open-url` (possibly before the app is ready), Windows and
 * Linux put it in `process.argv` — of the first instance at cold start, of
 * the second one through `second-instance`.
 */
import { BrowserWindow, app, ipcMain, type WebContents } from 'electron';
import path from 'node:path';

/**
 * The scheme the shell claims. Mirrored in `web/src/lib/deep-link.ts`, which
 * writes the links, and declared to the installers in `desktop/package.json`
 * (`build.protocols`) — that is what actually registers it on a user's
 * machine; the call below is what makes it work for an unpacked dev run.
 */
export const SCHEME = 'freecord';

/** Slugs are 9 random bytes as base64url; the same generous range the site uses. */
const ROOM_PATH = /^\/r\/[A-Za-z0-9_-]{8,64}$/;

/** Every other route the app has. A link may name one; it may not name more. */
const PAGES = new Set(['/', '/community', '/how-it-works']);

/**
 * A fragment we are willing to put in the address bar. The chat key is
 * `#k=<43 chars of base64url>`, and this is deliberately wider than that —
 * the shell has no business knowing the key's shape — while still refusing
 * the characters a second URL would need.
 */
const SAFE_HASH = /^#[A-Za-z0-9_\-=&%.~+:/]{0,512}$/;

/**
 * The path a link names, from either shape it can arrive in.
 *
 * `freecord://r/abc` parses `r` as the host and `/abc` as the path;
 * `freecord:/r/abc` puts the whole thing in the path. They are the same link
 * and some launchers rewrite one into the other, so both are read here.
 */
function pathOf(url: URL): string {
  const route = `${url.hostname ? `/${url.hostname}` : ''}${url.pathname}`;
  return route.replace(/\/+$/, '') || '/';
}

/**
 * The page this link opens, as an absolute URL on the app's own origin — or
 * null for anything that is not one of our routes.
 */
export function deepLinkTarget(raw: string, appUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:`) {
    return null;
  }
  const route = pathOf(url);
  if (!ROOM_PATH.test(route) && !PAGES.has(route)) {
    return null;
  }
  const hash = SAFE_HASH.test(url.hash) ? url.hash : '';
  return new URL(`${route}${hash}`, appUrl).href;
}

/**
 * The link inside a command line, if there is one. Windows and Linux launch
 * the app with the URL appended to its arguments, next to whatever Chromium
 * switches happen to be there.
 */
export function deepLinkFromArgv(argv: readonly string[]): string | null {
  return argv.find((arg) => new RegExp(`^${SCHEME}:`, 'i').test(arg)) ?? null;
}

/**
 * Claim the scheme with the system.
 *
 * In a packaged app the installer already did it (`build.protocols`), and
 * this is a harmless confirmation. Unpacked — `npm run dev` — Electron would
 * otherwise register the `electron` binary with no script to run, so the
 * script it is running is passed along.
 */
export function registerScheme(): void {
  if (process.defaultApp) {
    const script = process.argv[1];
    if (script) {
      app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(script)]);
    }
    return;
  }
  app.setAsDefaultProtocolClient(SCHEME);
}

/**
 * Pages that told us they can route a link themselves.
 *
 * A `loadURL` would work every time and is the fallback, but inside the app
 * it is a full reload of a live client — a call dropped and rejoined to open
 * a link that the router could have handled in a frame. So the page says it
 * is listening, and until it does the shell assumes it is not: an old build,
 * our own offline page, or a page whose script never ran all mean "reload",
 * which is the outcome that always works.
 *
 * Kept per `WebContents` and cleared on every load, so the flag can never
 * outlive the page that set it.
 */
const routing = new WeakSet<WebContents>();

export interface DeepLinkOptions {
  /** Where the app's pages live; every target is built against it. */
  appUrl: string;
  /** The window a link should land in, or null when there is none yet. */
  window: () => BrowserWindow | null;
  /** True only for a window we opened on a page we serve. */
  isTrusted: (contents: WebContents) => boolean;
}

/**
 * Wires the page's half of the contract and returns the opener: give it
 * whatever arrived from the system, and it does the rest (or nothing at all,
 * for a link that names no route of ours).
 */
export function installDeepLinks(options: DeepLinkOptions): (raw: string) => void {
  ipcMain.on('deep-link:ready', (event) => {
    if (options.isTrusted(event.sender)) {
      routing.add(event.sender);
    }
  });

  return (raw: string) => {
    const target = deepLinkTarget(raw, options.appUrl);
    const win = options.window();
    if (!target || !win || win.isDestroyed()) {
      return;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
    // Already there: someone pasted the link of the room they are in, and a
    // reload would drop the call to arrive where it already is.
    if (win.webContents.getURL() === target) {
      return;
    }
    if (routing.has(win.webContents)) {
      win.webContents.send('deep-link:open', target);
    } else {
      void win.loadURL(target);
    }
  };
}

/**
 * Forgets a window's promise to route as soon as it starts replacing the main
 * document: the page that made it is going away. This must happen at the
 * beginning, not on `did-finish-load` — the page announces itself from a React
 * effect, which runs before the window's `load` event, so clearing at the end
 * would throw away the promise the new page had already made. An in-page
 * router navigation keeps the same document, and keeps its flag.
 *
 * Read from the event object, never from the positional arguments beside it.
 * Electron still passes `(event, url, isInPlace, isMainFrame)` and has marked
 * them deprecated; the version that drops them would leave both undefined, the
 * condition below would stop being true, and the flag would survive the page
 * that set it. That failure does not degrade to a reload — it is a `send()`
 * into a page that is not listening, and the link is lost with no error. This
 * file's one rule is that doubt costs a reload, so it may not rest on an
 * argument whose removal is already announced.
 */
export function attachDeepLinks(win: BrowserWindow): void {
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      routing.delete(win.webContents);
    }
  });
}
