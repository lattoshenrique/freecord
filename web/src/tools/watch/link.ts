/**
 * What a link turns out to be — the step that used to be two tools.
 *
 * Somebody pastes one thing and it may be any of four:
 *
 *   a YouTube link      the address of the video IS the address of the
 *                       video. Read here, never sent anywhere.
 *   a media link        an `.m3u8`, an mp4, a Twitch channel. Whoever
 *                       already has the video's own address has nothing
 *                       to learn from a page being read, and this way
 *                       that link never leaves the browser either.
 *   a page              the only one that costs a round trip: finding
 *                       the video inside a page means READING the page,
 *                       and CORS forbids a browser from reading another
 *                       origin — so an app route does it
 *                       (server/src/app/source-lookup.ts).
 *   nothing playable    said plainly, before the room is committed.
 *
 * The local half is a deliberate mirror of `candidateForUrl` in
 * server/src/domain/sources.ts — the same rules, on this side of the
 * wire, the way `web/src/lib/protocol.ts` mirrors the server's message
 * types.
 */
import type { VideoCandidate } from '../../api';
import type { WatchItem } from './state';

/** One thing the room could watch, with what a person needs to choose it. */
export interface WatchCandidate {
  item: WatchItem;
  /** How it turned up: a link, a page's markup, a player caught loading it. */
  found: VideoCandidate['found'];
  /** What the page called it — often all that tells two copies apart. */
  label?: string;
  /** Reached through this embed rather than from the page itself. */
  via?: string;
  /** Signed for whoever opened the page: it may play for nobody else. */
  personal?: boolean;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{13,42}$/;
/** `1h2m3s`, `90s` or plain `90` — YouTube writes `t` every one of those ways. */
const TIME = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

const MEDIA: Record<string, 'file' | 'hls' | 'dash'> = {
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

function parseStart(value: string | null): number {
  if (!value) {
    return 0;
  }
  const match = TIME.exec(value.trim());
  if (!match || match[0] === '') {
    return 0;
  }
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

/**
 * The YouTube video or playlist in a link, with the moment it points at
 * already folded in — a full watch URL, a share link, an embed, a short,
 * a live, a playlist, or a bare id. Null when there is no YouTube in it.
 *
 * A link that carries BOTH a video and a playlist (`watch?v=…&list=…`,
 * what YouTube gives you for a video you opened from a playlist) is taken
 * as the video. That is the thing the person was looking at when they
 * copied it; a link meant as a playlist is the one that has no `v` at
 * all, which is exactly what /playlist gives.
 */
export function parseYouTube(input: string): WatchItem | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (VIDEO_ID.test(text)) {
    return { kind: 'video', video: text };
  }
  const url = asUrl(text);
  if (!url) {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  const video = (id: string, live = false): WatchItem => {
    const item: WatchItem = start > 0 ? { kind: 'video', video: id, start } : { kind: 'video', video: id };
    if (live) {
      item.live = true;
    }
    return item;
  };
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return VIDEO_ID.test(id) ? video(id) : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }
  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) {
    return video(fromQuery);
  }
  const list = url.searchParams.get('list');
  if (list && LIST_ID.test(list)) {
    // A playlist starts at its beginning: which of its videos is which is
    // the player's knowledge, not ours (state.ts).
    return { kind: 'list', list, index: 0 };
  }
  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const [, section, id] = url.pathname.split('/');
  return section && id && ['embed', 'shorts', 'live', 'v'].includes(section) && VIDEO_ID.test(id)
    ? video(id, section === 'live')
    : null;
}

/** The media a link is on its own, or null when a page must be read. */
function mediaCandidate(input: string): WatchCandidate | null {
  const url = asUrl(input);
  if (!url) {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const [, first = '', second = '', third = ''] = url.pathname.split('/');
  const href = url.toString();

  if (host === 'twitch.tv' || host === 'twitch.com') {
    if (first === 'videos' && TWITCH_ID.test(second)) {
      return twitch(href, { video: second });
    }
    if (third && second === 'clip' && CLIP_SLUG.test(third)) {
      return twitch(href, { clip: third });
    }
    if (CHANNEL.test(first) && !TWITCH_RESERVED.has(first.toLowerCase())) {
      return twitch(href, { channel: first }, true);
    }
    return null;
  }
  if (host === 'clips.twitch.tv' && CLIP_SLUG.test(first)) {
    return twitch(href, { clip: first });
  }

  const extension = /\.([a-z0-9]{2,4})$/i.exec(url.pathname)?.[1]?.toLowerCase();
  const play = extension ? MEDIA[extension] : undefined;
  if (!play) {
    return null;
  }
  return {
    item: { kind: 'source', play, url: href },
    found: 'link',
    label: decodeURIComponent(url.pathname.split('/').pop() ?? '').slice(0, 60) || undefined,
  };
}

function twitch(
  url: string,
  ref: { channel?: string; video?: string; clip?: string },
  live = false,
): WatchCandidate {
  const item: WatchItem = { kind: 'source', play: 'twitch', url, twitch: ref };
  if (live) {
    item.live = true;
  }
  return { item, found: 'link' };
}

/**
 * What this link is without asking anybody: YouTube first, because its
 * player is the one that gives the room a shared clock, then the media
 * addresses we can recognise on sight. Null means the page has to be
 * read, which is the only path that leaves the browser.
 */
export function directCandidate(input: string): WatchCandidate | null {
  const youtube = parseYouTube(input);
  if (youtube) {
    return { item: youtube, found: 'link' };
  }
  return mediaCandidate(input);
}

/**
 * One of the things a page turned out to hold, as this tool watches it.
 *
 * A YouTube embed found inside somebody's page comes back from the lookup
 * as a frame — a rectangle with no clock. It is not one, and pretending
 * otherwise was the honest cost of shipping YouTube as a separate tool:
 * here it is turned back into the video it is, and the room gets the same
 * shared timeline it would have had from the original link.
 */
export function fromLookup(candidate: VideoCandidate, page: string): WatchCandidate {
  const youtube = parseYouTube(candidate.url);
  if (youtube) {
    if (youtube.kind === 'video' && candidate.live === true) {
      youtube.live = true;
    }
    return { item: youtube, found: candidate.found, label: candidate.label, via: candidate.via };
  }
  const item: WatchItem = { kind: 'source', play: candidate.play, url: candidate.url };
  if (candidate.twitch) {
    item.twitch = candidate.twitch;
  }
  if (candidate.title) {
    item.title = candidate.title;
  }
  // A frame is not a broadcast. It has no position either, but that is
  // `hasSharedClock`'s answer, not this flag's — and calling a page live
  // would put a LIVE badge on an episode somebody uploaded in 2011.
  if (candidate.live === true) {
    item.live = true;
  }
  // Where it came from, so the stage can offer a way back to it — but
  // never the media URL twice over.
  if (page && page !== candidate.url) {
    item.page = page;
  }
  return {
    item,
    found: candidate.found,
    label: candidate.label,
    via: candidate.via,
    personal: candidate.personal,
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
 * A Twitch clip's own embed, or null when this is not one.
 *
 * Their JS player takes a channel or a past broadcast and nothing else,
 * so a clip cannot go through the same door: it gets the iframe their
 * site hands out, which requires naming the host it will sit on. Which
 * means a clip has no shared clock either — `hasSharedClock` says so,
 * and the shelf says so before anybody picks it.
 */
export function twitchClipUrl(
  item: WatchItem,
  hostname: string = typeof window === 'undefined' ? '' : window.location.hostname,
): string | null {
  const clip = item.kind === 'source' && item.play === 'twitch' ? item.twitch?.clip : undefined;
  return clip
    ? `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip)}&parent=${encodeURIComponent(hostname)}`
    : null;
}
