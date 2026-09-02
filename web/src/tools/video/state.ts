/**
 * What this tool puts in the room's one shared value, and how it is
 * checked on the way in.
 *
 * The server stores a tool's state without looking at it (docs/tools.md),
 * so `parseState` is the only thing between another peer's message and
 * this tool's components — and this tool has more to lose by it than the
 * YouTube one did. A YouTube state carries eleven characters that go into
 * a URL we build ourselves. This one carries a URL somebody else chose,
 * and that URL is handed to a `<video>` element or an `<iframe>`. A
 * `javascript:` in there would be script execution inside the room's own
 * page, where the chat's key lives in the fragment.
 *
 * So: http(s) only, absolute, capped, every other field checked and
 * clamped, and anything unexpected returns null — which the shelf treats
 * as the tool being off, always a safe place to land.
 */

/** How everybody in the room plays this, and how much clock that buys. */
export type VideoPlay = 'file' | 'hls' | 'dash' | 'twitch' | 'frame';

const PLAYS: readonly VideoPlay[] = ['file', 'hls', 'dash', 'twitch', 'frame'];

/** The thing on Twitch this is: a channel, a past broadcast, or a clip. */
export interface TwitchRef {
  channel?: string;
  video?: string;
  clip?: string;
}

/** The room's shared source, as this tool records it. */
export interface VideoState {
  play: VideoPlay;
  /** The media, or the page to frame. Always absolute, always http(s). */
  url: string;
  twitch?: TwitchRef;
  /** What to call it on the stage. Someone else's text: drawn, never run. */
  title?: string;
  /**
   * A broadcast, or something nobody can drive. There is no position to
   * agree on: the room agrees to be at the live edge, which is the only
   * place a live stream has.
   */
  live: boolean;
  playing: boolean;
  /** Position in seconds when the state was set. Meaningless when live. */
  time: number;
  /** The page this came from, so the stage can offer a way back to it. */
  page?: string;
}

const MAX_URL = 2048;
const MAX_TITLE = 200;
/** No video is a day long; past this it is a client with a bug. */
const MAX_POSITION_SECONDS = 24 * 60 * 60;

const CHANNEL = /^[A-Za-z0-9_]{2,25}$/;
const TWITCH_ID = /^[0-9]{1,20}$/;
const CLIP_SLUG = /^[A-Za-z0-9_-]{4,120}$/;

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

export function parseState(raw: unknown): VideoState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { play, url, twitch, title, live, playing, time, page } = raw as Record<string, unknown>;
  if (!PLAYS.includes(play as VideoPlay) || !isPlayableUrl(url)) {
    return null;
  }
  if (typeof live !== 'boolean' || typeof playing !== 'boolean') {
    return null;
  }
  if (
    typeof time !== 'number' ||
    !Number.isFinite(time) ||
    time < 0 ||
    time > MAX_POSITION_SECONDS
  ) {
    return null;
  }
  const ref = twitchRef(twitch);
  // A Twitch state with nothing to embed would build a player around an
  // empty channel name.
  if (play === 'twitch' && !ref) {
    return null;
  }
  const state: VideoState = { play: play as VideoPlay, url, live, playing, time };
  if (ref) {
    state.twitch = ref;
  }
  const title_ = label(title, MAX_TITLE);
  if (title_) {
    state.title = title_;
  }
  if (isPlayableUrl(page)) {
    state.page = page;
  }
  return state;
}

/**
 * Where the source is at `now`: a paused one sits where it was left, a
 * playing one has moved on since `at` — the moment the room's state was
 * set, on this machine's clock (the room hands it over already corrected
 * for the time the message spent in flight).
 *
 * A live source has no such number and never asks for one.
 */
export function positionAt(state: VideoState, at: number, now: number = Date.now()): number {
  return state.playing ? state.time + Math.max(0, now - at) / 1000 : state.time;
}

/**
 * Whether the room can agree on a position at all. A frame is somebody
 * else's page and we cannot reach inside it; a broadcast has only ever
 * one position, which is now.
 */
export function hasSharedClock(state: VideoState): boolean {
  return state.play !== 'frame' && !state.live;
}
