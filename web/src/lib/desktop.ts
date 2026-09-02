/**
 * The desktop shell, from the page's side.
 *
 * In the app this page runs inside an Electron window with **no system title
 * bar**: the shell asks for a frameless window and the page draws the bar
 * itself, so the product looks the same in the browser and in the app instead
 * of wearing a strip of Windows above it. See desktop/src/window-chrome.ts for
 * the other half.
 *
 * The two halves ship separately — the shell is installed, the page is
 * deployed — so nothing here assumes a shape. A bridge that is absent, a
 * capability that is missing, a call that is not a function: all of them mean
 * "browser", and the page simply draws no bar. That is what lets an old shell
 * run a new page (no `windowChrome`, so no bar and the system frame is still
 * there) and a new shell run an old page (no bar drawn, so the shell puts the
 * menu bar back — a frameless window nobody can close is the one outcome we
 * cannot ship).
 */
import type { MessageKey } from '../i18n/locales/en-US';

/** What the bar needs to know about the window it is drawn on. */
export interface DesktopWindowState {
  maximized: boolean;
  fullScreen: boolean;
  focused: boolean;
}

/**
 * Everything the page may ask of its window. Mirrors `WindowCommand` in
 * desktop/src/window-chrome.ts, which whitelists them again on arrival — a
 * command this side invents is ignored, not obeyed.
 */
export type WindowCommand =
  | 'minimize'
  | 'toggle-maximize'
  | 'close'
  | 'reload'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'fullscreen'
  | 'devtools'
  | 'open-browser'
  | 'source'
  | 'quit';

export interface DesktopWindowApi {
  /** "The bar is on screen" — until this lands the shell assumes it is not. */
  ready(): void;
  state(): Promise<unknown>;
  onState(handler: (state: unknown) => void): () => void;
  run(command: WindowCommand): void;
}

export interface DesktopBridge {
  version?: unknown;
  platform?: unknown;
  capabilities?: {
    systemAudio?: unknown;
    windowChrome?: unknown;
    trafficLights?: unknown;
    videoPicker?: unknown;
    deepLinks?: unknown;
  };
  window?: Partial<Record<keyof DesktopWindowApi, unknown>>;
  video?: Partial<Record<keyof DesktopVideoPicker, unknown>>;
  deepLink?: Partial<Record<keyof DesktopDeepLinks, unknown>>;
}

/**
 * Room links arriving from outside the app.
 *
 * The shell claims `freecord://` with the system; this is how a page that is
 * already running gets one, instead of the window being reloaded on it. A
 * shell built before this existed simply has none of it, and opens links the
 * way it always did (desktop/src/deep-link.ts).
 */
export interface DesktopDeepLinks {
  /** "I will route links myself." Until it lands, the shell reloads instead. */
  ready(): void;
  /** A room to open, as an absolute URL. Returns the unsubscribe. */
  onOpen(handler: (url: unknown) => void): () => void;
}

/**
 * Opening a page in a window of its own to see what it plays.
 *
 * The web half of the watch tool can read a page, but not run it: a site
 * that builds its player only after somebody clicks hands a fetcher
 * nothing. The shell can — it opens the page for real, the person presses
 * play, and it writes down the media the page then asks for
 * (desktop/src/video-picker.ts).
 */
export interface DesktopVideoPicker {
  /** Resolves with what that window saw, or an empty list. */
  pick(url: string): Promise<unknown>;
  /** Closes the window without waiting for it. */
  cancel(): void;
}

interface BridgeHost {
  freecordDesktop?: DesktopBridge;
}

/**
 * The bridge the shell's preload exposed, if this is running inside one.
 * Guarded for the places with no window at all — the unit tests, and any
 * prerender that might one day import this.
 */
export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as unknown as BridgeHost).freecordDesktop;
}

/**
 * The window controls, or null when nothing should be drawn: outside the app,
 * on a shell that still draws its own frame, or on one whose bridge is missing
 * a call this bar depends on.
 */
export function windowChrome(bridge = desktopBridge()): DesktopWindowApi | null {
  if (bridge?.capabilities?.windowChrome !== true) {
    return null;
  }
  const api = bridge.window;
  const calls = ['ready', 'state', 'onState', 'run'] as const;
  if (!api || calls.some((call) => typeof api[call] !== 'function')) {
    return null;
  }
  return api as unknown as DesktopWindowApi;
}

/**
 * The picker, or null when there is nothing to open a window with:
 * in a browser, or on a shell built before this existed. Same shape as
 * `windowChrome` above and for the same reason — the shell is installed
 * and the page is deployed, so neither may assume the other's version,
 * and the tool simply does not offer the button.
 */
export function videoPicker(bridge = desktopBridge()): DesktopVideoPicker | null {
  if (bridge?.capabilities?.videoPicker !== true) {
    return null;
  }
  const api = bridge.video;
  const calls = ['pick', 'cancel'] as const;
  if (!api || calls.some((call) => typeof api[call] !== 'function')) {
    return null;
  }
  return api as unknown as DesktopVideoPicker;
}

/**
 * The link channel, or null when there is nothing on the other end: a
 * browser, or a shell from before the app claimed a scheme of its own. Same
 * shape as the two above, and for the same reason — the two halves ship
 * separately, so neither may assume the other's version.
 */
export function deepLinks(bridge = desktopBridge()): DesktopDeepLinks | null {
  if (bridge?.capabilities?.deepLinks !== true) {
    return null;
  }
  const api = bridge.deepLink;
  const calls = ['ready', 'onOpen'] as const;
  if (!api || calls.some((call) => typeof api[call] !== 'function')) {
    return null;
  }
  return api as unknown as DesktopDeepLinks;
}

/** True where the platform keeps its own buttons and the bar makes room. */
export function hasTrafficLights(bridge = desktopBridge()): boolean {
  return bridge?.capabilities?.trafficLights === true;
}

/** Narrows what came over the bridge; a malformed state is simply ignored. */
export function isWindowState(value: unknown): value is DesktopWindowState {
  const state = value as Partial<DesktopWindowState> | null;
  return (
    typeof state === 'object' &&
    state !== null &&
    typeof state.maximized === 'boolean' &&
    typeof state.fullScreen === 'boolean' &&
    typeof state.focused === 'boolean'
  );
}

/**
 * What the bar writes in the middle: where you are, not what the page is
 * called. The room deliberately has no name of its own here — the slug is the
 * credential and the title bar is the first thing in any screenshot.
 */
export function titleBarLabel(pathname: string): MessageKey | null {
  if (pathname.startsWith('/r/')) {
    return 'desktop.window.room';
  }
  if (pathname.startsWith('/community')) {
    return 'home.community';
  }
  if (pathname.startsWith('/how-it-works')) {
    return 'how.link';
  }
  return null;
}
