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

/** The room's shared player, as this tool records it. */
export interface WatchState {
  /** YouTube video id — eleven characters of base64url, nothing else. */
  video: string;
  playing: boolean;
  /** Position in seconds when the state was set. */
  time: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** No video is a day long; past this it is a client with a bug. */
const MAX_POSITION_SECONDS = 24 * 60 * 60;

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

export function parseState(raw: unknown): WatchState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { video, playing, time } = raw as Record<string, unknown>;
  if (!isVideoId(video) || typeof playing !== 'boolean') {
    return null;
  }
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > MAX_POSITION_SECONDS) {
    return null;
  }
  return { video, playing, time };
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
