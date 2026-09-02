import { describe, expect, it } from 'vitest';
import { parseState, positionAt } from './state';

const state = { video: 'dQw4w9WgXcQ', playing: true, time: 30 };

describe('parseState', () => {
  it('takes a state this tool could have written', () => {
    expect(parseState(state)).toEqual(state);
    expect(parseState({ ...state, playing: false, time: 0 })).toEqual({
      video: 'dQw4w9WgXcQ',
      playing: false,
      time: 0,
    });
  });

  it('drops the field it did not ask for', () => {
    expect(parseState({ ...state, extra: 'ignored' })).toEqual(state);
  });

  it('refuses anything a peer could have made up', () => {
    // The server stores a state without looking at it, so this is the
    // only check between another peer's message and the player.
    for (const raw of [
      null,
      undefined,
      'a string',
      42,
      {},
      { ...state, video: 'javascript:alert(1)' },
      { ...state, video: 'https://evil.example/x' },
      { ...state, video: 'short' },
      { ...state, playing: 'yes' },
      { ...state, time: -1 },
      { ...state, time: Number.NaN },
      { ...state, time: Number.POSITIVE_INFINITY },
      { ...state, time: 25 * 60 * 60 },
      { ...state, time: '30' },
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
