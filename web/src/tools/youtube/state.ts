/**
 * What this tool puts in the room's one shared value, and how it is
 * checked on the way in.
 *
 * The server stores the state without looking at it (docs/tools.md), so
 * `parseState` is the only thing between another peer's message and this
 * tool's components. It is written as if the sender were hostile, because
 * the room link is the only credential and whoever holds it can send
 * anything: an id that is not a video id would go into an iframe URL, and
 * a position that is not a number would go into `seekTo`.
 */

/**
 * One thing to watch. A YouTube playlist is not a list of videos we can
 * expand — reading its contents needs YouTube's data API and a key we do
 * not have, and will not ask anybody for. The player knows how to play
 * one, so a playlist travels as itself: an id and which position of it is
 * on. Everything else about it (how long it is, what is in it) is the
 * player's business, and the room only agrees on where it is.
 */
export type WatchItem =
  /** `start`: where the link said to begin, kept for when its turn comes. */
  | { kind: 'video'; video: string; start?: number }
  | { kind: 'list'; list: string; index: number };

/** The room's shared player, as this tool records it. */
export interface WatchState {
  /** What is on now. */
  now: WatchItem;
  playing: boolean;
  /** Position in seconds within the video that is on. */
  time: number;
  /** What comes after it, in order. Empty when nothing is lined up. */
  queue: WatchItem[];
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/**
 * Playlist ids are longer and vary by kind (`PL…` for a made one, `UU…`
 * for a channel's uploads, `RD…` for a mix). The shape is checked, not
 * the kind: an id that does not load is a player's problem, an id that is
 * not an id would be somebody else's URL in an iframe.
 */
const LIST_ID = /^[A-Za-z0-9_-]{13,42}$/;
/** No video is a day long; past this it is a client with a bug. */
const MAX_POSITION_SECONDS = 24 * 60 * 60;
/** A playlist that claims more than this is not one we will index into. */
const MAX_LIST_INDEX = 5_000;
/**
 * How many things may be lined up. The whole state is echoed to everyone
 * on every change and has to fit the 4 KiB a tool gets (docs/tools.md);
 * forty items is a long evening and a fifth of that budget.
 */
export const QUEUE_MAX = 40;

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

export function isListId(value: unknown): value is string {
  return typeof value === 'string' && LIST_ID.test(value);
}

export function parseItem(raw: unknown): WatchItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (item.kind === 'video') {
    if (!isVideoId(item.video)) {
      return null;
    }
    const start = item.start;
    const from = typeof start === 'number' && Number.isFinite(start) && start >= 0 && start <= MAX_POSITION_SECONDS ? start : 0;
    return from > 0 ? { kind: 'video', video: item.video, start: from } : { kind: 'video', video: item.video };
  }
  if (item.kind === 'list') {
    const index = item.index;
    if (!isListId(item.list) || typeof index !== 'number' || !Number.isInteger(index)) {
      return null;
    }
    return index >= 0 && index <= MAX_LIST_INDEX ? { kind: 'list', list: item.list, index } : null;
  }
  return null;
}

/** Whether two items are the same thing on the shelf (a playlist ignores its position). */
export function sameItem(a: WatchItem, b: WatchItem): boolean {
  if (a.kind === 'video' && b.kind === 'video') {
    return a.video === b.video;
  }
  return a.kind === 'list' && b.kind === 'list' && a.list === b.list;
}

export function parseState(raw: unknown): WatchState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { now, playing, time, queue } = raw as Record<string, unknown>;
  const current = parseItem(now);
  if (!current || typeof playing !== 'boolean') {
    return null;
  }
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > MAX_POSITION_SECONDS) {
    return null;
  }
  // A queue with one bad entry loses that entry, not the evening: the
  // state is otherwise sound and dropping it would stop the video.
  const lined = Array.isArray(queue)
    ? queue
        .map(parseItem)
        .filter((item): item is WatchItem => item !== null)
        .slice(0, QUEUE_MAX)
    : [];
  return { now: current, playing, time, queue: lined };
}

/**
 * Where the video is at `now`: a paused one sits where it was left, a
 * playing one has moved on since `at` — the moment the room's state was
 * set, on this machine's clock (the shelf hands it over already corrected
 * for the time the message spent in flight).
 */
export function positionAt(state: WatchState, at: number, now: number = Date.now()): number {
  return state.playing ? state.time + Math.max(0, now - at) / 1000 : state.time;
}
