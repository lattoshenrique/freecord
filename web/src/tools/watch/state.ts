/**
 * What this tool puts in the room's one shared value, and how it is
 * checked on the way in.
 *
 * One tool watches everything, so one state carries everything: what is
 * on, whether it is playing, where it is, and what is lined up behind it.
 * What differs between a YouTube video and a stranger's page is only what
 * kind of ITEM is on — and the room agrees on the item, never on how any
 * one browser happens to play it.
 *
 *   video   a YouTube video. Eleven characters that go into a URL we
 *           build ourselves.
 *   list    a YouTube playlist, and which of its videos is on. Reading
 *           what is inside it needs YouTube's data API and a key we do
 *           not have and will not ask anybody for, so a playlist travels
 *           as itself and the player does the walking.
 *   source  anything else on the web: a file, a stream, Twitch, or a
 *           page to frame. This is the one with something to lose — it
 *           carries a URL SOMEBODY ELSE chose, and that URL is handed to
 *           a `<video>` element or an `<iframe>` inside the page where
 *           the chat's key lives in the fragment. A `javascript:` in
 *           there would be script execution in the room's own page.
 *
 * The server stores the state without looking at it (docs/tools.md), so
 * `parseState` is the only thing between another peer's message and this
 * tool's components. It is written as if the sender were hostile, because
 * the room link is the only credential and whoever holds it can send
 * anything: http(s) only, absolute, capped, every number clamped, and
 * anything unexpected returns null — which the shelf treats as the tool
 * being off, always a safe place to land.
 */

/** How everybody in the room plays a source, and how much clock that buys. */
export type SourcePlay = 'file' | 'hls' | 'dash' | 'twitch' | 'frame';

const PLAYS: readonly SourcePlay[] = ['file', 'hls', 'dash', 'twitch', 'frame'];

/** The thing on Twitch this is: a channel, a past broadcast, or a clip. */
export interface TwitchRef {
  channel?: string;
  video?: string;
  clip?: string;
}

/** One thing the room can watch. */
export type WatchItem =
  /** `start`: where the link said to begin, kept for when its turn comes. */
  | { kind: 'video'; video: string; start?: number }
  | { kind: 'list'; list: string; index: number }
  | {
      kind: 'source';
      play: SourcePlay;
      /** The media, or the page to frame. Always absolute, always http(s). */
      url: string;
      twitch?: TwitchRef;
      /** What to call it on the stage. Someone else's text: drawn, never run. */
      title?: string;
      /**
       * A broadcast, or something nobody can drive. There is no position
       * to agree on: the room agrees to be at the live edge, which is the
       * only place a live stream has.
       */
      live?: boolean;
      /** The page it came from, so the stage can offer a way back to it. */
      page?: string;
    };

/** The room's shared player, as this tool records it. */
export interface WatchState {
  /** What is on now. */
  now: WatchItem;
  playing: boolean;
  /** Position in seconds within the item that is on. */
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
const MAX_URL = 2048;
const MAX_TITLE = 200;

const CHANNEL = /^[A-Za-z0-9_]{2,25}$/;
const TWITCH_ID = /^[0-9]{1,20}$/;
const CLIP_SLUG = /^[A-Za-z0-9_-]{4,120}$/;

/**
 * How many things may be lined up. The whole state is echoed to everyone
 * on every change and has to fit the 4 KiB a tool gets (docs/tools.md);
 * forty items is a long evening and, in YouTube ids, a fifth of that
 * budget. A source item is a URL rather than an id and can be a hundred
 * times longer, so the count is not the only cap — see STATE_BUDGET.
 */
export const QUEUE_MAX = 40;

/**
 * How much of the 4 KiB this tool will fill before it stops lining things
 * up. Short of the cap on purpose: the server refuses a state WHOLE, so a
 * queue grown to exactly the limit would take the room's next play down
 * with it.
 */
export const STATE_BUDGET = 3_600;

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

export function isListId(value: unknown): value is string {
  return typeof value === 'string' && LIST_ID.test(value);
}

/**
 * A URL this tool is willing to hand to an element: absolute, http(s),
 * and short enough to be a link rather than a payload.
 */
export function isPlayableUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > MAX_URL) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Whether a page may be put in this room's iframe.
 *
 * Cross-origin only, and that is a security rule rather than a taste. The
 * frame is sandboxed with `allow-scripts allow-same-origin`, which is
 * safe precisely because the document inside gets an origin of its own.
 * Point it at OUR origin and those two flags describe a document with our
 * origin and reach into our DOM — inside the page holding the room's
 * chat key.
 */
export function isFramableHere(url: string, origin: string): boolean {
  try {
    return new URL(url).origin !== origin;
  } catch {
    return false;
  }
}

function twitchRef(raw: unknown): TwitchRef | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { channel, video, clip } = raw as Record<string, unknown>;
  const ref: TwitchRef = {};
  if (typeof channel === 'string' && CHANNEL.test(channel)) {
    ref.channel = channel;
  }
  if (typeof video === 'string' && TWITCH_ID.test(video)) {
    ref.video = video;
  }
  if (typeof clip === 'string' && CLIP_SLUG.test(clip)) {
    ref.clip = clip;
  }
  return ref.channel || ref.video || ref.clip ? ref : null;
}

/** Somebody else's words, made safe to draw: one line, bounded. */
function label(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? clean.slice(0, max) : undefined;
}

function parseSource(item: Record<string, unknown>): WatchItem | null {
  const { play, url, twitch, title, live, page } = item;
  if (!PLAYS.includes(play as SourcePlay) || !isPlayableUrl(url)) {
    return null;
  }
  const ref = twitchRef(twitch);
  // A Twitch source with nothing to embed would build a player around an
  // empty channel name.
  if (play === 'twitch' && !ref) {
    return null;
  }
  const source: WatchItem = { kind: 'source', play: play as SourcePlay, url };
  if (ref) {
    source.twitch = ref;
  }
  const name = label(title, MAX_TITLE);
  if (name) {
    source.title = name;
  }
  if (live === true) {
    source.live = true;
  }
  if (isPlayableUrl(page)) {
    source.page = page;
  }
  return source;
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
    const from =
      typeof start === 'number' && Number.isFinite(start) && start >= 0 && start <= MAX_POSITION_SECONDS
        ? start
        : 0;
    return from > 0
      ? { kind: 'video', video: item.video, start: from }
      : { kind: 'video', video: item.video };
  }
  if (item.kind === 'list') {
    const index = item.index;
    if (!isListId(item.list) || typeof index !== 'number' || !Number.isInteger(index)) {
      return null;
    }
    return index >= 0 && index <= MAX_LIST_INDEX ? { kind: 'list', list: item.list, index } : null;
  }
  if (item.kind === 'source') {
    return parseSource(item);
  }
  return null;
}

/**
 * Whether two items are the same thing on the shelf. A playlist ignores
 * its position, and a source is its address: the same file found twice in
 * one page is one thing, whatever the page called it.
 */
export function sameItem(a: WatchItem, b: WatchItem): boolean {
  if (a.kind === 'video' && b.kind === 'video') {
    return a.video === b.video;
  }
  if (a.kind === 'list' && b.kind === 'list') {
    return a.list === b.list;
  }
  return a.kind === 'source' && b.kind === 'source' && a.play === b.play && a.url === b.url;
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
 * Where the item is at `now`: a paused one sits where it was left, a
 * playing one has moved on since `at` — the moment the room's state was
 * set, on this machine's clock (the room hands it over already corrected
 * for the time the message spent in flight).
 *
 * A live source has no such number and never asks for one.
 */
export function positionAt(state: WatchState, at: number, now: number = Date.now()): number {
  return state.playing ? state.time + Math.max(0, now - at) / 1000 : state.time;
}

/** A broadcast: one position, and it is now. */
export function isLive(item: WatchItem): boolean {
  return item.kind === 'source' && item.live === true;
}

/**
 * Whether this is a player the ROOM drives — play, pause and the speaker
 * key — as opposed to a rectangle we can only point at.
 *
 * This is a different question from `hasSharedClock`, and conflating the
 * two told a lie on screen: a Twitch channel has no position to share, so
 * it was labelled "each on their own", when in fact one person pressing
 * pause pauses it for everybody and the room's speaker key silences it.
 * Three states, not two — a shared position, a shared live edge, and
 * somebody else's page.
 */
export function roomDrives(item: WatchItem): boolean {
  if (item.kind !== 'source') {
    return true; // YouTube's player answers to us
  }
  return item.play !== 'frame' && !item.twitch?.clip;
}

/**
 * Whether the room can agree on a POSITION. A frame is somebody else's
 * page and we cannot reach inside it; a broadcast has only ever one
 * position, which is now.
 */
export function hasSharedClock(item: WatchItem): boolean {
  if (item.kind !== 'source') {
    return true;
  }
  if (item.play === 'frame' || item.live) {
    return false;
  }
  // A Twitch clip plays in an iframe we cannot reach into, the same as
  // any other page — see twitchClipUrl in link.ts.
  return !item.twitch?.clip;
}
