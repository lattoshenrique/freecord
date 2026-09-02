/**
 * The links this tool can recognise without asking anybody.
 *
 * A deliberate mirror of `candidateForUrl` in
 * server/src/domain/sources.ts — the same rules, on this side of the
 * wire, for the same reason `web/src/lib/protocol.ts` mirrors the
 * server's message types.
 *
 * It is worth the duplication. Somebody who already has the address of
 * the video — an `.m3u8`, an mp4, a Twitch channel — has nothing to
 * learn from a page being read, and this way that link never leaves the
 * browser at all. The round trip is for pages, and only for pages.
 */
import type { VideoCandidate } from '../../api';

const MEDIA: Record<string, VideoCandidate['play']> = {
  m3u8: 'hls',
  mpd: 'dash',
  mp4: 'file',
  m4v: 'file',
  webm: 'file',
  ogv: 'file',
  ogg: 'file',
  mov: 'file',
};

const CHANNEL = /^[a-zA-Z0-9_]{2,25}$/;
const TWITCH_ID = /^[0-9]{1,20}$/;
const CLIP_SLUG = /^[A-Za-z0-9_-]{4,120}$/;
const TWITCH_RESERVED = new Set([
  'directory',
  'downloads',
  'jobs',
  'p',
  'products',
  'settings',
  'store',
  'subs',
  'turbo',
  'videos',
  'wallet',
]);

/** Whatever was typed, as a URL — a bare host means https, as a paste does. */
export function asUrl(input: string): URL | null {
  const text = input.trim();
  if (!text || text.length > 2048) {
    return null;
  }
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** The candidate a link is on its own, or null when a page must be read. */
export function localCandidate(input: string): VideoCandidate | null {
  const url = asUrl(input);
  if (!url) {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const [, first = '', second = '', third = ''] = url.pathname.split('/');

  if (host === 'twitch.tv' || host === 'twitch.com') {
    if (first === 'videos' && TWITCH_ID.test(second)) {
      return { play: 'twitch', url: url.toString(), found: 'link', twitch: { video: second } };
    }
    if (third && second === 'clip' && CLIP_SLUG.test(third)) {
      return { play: 'twitch', url: url.toString(), found: 'link', twitch: { clip: third } };
    }
    if (CHANNEL.test(first) && !TWITCH_RESERVED.has(first.toLowerCase())) {
      return {
        play: 'twitch',
        url: url.toString(),
        found: 'link',
        twitch: { channel: first },
        live: true,
      };
    }
    return null;
  }
  if (host === 'clips.twitch.tv' && CLIP_SLUG.test(first)) {
    return { play: 'twitch', url: url.toString(), found: 'link', twitch: { clip: first } };
  }

  const extension = /\.([a-z0-9]{2,4})$/i.exec(url.pathname)?.[1]?.toLowerCase();
  const play = extension ? MEDIA[extension] : undefined;
  if (!play) {
    return null;
  }
  return {
    play,
    url: url.toString(),
    found: 'link',
    label: decodeURIComponent(url.pathname.split('/').pop() ?? '').slice(0, 60) || undefined,
  };
}

/** The host a candidate comes from, for the line under its name. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * YouTube, which has a shelf of its own. Nothing stops this tool from
 * framing it, but the other one gives the room a shared clock, and
 * saying so costs one line.
 */
export function isYouTube(url: string): boolean {
  const host = hostOf(url).toLowerCase();
  return host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com';
}
