import { describe, expect, it } from 'vitest';
import { hasSharedClock, isFramableHere, parseState, positionAt } from './state';

/** A state that is fine, so a test can spoil exactly one thing about it. */
const good = {
  play: 'file',
  url: 'https://cdn.example.com/11.mp4',
  live: false,
  playing: true,
  time: 12,
};

describe('what another peer is allowed to hand this tool', () => {
  it('takes a state that is what it says it is', () => {
    expect(parseState(good)).toEqual(good);
  });

  it('keeps the extras when they are sound, and drops them when they are not', () => {
    expect(parseState({ ...good, title: '  Episode  11 ', page: 'https://site.example/ep/11' })).toMatchObject({
      title: 'Episode 11',
      page: 'https://site.example/ep/11',
    });
    expect(parseState({ ...good, title: 42, page: 'javascript:alert(1)' })).toEqual(good);
  });

  it('strips the control characters out of a title before anyone draws it', () => {
    expect(parseState({ ...good, title: 'Episode\u000011\u001b[31m' })?.title).toBe('Episode 11 [31m');
  });

  it('refuses a URL that is not a URL we would hand to an element', () => {
    // The whole reason this function exists: these end up in a <video>
    // src or an iframe src, inside the page that holds the chat's key.
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://example.com/x',
      'vbscript:msgbox',
      '/relative/only.mp4',
      '',
      42,
      null,
      `https://example.com/${'a'.repeat(2100)}`,
    ]) {
      expect(parseState({ ...good, url }), String(url)).toBeNull();
    }
  });

  it('refuses a play kind it does not know', () => {
    expect(parseState({ ...good, play: 'magic' })).toBeNull();
    expect(parseState({ ...good, play: undefined })).toBeNull();
  });

  it('refuses a position that is not one', () => {
    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY, 60 * 60 * 25, '12', null]) {
      expect(parseState({ ...good, time }), String(time)).toBeNull();
    }
  });

  it('refuses anything that is not a state at all', () => {
    for (const raw of [null, undefined, 7, 'video', [], true]) {
      expect(parseState(raw), String(raw)).toBeNull();
    }
  });

  it('will not build a Twitch player around nothing', () => {
    const twitch = { ...good, play: 'twitch', url: 'https://twitch.tv/x' };
    expect(parseState(twitch)).toBeNull();
    expect(parseState({ ...twitch, twitch: { channel: 'not a channel!' } })).toBeNull();
    expect(parseState({ ...twitch, twitch: { channel: 'gaules' } })).toMatchObject({
      twitch: { channel: 'gaules' },
    });
    expect(parseState({ ...twitch, twitch: { video: '123', clip: '<script>' } })).toMatchObject({
      twitch: { video: '123' },
    });
  });
});

describe('the frame is only ever somebody else’s page', () => {
  it('refuses our own origin, where the sandbox would be no sandbox', () => {
    expect(isFramableHere('https://site.example/ep/1', 'https://freecord.example')).toBe(true);
    expect(isFramableHere('https://freecord.example/r/abc', 'https://freecord.example')).toBe(false);
    expect(isFramableHere('not a url', 'https://freecord.example')).toBe(false);
  });
});

describe('where the source is', () => {
  it('moves a playing one on by the time since the room said so', () => {
    expect(positionAt({ ...good, playing: true, time: 10 } as never, 1_000, 4_000)).toBe(13);
  });

  it('leaves a paused one where it was left', () => {
    expect(positionAt({ ...good, playing: false, time: 10 } as never, 1_000, 90_000)).toBe(10);
  });

  it('never runs backwards on a clock that did', () => {
    expect(positionAt({ ...good, playing: true, time: 10 } as never, 5_000, 1_000)).toBe(10);
  });
});

describe('what the room can agree on', () => {
  it('is a position, unless it is a broadcast or somebody else’s page', () => {
    expect(hasSharedClock({ ...good } as never)).toBe(true);
    expect(hasSharedClock({ ...good, live: true } as never)).toBe(false);
    expect(hasSharedClock({ ...good, play: 'frame' } as never)).toBe(false);
  });
});
