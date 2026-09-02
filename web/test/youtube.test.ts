import { describe, expect, it } from 'vitest';
import { parseVideo } from '../src/lib/youtube';

describe('parseVideo', () => {
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
      expect(parseVideo(link), link).toEqual({ video: 'dQw4w9WgXcQ', start: 0 });
    }
  });

  it('keeps the moment a share link points at', () => {
    expect(parseVideo('https://youtu.be/dQw4w9WgXcQ?t=90')).toEqual({
      video: 'dQw4w9WgXcQ',
      start: 90,
    });
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toEqual({
      video: 'dQw4w9WgXcQ',
      start: 3723,
    });
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45')).toEqual({
      video: 'dQw4w9WgXcQ',
      start: 45,
    });
  });

  it('the query wins over the path, and extra params are ignored', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2')).toEqual({
      video: 'dQw4w9WgXcQ',
      start: 0,
    });
  });

  it('anything without a video in it is nothing', () => {
    for (const input of [
      '',
      '   ',
      'https://vimeo.com/76979871',
      'https://www.youtube.com/',
      'https://www.youtube.com/watch?v=short',
      'https://youtu.be/',
      'javascript:alert(1)',
      'not a link at all',
    ]) {
      expect(parseVideo(input), input).toBeNull();
    }
  });
});
