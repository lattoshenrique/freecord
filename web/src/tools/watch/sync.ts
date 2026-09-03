/**
 * The one rule that keeps a shared player honest:
 *
 *   a PERSON moving the player tells the room;
 *   a PLAYER falling behind fixes itself.
 *
 * Getting that backwards is the classic watch-together bug: the slowest
 * connection in the room reports its own buffering as a seek and drags
 * everyone back to it, one second at a time, forever.
 *
 * The rule is one; keeping it takes two different pieces of code, because
 * the two players this tool drives are not equally honest about
 * themselves — and pretending they were is what would make one of them
 * wrong.
 *
 *   a `<video>` element    SAYS what it is doing. It fires `seeked` when
 *                          it has been seeked and reports `seeking` and a
 *                          starved `readyState` when it is merely
 *                          waiting. Nothing has to be inferred, so
 *                          `correctionFor` below only ever catches our
 *                          own copy up, silently, and a person's move
 *                          reaches the room through the element's own
 *                          events (Stage.tsx).
 *   YouTube's iframe       reports a number, once a second, and nothing
 *                          else. A seek and a stall have to be told apart
 *                          from that number alone — which is what
 *                          `decideSync` does, and why it is the longer of
 *                          the two.
 */

// ---------------------------------------------------------------------
// Both halves
// ---------------------------------------------------------------------

/** Closer than this to the room's position, nobody can tell the difference. */
export const DRIFT_TOLERANCE_SECONDS = 2;

// ---------------------------------------------------------------------
// A player that only reports a number: YouTube's
// ---------------------------------------------------------------------

/**
 * Told apart by the clock. Between two readings of a playing video, the
 * position should advance by exactly the wall time that passed. A viewer
 * whose copy stalls advances by less — at most one tick's worth, which is
 * why the reading is taken often — while a person dragging the scrub bar
 * moves it by more than any tick could account for. Only the second one
 * is news for the room; the first is this browser's problem and this
 * browser seeks its way out of it.
 *
 * There is a third state, and leaving it out cost us a room: a player
 * that has not ARRIVED yet. A video asked to start at 9:30 reads as 0:00
 * for as long as it takes to load, which is a jump by any measure — and
 * a jump, reported, is how a joiner drags the whole room back to the
 * beginning of a film it was in the middle of. So a player that is not
 * yet where the room is says nothing about position at all. It is
 * `settling`, and the only thing it is still allowed to report is a
 * person pressing pause.
 */

/** One reading of a player: where it was, whether it was playing, when. */
export interface PlayerSample {
  time: number;
  playing: boolean;
  /** Clock reading (ms) when the sample was taken. */
  at: number;
}

export type SyncAction =
  /** A person did this: the room follows them. */
  | { kind: 'report'; playing: boolean; time: number }
  /** We are the ones adrift: catch up without telling anybody. */
  | { kind: 'seek'; time: number }
  /**
   * Still on our way to where the room is (loading, buffering after a
   * seek). Nothing to say and nothing to fix: whoever is waiting on a
   * player is not evidence about where the video should be.
   */
  | { kind: 'wait' }
  | { kind: 'idle' };

/**
 * A position that moved this much more (or less) than the clock did is a
 * person on the scrub bar. Buffering never jumps: it stalls, which costs
 * at most one sampling interval.
 */
export const SEEK_JUMP_SECONDS = 1.5;

/** A scrub burst becomes one room update after the controller lets go. */
export const SEEK_REPORT_DEBOUNCE_MS = 1500;

export interface PendingSeekReport {
  time: number;
  playing: boolean;
  lastJumpAt: number;
}

export interface ControllerSyncDecision {
  action: SyncAction;
  pending: PendingSeekReport | null;
}

export function decideSync(
  previous: PlayerSample,
  current: PlayerSample,
  /** The room's state, its position already projected to `current.at`. */
  room: { playing: boolean; time: number },
  /**
   * This player has been told where to go and has not got there yet — it
   * was just handed a video, or seeked. See the note above: while that is
   * true, its position is not evidence of anything.
   */
  settling = false,
): SyncAction {
  if (current.playing !== room.playing) {
    // Somebody pressed play or pause — theirs is the room's state now.
    // The one thing a settling player may still report, because a hand on
    // the pause button is a hand on the pause button.
    return { kind: 'report', playing: current.playing, time: current.time };
  }
  const arrived = Math.abs(current.time - room.time) <= DRIFT_TOLERANCE_SECONDS;
  if (settling && !arrived) {
    return { kind: 'wait' };
  }
  const advanced = current.time - previous.time;
  const wall = previous.playing ? Math.max(0, current.at - previous.at) / 1000 : 0;
  if (Math.abs(advanced - wall) > SEEK_JUMP_SECONDS) {
    return { kind: 'report', playing: current.playing, time: current.time };
  }
  if (current.playing && !arrived) {
    return { kind: 'seek', time: room.time };
  }
  return { kind: 'idle' };
}

/**
 * The controller may tap or drag through several positions while finding
 * the right moment. Viewers need the last position, not every loading state
 * on the way there. Play/pause remains immediate; position jumps settle into
 * one report after a quiet window.
 */
export function decideControllerSync(
  previous: PlayerSample,
  current: PlayerSample,
  room: { playing: boolean; time: number },
  settling = false,
  pending: PendingSeekReport | null = null,
): ControllerSyncDecision {
  if (current.playing !== room.playing) {
    return {
      action: { kind: 'report', playing: current.playing, time: current.time },
      pending: null,
    };
  }

  const advanced = current.time - previous.time;
  const wall = previous.playing ? Math.max(0, current.at - previous.at) / 1000 : 0;
  const jumped = Math.abs(advanced - wall) > SEEK_JUMP_SECONDS;

  if (pending) {
    const next = {
      time: current.time,
      playing: current.playing,
      lastJumpAt: jumped ? current.at : pending.lastJumpAt,
    };
    if (current.at - next.lastJumpAt >= SEEK_REPORT_DEBOUNCE_MS) {
      return {
        action: { kind: 'report', playing: next.playing, time: next.time },
        pending: null,
      };
    }
    return { action: { kind: 'wait' }, pending: next };
  }

  const action = decideSync(previous, current, room, settling);
  if (action.kind !== 'report') {
    return { action, pending: null };
  }
  return {
    action: { kind: 'wait' },
    pending: { time: current.time, playing: current.playing, lastJumpAt: current.at },
  };
}

// ---------------------------------------------------------------------
// A player that says what it is doing: our own <video>, and Twitch's
// ---------------------------------------------------------------------

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
