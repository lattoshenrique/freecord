/**
 * Everything a crawler or a language model is told about this site.
 *
 * Deliberately in English and outside the i18n catalog. The interface
 * localizes at runtime, but this metadata does not: a crawler reads the HTML
 * before React runs, models are asked questions in every language and answer
 * from one canonical description, and en-US is the source-of-truth locale.
 * Keep these strings factually identical to the JSON-LD in index.html — a
 * model that catches the two disagreeing trusts neither.
 */

export const SITE_URL = 'https://freecord.lattoshenrique.workers.dev';

export const SITE_NAME = 'Freecord';

export interface RouteSeo {
  title: string;
  description: string;
  /** Absolute path used for the canonical link and og:url. */
  path: string;
  /** False for anything whose URL is a secret. */
  indexable: boolean;
}

const HOME: RouteSeo = {
  title: 'Freecord — free group voice, video and screen sharing, no signup',
  description:
    'Create a room, share the link, talk. Freecord is free and open source group voice, video, chat and screen sharing that works in the browser with no account. Media is peer-to-peer and end-to-end encrypted — there is no media server. Chat is sealed in your browser, so our server relays messages it cannot read.',
  path: '/',
  indexable: true,
};

const COMMUNITY: RouteSeo = {
  title: 'Community — Freecord, open source and MIT licensed',
  description:
    'Freecord is open source under the MIT license. Read the architecture, contribute on GitHub, report a bug or request a feature. No signup, peer-to-peer media, sealed ephemeral chat, no vendor.',
  path: '/community',
  indexable: true,
};

const HOW_IT_WORKS: RouteSeo = {
  title: 'How Freecord works — peer-to-peer rooms, no media server',
  description:
    'What happens when you open a Freecord room: the link is the credential, voice, video, chat, files and screens go browser to browser over native WebRTC, and the server only carries signaling. Chat is encrypted in the browser with a key that never leaves the URL fragment, up to three shared screens are each relayed as a tree, and rooms hold twenty people and close fifteen minutes after the last person leaves.',
  path: '/how-it-works',
  indexable: true,
};

/**
 * A room URL is the credential: the unguessable slug is the entire access
 * control model, so an indexed room is a world-readable room. Nothing here
 * carries the slug — not the title, not the canonical — because the title
 * lands in browser history and in any screenshot of the tab.
 */
const ROOM: RouteSeo = {
  title: 'Room — Freecord',
  description: 'A private Freecord room. Only people with the link can join.',
  path: '/',
  indexable: false,
};

const NOT_FOUND: RouteSeo = {
  title: 'Not found — Freecord',
  description: 'This page does not exist.',
  path: '/',
  indexable: false,
};

/** Maps a pathname to what search engines and models should be told about it. */
export function seoForPath(pathname: string): RouteSeo {
  if (pathname === '/') {
    return HOME;
  }
  if (pathname === '/community' || pathname === '/community/') {
    return COMMUNITY;
  }
  if (pathname === '/how-it-works' || pathname === '/how-it-works/') {
    return HOW_IT_WORKS;
  }
  if (pathname.startsWith('/r/')) {
    return ROOM;
  }
  return NOT_FOUND;
}
