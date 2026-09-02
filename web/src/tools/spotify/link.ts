/**
 * Turning what somebody pasted into something the room can put on, and
 * back into the two addresses this tool ever uses.
 *
 * Nothing is looked up. A Spotify link already says what it points at —
 * `open.spotify.com/track/<id>` — so the kind and the id are read out of
 * the text itself, and the embed address is BUILT from them. That is why
 * this tool asks nobody for a key and calls no Spotify service: the only
 * thing it needs to know is written on the link.
 *
 * It follows that a link which hides what it points at cannot be taken.
 * A `spotify.link/...` short link is a redirect, and reading where it
 * goes means fetching it, which a browser may not do across origins and
 * which this tool will not add a server route for. The field says so
 * instead of putting up something that will not load.
 */
import { KINDS, isSpotifyId, type ListenItem, type ListenKind } from './state';

/**
 * The one host a link may come from. The address we hand an iframe is
 * built from this constant and two checked fields, never from the text
 * somebody pasted.
 */
const HOST = 'open.spotify.com';

function kindOf(segment: string | undefined): ListenKind | null {
  return segment && (KINDS as readonly string[]).includes(segment) ? (segment as ListenKind) : null;
}

/**
 * The first `<kind>/<id>` pair in a list of segments. Reading a pair
 * rather than a fixed position is what carries every shape Spotify has
 * ever handed out: the plain `/track/<id>`, the localised
 * `/intl-pt/track/<id>`, an `/embed/track/<id>` somebody copied out of
 * an embed, and the old `/user/<name>/playlist/<id>`.
 */
function pairIn(segments: readonly string[]): ListenItem | null {
  for (let i = 0; i < segments.length - 1; i++) {
    const kind = kindOf(segments[i]);
    const id = segments[i + 1];
    if (kind && isSpotifyId(id)) {
      return { kind, id };
    }
  }
  return null;
}

/**
 * What someone pasted: a share link, a link copied from the address bar,
 * an embed's address, or the `spotify:` URI the desktop app copies. Null
 * when there is nothing in it we can name — the field says so, rather
 * than the room being told to put on nothing.
 */
export function parseLink(input: string): ListenItem | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  // spotify:track:<id>, and the old spotify:user:<name>:playlist:<id>.
  if (text.toLowerCase().startsWith('spotify:')) {
    return pairIn(text.slice('spotify:'.length).split(':'));
  }
  let url: URL;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.hostname.replace(/^www\./, '') !== HOST) {
    return null;
  }
  return pairIn(url.pathname.split('/').filter(Boolean));
}

/**
 * The player everybody gets. Built here from a kind out of a fixed list
 * and 22 base62 characters (state.ts), so there is no way for a peer's
 * message to become an address of its own choosing.
 *
 * `theme=0` is Spotify's quiet variant, which sits in a dark room better
 * than the coloured card does.
 */
export function embedUrl(item: ListenItem): string {
  return `https://${HOST}/embed/${item.kind}/${item.id}?theme=0`;
}

/** The same thing on Spotify itself, for a person who wants it there. */
export function pageUrl(item: ListenItem): string {
  return `https://${HOST}/${item.kind}/${item.id}`;
}
