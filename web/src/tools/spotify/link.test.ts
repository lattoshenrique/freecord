import { describe, expect, it } from 'vitest';
import { embedUrl, pageUrl, parseLink } from './link';
import type { ListenItem } from './state';

const track: ListenItem = { kind: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' };
const list: ListenItem = { kind: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' };

describe('parseLink', () => {
  it('takes the link the share sheet gives, with its tracking tail', () => {
    expect(parseLink(`https://open.spotify.com/track/${track.id}?si=8f0e2c1d`)).toEqual(track);
  });

  it('takes the localised path the app hands out', () => {
    expect(parseLink(`https://open.spotify.com/intl-pt/track/${track.id}`)).toEqual(track);
  });

  it('takes an embed address somebody copied out of a page', () => {
    expect(parseLink(`https://open.spotify.com/embed/playlist/${list.id}?theme=0`)).toEqual(list);
  });

  it('takes the old playlist path with a user in front of it', () => {
    expect(parseLink(`https://open.spotify.com/user/spotify/playlist/${list.id}`)).toEqual(list);
  });

  it('takes a spotify: URI, new shape and old', () => {
    expect(parseLink(`spotify:track:${track.id}`)).toEqual(track);
    expect(parseLink(`spotify:user:spotify:playlist:${list.id}`)).toEqual(list);
  });

  it('takes a link pasted without its scheme, and with room around it', () => {
    expect(parseLink(`  open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3  `)).toEqual({
      kind: 'album',
      id: '1DFixLWuPkv3KT3TnV35m3',
    });
  });

  it('refuses what it cannot name', () => {
    for (const text of [
      '',
      'not a link',
      // A redirect: what it points at is not written on it, and this tool
      // asks nobody.
      'https://spotify.link/abc123',
      // Somebody else's host, however it is dressed up.
      'https://open.spotify.com.evil.example/track/4cOdK2wGLETKBW3PvgPWqT',
      'https://evil.example/open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      'https://open.spotify.com/search/anything',
      'https://open.spotify.com/track/short',
      'javascript:alert(1)',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseLink(text), text).toBeNull();
    }
  });
});

describe('the addresses this tool uses', () => {
  it('are built from the kind and the id, never from what was pasted', () => {
    expect(embedUrl(list)).toBe(`https://open.spotify.com/embed/playlist/${list.id}?theme=0`);
    expect(pageUrl(track)).toBe(`https://open.spotify.com/track/${track.id}`);
  });

  it('point at Spotify and nowhere else, whatever came in', () => {
    const item = parseLink(`https://open.spotify.com/track/${track.id}?si=x#fragment`);
    expect(item).not.toBeNull();
    expect(new URL(embedUrl(item!)).origin).toBe('https://open.spotify.com');
  });
});
