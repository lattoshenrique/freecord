import { describe, expect, it } from 'vitest';
import { QUEUE_MAX, parseItem, parseState, sameItem, type ListenItem } from './state';

const track: ListenItem = { kind: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' };
const list: ListenItem = { kind: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' };

describe('parseItem', () => {
  it('takes a kind we know and an id shaped like one', () => {
    expect(parseItem(track)).toEqual(track);
    expect(parseItem(list)).toEqual(list);
    expect(parseItem({ kind: 'episode', id: '512ojhOuo1ktJprKbVcKyQ' })).toEqual({
      kind: 'episode',
      id: '512ojhOuo1ktJprKbVcKyQ',
    });
  });

  it('drops whatever else came with it', () => {
    expect(parseItem({ ...track, url: 'https://evil.example/x' })).toEqual(track);
  });

  it('refuses anything a peer could have made up', () => {
    for (const raw of [
      null,
      'track',
      { kind: 'track' },
      { kind: 'user', id: track.id },
      { kind: 'track', id: 'short' },
      // The id goes into an address we build: anything that could steer
      // that address is not an id.
      { kind: 'track', id: '../../../../etc/passwd' },
      { kind: 'track', id: `${track.id}?x=1` },
      { kind: 'track', id: 'javascript:alert(1)' },
      { kind: 'track', id: `${track.id}A` },
      { kind: 'track', id: 42 },
    ]) {
      expect(parseItem(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('sameItem', () => {
  it('is the kind and the id together', () => {
    expect(sameItem(track, { ...track })).toBe(true);
    expect(sameItem(track, { ...track, kind: 'album' })).toBe(false);
    expect(sameItem(track, list)).toBe(false);
  });
});

describe('parseState', () => {
  it('takes a state this tool could have written', () => {
    expect(parseState({ now: track, queue: [list] })).toEqual({ now: track, queue: [list] });
  });

  it('a missing queue is an empty one', () => {
    expect(parseState({ now: track })).toEqual({ now: track, queue: [] });
    expect(parseState({ now: track, queue: 'nope' })).toEqual({ now: track, queue: [] });
  });

  it('one bad entry costs the entry, not the evening', () => {
    const parsed = parseState({ now: track, queue: [list, { kind: 'track' }, track] });
    expect(parsed?.queue).toEqual([list, track]);
  });

  it('a queue longer than the room allows is cut to it', () => {
    const long = Array.from({ length: QUEUE_MAX + 12 }, () => list);
    expect(parseState({ now: track, queue: long })?.queue).toHaveLength(QUEUE_MAX);
  });

  it('refuses a state with nothing playable in it', () => {
    for (const raw of [null, 42, 'spotify:track:4cOdK2wGLETKBW3PvgPWqT', {}, { now: null }, { now: { kind: 'track', id: '!' } }]) {
      expect(parseState(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});
