import { describe, expect, it, vi } from 'vitest';
import {
  AudioMix,
  MAX_MIX_LEVEL,
  MAX_TOOL_MIX_LEVEL,
  clampLevel,
  effectiveLevel,
  isDefaultLevel,
  mixKey,
  mixKindOf,
  maxMixLevelFor,
  type MixKey,
} from '../src/lib/audio-mix';

function memoryStorage(seed?: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const alice = mixKey('person', 'p1');
const shared = mixKey('screen', 'p2');
const watch = mixKey('tool', 'watch');

describe('keys', () => {
  it('names a source by kind and id', () => {
    expect(alice).toBe('person:p1');
    expect(mixKindOf(alice)).toBe('person');
    expect(mixKindOf(shared)).toBe('screen');
    expect(mixKindOf(watch)).toBe('tool');
  });

  it('refuses a kind it does not know', () => {
    expect(mixKindOf('bogus:1' as MixKey)).toBeNull();
    expect(mixKindOf('person' as MixKey)).toBeNull();
  });

  it('only offers real amplification where the playback path supports it', () => {
    expect(maxMixLevelFor(alice)).toBe(MAX_MIX_LEVEL);
    expect(maxMixLevelFor(shared)).toBe(MAX_MIX_LEVEL);
    expect(maxMixLevelFor(watch)).toBe(MAX_TOOL_MIX_LEVEL);
  });
});

describe('levels', () => {
  it('clamps into the mix range', () => {
    expect(clampLevel(-2)).toBe(0);
    expect(clampLevel(0.35)).toBe(0.35);
    expect(clampLevel(1.75)).toBe(1.75);
    expect(clampLevel(4)).toBe(MAX_MIX_LEVEL);
    expect(clampLevel(Number.NaN)).toBe(1);
  });

  it('reads an unknown source as untouched', () => {
    expect(effectiveLevel(undefined)).toBe(1);
    expect(isDefaultLevel(undefined)).toBe(true);
  });

  it('mutes to silence without losing the slider', () => {
    expect(effectiveLevel({ level: 0.4, muted: true })).toBe(0);
    expect(isDefaultLevel({ level: 1, muted: true })).toBe(false);
  });
});

describe('the mixer', () => {
  it('starts every source at full', () => {
    const mix = new AudioMix(null);
    expect(mix.volumeOf(alice)).toBe(1);
    expect(mix.entries()).toEqual([]);
  });

  it('holds a level per source, independently', () => {
    const mix = new AudioMix(null);
    mix.setLevel(alice, 0.25);
    expect(mix.volumeOf(alice)).toBe(0.25);
    expect(mix.volumeOf(shared)).toBe(1);
  });

  it('lets one source be amplified to 200%', () => {
    const mix = new AudioMix(null);
    mix.setLevel(alice, 2);
    expect(mix.volumeOf(alice)).toBe(2);
    expect(mix.volumeOf(shared)).toBe(1);
  });

  it('does not store a fake boost for an embedded tool', () => {
    const mix = new AudioMix(null);
    mix.setLevel(watch, 2);
    expect(mix.volumeOf(watch)).toBe(1);
    expect(mix.entries()).toEqual([]);
  });

  it('drops a source back out of the list when it returns to full', () => {
    const mix = new AudioMix(null);
    mix.setLevel(alice, 0.5);
    expect(mix.entries()).toHaveLength(1);
    mix.setLevel(alice, 1);
    expect(mix.entries()).toEqual([]);
  });

  it('mutes and comes back to where the slider was', () => {
    const mix = new AudioMix(null);
    mix.setLevel(alice, 0.3);
    mix.toggleMuted(alice);
    expect(mix.volumeOf(alice)).toBe(0);
    expect(mix.get(alice).level).toBe(0.3);
    mix.toggleMuted(alice);
    expect(mix.volumeOf(alice)).toBe(0.3);
  });

  it('unmutes something dragged to zero at full, having nowhere to return to', () => {
    const mix = new AudioMix(null);
    mix.setLevel(alice, 0);
    expect(mix.get(alice)).toEqual({ level: 0, muted: true });
    mix.toggleMuted(alice);
    expect(mix.volumeOf(alice)).toBe(1);
  });

  it('tells its watchers once per real change', () => {
    const mix = new AudioMix(null);
    const seen = vi.fn();
    const off = mix.subscribe(seen);
    mix.setLevel(alice, 0.5);
    mix.setLevel(alice, 0.5); // same value: nothing happened
    expect(seen).toHaveBeenCalledTimes(1);
    expect(mix.snapshot()).toBe(1);
    off();
    mix.setLevel(alice, 0.2);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('forgets a source that left', () => {
    const mix = new AudioMix(null);
    mix.setLevel(alice, 0.5);
    mix.forget(alice);
    expect(mix.volumeOf(alice)).toBe(1);
    expect(mix.entries()).toEqual([]);
  });
});

describe('what survives a reload', () => {
  it('saves a tool level and nothing else', () => {
    const storage = memoryStorage();
    const mix = new AudioMix(storage);
    mix.setLevel(watch, 0.4);
    mix.setLevel(alice, 0.2);
    mix.setLevel(shared, 0.1);
    const saved = JSON.parse(storage.getItem('freecord:audio-mix') ?? '{}') as Record<string, unknown>;
    expect(Object.keys(saved)).toEqual(['tool:watch']);
  });

  it('reads a saved tool level back', () => {
    const storage = memoryStorage({
      'freecord:audio-mix': JSON.stringify({ 'tool:watch': { level: 0.4, muted: false } }),
    });
    expect(new AudioMix(storage).volumeOf(watch)).toBe(0.4);
  });

  it('normalizes an old tool boost that its player could never apply', () => {
    const storage = memoryStorage({
      'freecord:audio-mix': JSON.stringify({ 'tool:watch': { level: 2, muted: false } }),
    });
    expect(new AudioMix(storage).volumeOf(watch)).toBe(1);
  });

  it('ignores a peer level somebody put in storage by hand', () => {
    const storage = memoryStorage({
      'freecord:audio-mix': JSON.stringify({ 'person:p1': { level: 0.1, muted: false } }),
    });
    expect(new AudioMix(storage).volumeOf(alice)).toBe(1);
  });

  it('survives garbage instead of failing to build', () => {
    expect(new AudioMix(memoryStorage({ 'freecord:audio-mix': 'not json' })).entries()).toEqual([]);
    const wrong = memoryStorage({
      'freecord:audio-mix': JSON.stringify({ 'tool:watch': { level: 'loud' } }),
    });
    expect(new AudioMix(wrong).volumeOf(watch)).toBe(1);
  });

  it('works with no storage at all', () => {
    const mix = new AudioMix(null);
    mix.setLevel(watch, 0.5);
    expect(mix.volumeOf(watch)).toBe(0.5);
  });
});
