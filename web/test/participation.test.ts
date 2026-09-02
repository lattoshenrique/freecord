import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PARTICIPATION,
  extractScreenRefusal,
  loadParticipation,
  makeScreenRefusal,
  mayRefuse,
  saveParticipation,
  sendingTargets,
} from '../src/lib/participation';

/** The same shape media-settings.test.ts uses: storage without a browser. */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadParticipation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('takes part in everything when storage is not there at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadParticipation()).toEqual(DEFAULT_PARTICIPATION);
  });

  it('takes part in everything until somebody says otherwise', () => {
    expect(loadParticipation()).toEqual(DEFAULT_PARTICIPATION);
  });

  it('remembers a refusal across sessions', () => {
    saveParticipation({ screens: false, tools: true });
    expect(loadParticipation()).toEqual({ screens: false, tools: true });
  });

  it('reads a half-written value as taking part', () => {
    localStorage.setItem('freecord:participation', JSON.stringify({ tools: false }));
    expect(loadParticipation()).toEqual({ screens: true, tools: false });
  });

  it('survives a value that is not settings at all', () => {
    localStorage.setItem('freecord:participation', 'not json');
    expect(loadParticipation()).toEqual(DEFAULT_PARTICIPATION);
  });
});

describe('the refusal note', () => {
  it('says which screen it is about, and comes back whole', () => {
    const note = makeScreenRefusal('peer-a', true);
    expect(extractScreenRefusal(note)).toEqual({ v: 1, of: 'peer-a', on: true });
  });

  it('carries the way back in too', () => {
    expect(extractScreenRefusal(makeScreenRefusal('peer-a', false))?.on).toBe(false);
  });

  it('is not confused with the SDP and ICE that share the envelope', () => {
    expect(extractScreenRefusal({ description: { type: 'offer', sdp: 'v=0' } })).toBeNull();
    expect(extractScreenRefusal({ candidate: { candidate: 'candidate:1 1 udp' } })).toBeNull();
    expect(extractScreenRefusal({ relay: { v: 1, kind: 'stall' } })).toBeNull();
  });

  it('refuses a note it cannot read rather than guessing', () => {
    expect(extractScreenRefusal({ screens: { v: 2, of: 'peer-a', on: true } })).toBeNull();
    expect(extractScreenRefusal({ screens: { v: 1, on: true } })).toBeNull();
    expect(extractScreenRefusal({ screens: { v: 1, of: 'peer-a', on: 'yes' } })).toBeNull();
    expect(extractScreenRefusal(null)).toBeNull();
    expect(extractScreenRefusal('screens')).toBeNull();
  });
});

describe('sendingTargets', () => {
  it('drops the people who refused this screen', () => {
    expect(sendingTargets(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });

  it('keeps the order the tree gave', () => {
    expect(sendingTargets(['c', 'a', 'b'], new Set())).toEqual(['c', 'a', 'b']);
  });

  it('sending to nobody is a normal outcome', () => {
    expect(sendingTargets(['a'], new Set(['a']))).toEqual([]);
  });
});

describe('mayRefuse', () => {
  it('lets a leaf refuse', () => {
    expect(mayRefuse({ screens: false, tools: true }, [])).toBe(true);
  });

  it('keeps a relay carrying the screen for the people below it', () => {
    expect(mayRefuse({ screens: false, tools: true }, ['a'])).toBe(false);
  });

  it('has nothing to say while the person takes part', () => {
    expect(mayRefuse({ screens: true, tools: true }, [])).toBe(false);
  });
});
