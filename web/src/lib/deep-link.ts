/**
 * The link, and the app it should open in.
 *
 * A room link is the whole product — it gets pasted into someone else's chat
 * and clicked there. Installing an app must not make that link worse, so
 * neither half of this file ever changes what a link *is*: the address stays
 * an ordinary `https://…/r/<slug>#k=…` that works in any browser, and all
 * that changes is who answers it.
 *
 * Two answers, and they arrive from opposite directions:
 *
 * - **The installed page.** Nothing here does that: the browser does, because
 *   the manifest asks it to (`handle_links`, `launch_handler`). An installed
 *   PWA is in scope for its own links and the platform hands them over.
 * - **The desktop app**, which the browser knows nothing about. There is no
 *   way to ask whether an app is installed — every honest answer to that
 *   question is a fingerprint — so this is a choice somebody makes once: the
 *   doorstep offers `freecord://…`, and if it worked, the offer is remembered
 *   and the next link goes straight there (`components/OpenInApp.tsx`).
 *
 * The third piece is the return path: a link the shell hands to a page that
 * is already running, so the app opens a room the way the router does rather
 * than reloading the whole client mid-call. `desktop/src/deep-link.ts` is the
 * other half of that, and it falls back to a reload for any page — an old
 * build, a page whose script failed — that never announces itself here.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { deepLinks } from './desktop';
import { parseInvite } from './invite';

/** The scheme the desktop shell registers. Mirrored in desktop/src/deep-link.ts. */
export const APP_SCHEME = 'freecord';

/** Where the choice is remembered — this browser only, and forgettable. */
const PREFERENCE_KEY = 'freecord:open-in-app';

/**
 * The same room, addressed to the app instead of to the web.
 *
 * `parseInvite` is what decides this is a room link at all — the one place
 * that knows the shape, rather than a second regular expression that could
 * drift from it. The fragment rides along verbatim: it carries the chat key,
 * and a room opened without it is a room nobody can read.
 */
export function appLink(pathname: string, hash: string): string | null {
  const invite = parseInvite(`${pathname}${hash}`);
  return invite ? `${APP_SCHEME}://r/${invite.slug}${invite.hash}` : null;
}

/**
 * The path a link the shell just handed us names, for the router — or null
 * for anything that is not this origin's own page.
 *
 * The shell validates the link before it sends it and builds the target
 * against its own APP_URL, so this is the second lock on the same door: the
 * value arrives over IPC, and a page that navigates wherever it is told is a
 * page that can be told to navigate anywhere.
 */
export function routeFromTarget(value: unknown, origin: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
}

/* ---- the choice, and where it is kept ---- */

/**
 * Where the answer is kept, when anywhere is.
 *
 * Reaching for it can throw rather than merely come back empty — Safari in
 * private browsing does, and so does any browser told to block site data —
 * and the tests have no browser at all, which is why both readers below take
 * the store as an argument.
 */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Has somebody on this browser already chosen the app for links like this? */
export function prefersApp(store: Storage | null = storage()): boolean {
  try {
    return store?.getItem(PREFERENCE_KEY) === '1';
  } catch {
    // A preference that cannot be read is a preference nobody expressed.
    return false;
  }
}

/** Remembers the answer, or forgets it — "stay in the browser" is an answer. */
export function rememberApp(yes: boolean, store: Storage | null = storage()): void {
  try {
    if (yes) {
      store?.setItem(PREFERENCE_KEY, '1');
    } else {
      store?.removeItem(PREFERENCE_KEY);
    }
  } catch {
    // A browser that will not remember still opens rooms; it just asks again.
  }
}

/**
 * Hands this page's room to the app. Returns false when there was nothing to
 * hand over, which is the caller's cue to say nothing at all.
 *
 * What happens next is the operating system's, not ours: an installed app
 * comes forward, and with none installed the browser quietly does nothing —
 * which is why the offer is a button somebody presses, never a redirect that
 * happens to them, and why this tab stays exactly where it is.
 */
export function handOffToApp(pathname: string, hash: string): boolean {
  const link = appLink(pathname, hash);
  if (!link) {
    return false;
  }
  window.location.href = link;
  return true;
}

/* ---- the return path: a link arriving from the shell ---- */

/**
 * Listens for a room link the shell was asked to open and routes to it.
 *
 * Announcing readiness is the point: until this runs, the shell opens links
 * by loading them into the window, which reloads the whole client. Inside a
 * call that is the difference between a navigation and a rejoin.
 *
 * Does nothing in a browser, where there is no shell to hear from.
 */
export function useDeepLinkRouting(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const api = deepLinks();
    if (!api) {
      return;
    }
    const stop = api.onOpen((value) => {
      const route = routeFromTarget(value, window.location.origin);
      if (route) {
        navigate(route);
      }
    });
    api.ready();
    return stop;
  }, [navigate]);
}
