/**
 * YouTube's IFrame player, wrapped in the little of it this room needs.
 *
 * The room never proxies the video: each browser embeds YouTube's own
 * player and plays from YouTube. What travels between us is only the
 * agreement — which video, playing or not, and where. So this module has
 * one job: hand back a player object the stage can drive. Turning a
 * pasted link into an item is link.ts, one door earlier.
 *
 * The API script is fetched once per page and shared: YouTube installs a
 * single global (`window.YT`) and calls a single global callback, so a
 * second loader would fight the first for it. It is fetched only when a
 * YouTube item actually turns up — a room that only ever watches files
 * never loads a line of it.
 */
import type { WatchItem } from './state';

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
  /** 0 … 100. Their own scale, and the only volume control they expose. */
  setVolume(volume: number): void;
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
      item.kind === 'list'
        ? { playerVars: { ...common, listType: 'playlist', list: item.list } }
        : {
            videoId: item.kind === 'video' ? item.video : undefined,
            playerVars: { ...common, start: Math.floor(options.startSeconds) },
          };
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
