/**
 * The one rule that keeps a shared player honest:
 *
 *   a PERSON moving the player tells the room;
 *   a PLAYER falling behind fixes itself.
 *
 * Told apart by the clock. Between two readings of a playing video, the
 * position should advance by exactly the wall time that passed. A viewer
 * whose copy stalls advances by less — at most one tick's worth, which is
 * why the reading is taken often — while a person dragging the scrub bar
 * moves it by more than any tick could account for. Only the second one
 * is news for the room; the first is this browser's problem and this
 * browser seeks its way out of it.
 *
 * Getting that backwards is the classic watch-together bug: the slowest
 * connection in the room reports its own buffering as a seek and drags
 * everyone back to it, one second at a time, forever.
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
  | { kind: 'idle' };

/** Closer than this to the room's position, nobody can tell the difference. */
export const DRIFT_TOLERANCE_SECONDS = 2;
/**
 * A position that moved this much more (or less) than the clock did is a
 * person on the scrub bar. Buffering never jumps: it stalls, which costs
 * at most one sampling interval.
 */
export const SEEK_JUMP_SECONDS = 1.5;

export function decideSync(
  previous: PlayerSample,
  current: PlayerSample,
  /** The room's state, its position already projected to `current.at`. */
  room: { playing: boolean; time: number },
): SyncAction {
  if (current.playing !== room.playing) {
    // Somebody pressed play or pause — theirs is the room's state now.
    return { kind: 'report', playing: current.playing, time: current.time };
  }
  const advanced = current.time - previous.time;
  const wall = previous.playing ? Math.max(0, current.at - previous.at) / 1000 : 0;
  if (Math.abs(advanced - wall) > SEEK_JUMP_SECONDS) {
    return { kind: 'report', playing: current.playing, time: current.time };
  }
  if (current.playing && Math.abs(current.time - room.time) > DRIFT_TOLERANCE_SECONDS) {
    return { kind: 'seek', time: room.time };
  }
  return { kind: 'idle' };
}
