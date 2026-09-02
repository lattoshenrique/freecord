/**
 * Where the video is, in a page somebody pasted.
 *
 * The room's watch tool takes a link to whatever somebody was already
 * looking at. Sometimes that is a link to a video — a YouTube URL, an
 * `.m3u8`, a Twitch channel — and the browser reads those itself. The
 * rest of the time it is a link to a PAGE: an episode, a lecture, a
 * broadcast somebody else's site is hosting. Somebody has to open that
 * page and say what is playable in it, and that somebody cannot be the
 * browser: a document from another origin is unreadable to it, by the
 * same rule that keeps the rest of the web honest. So an edge fetches the
 * page and this file reads it.
 *
 * What it reads is METADATA — the markup a page already publishes about
 * its own video: the tags every chat app reads to draw a preview, the
 * `<video>` element, the player's configuration. No media byte passes
 * through us, before or after. Whatever the room agrees to watch, every
 * browser fetches from the source itself, exactly as it does for a
 * YouTube link; "no media through a server" is one of this project's
 * louder promises and nothing here softens it.
 *
 * Everything below is a pure function of text. Fetching — timeouts, size
 * caps, how many hops — lives in app/source-lookup.ts, so both edges get
 * the same answers and one test covers them.
 */

export const SOURCE_LIMITS = {
  /** A link past this is not a link, it is a payload. */
  maxUrlLength: 2048,
  /** How much of a page is read before we stop looking. */
  maxHtmlBytes: 2 * 1024 * 1024,
  /** How many candidates a person is asked to choose between. */
  maxCandidates: 12,
  /** Titles and labels are drawn on screen: cut, never trusted. */
  maxLabelLength: 120,
} as const;

/**
 * How a client plays a candidate — and, with it, how much of a shared
 * clock the room can have:
 *
 *   file / hls / dash  our own <video> element. Play, pause and position
 *                      are ours to set, so the room gets a real shared
 *                      timeline, the same one a YouTube link gets.
 *   twitch             their embed, driven through its own JS API: play
 *                      and pause for everybody, volume that obeys the
 *                      room's speaker key, and the live edge instead of
 *                      a position.
 *   frame              somebody else's page in an iframe. We can put the
 *                      same thing in front of everybody and nothing more:
 *                      no clock, no volume, no way in. It is the humblest
 *                      kind and the one that works when nothing else
 *                      does — including on the sites that only build
 *                      their player after a click, because the click
 *                      happens in each viewer's own frame.
 */
export type SourcePlay = 'file' | 'hls' | 'dash' | 'twitch' | 'frame';

/** Where a candidate was found — shown to whoever is choosing. */
export type SourceFound =
  /** The link itself was the video. */
  | 'link'
  /** The page's own preview tags (og:video, twitter:player). */
  | 'meta'
  /** schema.org VideoObject. */
  | 'schema'
  /** A <video> or <source> element. */
  | 'element'
  /** An <iframe>: a player from somewhere else. */
  | 'embed'
  /** A media URL in the page's scripts — the player's configuration. */
  | 'script';

/** One thing the room could watch, with what it takes to choose. */
export interface VideoCandidate {
  play: SourcePlay;
  /** Absolute http(s) URL: the media, or the page to frame. */
  url: string;
  found: SourceFound;
  /** What the page called it: "720p", "Dublado", the file's name. */
  label?: string;
  /** The page's title for it. */
  title?: string;
  /** A still, when the page offered one. */
  poster?: string;
  /** Twitch's channel, video or clip — the client builds the embed. */
  twitch?: { channel?: string; video?: string; clip?: string };
  /** The page said this is a broadcast, or the URL is a live channel. */
  live?: boolean;
  /**
   * The page refuses to be framed (X-Frame-Options, frame-ancestors), so
   * this candidate would be an empty rectangle. Known only for URLs we
   * actually fetched; undefined means nobody asked.
   */
  framable?: boolean;
  /**
   * The URL carries a token, an expiry or an IP — it was minted for
   * whoever opened the page, and handing it to the rest of the room is
   * how a video plays for one person and 403s for everybody else. Not a
   * refusal: a warning the chooser shows, because plenty of tokens are
   * not bound to anything.
   */
  personal?: boolean;
  /** Reached through this embed rather than from the page itself. */
  via?: string;
}

/** What a lookup came back with. */
export interface SourceLookup {
  /** The page that was read, after redirects. */
  url: string;
  title?: string;
  candidates: VideoCandidate[];
  /**
   * Nothing playable was found and the page cannot be framed either, so
   * there is nothing to offer at all — the tool says what to do next.
   */
  empty: boolean;
}

/* ------------------------------------------------------------------ *
 * The URL, before anything is fetched
 * ------------------------------------------------------------------ */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function blockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : -1));
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false; // not an IPv4 literal at all; it is a name
  }
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 || // this network
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, and the cloud metadata address
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier NAT
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function blockedIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (address === '::1' || address === '::') {
    return true;
  }
  // An IPv4 address wearing an IPv6 hat is still that address.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) {
    return blockedIpv4(mapped[1]!);
  }
  const head = address.split(':')[0] ?? '';
  // fc00::/7 (unique local) and fe80::/10 (link local).
  return /^f[cd]/.test(head) || /^fe[89ab]/.test(head);
}

/**
 * Hosts an edge must not be talked into fetching.
 *
 * Be honest about what this is: a guard against the obvious, not a proof.
 * A name that resolves to a private address defeats it, and neither edge
 * can see an address before it connects. What actually keeps production
 * safe is where the fetch happens — the Worker reaches the open internet
 * from Cloudflare's edge and has no private network of ours behind it.
 * The Node edge might be inside one, which is exactly why this list
 * exists at all.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host)) {
    return true;
  }
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  return host.startsWith('[') ? blockedIpv6(host) : blockedIpv4(host) || blockedIpv6(host);
}

/**
 * A host that is a NAME, not an address.
 *
 * The blocklist above parses dotted quads, and that is not enough on its
 * own, because an address can be written several ways and only one of
 * them looks like an address. `http://127.1/` is loopback with two
 * labels; `http://0x7f.0.0.1/` is loopback in hex; `http://2130706433/`
 * is loopback as a single integer. Chasing the notations is a game with
 * no last move, so this refuses the whole class: the last label has to
 * be alphabetic, the way a real top-level domain is.
 *
 * The cost is bare IP addresses, which are then unreachable even when
 * public. That is a fair price — a page with a video in it lives at a
 * name — and it is a refusal we can explain, which the alternative is
 * not.
 */
export function isNamedHost(hostname: string): boolean {
  const labels = hostname.split('.');
  return labels.length >= 2 && /^[a-z]{2,63}$/i.test(labels[labels.length - 1] ?? '');
}

/**
 * What somebody typed, as a URL we are willing to open — or null.
 *
 * A missing scheme is the common paste, so it gets https. Everything else
 * is refused rather than repaired: another scheme (a `javascript:` that
 * would end up in an iframe src), a port nobody serves pages on, a
 * host from the list above, or a link long enough to be a payload.
 */
export function normalizeSourceUrl(input: string): string | null {
  const text = input.trim();
  if (!text || text.length > SOURCE_LIMITS.maxUrlLength) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  // Credentials in a URL are for talking a fetcher into something, never
  // for watching a video.
  if (url.username || url.password) {
    return null;
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    return null;
  }
  if (isBlockedHost(url.hostname) || !isNamedHost(url.hostname)) {
    return null;
  }
  url.hash = '';
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * What a URL says about itself
 * ------------------------------------------------------------------ */

const MEDIA_EXTENSIONS: Record<string, SourcePlay> = {
  m3u8: 'hls',
  mpd: 'dash',
  mp4: 'file',
  m4v: 'file',
  webm: 'file',
  ogv: 'file',
  ogg: 'file',
  mov: 'file',
};

/** The play kind a URL's own path implies, if it is media at all. */
export function mediaPlayFor(url: string): SourcePlay | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const extension = /\.([a-z0-9]{2,4})$/i.exec(path)?.[1]?.toLowerCase();
  return extension ? (MEDIA_EXTENSIONS[extension] ?? null) : null;
}

/**
 * Query keys that mean "this link was cut for one viewer". The find is
 * from a real site: an episode's mp4 came back signed with the watcher's
 * own IP, which plays beautifully for the person who pasted it and for
 * nobody else in the room.
 */
const PERSONAL_KEYS = ['token', 'expires', 'expire', 'ip', 'signature', 'sig', 'hash', 'md5', 'key'];

export function looksPersonal(url: string): boolean {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return false;
  }
  return PERSONAL_KEYS.some((key) => params.has(key));
}

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

const CHANNEL = /^[a-zA-Z0-9_]{2,25}$/;
const TWITCH_ID = /^[0-9]{1,20}$/;
const CLIP_SLUG = /^[A-Za-z0-9_-]{4,120}$/;

/**
 * The candidate a link is on its own, with nothing fetched: a media file,
 * a Twitch channel, or a page from a service whose player we can at least
 * frame. Everything else needs the page read.
 */
export function candidateForUrl(url: string): VideoCandidate | null {
  const normalized = normalizeSourceUrl(url);
  if (!normalized) {
    return null;
  }
  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const [, first = '', second = '', third = ''] = parsed.pathname.split('/');

  if (host === 'twitch.tv' || host === 'twitch.com') {
    if (first === 'videos' && TWITCH_ID.test(second)) {
      return { play: 'twitch', url: normalized, found: 'link', twitch: { video: second } };
    }
    if (third && second === 'clip' && CLIP_SLUG.test(third)) {
      return { play: 'twitch', url: normalized, found: 'link', twitch: { clip: third } };
    }
    if (CHANNEL.test(first) && !TWITCH_RESERVED.has(first.toLowerCase())) {
      return {
        play: 'twitch',
        url: normalized,
        found: 'link',
        twitch: { channel: first },
        live: true,
      };
    }
    return null;
  }
  if (host === 'clips.twitch.tv' && CLIP_SLUG.test(first)) {
    return { play: 'twitch', url: normalized, found: 'link', twitch: { clip: first } };
  }
  if (host === 'player.twitch.tv') {
    const channel = parsed.searchParams.get('channel');
    const video = parsed.searchParams.get('video')?.replace(/^v/, '') ?? null;
    if (channel && CHANNEL.test(channel)) {
      return {
        play: 'twitch',
        url: normalized,
        found: 'link',
        twitch: { channel },
        live: true,
      };
    }
    if (video && TWITCH_ID.test(video)) {
      return { play: 'twitch', url: normalized, found: 'link', twitch: { video } };
    }
    return null;
  }

  const play = mediaPlayFor(normalized);
  if (play) {
    return {
      play,
      url: normalized,
      found: 'link',
      label: decodeURIComponent(parsed.pathname.split('/').pop() ?? '').slice(0, 60) || undefined,
      personal: looksPersonal(normalized) || undefined,
    };
  }
  return null;
}

/**
 * The player a big platform hands out for one of its own pages.
 *
 * Offered ALONGSIDE whatever reading the page turns up, never instead of
 * it: Vimeo's page yields real manifests, which give the room a shared
 * clock, while the embed always works and gives none. Which of those a
 * room wants is exactly the choice this tool exists to put in front of
 * somebody, so it offers both and says what each costs.
 */
export function providerEmbedFor(pageUrl: string): VideoCandidate | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const [, first = '', second = '', third = ''] = url.pathname.split('/');

  if (host === 'vimeo.com' && /^\d{6,12}$/.test(first)) {
    // An unlisted video carries its key as the second segment, and the
    // embed will not play without it.
    const key = /^[A-Za-z0-9]{6,20}$/.test(second) ? `?h=${second}` : '';
    return { play: 'frame', url: `https://player.vimeo.com/video/${first}${key}`, found: 'link' };
  }
  if (host === 'player.vimeo.com' && first === 'video' && /^\d{6,12}$/.test(second)) {
    return { play: 'frame', url: url.toString(), found: 'link' };
  }
  if (host === 'dailymotion.com' && first === 'video' && /^[A-Za-z0-9]{5,20}$/.test(second)) {
    return { play: 'frame', url: `https://geo.dailymotion.com/player.html?video=${second}`, found: 'link' };
  }
  if (host === 'dai.ly' && /^[A-Za-z0-9]{5,20}$/.test(first)) {
    return { play: 'frame', url: `https://geo.dailymotion.com/player.html?video=${first}`, found: 'link' };
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? first
        : (url.searchParams.get('v') ??
          (['embed', 'shorts', 'live', 'v'].includes(first) ? second : ''));
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
      return { play: 'frame', url: `https://www.youtube.com/embed/${id}`, found: 'link' };
    }
  }
  void third;
  return null;
}

/* ------------------------------------------------------------------ *
 * Whether a page may be framed
 * ------------------------------------------------------------------ */

/**
 * Whether we may put this response in an iframe, read from the two
 * headers that decide it.
 *
 * Conservative on purpose: `SAMEORIGIN` and any `frame-ancestors` list
 * that is not a wildcard both mean "not you", and an empty rectangle in
 * the middle of a room is worse than a candidate that was never offered.
 */
export function framingAllowed(
  xFrameOptions: string | null | undefined,
  contentSecurityPolicy: string | null | undefined,
): boolean {
  const xfo = (xFrameOptions ?? '').trim().toLowerCase();
  if (xfo === 'deny' || xfo === 'sameorigin' || xfo.startsWith('allow-from')) {
    return false;
  }
  const csp = (contentSecurityPolicy ?? '').toLowerCase();
  const ancestors = /frame-ancestors([^;]*)/.exec(csp);
  if (!ancestors) {
    return true;
  }
  const sources = (ancestors[1] ?? '').trim().split(/\s+/).filter(Boolean);
  return sources.includes('*') || sources.includes('https:');
}

/* ------------------------------------------------------------------ *
 * Reading the page
 * ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  '#38': '&',
  '#x26': '&',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]{1,6}|[a-z]{2,6});/gi, (match, name: string) => {
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** One attribute out of a tag, either quoting style. */
function attr(tag: string, name: string): string | null {
  const double = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  if (double) {
    return decodeEntities(double[1]!.trim());
  }
  const single = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag);
  if (single) {
    return decodeEntities(single[1]!.trim());
  }
  const bare = new RegExp(`\\b${name}\\s*=\\s*([^\\s"'>]+)`, 'i').exec(tag);
  return bare ? decodeEntities(bare[1]!.trim()) : null;
}

function absolute(value: string | null | undefined, base: string): string | null {
  if (!value) {
    return null;
  }
  const text = value.trim();
  if (!text || text.startsWith('#')) {
    return null;
  }
  try {
    // A protocol-relative URL takes the page's scheme, which is what a
    // browser would do with it.
    return normalizeSourceUrl(new URL(text, base).toString());
  } catch {
    return null;
  }
}

function trim(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, SOURCE_LIMITS.maxLabelLength) : undefined;
}

/** What a page calls a quality tier when it does not use numbers. */
const NAMED_TIERS: Record<string, string> = {
  sd: 'SD',
  hd: 'HD',
  fhd: 'Full HD',
  fullhd: 'Full HD',
  uhd: '4K',
  '4k': '4K',
  low: 'SD',
  high: 'HD',
};

/**
 * A quality label out of whatever the page attached to a source.
 *
 * This is not decoration: two candidates that read the same are two
 * candidates nobody can choose between, and an episode offered at three
 * qualities is the ordinary case. Numbers first, then the names sites
 * use for the same thing, then the file's own name.
 */
function qualityLabel(tag: string, url: string): string | undefined {
  const stated = trim(attr(tag, 'label') ?? attr(tag, 'title') ?? attr(tag, 'data-quality'));
  if (stated) {
    return stated;
  }
  const size = attr(tag, 'size') ?? attr(tag, 'res') ?? attr(tag, 'height');
  if (size && /^\d{3,4}$/.test(size)) {
    return `${size}p`;
  }
  const parsed = new URL(url, 'https://x.invalid');
  const path = parsed.pathname;
  const numbered = /(?:^|[^\d])(240|360|480|540|576|720|1080|1440|2160)p?(?:[^\d]|$)/i.exec(path);
  if (numbered) {
    return `${numbered[1]}p`;
  }
  // `/sd/11.mp4` and `/hd/11.mp4` are the same episode twice, and the
  // directory is the only thing telling them apart.
  for (const segment of path.toLowerCase().split(/[/._-]/).reverse()) {
    const tier = NAMED_TIERS[segment];
    if (tier) {
      return tier;
    }
  }
  // `playlist.m3u8` four times over is four rows nobody can choose
  // between. Where the file name is the same word every site uses, the
  // host it comes from is the only thing that differs — so say that.
  const file = path.split('/').pop() ?? '';
  if (GENERIC_FILE.test(file) && parsed.hostname !== 'x.invalid') {
    return parsed.hostname.replace(/^www\./, '');
  }
  return undefined;
}

/** File names that name a format, not a video. */
const GENERIC_FILE = /^(?:playlist|index|master|manifest|chunklist|stream|video|media)\.[a-z0-9]{2,4}$/i;

/**
 * The label a player's configuration put beside a URL — `"label":"720p"`,
 * `quality: 'HD'`. The window is small on purpose: near means near.
 */
const LABEL_BESIDE = /["'](?:label|quality|res|title)["']?\s*:\s*["']([^"']{1,24})["']/i;

function labelBeside(text: string, from: number, to: number): string | undefined {
  return trim(LABEL_BESIDE.exec(text.slice(from, to))?.[1]);
}

const TAG = {
  meta: /<meta\b[^>]*>/gi,
  video: /<video\b[^>]*>/gi,
  source: /<source\b[^>]*>/gi,
  iframe: /<iframe\b[^>]*>/gi,
  base: /<base\b[^>]*>/i,
  script: /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{0,20000}?)<\/script>/gi,
  title: /<title[^>]*>([\s\S]{0,300}?)<\/title>/i,
};

/**
 * Media URLs sitting in the page's own text — a player's configuration,
 * a JSON blob, an inline script. Written with `\/` escapes as often as
 * not, which is why the haystack is unescaped first.
 */
const MEDIA_IN_TEXT =
  /https?:\/\/[^\s"'<>\\)]{4,600}\.(?:m3u8|mpd|mp4|m4v|webm|ogv|mov)(?:\?[^\s"'<>\\)]{0,400})?/gi;

function pageTitle(html: string): string | undefined {
  const og = metaContent(html, ['og:title', 'twitter:title']);
  return trim(og ?? decodeEntities(TAG.title.exec(html)?.[1] ?? ''));
}

/** The first of these preview tags the page carries. */
function metaContent(html: string, keys: readonly string[]): string | undefined {
  TAG.meta.lastIndex = 0;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let match: RegExpExecArray | null;
  while ((match = TAG.meta.exec(html))) {
    const tag = match[0];
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (wanted.has(key)) {
      const content = attr(tag, 'content');
      if (content) {
        return content;
      }
    }
  }
  return undefined;
}

/** A candidate for a URL that is media, or an embed we can frame. */
function candidateFor(
  url: string,
  found: SourceFound,
  extra: Partial<VideoCandidate> = {},
): VideoCandidate | null {
  const known = candidateForUrl(url);
  if (known) {
    return { ...known, ...extra, found, label: extra.label ?? known.label };
  }
  const play = mediaPlayFor(url);
  return {
    play: play ?? 'frame',
    url,
    found,
    // Only a media URL can be "cut for one viewer": a frame is a page,
    // and each browser opens it in its own name anyway. Warning about a
    // token there would scare people off the one option that survives a
    // site which signs its links.
    personal: (play && looksPersonal(url)) || undefined,
    ...extra,
  };
}

/**
 * Frames that are never the video. Every page of any size carries a few —
 * a login, a consent box, an ad slot, an analytics pixel — and offering
 * them as things to watch together buries the one candidate that is.
 */
const NOT_A_PLAYER =
  /(^|\.)(accounts\.google\.com|google\.com|googletagmanager\.com|google-analytics\.com|doubleclick\.net|googlesyndication\.com|facebook\.com|connect\.facebook\.net|disqus\.com|recaptcha\.net|hcaptcha\.com|adservice\..*|.*\.ads?\..*)$/i;

/**
 * Things that are not documents, however they got into a `src`. Real
 * example, from one of the largest video sites there is: Dailymotion's
 * page carries `<iframe src="/favicon.ico">`, and offering that as
 * something to watch together was the whole of what we found there.
 */
const NOT_A_PAGE = /\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|mjs|json|woff2?|ttf|map)$/i;

function isPlayerHost(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (NOT_A_PLAYER.test(hostname.toLowerCase()) || NOT_A_PAGE.test(pathname)) {
      return false;
    }
    return !/\/(?:recaptcha|gtm|analytics|consent|cookie)/i.test(pathname);
  } catch {
    return false;
  }
}

function schemaCandidates(html: string, base: string): VideoCandidate[] {
  const found: VideoCandidate[] = [];
  TAG.script.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = TAG.script.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(block[1] ?? '');
    } catch {
      continue;
    }
    walkSchema(data, base, found, 0);
  }
  return found;
}

function walkSchema(node: unknown, base: string, out: VideoCandidate[], depth: number): void {
  if (depth > 6 || !node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 40)) {
      walkSchema(item, base, out, depth + 1);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  const type = String(record['@type'] ?? '').toLowerCase();
  if (type.includes('videoobject') || type === 'broadcastevent') {
    const title = trim(typeof record.name === 'string' ? record.name : undefined);
    const poster = typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : undefined;
    const live = record.isLiveBroadcast === true || type === 'broadcastevent';
    for (const key of ['contentUrl', 'embedUrl'] as const) {
      const value = record[key];
      const url = typeof value === 'string' ? absolute(value, base) : null;
      const candidate = url && candidateFor(url, 'schema', { title, live: live || undefined });
      if (candidate) {
        candidate.poster = absolute(poster, base) ?? undefined;
        out.push(candidate);
      }
    }
  }
  for (const value of Object.values(record).slice(0, 40)) {
    walkSchema(value, base, out, depth + 1);
  }
}

/**
 * Everything playable this page admits to, in the order a person should
 * be offered it. The caller decides what to fetch next (an embed worth a
 * second look) and what to show.
 */
export function candidatesFromHtml(html: string, pageUrl: string): VideoCandidate[] {
  const page = html.slice(0, SOURCE_LIMITS.maxHtmlBytes);
  // A page is allowed to say what its relative URLs are relative to, and
  // one that says so and is not believed resolves every source it has to
  // the wrong host.
  const declared = TAG.base.exec(page)?.[0];
  const base = (declared && absolute(attr(declared, 'href'), pageUrl)) || pageUrl;
  const title = pageTitle(page);
  const poster = absolute(metaContent(page, ['og:image', 'twitter:image']), base) ?? undefined;
  const found: VideoCandidate[] = [];
  const add = (candidate: VideoCandidate | null): void => {
    if (candidate) {
      found.push({ title: candidate.title ?? title, poster: candidate.poster ?? poster, ...candidate });
    }
  };

  // 1. The tags a page publishes about itself. A `twitter:player` is an
  //    embed by definition; an `og:video` may be either.
  const declaredLive =
    /["']?(?:og:video:)?tag["']?\s*[:=]\s*["']live/i.test(page) ||
    metaContent(page, ['og:video:type']) === 'application/x-mpegURL';
  for (const key of ['og:video:secure_url', 'og:video:url', 'og:video'] as const) {
    const url = absolute(metaContent(page, [key]), base);
    add(url ? candidateFor(url, 'meta', { title, live: declaredLive || undefined }) : null);
  }
  const player = absolute(metaContent(page, ['twitter:player']), base);
  add(player ? { ...candidateFor(player, 'meta', { title })!, play: candidateForUrl(player)?.play ?? 'frame' } : null);

  // 2. schema.org — the most explicit thing a page can say.
  for (const candidate of schemaCandidates(page, base)) {
    add(candidate);
  }

  // 3. The elements themselves.
  TAG.video.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.video.exec(page))) {
    const tag = match[0];
    const src = absolute(attr(tag, 'src') ?? attr(tag, 'data-src'), base);
    add(
      src
        ? candidateFor(src, 'element', {
            label: qualityLabel(tag, src),
            poster: absolute(attr(tag, 'poster'), base) ?? poster,
            title,
          })
        : null,
    );
  }
  TAG.source.lastIndex = 0;
  while ((match = TAG.source.exec(page))) {
    const tag = match[0];
    const type = attr(tag, 'type') ?? '';
    const src = absolute(attr(tag, 'src'), base);
    // <source> also lives in <picture>; only the media ones are ours.
    if (!src || (type && !/^(video|audio|application\/(x-mpegurl|vnd\.apple\.mpegurl|dash))/i.test(type))) {
      continue;
    }
    if (mediaPlayFor(src) || /mpegurl|dash/i.test(type)) {
      add(candidateFor(src, 'element', { label: qualityLabel(tag, src), title }));
    }
  }

  // 4. Players from elsewhere. Anything we recognise plays properly;
  //    everything else is a frame, which is still the whole point.
  TAG.iframe.lastIndex = 0;
  while ((match = TAG.iframe.exec(page))) {
    const tag = match[0];
    const src = absolute(attr(tag, 'src') ?? attr(tag, 'data-src') ?? attr(tag, 'data-litespeed-src'), base);
    add(src && isPlayerHost(src) ? candidateFor(src, 'embed', { title: trim(attr(tag, 'title')) ?? title }) : null);
  }

  // 5. The player's own configuration, wherever it sits. Last, because
  //    it is the guess: a page may carry a trailer's mp4 next to the
  //    episode's, and only the person watching can tell them apart.
  const text = page.replace(/\\\//g, '/');
  MEDIA_IN_TEXT.lastIndex = 0;
  let scanned = 0;
  while ((match = MEDIA_IN_TEXT.exec(text)) && scanned < 40) {
    scanned += 1;
    const url = absolute(decodeEntities(match[0]), base);
    const end = match.index + match[0].length;
    const label = labelBeside(text, end, end + 90) ?? qualityLabel('', url ?? '');
    add(url ? candidateFor(url, 'script', { label, title }) : null);
  }

  return rankCandidates(found);
}

/**
 * The list a person is shown: no duplicates, best first, capped.
 *
 * "Best" is how much of a shared clock the room gets, then how sure the
 * page was that this is its video. A frame is last and never absent — it
 * is what carries the sites whose player only exists after a click.
 */
export function rankCandidates(candidates: readonly VideoCandidate[]): VideoCandidate[] {
  const playRank: Record<SourcePlay, number> = { hls: 0, file: 0, dash: 1, twitch: 1, frame: 3 };
  const foundRank: Record<SourceFound, number> = {
    link: 0,
    meta: 1,
    schema: 1,
    element: 2,
    embed: 3,
    script: 4,
  };
  const seen = new Map<string, VideoCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.play}:${candidate.url}`;
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, candidate);
      continue;
    }
    // The same URL found twice keeps whatever either sighting knew.
    seen.set(key, {
      ...candidate,
      ...previous,
      label: previous.label ?? candidate.label,
      title: previous.title ?? candidate.title,
      poster: previous.poster ?? candidate.poster,
      live: previous.live ?? candidate.live,
    });
  }
  // A page's scripts often carry the same stream signed several ways —
  // Vimeo hands out four manifests for one video, two per CDN. They are
  // different URLs and identical rows, and a list nobody can choose from
  // is worse than a shorter one. Only guesses are collapsed: a `<source>`
  // the page labelled is the page telling us they differ.
  const distinct: VideoCandidate[] = [];
  const shapes = new Set<string>();
  for (const candidate of seen.values()) {
    if (candidate.found === 'script') {
      const host = ((): string => {
        try {
          return new URL(candidate.url).hostname;
        } catch {
          return candidate.url;
        }
      })();
      const shape = `${candidate.play}:${host}:${candidate.label ?? ''}`;
      if (shapes.has(shape)) {
        continue;
      }
      shapes.add(shape);
    }
    distinct.push(candidate);
  }
  return distinct
    // A stable sort, so two candidates of equal standing stay in the order
    // the page put them in — which is the page's own idea of what matters.
    .sort(
      (a, b) =>
        playRank[a.play] - playRank[b.play] || foundRank[a.found] - foundRank[b.found],
    )
    .slice(0, SOURCE_LIMITS.maxCandidates);
}

/**
 * The one embed worth opening as well, if any.
 *
 * A page whose video lives behind another page's player — a very common
 * shape — tells us nothing playable until that second page is read. One
 * hop, the first unrecognised frame, and never the page we just read.
 */
export function embedToFollow(
  candidates: readonly VideoCandidate[],
  pageUrl: string,
): string | null {
  const playable = candidates.some((candidate) => candidate.play !== 'frame');
  if (playable) {
    return null;
  }
  const page = new URL(pageUrl);
  for (const candidate of candidates) {
    if (candidate.play !== 'frame' || candidate.via) {
      continue;
    }
    const url = new URL(candidate.url);
    if (url.toString() !== page.toString()) {
      return candidate.url;
    }
  }
  return null;
}
