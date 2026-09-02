import { describe, expect, it } from 'vitest';
import { advance, enqueue, mayAdvanceFrom, playAt, removeAt, startWith, withListIndex } from './queue';
import { QUEUE_MAX, type WatchItem } from './state';

const video = (id: string): WatchItem => ({ kind: 'video', video: id });
const a = video('aaaaaaaaaaa');
const b = video('bbbbbbbbbbb');
const c = video('ccccccccccc');
const list: WatchItem = { kind: 'list', list: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', index: 0 };

describe('starting', () => {
  it('puts one thing on, playing, from where the link said', () => {
    expect(startWith(a, 90)).toEqual({ now: a, playing: true, time: 90, queue: [] });
  });
});

describe('the queue', () => {
  it('lines things up in order', () => {
    let state = startWith(a);
    state = enqueue(state, b);
    state = enqueue(state, list);
    expect(state.queue).toEqual([b, list]);
    expect(state.now).toEqual(a);
  });

  it('a full queue keeps what it has', () => {
    let state = startWith(a);
    for (let i = 0; i < QUEUE_MAX + 5; i++) {
      state = enqueue(state, b);
    }
    expect(state.queue).toHaveLength(QUEUE_MAX);
  });

  it('removing takes out the one asked for', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    expect(removeAt(state, 0).queue).toEqual([c]);
    expect(removeAt(state, 5)).toBe(state);
    expect(removeAt(state, -1)).toBe(state);
  });

  it('playing one from the queue drops what it jumped over', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    // The room chose to jump to c: b was passed on, not postponed.
    expect(playAt(state, 1)).toEqual({ now: c, playing: true, time: 0, queue: [] });
    expect(playAt(state, 9)).toBe(state);
  });
});

describe('where a queued thing begins', () => {
  it('a link queued at a moment comes on at that moment', () => {
    const at10 = { kind: 'video', video: 'ddddddddddd', start: 600 } as const;
    const state = { now: a, playing: true, time: 5, queue: [at10] };
    expect(advance(state)).toMatchObject({ now: at10, time: 600 });
    expect(playAt(state, 0)).toMatchObject({ now: at10, time: 600 });
    expect(startWith(at10)).toMatchObject({ time: 600 });
  });

  it('everything else begins at its beginning', () => {
    expect(advance({ now: a, playing: true, time: 5, queue: [b] })).toMatchObject({ time: 0 });
    expect(advance({ now: a, playing: true, time: 5, queue: [list] })).toMatchObject({ time: 0 });
  });
});

describe('advancing', () => {
  it('moves to the next thing, from its start', () => {
    const state = { now: a, playing: true, time: 400, queue: [b, c] };
    expect(advance(state)).toEqual({ now: b, playing: true, time: 0, queue: [c] });
  });

  it('with nothing lined up it stops where it is', () => {
    // The last frame stays on the stage: a video ending is not a reason
    // for the stage to empty itself out from under the room.
    const state = { now: a, playing: true, time: 400, queue: [] };
    expect(advance(state)).toEqual({ ...state, playing: false });
  });

  it('only whoever is still on the room’s item may advance it', () => {
    const state = { now: b, playing: true, time: 0, queue: [c] };
    // Two players ending together: both pass, and both send the same move.
    expect(mayAdvanceFrom(state, b)).toBe(true);
    // A straggler that ends late, after the room already moved on: silent.
    expect(mayAdvanceFrom(state, a)).toBe(false);
  });

  it('a playlist is still the room’s item wherever it is', () => {
    const state = { now: { ...list, index: 4 }, playing: true, time: 0, queue: [] };
    expect(mayAdvanceFrom(state, list)).toBe(true);
  });
});

describe('a playlist walking on its own', () => {
  it('the room follows the index, from the top of the new video', () => {
    const state = { now: list, playing: false, time: 120, queue: [a] };
    expect(withListIndex(state, 2)).toEqual({
      now: { ...list, index: 2 },
      playing: true,
      time: 0,
      queue: [a],
    });
  });

  it('the same index changes nothing, and a video has no index', () => {
    const onList = { now: list, playing: true, time: 5, queue: [] };
    expect(withListIndex(onList, 0)).toBe(onList);
    const onVideo = { now: a, playing: true, time: 5, queue: [] };
    expect(withListIndex(onVideo, 3)).toBe(onVideo);
  });
});
