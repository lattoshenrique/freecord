/**
 * The queue: what the room lined up, and the rules for moving through it.
 *
 * Pure functions over the shared state, on purpose. Every one of these is
 * a thing several people can do at the same moment — two peers whose
 * videos end within a second of each other, one adding while another
 * skips — and the room settles it the way it settles everything else:
 * last word wins (docs/tools.md). What keeps that from thrashing is that
 * these moves are IDEMPOTENT in the way that matters. Advancing past the
 * item that is on lands on the same next item no matter who does it, and
 * `advance` is only ever called by a player whose own item is still the
 * one the room has on — so a straggler that ends late cannot drag the
 * room back to the film it already left.
 */
import { QUEUE_MAX, sameItem, type WatchItem, type WatchState } from './state';

/** Where an item begins when its turn comes: what its link asked for. */
function startOf(item: WatchItem): number {
  return item.kind === 'video' ? (item.start ?? 0) : 0;
}

/** A first state: this item on, playing, nothing lined up behind it. */
export function startWith(item: WatchItem, startSeconds = startOf(item)): WatchState {
  return { now: item, playing: true, time: startSeconds, queue: [] };
}

/** Lines an item up at the end. A full queue keeps what it has. */
export function enqueue(state: WatchState, item: WatchItem): WatchState {
  if (state.queue.length >= QUEUE_MAX) {
    return state;
  }
  return { ...state, queue: [...state.queue, item] };
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
 * was playing is still what the room has on. Two peers reaching the end
 * together both pass; the second's message is the same advance as the
 * first's. A peer that reaches the end LATE — a buffering straggler —
 * finds the room already moved on, and says nothing.
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
