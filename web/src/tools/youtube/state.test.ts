import { describe, expect, it } from 'vitest';
import { QUEUE_MAX, parseItem, parseState, positionAt, sameItem } from './state';

const video = { kind: 'video', video: 'dQw4w9WgXcQ' } as const;
const list = { kind: 'list', list: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', index: 3 } as const;
const state = { now: video, playing: true, time: 30, queue: [] };

describe('parseItem', () => {
  it('takes a video and a position inside a playlist', () => {
    expect(parseItem(video)).toEqual(video);
    expect(parseItem(list)).toEqual(list);
  });

  it('refuses anything a peer could have made up', () => {
    for (const raw of [
      null,
      'dQw4w9WgXcQ',
      { kind: 'video' },
      { kind: 'video', video: 'javascript:alert(1)' },
      { kind: 'video', video: 'short' },
      { kind: 'list', list: 'PL' },
      { kind: 'list', list: list.list, index: -1 },
      { kind: 'list', list: list.list, index: 1.5 },
      { kind: 'list', list: list.list, index: 999_999 },
      { kind: 'stream', url: 'https://evil.example/x' },
    ]) {
      expect(parseItem(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('a queued moment', () => {
  it('is kept when it is one, and dropped when it is nonsense', () => {
    expect(parseItem({ ...video, start: 600 })).toEqual({ ...video, start: 600 });
    expect(parseItem({ ...video, start: -5 })).toEqual(video);
    expect(parseItem({ ...video, start: '600' })).toEqual(video);
    expect(parseItem({ ...video, start: 25 * 60 * 60 })).toEqual(video);
  });
});

describe('sameItem', () => {
  it('a playlist is itself wherever it happens to be', () => {
    expect(sameItem(list, { ...list, index: 9 })).toBe(true);
    expect(sameItem(video, { ...video })).toBe(true);
    expect(sameItem(video, list)).toBe(false);
  });
});

describe('parseState', () => {
  it('takes a state this tool could have written', () => {
    expect(parseState(state)).toEqual(state);
    expect(parseState({ ...state, queue: [video, list] })).toEqual({ ...state, queue: [video, list] });
  });

  it('a missing queue is an empty one', () => {
    expect(parseState({ now: video, playing: false, time: 0 })?.queue).toEqual([]);
  });

  it('one bad entry costs the entry, not the evening', () => {
    const parsed = parseState({ ...state, queue: [video, { kind: 'video', video: 'nope' }, list] });
    expect(parsed?.queue).toEqual([video, list]);
  });

  it('a queue longer than the cap is cut to it', () => {
    const long = Array.from({ length: QUEUE_MAX + 10 }, () => video);
    expect(parseState({ ...state, queue: long })?.queue).toHaveLength(QUEUE_MAX);
  });

  it('refuses a state with nothing playable in it', () => {
    // The server stores a state without looking at it, so this is the
    // only check between another peer's message and the player.
    for (const raw of [
      null,
      'a string',
      {},
      { ...state, now: { kind: 'video', video: 'https://evil.example/x' } },
      { ...state, playing: 'yes' },
      { ...state, time: -1 },
      { ...state, time: Number.NaN },
      { ...state, time: 25 * 60 * 60 },
    ]) {
      expect(parseState(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('positionAt', () => {
  it('a paused video sits still; a playing one moves with the clock', () => {
    expect(positionAt({ ...state, playing: false }, 1_000, 61_000)).toBe(30);
    expect(positionAt(state, 1_000, 61_000)).toBe(90);
  });

  it('a clock that went backwards never rewinds the room', () => {
    expect(positionAt(state, 10_000, 9_000)).toBe(30);
  });
});
