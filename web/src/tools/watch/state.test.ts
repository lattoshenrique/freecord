import { describe, expect, it } from 'vitest';
import {
  QUEUE_MAX,
  hasSharedClock,
  isFramableHere,
  isLive,
  parseItem,
  parseState,
  positionAt,
  roomDrives,
  sameItem,
} from './state';

const video = { kind: 'video', video: 'dQw4w9WgXcQ' } as const;
const list = { kind: 'list', list: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', index: 3 } as const;
const file = { kind: 'source', play: 'file', url: 'https://cdn.example.com/11.mp4' } as const;
const state = { now: video, playing: true, time: 30, queue: [] };

describe('parseItem', () => {
  it('takes the three kinds of thing a room can watch', () => {
    expect(parseItem(video)).toEqual(video);
    expect(parseItem(list)).toEqual(list);
    expect(parseItem(file)).toEqual(file);
  });

  it('refuses anything a peer could have made up', () => {
    for (const raw of [
      null,
      'dQw4w9WgXcQ',
      { kind: 'video' },
      { kind: 'video', video: 'javascript:alert(1)' },
      { kind: 'video', video: 'short' },
      { kind: 'list', list: 'PL' },
      { kind: 'list', list: list.list, index: -1 },
      { kind: 'list', list: list.list, index: 1.5 },
      { kind: 'list', list: list.list, index: 999_999 },
      { kind: 'stream', url: 'https://evil.example/x' },
    ]) {
      expect(parseItem(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('a source item, which carries somebody else’s URL', () => {
  it('refuses a URL that is not one we would hand to an element', () => {
    // The whole reason this check exists: these end up in a <video> src
    // or an iframe src, inside the page that holds the chat's key.
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
      expect(parseItem({ ...file, url }), String(url)).toBeNull();
    }
  });

  it('refuses a play kind it does not know', () => {
    expect(parseItem({ ...file, play: 'magic' })).toBeNull();
    expect(parseItem({ ...file, play: undefined })).toBeNull();
  });

  it('keeps the extras when they are sound, and drops them when they are not', () => {
    expect(parseItem({ ...file, title: '  Episode  11 ', page: 'https://site.example/ep/11' })).toMatchObject({
      title: 'Episode 11',
      page: 'https://site.example/ep/11',
    });
    expect(parseItem({ ...file, title: 42, page: 'javascript:alert(1)' })).toEqual(file);
  });

  it('strips the control characters out of a title before anyone draws it', () => {
    expect(parseItem({ ...file, title: 'Episode\u000011\u001b[31m' })).toMatchObject({
      title: 'Episode 11 [31m',
    });
  });

  it('will not build a Twitch player around nothing', () => {
    const twitch = { kind: 'source', play: 'twitch', url: 'https://twitch.tv/x' };
    expect(parseItem(twitch)).toBeNull();
    expect(parseItem({ ...twitch, twitch: { channel: 'not a channel!' } })).toBeNull();
    expect(parseItem({ ...twitch, twitch: { channel: 'gaules' } })).toMatchObject({
      twitch: { channel: 'gaules' },
    });
    expect(parseItem({ ...twitch, twitch: { video: '123', clip: '<script>' } })).toMatchObject({
      twitch: { video: '123' },
    });
  });
});

describe('a queued moment', () => {
  it('is kept when it is one, and dropped when it is nonsense', () => {
    expect(parseItem({ ...video, start: 600 })).toEqual({ ...video, start: 600 });
    expect(parseItem({ ...video, start: -5 })).toEqual(video);
    expect(parseItem({ ...video, start: '600' })).toEqual(video);
    expect(parseItem({ ...video, start: 25 * 60 * 60 })).toEqual(video);
  });
});

describe('sameItem', () => {
  it('a playlist is itself wherever it happens to be', () => {
    expect(sameItem(list, { ...list, index: 9 })).toBe(true);
    expect(sameItem(video, { ...video })).toBe(true);
    expect(sameItem(video, list)).toBe(false);
  });

  it('a source is its address', () => {
    expect(sameItem(file, { ...file, title: 'another name for it' })).toBe(true);
    expect(sameItem(file, { ...file, url: 'https://cdn.example.com/12.mp4' })).toBe(false);
    expect(sameItem(file, video)).toBe(false);
  });
});

describe('parseState', () => {
  it('takes a state this tool could have written', () => {
    expect(parseState(state)).toEqual(state);
    expect(parseState({ ...state, queue: [video, list, file] })).toEqual({
      ...state,
      queue: [video, list, file],
    });
  });

  it('a missing queue is an empty one', () => {
    expect(parseState({ now: video, playing: false, time: 0 })?.queue).toEqual([]);
  });

  it('one bad entry costs the entry, not the evening', () => {
    const parsed = parseState({ ...state, queue: [video, { kind: 'video', video: 'nope' }, file] });
    expect(parsed?.queue).toEqual([video, file]);
  });

  it('a queue longer than the cap is cut to it', () => {
    const long = Array.from({ length: QUEUE_MAX + 10 }, () => video);
    expect(parseState({ ...state, queue: long })?.queue).toHaveLength(QUEUE_MAX);
  });

  it('refuses a state with nothing playable in it', () => {
    // The server stores a state without looking at it, so this is the
    // only check between another peer's message and the player.
    for (const raw of [
      null,
      'a string',
      {},
      { ...state, now: { kind: 'video', video: 'https://evil.example/x' } },
      { ...state, now: { kind: 'source', play: 'file', url: 'javascript:alert(1)' } },
      { ...state, playing: 'yes' },
      { ...state, time: -1 },
      { ...state, time: Number.NaN },
      { ...state, time: 25 * 60 * 60 },
    ]) {
      expect(parseState(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('positionAt', () => {
  it('a paused video sits still; a playing one moves with the clock', () => {
    expect(positionAt({ ...state, playing: false }, 1_000, 61_000)).toBe(30);
    expect(positionAt(state, 1_000, 61_000)).toBe(90);
  });

  it('a clock that went backwards never rewinds the room', () => {
    expect(positionAt(state, 10_000, 9_000)).toBe(30);
  });
});

describe('the frame is only ever somebody else’s page', () => {
  it('refuses our own origin, where the sandbox would be no sandbox', () => {
    expect(isFramableHere('https://site.example/ep/1', 'https://freecord.example')).toBe(true);
    expect(isFramableHere('https://freecord.example/r/abc', 'https://freecord.example')).toBe(false);
    expect(isFramableHere('not a url', 'https://freecord.example')).toBe(false);
  });
});

describe('what the room can agree on', () => {
  it('is a position, unless it is a broadcast or somebody else’s page', () => {
    expect(hasSharedClock(file)).toBe(true);
    expect(hasSharedClock({ ...file, live: true })).toBe(false);
    expect(hasSharedClock({ ...file, play: 'frame' })).toBe(false);
  });

  it('is always a position on YouTube, which is why it has its own player', () => {
    expect(hasSharedClock(video)).toBe(true);
    expect(hasSharedClock(list)).toBe(true);
    expect(isLive(video)).toBe(false);
  });

  it('tells a player the room drives from a rectangle it only points at', () => {
    expect(roomDrives(video)).toBe(true);
    expect(roomDrives(file)).toBe(true);
    // A live channel: no position to share, but play, pause and the
    // speaker key still reach it.
    expect(roomDrives({ ...file, play: 'twitch', twitch: { channel: 'gaules' }, live: true })).toBe(true);
    expect(roomDrives({ ...file, play: 'frame' })).toBe(false);
    expect(roomDrives({ ...file, play: 'twitch', twitch: { clip: 'FunnyMoment-abc' } })).toBe(false);
  });
});

describe('a Twitch clip is a frame wearing another name', () => {
  const clip = {
    kind: 'source',
    play: 'twitch',
    url: 'https://clips.twitch.tv/FunnyMoment-abc',
    twitch: { clip: 'FunnyMoment-abc' },
  } as const;

  it('promises no shared clock, because their player will not take one', () => {
    expect(hasSharedClock(clip)).toBe(false);
    expect(hasSharedClock({ ...clip, twitch: { channel: 'gaules' } })).toBe(true);
  });
});
