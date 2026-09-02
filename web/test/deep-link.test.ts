import { describe, expect, it } from 'vitest';
import { APP_SCHEME, appLink, prefersApp, rememberApp, routeFromTarget } from '../src/lib/deep-link';

describe('appLink', () => {
  it('addresses the same room to the app', () => {
    expect(appLink('/r/abcdefghijkl', '')).toBe(`${APP_SCHEME}://r/abcdefghijkl`);
  });

  it('carries the fragment, because it carries the chat key', () => {
    const key = 'a'.repeat(43);
    expect(appLink('/r/abcdefghijkl', `#k=${key}`)).toBe(
      `${APP_SCHEME}://r/abcdefghijkl#k=${key}`,
    );
  });

  it('has nothing to offer on a page that is not a room', () => {
    expect(appLink('/', '')).toBeNull();
    expect(appLink('/community', '')).toBeNull();
    expect(appLink('/r/short', '')).toBeNull();
  });
});

describe('routeFromTarget', () => {
  const origin = 'https://freecord.example';

  it('reduces a target from the shell to a path the router can take', () => {
    expect(routeFromTarget(`${origin}/r/abcdefghijkl#k=1`, origin)).toBe('/r/abcdefghijkl#k=1');
  });

  it('refuses another origin, whatever the shell believed it was sending', () => {
    expect(routeFromTarget('https://evil.example/r/abcdefghijkl', origin)).toBeNull();
    // A same-origin prefix is not the same origin.
    expect(routeFromTarget('https://freecord.example.evil.test/r/abc', origin)).toBeNull();
  });

  it('refuses anything that is not a URL at all', () => {
    expect(routeFromTarget('/r/abcdefghijkl', origin)).toBeNull();
    expect(routeFromTarget(null, origin)).toBeNull();
    expect(routeFromTarget(42, origin)).toBeNull();
  });
});

describe('the remembered choice', () => {
  /** Enough of a Storage to hold one answer. */
  function fakeStore(): Storage {
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
      clear: () => values.clear(),
      key: () => null,
      get length() {
        return values.size;
      },
    } as Storage;
  }

  it('starts unset, is remembered, and can be taken back', () => {
    const store = fakeStore();
    expect(prefersApp(store)).toBe(false);
    rememberApp(true, store);
    expect(prefersApp(store)).toBe(true);
    rememberApp(false, store);
    expect(prefersApp(store)).toBe(false);
  });

  it('treats a browser with nowhere to keep it as nobody having chosen', () => {
    expect(() => rememberApp(true, null)).not.toThrow();
    expect(prefersApp(null)).toBe(false);
  });

  it('survives storage that throws instead of answering', () => {
    // Safari in private browsing, and any browser told to block site data.
    const denied = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => rememberApp(true, denied)).not.toThrow();
    expect(prefersApp(denied)).toBe(false);
  });
});
