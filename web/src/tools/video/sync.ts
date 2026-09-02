/**
 * Keeping everybody's player where the room says it is.
 *
 * The YouTube tool has to infer a person from a position: its player
 * reports a number every second, and a seek has to be told from a stall
 * by how much that number moved (tools/youtube/sync.ts). A real `<video>`
 * element needs no such inference — it fires `seeked` when it has been
 * seeked and `waiting` when it is merely starving, and the two are never
 * confused. So this file is smaller than its cousin on purpose, and the
 * classic watch-together bug (the slowest connection in the room
 * reporting its own buffering as a seek and dragging everybody back to
 * it, one second at a time) is impossible here by construction instead of
 * avoided by a threshold.
 *
 * What is left is the ticker: every so often, look at our own element and
 * bring it back to where the room is, without telling anybody. The rule
 * is the one this product uses everywhere — a PERSON moving the player
 * tells the room; a PLAYER falling behind fixes itself.
 */

/** Closer than this to the room's position and nobody can tell. */
export const DRIFT_TOLERANCE_SECONDS = 2;

/**
 * How far behind the live edge is worth a jump.
 *
 * A stream has no position to agree on, so "together" means "all at the
 * edge". Snapping on every hiccup would make it unwatchable, though, and
 * a browser that paused to buffer honestly sits a few seconds back — this
 * is the distance at which somebody is no longer watching the same
 * moment as the room, rather than the distance at which they are behind.
 */
export const LIVE_EDGE_SECONDS = 30;

/** One reading of our own element. */
export interface PlayerReading {
  time: number;
  paused: boolean;
  /**
   * On its way somewhere: seeking, or without enough buffered to say
   * where it is. Its position is not evidence of anything while this is
   * true — which is exactly the state a joining player is in.
   */
  busy: boolean;
  /** The furthest point that can be played, when the source has one. */
  liveEdge?: number;
}

export type Correction =
  | { kind: 'seek'; time: number }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'idle' };

/**
 * What to do about our element, given what the room last said. Never a
 * report: this is only ever us catching up, and catching up is nobody
 * else's business.
 *
 * Play and pause come before position, because a paused player that is
 * also adrift gets seeked by the same tick that starts it — and a player
 * with nothing buffered is left alone until it has something.
 */
export function correctionFor(
  reading: PlayerReading,
  room: { playing: boolean; time: number },
): Correction {
  if (room.playing && reading.paused) {
    return { kind: 'play' };
  }
  if (!room.playing && !reading.paused) {
    return { kind: 'pause' };
  }
  if (reading.busy) {
    return { kind: 'idle' };
  }
  if (Math.abs(reading.time - room.time) > DRIFT_TOLERANCE_SECONDS) {
    return { kind: 'seek', time: room.time };
  }
  return { kind: 'idle' };
}

/**
 * The same, for something with no position to agree on: keep it running,
 * and keep it at the edge. A stream that has drifted a long way back — a
 * laptop that slept, a tab the browser throttled — is not watching the
 * same moment as the room, however well its clock is synchronised.
 */
export function liveCorrectionFor(
  reading: PlayerReading,
  room: { playing: boolean },
): Correction {
  if (room.playing && reading.paused) {
    return { kind: 'play' };
  }
  if (!room.playing && !reading.paused) {
    return { kind: 'pause' };
  }
  if (reading.busy || reading.paused || reading.liveEdge === undefined) {
    return { kind: 'idle' };
  }
  return reading.liveEdge - reading.time > LIVE_EDGE_SECONDS
    ? { kind: 'seek', time: reading.liveEdge }
    : { kind: 'idle' };
}
