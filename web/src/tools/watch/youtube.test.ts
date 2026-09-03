import { afterEach, describe, expect, it } from 'vitest';
import { createPlayer, youtubeLiveEdgeOf, type YouTubePlayer } from './youtube';

function player(data: { isLive?: boolean } | undefined, duration: number): YouTubePlayer {
  return {
    getVideoData: () => data ?? {},
    getDuration: () => duration,
  } as YouTubePlayer;
}

describe('YouTube live edge', () => {
  it('uses the duration as the current edge of a live broadcast', () => {
    expect(youtubeLiveEdgeOf(player({ isLive: true }, 3_600))).toBe(3_600);
  });

  it('does not mistake an ordinary long video for a live broadcast', () => {
    expect(youtubeLiveEdgeOf(player({ isLive: false }, 3_600))).toBeUndefined();
  });

  it('can trust an explicit /live link when an older iframe omits the flag', () => {
    expect(youtubeLiveEdgeOf(player(undefined, 3_600), true)).toBe(3_600);
  });

  it('refuses a broken edge reading', () => {
    expect(youtubeLiveEdgeOf(player({ isLive: true }, Number.NaN))).toBeUndefined();
  });
});

/**
 * What the player was BUILT with — the API takes these once, at
 * construction, and a viewer who was handed a scrub bar keeps it.
 *
 * One fake for the whole file: the module caches its loader promise (and
 * so the API object with it) the first time anybody asks, exactly as the
 * page does.
 */
const built: { playerVars?: Record<string, unknown> }[] = [];

const YT = {
  Player: function Player(_element: HTMLElement, config: unknown) {
    built.push(config as { playerVars?: Record<string, unknown> });
    const events = (config as { events: { onReady: () => void } }).events;
    queueMicrotask(() => events.onReady());
    return { destroy: () => undefined } as unknown as YouTubePlayer;
  } as unknown as new (element: HTMLElement, config: unknown) => YouTubePlayer,
};

async function playerVarsFor(controls: boolean): Promise<Record<string, unknown>> {
  built.length = 0;
  (globalThis as { window?: unknown }).window = { YT };
  await createPlayer({} as HTMLElement, {
    item: { kind: 'video', video: 'abc12345678' },
    startSeconds: 0,
    autoplay: false,
    controls,
    onReady: () => undefined,
    onStateChange: () => undefined,
    onError: () => undefined,
  });
  return built[built.length - 1]?.playerVars ?? {};
}

describe('who the player offers itself to', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('gives the controller YouTube\'s own controls', async () => {
    const vars = await playerVarsFor(true);
    expect(vars.controls).toBe(1);
    expect(vars.disablekb).toBe(0);
  });

  it('gives everybody else the picture and nothing to press', async () => {
    const vars = await playerVarsFor(false);
    expect(vars.controls).toBe(0);
    expect(vars.disablekb).toBe(1);
  });
});
