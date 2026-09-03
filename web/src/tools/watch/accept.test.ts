import { describe, expect, it } from 'vitest';
import { watchTool } from './index';
import { startWith } from './queue';
import type { WatchItem, WatchState } from './state';

/**
 * What this tool answers when the chat asks (`/play`, `/queue`, `/skip`).
 *
 * The contract's rule is that `null` means "not mine, ask the next tool"
 * — never "no" — and getting that wrong is the interesting failure: a
 * tool that answers everything swallows a link another one could have
 * played, and one that answers nothing is a command that silently does
 * nothing. Both directions are checked here.
 */
const accept = watchTool.accept!;

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const FILM: WatchItem = { kind: 'source', play: 'file', url: 'https://example.com/film.mp4' };

function now(state: WatchState | null, at = Date.now()) {
  return { state, at };
}

describe('what the watch tool takes from the chat', () => {
  it('plays a link it can read on sight, over whatever was on', () => {
    const answer = accept({ kind: 'play', input: YOUTUBE }, now(startWith(FILM)));
    expect(answer).toEqual({ next: { now: { kind: 'video', video: 'dQw4w9WgXcQ' }, playing: true, time: 0, queue: [] } });
  });

  it('takes a bare video id and a direct media address too', () => {
    expect(accept({ kind: 'play', input: 'dQw4w9WgXcQ' }, now(null))).toMatchObject({
      next: { now: { kind: 'video', video: 'dQw4w9WgXcQ' } },
    });
    expect(accept({ kind: 'play', input: 'https://example.com/film.mp4' }, now(null))).toMatchObject({
      next: { now: { kind: 'source', play: 'file' } },
    });
  });

  it('leaves a page alone: reading one is a round trip and then a choice', () => {
    expect(accept({ kind: 'play', input: 'https://example.com/an/episode' }, now(null))).toBeNull();
    expect(accept({ kind: 'play', input: 'not a link at all' }, now(null))).toBeNull();
  });

  it('lines one up behind what is on, and carries the position through', () => {
    const state = { ...startWith({ kind: 'video', video: 'dQw4w9WgXcQ' }), time: 30 };
    // Twelve seconds ago, and still playing: a state written now that did
    // not touch the position would rewind the room to 30s.
    const answer = accept({ kind: 'queue', input: 'https://example.com/film.mp4' }, now(state, Date.now() - 12_000));
    expect(answer).not.toBeNull();
    const next = (answer as { next: WatchState }).next;
    expect(next.queue).toEqual([FILM]);
    expect(next.now).toEqual(state.now);
    expect(next.time).toBeGreaterThan(41);
    expect(next.time).toBeLessThan(43);
  });

  it('starts the thing when nothing is on and it was asked to queue it', () => {
    expect(accept({ kind: 'queue', input: YOUTUBE }, now(null))).toMatchObject({
      next: { now: { kind: 'video', video: 'dQw4w9WgXcQ' }, playing: true },
    });
  });

  it('refuses in its own words when the queue has no room left', () => {
    // Long URLs, not many items: the budget a tool's state gets is bytes.
    const long = (n: number): WatchItem => ({
      kind: 'source',
      play: 'file',
      url: `https://example.com/${'a'.repeat(200)}/${n}.mp4`,
    });
    const full: WatchState = {
      now: long(0),
      playing: true,
      time: 0,
      queue: Array.from({ length: 16 }, (_, index) => long(index + 1)),
    };
    expect(accept({ kind: 'queue', input: 'https://example.com/film.mp4' }, now(full))).toEqual({
      refused: 'queueFull',
    });
  });

  it('moves on only when it has something on', () => {
    expect(accept({ kind: 'skip' }, now(null))).toBeNull();
    const state = { ...startWith({ kind: 'video', video: 'dQw4w9WgXcQ' }), queue: [FILM] };
    expect(accept({ kind: 'skip' }, now(state))).toEqual({
      next: { now: FILM, playing: true, time: 0, queue: [] },
    });
  });
});
