/**
 * The lineup: what the room put on, what is behind it, and the moves
 * anybody may make on either.
 *
 * Pure functions over the shared state, on purpose. Every one of these
 * is a thing several people can do at the same moment, and the room
 * settles it the way it settles everything else: last word wins
 * (docs/tools.md). What keeps that from thrashing is that the moves are
 * written as functions of the state they were handed, so two people
 * skipping the same song land on the same next one instead of eating two
 * of them — `advance` past the item that is on is the same advance
 * whoever makes it.
 *
 * Nothing here happens by itself. This tool cannot hear its own player
 * (index.ts), so a song ending moves nothing: the queue walks when a
 * person walks it, which is also what somebody handing round an aux
 * cable does.
 */
import { QUEUE_MAX, type ListenItem, type ListenState } from './state';

/** A first state: this on, nothing lined up behind it. */
export function startWith(item: ListenItem): ListenState {
  return { now: item, queue: [] };
}

/** Lines an item up at the end. A full queue keeps what it has. */
export function enqueue(state: ListenState, item: ListenItem): ListenState {
  if (state.queue.length >= QUEUE_MAX) {
    return state;
  }
  return { ...state, queue: [...state.queue, item] };
}

/** Drops the item at `index`; out of range changes nothing. */
export function removeAt(state: ListenState, index: number): ListenState {
  if (index < 0 || index >= state.queue.length) {
    return state;
  }
  return { ...state, queue: state.queue.filter((_, at) => at !== index) };
}

/**
 * Puts a queued item on now, keeping what was behind it in order and
 * dropping what it skipped past — the room chose to jump, so the ones it
 * jumped over were passed on, not postponed.
 */
export function playAt(state: ListenState, index: number): ListenState {
  const item = state.queue[index];
  if (!item) {
    return state;
  }
  return { now: item, queue: state.queue.slice(index + 1) };
}

/**
 * Moves to the next thing. With nothing lined up the room keeps what it
 * has on: taking it off would empty the stage under people who are still
 * listening to it, and the key that takes it off for everyone is its own.
 */
export function advance(state: ListenState): ListenState {
  const [next, ...rest] = state.queue;
  return next ? { now: next, queue: rest } : state;
}
