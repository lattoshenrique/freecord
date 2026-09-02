import { describe, expect, it } from 'vitest';
import { parseLink } from './player';

describe('parseLink', () => {
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
      expect(parseLink(link), link).toEqual({
        item: { kind: 'video', video: 'dQw4w9WgXcQ' },
        start: 0,
      });
    }
  });

  it('keeps the moment a share link points at', () => {
    const video = { kind: 'video', video: 'dQw4w9WgXcQ' };
    expect(parseLink('https://youtu.be/dQw4w9WgXcQ?t=90')).toEqual({ item: video, start: 90 });
    expect(parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toEqual({
      item: video,
      start: 3723,
    });
    expect(parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45')).toEqual({
      item: video,
      start: 45,
    });
  });

  it('a playlist link is a playlist, from its beginning', () => {
    const list = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';
    expect(parseLink(`https://www.youtube.com/playlist?list=${list}`)).toEqual({
      item: { kind: 'list', list, index: 0 },
      start: 0,
    });
  });

  it('a link carrying both is the video, which is what the person was looking at', () => {
    // What YouTube hands you for a video you opened from a playlist. A
    // link MEANT as a playlist is the one with no `v` at all.
    expect(
      parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI&index=2'),
    ).toEqual({ item: { kind: 'video', video: 'dQw4w9WgXcQ' }, start: 0 });
  });

  it('anything without a video in it is nothing', () => {
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
      expect(parseLink(input), input).toBeNull();
    }
  });
});
