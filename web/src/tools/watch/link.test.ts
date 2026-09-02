import { describe, expect, it } from 'vitest';
import { directCandidate, fromLookup, hostOf, parseYouTube, twitchClipUrl } from './link';

describe('parseYouTube', () => {
  it('reads the id out of the links people actually paste', () => {
    const cases = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      '  dQw4w9WgXcQ  ',
    ];
    for (const link of cases) {
      expect(parseYouTube(link), link).toEqual({ kind: 'video', video: 'dQw4w9WgXcQ' });
    }
  });

  it('keeps the moment a share link points at', () => {
    const video = 'dQw4w9WgXcQ';
    expect(parseYouTube('https://youtu.be/dQw4w9WgXcQ?t=90')).toEqual({ kind: 'video', video, start: 90 });
    expect(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toEqual({
      kind: 'video',
      video,
      start: 3723,
    });
    expect(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45')).toEqual({
      kind: 'video',
      video,
      start: 45,
    });
  });

  it('a playlist link is a playlist, from its beginning', () => {
    const list = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';
    expect(parseYouTube(`https://www.youtube.com/playlist?list=${list}`)).toEqual({
      kind: 'list',
      list,
      index: 0,
    });
  });

  it('a link carrying both is the video, which is what the person was looking at', () => {
    // What YouTube hands you for a video you opened from a playlist. A
    // link MEANT as a playlist is the one with no `v` at all.
    expect(
      parseYouTube(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI&index=2',
      ),
    ).toEqual({ kind: 'video', video: 'dQw4w9WgXcQ' });
  });

  it('anything without a YouTube video in it is nothing', () => {
    for (const input of [
      '',
      '   ',
      'https://vimeo.com/76979871',
      'https://www.youtube.com/',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/playlist?list=PL',
      'https://youtu.be/',
      'javascript:alert(1)',
      'not a link at all',
    ]) {
      expect(parseYouTube(input), input).toBeNull();
    }
  });
});

describe('what a link is without asking anybody', () => {
  it('YouTube first: it is the one whose address IS the video', () => {
    expect(directCandidate('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      item: { kind: 'video', video: 'dQw4w9WgXcQ' },
      found: 'link',
    });
  });

  it('a media file, named by what it ends in', () => {
    expect(directCandidate('https://cdn.example.com/ep/11.mp4')).toMatchObject({
      item: { kind: 'source', play: 'file', url: 'https://cdn.example.com/ep/11.mp4' },
      label: '11.mp4',
    });
    expect(directCandidate('https://cdn.example.com/live/index.m3u8')?.item).toMatchObject({
      play: 'hls',
    });
    expect(directCandidate('https://cdn.example.com/live/manifest.mpd')?.item).toMatchObject({
      play: 'dash',
    });
  });

  it('the three things Twitch hands out, and nothing it does not', () => {
    expect(directCandidate('https://twitch.tv/gaules')?.item).toMatchObject({
      play: 'twitch',
      twitch: { channel: 'gaules' },
      live: true,
    });
    expect(directCandidate('https://www.twitch.tv/videos/123456')?.item).toMatchObject({
      twitch: { video: '123456' },
    });
    expect(directCandidate('https://clips.twitch.tv/FunnyMoment-abc')?.item).toMatchObject({
      twitch: { clip: 'FunnyMoment-abc' },
    });
    // Their own pages are not channels.
    expect(directCandidate('https://twitch.tv/directory')).toBeNull();
  });

  it('a page is nobody’s guess: it says so, and the round trip happens', () => {
    expect(directCandidate('https://site.example/watch/ep-11')).toBeNull();
    expect(directCandidate('not a link at all')).toBeNull();
  });
});

describe('what a page turned out to hold', () => {
  const page = 'https://site.example/ep/11';

  it('keeps where it came from, but never the same URL twice', () => {
    expect(
      fromLookup({ play: 'file', url: 'https://cdn.example.com/11.mp4', found: 'element' }, page).item,
    ).toEqual({ kind: 'source', play: 'file', url: 'https://cdn.example.com/11.mp4', page });
    expect(fromLookup({ play: 'frame', url: page, found: 'link' }, page).item).toEqual({
      kind: 'source',
      play: 'frame',
      url: page,
    });
  });

  it('a YouTube embed found in a page is the video it is, with the room’s clock', () => {
    // The honest cost of shipping YouTube as a tool of its own: the
    // lookup can only call this a frame, and a frame has no clock. Here
    // it is read back into the video it always was.
    const found = fromLookup(
      { play: 'frame', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', found: 'embed' },
      page,
    );
    expect(found.item).toEqual({ kind: 'video', video: 'dQw4w9WgXcQ' });
  });

  it('a page is not a broadcast, whatever the badge would like', () => {
    expect(fromLookup({ play: 'frame', url: page, found: 'link' }, page).item).not.toHaveProperty('live');
    expect(
      fromLookup({ play: 'hls', url: 'https://cdn.example.com/x.m3u8', found: 'script', live: true }, page)
        .item,
    ).toMatchObject({ live: true });
  });
});

describe('hostOf', () => {
  it('is what a person would call the site', () => {
    expect(hostOf('https://www.site.example/ep/11')).toBe('site.example');
    expect(hostOf('nonsense')).toBe('nonsense');
  });
});

describe('a Twitch clip, which their player API will not take', () => {
  const clip = {
    kind: 'source',
    play: 'twitch',
    url: 'https://clips.twitch.tv/FunnyMoment-abc',
    twitch: { clip: 'FunnyMoment-abc' },
  } as const;

  it('builds the embed their site hands out, naming the host it sits on', () => {
    expect(twitchClipUrl(clip, 'freecord.example')).toBe(
      'https://clips.twitch.tv/embed?clip=FunnyMoment-abc&parent=freecord.example',
    );
    expect(twitchClipUrl({ ...clip, twitch: { channel: 'gaules' } }, 'x.example')).toBeNull();
    expect(twitchClipUrl({ kind: 'video', video: 'dQw4w9WgXcQ' }, 'x.example')).toBeNull();
  });
});
