import { describe, expect, it } from 'vitest';
import { youtubeLiveEdgeOf, type YouTubePlayer } from './youtube';

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
