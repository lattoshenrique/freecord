import { describe, expect, it } from 'vitest';
import {
  hasTrafficLights,
  isWindowState,
  titleBarLabel,
  windowChrome,
  type DesktopBridge,
} from '../src/lib/desktop';

/** A shell that exposes everything the bar needs. */
const full = (over: Partial<DesktopBridge> = {}): DesktopBridge => ({
  platform: 'win32',
  capabilities: { windowChrome: true },
  window: {
    ready: () => undefined,
    state: async () => null,
    onState: () => () => undefined,
    run: () => undefined,
  },
  ...over,
});

describe('windowChrome', () => {
  it('draws nothing in a browser', () => {
    expect(windowChrome(undefined)).toBeNull();
  });

  it('draws nothing on a shell that still has its own frame', () => {
    // An older shell: it exposes the bridge, but not this capability.
    expect(windowChrome({ capabilities: { systemAudio: true } })).toBeNull();
  });

  it('draws nothing when a call the bar depends on is missing', () => {
    const bridge = full();
    delete bridge.window?.onState;
    expect(windowChrome(bridge)).toBeNull();
  });

  it('hands back the bridge when the shell can carry a bar', () => {
    const bridge = full();
    expect(windowChrome(bridge)).toBe(bridge.window);
  });
});

describe('hasTrafficLights', () => {
  it('is true only when the shell says so', () => {
    expect(hasTrafficLights(full({ capabilities: { windowChrome: true, trafficLights: true } }))).toBe(true);
    expect(hasTrafficLights(full())).toBe(false);
    expect(hasTrafficLights(undefined)).toBe(false);
  });
});

describe('isWindowState', () => {
  it('accepts a complete state and refuses anything else', () => {
    expect(isWindowState({ maximized: false, fullScreen: true, focused: true })).toBe(true);
    expect(isWindowState({ maximized: false, fullScreen: true })).toBe(false);
    expect(isWindowState(null)).toBe(false);
    expect(isWindowState('maximized')).toBe(false);
  });
});

describe('titleBarLabel', () => {
  it('names the screen without ever naming the room', () => {
    expect(titleBarLabel('/r/abc-def#k=secret')).toBe('desktop.window.room');
    expect(titleBarLabel('/community')).toBe('home.community');
    expect(titleBarLabel('/how-it-works')).toBe('how.link');
  });

  it('leaves the home to the mark beside it', () => {
    expect(titleBarLabel('/')).toBeNull();
  });
});
