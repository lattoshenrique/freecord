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
  mute(): void;
  unMute(): void;
  destroy(): void;
}

interface PlayerOptions {
  videoId: string;
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
    const player = new api.Player(element, {
      videoId: options.videoId,
      playerVars: {
        // The room's own controls are the shared ones; YouTube's are the
        // familiar ones, and every move they make goes out to everybody.
        autoplay: options.autoplay ? 1 : 0,
        start: Math.floor(options.startSeconds),
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
      },
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

/** A video id, and where the pasted link said to start (0 if it did not). */
export interface ParsedVideo {
  video: string;
  start: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
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
 * The video in whatever someone pasted: a full watch URL, a share link, an
 * embed, a short, a live, or the bare id. Null when there is no video in
 * it — the field says so instead of the room being told to load nothing.
 */
export function parseVideo(input: string): ParsedVideo | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (VIDEO_ID.test(text)) {
    return { video: text, start: 0 };
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
    return VIDEO_ID.test(id) ? { video: id, start } : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }
  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) {
    return { video: fromQuery, start };
  }
  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const [, section, id] = url.pathname.split('/');
  return section && id && ['embed', 'shorts', 'live', 'v'].includes(section) && VIDEO_ID.test(id)
    ? { video: id, start }
    : null;
}
