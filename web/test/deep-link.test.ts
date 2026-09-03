import { describe, expect, it } from 'vitest';
import { APP_SCHEME, appLink, routeFromTarget } from '../src/lib/deep-link';

describe('appLink', () => {
  it('addresses the same room to the app', () => {
    expect(appLink('/r/abcdefghijkl', '')).toBe(`${APP_SCHEME}://r/abcdefghijkl`);
  });

  it('carries the fragment, because it carries the chat key', () => {
    const key = 'a'.repeat(43);
    expect(appLink('/r/abcdefghijkl', `#k=${key}&n=Old+name`)).toBe(
      `${APP_SCHEME}://r/abcdefghijkl#${key}~T2xkIG5hbWU`,
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
