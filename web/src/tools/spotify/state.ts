/**
 * What this tool puts in the room's one shared value, and how it is
 * checked on the way in.
 *
 * The server stores a tool's state without looking at it (docs/tools.md),
 * so `parseState` is the only thing between another peer's message and
 * this tool's components. What this one carries ends up inside an embed
 * URL and therefore inside an iframe in the page that holds the room's
 * chat key — so nothing arbitrary is ever carried. A state names a KIND
 * out of a fixed list and an ID of 22 base62 characters, and the address
 * is built from those two by us (link.ts). A peer cannot put a URL in
 * here because there is no field for one.
 *
 * There is no position and no play flag, and that is the shape of the
 * tool rather than a gap: nothing here reaches into Spotify's player
 * (see index.ts). The room agrees on WHAT is on and WHAT is lined up
 * behind it; each person presses play on their own copy.
 */

/** The things Spotify will put in an embed, and the only ones we name. */
export type ListenKind = 'track' | 'album' | 'playlist' | 'artist' | 'episode' | 'show';

export const KINDS: readonly ListenKind[] = [
  'track',
  'album',
  'playlist',
  'artist',
  'episode',
  'show',
];

/**
 * A Spotify id is 22 characters of base62 — no dashes, no slashes, no
 * dots, nothing that could steer the URL we build out of it.
 */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

/** One thing to put on: a song, a record, a list, somebody's whole page. */
export interface ListenItem {
  kind: ListenKind;
  id: string;
}

/** The room's turntable, as this tool records it. */
export interface ListenState {
  /** What is on now. */
  now: ListenItem;
  /** What the room lined up behind it, in order. */
  queue: ListenItem[];
}

/**
 * How many things may be lined up. The whole state is echoed to everyone
 * on every change and has to fit the 4 KiB a tool gets (docs/tools.md);
 * an item costs about 40 bytes, so forty of them is an evening and a
 * long way short of the budget.
 */
export const QUEUE_MAX = 40;

export function isSpotifyId(value: unknown): value is string {
  return typeof value === 'string' && SPOTIFY_ID.test(value);
}

export function isListenKind(value: unknown): value is ListenKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

export function parseItem(raw: unknown): ListenItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { kind, id } = raw as Record<string, unknown>;
  return isListenKind(kind) && isSpotifyId(id) ? { kind, id } : null;
}

/** Whether two items are the same thing on the shelf. */
export function sameItem(a: ListenItem, b: ListenItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function parseState(raw: unknown): ListenState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { now, queue } = raw as Record<string, unknown>;
  const current = parseItem(now);
  if (!current) {
    return null;
  }
  // A queue with one bad entry loses that entry, not the evening: the
  // state is otherwise sound, and dropping it would take the music off.
  const lined = Array.isArray(queue)
    ? queue
        .map(parseItem)
        .filter((item): item is ListenItem => item !== null)
        .slice(0, QUEUE_MAX)
    : [];
  return { now: current, queue: lined };
}
