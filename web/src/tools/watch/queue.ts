/**
 * The queue: what the room lined up, and the rules for moving through it.
 *
 * Pure functions over the shared state, on purpose. The participant who
 * starts Watch Together controls these moves, while every other player is
 * read-only. They are still idempotent in the way that matters: `advance`
 * is only called by a controller whose own item is still the one the room
 * has on, so a late end event cannot drag the room back to the film it
 * already left.
 *
 * The queue takes anything the tool can watch. A YouTube video, an
 * episode found in somebody's page and a Twitch VOD line up in the same
 * list and hand the stage over to each other in turn.
 */
import {
  QUEUE_MAX,
  STATE_BUDGET,
  positionAt,
  sameItem,
  type WatchItem,
  type WatchState,
} from './state';

/** Where an item begins when its turn comes: what its link asked for. */
function startOf(item: WatchItem): number {
  return item.kind === 'video' ? (item.start ?? 0) : 0;
}

/** A first state: this item on, playing, nothing lined up behind it. */
export function startWith(item: WatchItem, startSeconds = startOf(item)): WatchState {
  return { now: item, playing: true, time: startSeconds, queue: [] };
}

/**
 * Whether a state still fits what a tool is allowed to say.
 *
 * Counting items is not enough now that one of them may be a two-kilobyte
 * URL: the server refuses an oversized state WHOLE (docs/tools.md), so a
 * queue nobody checked would not lose its last entry — it would lose the
 * room's next play, silently, and nobody would know why the video stopped
 * changing.
 */
export function fits(state: WatchState): boolean {
  return JSON.stringify(state).length <= STATE_BUDGET;
}

/**
 * The state with its position brought up to now — what to write through
 * whenever a move does not itself say where the video is.
 *
 * Every state carries a `time` and the moment it was set, and a viewer
 * reads the two together (docs/tools.md). So a state written WITHOUT
 * touching the position — lining something up, taking something out —
 * carries yesterday's number with today's timestamp, and every player in
 * the room dutifully seeks back to where the video was when somebody last
 * pressed something. Watched happening: adding to the queue rewound the
 * room twelve seconds, in front of everybody.
 */
export function carried(state: WatchState, at: number, now?: number): WatchState {
  return { ...state, time: positionAt(state, at, now) };
}

/** Lines an item up at the end. A queue with no room keeps what it has. */
export function enqueue(state: WatchState, item: WatchItem): WatchState {
  if (state.queue.length >= QUEUE_MAX) {
    return state;
  }
  const next = { ...state, queue: [...state.queue, item] };
  return fits(next) ? next : state;
}

/** Whether one more would fit — what the shelf disables its key on. */
export function hasRoomFor(state: WatchState, item: WatchItem): boolean {
  return enqueue(state, item) !== state;
}

/** Drops the item at `index` of the queue; out of range changes nothing. */
export function removeAt(state: WatchState, index: number): WatchState {
  if (index < 0 || index >= state.queue.length) {
    return state;
  }
  return { ...state, queue: state.queue.filter((_, at) => at !== index) };
}

/**
 * Puts a queued item on now, keeping everything behind it in order and
 * dropping what it skipped past — the room chose to jump, so the ones it
 * jumped over were passed on, not postponed.
 */
export function playAt(state: WatchState, index: number): WatchState {
  const item = state.queue[index];
  if (!item) {
    return state;
  }
  return { now: item, playing: true, time: startOf(item), queue: state.queue.slice(index + 1) };
}

/**
 * Moves to the next thing. With nothing lined up, the room stays where it
 * is and stops — leaving the last frame on the stage, which is what a
 * person expects when a video ends, rather than a stage that empties
 * itself out from under them.
 */
export function advance(state: WatchState): WatchState {
  const [next, ...rest] = state.queue;
  if (!next) {
    return { ...state, playing: false };
  }
  // From where its link asked to start: a video queued at 10:00 comes on
  // at 10:00, whoever's turn brought it here.
  return { now: next, playing: true, time: startOf(next), queue: rest };
}

/**
 * Whether this player may report that its item finished: only if what it
 * was playing is still what the room has on. A late end event after the
 * controller already moved the room on finds a different item and says
 * nothing.
 */
export function mayAdvanceFrom(state: WatchState, finished: WatchItem): boolean {
  return sameItem(state.now, finished);
}

/** The playlist moved to another of its videos; the room follows it. */
export function withListIndex(state: WatchState, index: number): WatchState {
  if (state.now.kind !== 'list' || state.now.index === index) {
    return state;
  }
  return { ...state, now: { ...state.now, index }, time: 0, playing: true };
}
