/**
 * Twitch's embed, wrapped in the little of it a room needs.
 *
 * A live channel is the one source where "together" costs nothing and
 * means everything: there is no position to agree on, because a
 * broadcast has only one, and it is now. What the room still agrees on
 * is whether it is playing — and, because the shelf's rule is that a
 * tool making sound respects the room's speaker key, we need a player we
 * can actually mute. That is the whole reason this goes through their
 * JS API instead of a plain iframe: an iframe would be a rectangle we
 * cannot reach into, and the speaker key would stop meaning anything.
 *
 * As with YouTube's API, the script is fetched once per page and shared:
 * it installs a single global.
 */

/** The parts of Twitch's player we call. */
export interface TwitchPlayer {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  isPaused(): boolean;
  setMuted(muted: boolean): void;
  /** 0 … 1. */
  setVolume(volume: number): void;
  getEnded?(): boolean;
}

interface TwitchEmbed {
  getPlayer(): TwitchPlayer;
  addEventListener(event: string, handler: () => void): void;
  destroy?(): void;
}

interface TwitchApi {
  Embed: {
    new (element: HTMLElement | string, options: Record<string, unknown>): TwitchEmbed;
    VIDEO_READY: string;
  };
  Player: { PLAY: string; PAUSE: string; ENDED: string; OFFLINE: string };
}

declare global {
  interface Window {
    Twitch?: TwitchApi;
  }
}

const API_SRC = 'https://embed.twitch.tv/embed/v1.js';
/** One fetch per page, shared by every mount. */
let apiPromise: Promise<TwitchApi> | null = null;

export function loadTwitchApi(): Promise<TwitchApi> {
  if (apiPromise) {
    return apiPromise;
  }
  apiPromise = new Promise<TwitchApi>((resolve, reject) => {
    if (window.Twitch?.Embed) {
      resolve(window.Twitch);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${API_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const ready = () => {
      if (window.Twitch?.Embed) {
        resolve(window.Twitch);
      } else {
        reject(new Error('twitch api loaded without an embed'));
      }
    };
    script.addEventListener('load', ready);
    // Blocked by an extension, by an offline app, or by a network that
    // does not like Twitch: fail the promise rather than leave a player
    // spinning forever.
    script.addEventListener('error', () => reject(new Error('twitch api blocked')));
    if (!existing) {
      script.src = API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    apiPromise = null; // a later attempt may find the network back
    throw error;
  });
  return apiPromise;
}

export interface TwitchMountOptions {
  channel?: string;
  video?: string;
  clip?: string;
  autoplay: boolean;
  muted: boolean;
  startSeconds: number;
  onReady: (player: TwitchPlayer) => void;
  onPlayPause: () => void;
}

/**
 * Builds a player inside `element`.
 *
 * `parent` is Twitch's own requirement — an embed names the host it is
 * allowed to be embedded on — and it is this page's hostname because
 * that is exactly what it is.
 */
export async function mountTwitch(
  element: HTMLElement,
  options: TwitchMountOptions,
): Promise<TwitchEmbed> {
  const api = await loadTwitchApi();
  const embed = new api.Embed(element, {
    width: '100%',
    height: '100%',
    channel: options.channel,
    video: options.video,
    // Their API spells a past broadcast's start as `time`, in `1h2m3s`.
    time: options.video && options.startSeconds > 0 ? seekString(options.startSeconds) : undefined,
    autoplay: options.autoplay,
    muted: options.muted,
    // The room is the chat; theirs would be a second conversation in the
    // corner of a call.
    layout: 'video',
    allowfullscreen: true,
  });
  embed.addEventListener(api.Embed.VIDEO_READY, () => options.onReady(embed.getPlayer()));
  embed.addEventListener(api.Player.PLAY, options.onPlayPause);
  embed.addEventListener(api.Player.PAUSE, options.onPlayPause);
  return embed;
}

/** Seconds as Twitch writes them: `1h2m3s`. */
export function seekString(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h}h${m}m${s}s`;
}
