/**
 * Installing Freecord from the browser.
 *
 * On a phone there is nothing to download — the app IS the page, and the
 * platform will add it to the home screen if we ask. What the browser gives
 * us to ask with is uneven, so this module normalizes it into four states the
 * UI can render without knowing whose browser it is:
 *
 *  - `installed`   — already running from the home screen. Say nothing.
 *  - `prompt`      — Chromium fired `beforeinstallprompt`; one tap installs.
 *  - `manual`      — installable, but only through a menu the page cannot
 *    open: every browser on iOS (Share → Add to Home Screen) and the ones
 *    on Android that never fire the event. Instructions, not a button.
 *  - `unavailable` — nothing honest to offer.
 *
 * The `beforeinstallprompt` listener is installed when this module is
 * imported, not when a component mounts: Chromium fires it once, early, and
 * an event nobody was listening for is an install offer we can never make
 * again in that page's life.
 *
 * The service worker registration lives here too, because it is the same
 * feature: without a worker the browser will not offer to install at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { APP_BUILD, APP_VERSION } from './build-info';
import { isDesktopApp } from './platform';

/**
 * Chromium's install event. Not in lib.dom, and deliberately described here
 * rather than declared globally: this is the only file that touches it.
 */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'prompt' | 'manual' | 'unavailable';

/** How someone installs by hand, which decides which instructions to show. */
export type ManualRoute = 'ios' | 'menu';

export interface InstallProbe {
  /** Already launched from the home screen or a window of its own. */
  standalone: boolean;
  /** The browser handed us an install event we are still holding. */
  prompted: boolean;
  /** A phone or a tablet: the platforms where installing beats downloading. */
  mobile: boolean;
}

/**
 * The state, from three facts. Pure so the decision is testable without a
 * browser — the same shape `detectPlatform` uses in lib/platform.ts.
 *
 * `mobile` is what turns a missing event into instructions instead of
 * silence: a phone can always install, even where the event never comes.
 */
export function installState({ standalone, prompted, mobile }: InstallProbe): InstallState {
  if (standalone) {
    return 'installed';
  }
  if (prompted) {
    return 'prompt';
  }
  return mobile ? 'manual' : 'unavailable';
}

/**
 * Which by-hand route to describe. Every browser on iOS is WebKit and every
 * one of them installs through the system Share sheet; everywhere else the
 * item lives in the browser's own menu.
 */
export function manualRoute(probe: { userAgent: string; maxTouchPoints?: number }): ManualRoute {
  const ua = probe.userAgent;
  // An iPad reporting itself as a Macintosh is still iOS — touch gives it
  // away, the same tell lib/platform.ts uses.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && (probe.maxTouchPoints ?? 0) > 1);
  return ios ? 'ios' : 'menu';
}

/** Running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  // Safari on iOS predates display-mode and answers this instead.
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  if (typeof window.matchMedia !== 'function') {
    return false;
  }
  return ['standalone', 'minimal-ui', 'fullscreen'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

/* ---- the held event, and who is watching for it ---- */

let deferred: InstallPromptEvent | null = null;
let installed = false;
const watchers = new Set<() => void>();

function announce() {
  for (const watcher of watchers) {
    watcher();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Held, not shown: Chromium's own bar would land wherever it likes, and
    // the offer belongs where the download link used to be.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    announce();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    announce();
  });
}

/** What `install()` could do about it. */
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * The install state, live: it changes when the browser hands us the event
 * (which can be after the first render) and when the app is installed.
 *
 * `mobile` comes from the caller because the page has already worked out the
 * visitor's platform for the desktop download, and asking twice would mean
 * two answers that can disagree.
 */
export function useInstall(mobile: boolean): {
  state: InstallState;
  install: () => Promise<InstallOutcome>;
} {
  const [, bump] = useState(0);
  useEffect(() => {
    const watcher = () => bump((n) => n + 1);
    watchers.add(watcher);
    return () => {
      watchers.delete(watcher);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferred;
    if (!event) {
      return 'unavailable';
    }
    // Spent either way: Chromium refuses a second prompt() on the same event
    // and fires a fresh one if the person may be asked again.
    deferred = null;
    announce();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  }, []);

  return {
    state: installState({
      standalone: installed || isStandalone(),
      prompted: deferred !== null,
      mobile,
    }),
    install,
  };
}

/**
 * Register the worker that makes the browser offer to install.
 *
 * Three deliberate silences. Not in dev, where the worker would sit between
 * Vite and the page for no gain. Not in the desktop app, which is a shell
 * around the production page and has its own update path — a worker there
 * would be a second, slower one. And never noisily: a browser that refuses
 * the registration loses the install offer, not the app.
 *
 * The build id rides in the query string so a deploy is a new worker script
 * to the browser, and `activate` can drop the caches of the one before it.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || isDesktopApp()) {
    return;
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  const url = `/sw.js?v=${encodeURIComponent(`${APP_VERSION}.${APP_BUILD}`)}`;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(url)
      .then(letUpdatesLand)
      .catch(() => undefined);
  });
}

/**
 * A worker installed by a newer deploy waits until every tab using the old
 * one is gone. That is the right default inside a call — swapping the app
 * under a live room is exactly what the wait is for — but on the home it is
 * just a version nobody asked to keep. So: outside a room, wave it through.
 *
 * There is no reload here on purpose. The document is fetched network-first,
 * so the page is already the current build; the only thing changing hands is
 * which worker answers, and that needs no interruption to be seen.
 */
function letUpdatesLand(registration: ServiceWorkerRegistration): void {
  const inRoom = () => window.location.pathname.startsWith('/r/');
  const waveThrough = () => {
    if (registration.waiting && !inRoom()) {
      registration.waiting.postMessage({ type: 'freecord:activate-update' });
    }
  };
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        waveThrough();
      }
    });
  });
  // One may have been waiting since the last visit.
  waveThrough();
}
