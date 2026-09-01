import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSoundEffectsEnabled, soundEffectsEnabled } from '../src/lib/notification-sound';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe('sound effects switch', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is on by default and remembers being switched off', () => {
    expect(soundEffectsEnabled()).toBe(true);
    setSoundEffectsEnabled(false);
    expect(soundEffectsEnabled()).toBe(false);
    expect(localStorage.getItem('freecord:sounds')).toBe('off');
  });

  it('switching back on clears the key rather than storing "on"', () => {
    setSoundEffectsEnabled(false);
    setSoundEffectsEnabled(true);
    expect(soundEffectsEnabled()).toBe(true);
    expect(localStorage.getItem('freecord:sounds')).toBeNull();
  });

  it('defaults to on when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('private browsing');
      },
    });
    expect(soundEffectsEnabled()).toBe(true);
    expect(() => setSoundEffectsEnabled(false)).not.toThrow();
  });
});
