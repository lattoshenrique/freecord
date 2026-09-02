import { describe, expect, it } from 'vitest';
import {
  advance,
  enqueue,
  fits,
  hasRoomFor,
  mayAdvanceFrom,
  playAt,
  removeAt,
  startWith,
  withListIndex,
} from './queue';
import { QUEUE_MAX, STATE_BUDGET, type WatchItem } from './state';

const video = (id: string): WatchItem => ({ kind: 'video', video: id });
const a = video('aaaaaaaaaaa');
const b = video('bbbbbbbbbbb');
const c = video('ccccccccccc');
const list: WatchItem = { kind: 'list', list: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', index: 0 };
const file: WatchItem = { kind: 'source', play: 'file', url: 'https://cdn.example.com/11.mp4' };

describe('starting', () => {
  it('puts one thing on, playing, from where the link said', () => {
    const atMinute = { kind: 'video', video: 'aaaaaaaaaaa', start: 90 } as const;
    expect(startWith(atMinute)).toEqual({ now: atMinute, playing: true, time: 90, queue: [] });
  });

  it('starts anything else at its beginning', () => {
    expect(startWith(file)).toEqual({ now: file, playing: true, time: 0, queue: [] });
  });
});

describe('the queue', () => {
  it('lines up anything the tool can watch, in order', () => {
    let state = startWith(a);
    state = enqueue(state, b);
    state = enqueue(state, list);
    state = enqueue(state, file);
    expect(state.queue).toEqual([b, list, file]);
    expect(state.now).toEqual(a);
  });

  it('a full queue keeps what it has', () => {
    let state = startWith(a);
    for (let i = 0; i < QUEUE_MAX + 5; i++) {
      state = enqueue(state, b);
    }
    expect(state.queue).toHaveLength(QUEUE_MAX);
    expect(hasRoomFor(state, b)).toBe(false);
  });

  it('counting is not the only cap: a state has 4 KiB to live in', () => {
    // Ten YouTube ids fit in a line; ten URLs of a length sites really
    // do hand out do not. Refused whole by the server, an oversized state
    // would take the room's next play with it, not just this entry.
    const long: WatchItem = {
      kind: 'source',
      play: 'hls',
      url: `https://cdn.example.com/${'a'.repeat(1900)}.m3u8`,
    };
    let state = startWith(a);
    state = enqueue(state, long);
    expect(state.queue).toHaveLength(1);
    // Two of them do not, and the queue says so before anybody presses.
    expect(hasRoomFor(state, long)).toBe(false);
    expect(enqueue(state, long)).toBe(state);
    expect(fits(state)).toBe(true);
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(STATE_BUDGET);
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
    expect(advance({ now: a, playing: true, time: 5, queue: [file] })).toMatchObject({ time: 0 });
  });
});

describe('advancing', () => {
  it('moves to the next thing, whatever kind of thing it is', () => {
    const state = { now: a, playing: true, time: 400, queue: [file, c] };
    expect(advance(state)).toEqual({ now: file, playing: true, time: 0, queue: [c] });
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

  it('an episode that ends hands over the same way a video does', () => {
    const state = { now: file, playing: true, time: 1_200, queue: [a] };
    expect(mayAdvanceFrom(state, file)).toBe(true);
    expect(mayAdvanceFrom(state, { ...file, url: 'https://cdn.example.com/10.mp4' })).toBe(false);
    expect(advance(state)).toEqual({ now: a, playing: true, time: 0, queue: [] });
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

  it('the same index changes nothing, and nothing else has one', () => {
    const onList = { now: list, playing: true, time: 5, queue: [] };
    expect(withListIndex(onList, 0)).toBe(onList);
    const onVideo = { now: a, playing: true, time: 5, queue: [] };
    expect(withListIndex(onVideo, 3)).toBe(onVideo);
    const onFile = { now: file, playing: true, time: 5, queue: [] };
    expect(withListIndex(onFile, 3)).toBe(onFile);
  });
});
