/**
 * Watching together — what the room has on the tool shelf's first tool.
 *
 * The video itself never touches this server: the browsers embed YouTube's
 * own player and the room only agrees on WHAT is playing, WHETHER it is
 * playing and WHERE it is. That agreement is server state for the same
 * reason presence is: a peer joining ten minutes late has nobody to ask,
 * and two peers disagreeing about the position is exactly the bug the
 * feature exists to avoid.
 *
 * The position is stored with the clock reading that produced it and
 * projected forward on the way out (projectWatch), so every client is told
 * where the video is *now* by the one clock all of them share — the
 * server's. Clients never see `at`, and never have to trust their own
 * clock against anybody else's.
 */

/** What the room is watching, as the server holds it. */
export interface WatchState {
  /** YouTube video id — the only thing about the video the server keeps. */
  video: string;
  playing: boolean;
  /** Position in seconds when `at` was read. */
  time: number;
  /** Server clock at the moment the position was reported. */
  at: number;
}

/** The same state as the room hears it: position already brought up to date. */
export interface WatchProjection {
  video: string;
  playing: boolean;
  time: number;
}

export const WATCH_LIMITS = {
  /**
   * A YouTube id is eleven characters of base64url. Validating the shape
   * keeps the room's state to something a player can actually load — the
   * field is echoed to everyone, so it may not carry a URL of someone
   * else's choosing.
   */
  videoIdPattern: /^[A-Za-z0-9_-]{11}$/,
  /** No video is a day long; anything past this is a client with a bug. */
  maxPositionSeconds: 24 * 60 * 60,
} as const;

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && WATCH_LIMITS.videoIdPattern.test(value);
}

/** A position that may be stored: finite, not negative, not absurd. */
export function isPosition(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= WATCH_LIMITS.maxPositionSeconds
  );
}

/**
 * Where the video is at `now`. A paused video sits where it was left; a
 * playing one has moved on by the time since the last report. A clock that
 * went backwards (or a report from the future) never rewinds anybody.
 */
export function projectWatch(
  state: WatchState | null | undefined,
  now: number,
): WatchProjection | null {
  if (!state) {
    return null;
  }
  const elapsed = state.playing ? Math.max(0, now - state.at) / 1000 : 0;
  return {
    video: state.video,
    playing: state.playing,
    // Milliseconds are as fine as this ever needs to be, and a short number
    // keeps the welcome payload readable.
    time: Math.round((state.time + elapsed) * 1000) / 1000,
  };
}
