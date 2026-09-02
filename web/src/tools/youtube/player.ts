/**
 * YouTube's IFrame player, wrapped in the little of it this room needs.
 *
 * The room never proxies the video: each browser embeds YouTube's own
 * player and plays from YouTube. What travels between us is only the
 * agreement — which video, playing or not, and where (lib/protocol.ts,
 * `watch`). So this module has two jobs: turn whatever someone pasted
 * into a video id, and hand back a player object the component can drive.
 *
 * The API script is fetched once per page and shared: YouTube installs a
 * single global (`window.YT`) and calls a single global callback, so a
 * second loader would fight the first for it.
 */

/** The player states YouTube reports; mirror of `YT.PlayerState`. */
import type { WatchItem } from './state';

export const PLAYER_STATE = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
} as const;

/** What we call on the player — a subset of YouTube's own interface. */
export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  loadPlaylist(options: { list: string; listType: 'playlist'; index?: number; startSeconds?: number }): void;
  cuePlaylist(options: { list: string; listType: 'playlist'; index?: number; startSeconds?: number }): void;
  /** Where in its playlist the player is; -1 when it is not playing one. */
  getPlaylistIndex(): number;
  /** The playlist's video ids, so we can tell its last video from the rest. */
  getPlaylist(): string[] | null;
  /** Jumps to another of the playlist's videos. */
  playVideoAt(index: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

interface PlayerOptions {
  /** What to load: one video, or a position inside a playlist. */
  item: WatchItem;
  startSeconds: number;
  autoplay: boolean;
  onReady: (player: YouTubePlayer) => void;
  onStateChange: (state: number) => void;
  onError: () => void;
}

interface YouTubeApi {
  Player: new (element: HTMLElement, config: unknown) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api';
/** One fetch per page, shared by every mount (see the note above). */
let apiPromise: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (apiPromise) {
    return apiPromise;
  }
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    // The API calls this the moment it is ready; anything the page had
    // there is kept, because we are guests in a global we do not own.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('youtube api loaded without a player'));
      }
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${API_SRC}"]`);
    if (existing) {
      return; // another mount already asked; the callback covers us both
    }
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    // A blocked script (an extension, an offline desktop app) must fail
    // the promise rather than leave the player spinning forever.
    script.onerror = () => reject(new Error('youtube api blocked'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    apiPromise = null; // a later attempt may find the network back
    throw error;
  });
  return apiPromise;
}

/** Creates a player in `element`, resolving when YouTube says it is ready. */
export async function createPlayer(
  element: HTMLElement,
  options: PlayerOptions,
): Promise<YouTubePlayer> {
  const api = await loadYouTubeApi();
  return new Promise<YouTubePlayer>((resolve) => {
    const { item } = options;
    // The room's own controls are the shared ones; YouTube's are the
    // familiar ones, and every move they make goes out to everybody.
    const common = { playsinline: 1, rel: 0, modestbranding: 1, autoplay: options.autoplay ? 1 : 0 };
    // A playlist is loaded as ITSELF and nothing else: `listType` + `list`
    // alone. Adding a videoId, an index or a start next to them leaves the
    // API with an iframe whose src it never fills in — which is a stage
    // that stays black forever. Where in the playlist to be, and where in
    // that video, is applied on ready like every other correction (Stage).
    const config =
      item.kind === 'video'
        ? { videoId: item.video, playerVars: { ...common, start: Math.floor(options.startSeconds) } }
        : { playerVars: { ...common, listType: 'playlist', list: item.list } };
    const player = new api.Player(element, {
      ...config,
      events: {
        onReady: () => {
          options.onReady(player);
          resolve(player);
        },
        onStateChange: (event: { data: number }) => options.onStateChange(event.data),
        onError: () => options.onError(),
      },
    });
  });
}

/** What a pasted link turned out to be, and where it said to start. */
export interface ParsedLink {
  item: WatchItem;
  start: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{13,42}$/;
/** `1h2m3s`, `90s` or plain `90` — YouTube writes `t` every one of those ways. */
const TIME = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

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
 * What someone pasted: a full watch URL, a share link, an embed, a short,
 * a live, a playlist, or a bare id. Null when there is nothing to play in
 * it — the field says so instead of the room being told to load nothing.
 *
 * A link that carries BOTH a video and a playlist (`watch?v=…&list=…`,
 * what YouTube gives you for a video you opened from a playlist) is taken
 * as the video. That is the thing the person was looking at when they
 * copied it; a link meant as a playlist is the one that has no `v` at
 * all, which is exactly what /playlist gives.
 */
export function parseLink(input: string): ParsedLink | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (VIDEO_ID.test(text)) {
    return { item: { kind: 'video', video: text }, start: 0 };
  }
  let url: URL;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return VIDEO_ID.test(id) ? { item: { kind: 'video', video: id }, start } : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }
  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) {
    return { item: { kind: 'video', video: fromQuery }, start };
  }
  const list = url.searchParams.get('list');
  if (list && LIST_ID.test(list)) {
    // A playlist starts at its beginning: which of its videos is which is
    // the player's knowledge, not ours (state.ts).
    return { item: { kind: 'list', list, index: 0 }, start: 0 };
  }
  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const [, section, id] = url.pathname.split('/');
  return section && id && ['embed', 'shorts', 'live', 'v'].includes(section) && VIDEO_ID.test(id)
    ? { item: { kind: 'video', video: id }, start }
    : null;
}
