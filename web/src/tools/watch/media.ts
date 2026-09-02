/**
 * Putting a source into a `<video>` element.
 *
 * Three shapes arrive here and only the middle one needs help:
 *
 *   file   a progressive file. `src = url` and the browser does the rest.
 *          No `crossOrigin`, deliberately: setting it would demand CORS
 *          headers from every site that serves a plain mp4 perfectly
 *          happily without them, and break the common case to tidy up
 *          the rare one.
 *   hls    a manifest, played through hls.js on Media Source Extensions
 *          wherever they exist, and natively only where they do not
 *          (iOS). Never the other way round — see playsHlsNatively, and
 *          the browser that says "maybe" and means no. hls.js is
 *          imported only when a stream actually turns up: it is the
 *          heaviest thing in this build, and a room that never opens a
 *          stream never fetches it.
 *   dash   attached as-is. A handful of browsers manage it; the rest
 *          fail, and the stage says so rather than spinning.
 *
 * Nothing here proxies anything: the bytes go from wherever the video
 * lives to this browser, and the room only ever agreed on the address.
 */
import type { SourcePlay } from './state';

/** What a mounted source hands back: a way to let go of it. */
export interface AttachedSource {
  destroy(): void;
}

/**
 * Whether this browser plays HLS on its own — asked LAST, and never
 * believed on its own.
 *
 * `canPlayType('application/vnd.apple.mpegurl')` answers `"maybe"` in
 * Chromium, which cannot play HLS at all. Measured, not assumed: this
 * browser says "maybe" and then fires `error` on the element the moment
 * it is handed a manifest. Trusting it is why every stream failed
 * everywhere except Safari — which is to say in almost every room.
 *
 * So the order is the one every HLS player uses: Media Source Extensions
 * first (hls.js — Chrome, Edge, Firefox), and the element's own opinion
 * only where MSE is missing, which in practice means iOS, the one place
 * that opinion is true.
 */
function playsHlsNatively(video: HTMLVideoElement): boolean {
  return (
    video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    video.canPlayType('application/x-mpegURL') !== ''
  );
}

/** How many times a stream may stumble before we say so out loud. */
const MAX_RECOVERIES = 2;

export type SourceFailure =
  /** The source refused to load or to decode. */
  | 'failed'
  /** A stream this browser has no way to play. */
  | 'unsupported';

/**
 * Points an element at a source. Resolves once the source is attached —
 * not once it plays, which is the caller's business and the room's.
 */
export async function attachSource(
  video: HTMLVideoElement,
  source: { play: SourcePlay; url: string },
  onFailure: (failure: SourceFailure) => void,
): Promise<AttachedSource> {
  if (source.play === 'hls') {
    // hls.js first (see playsHlsNatively for why), and the element's own
    // support only where hls.js cannot run.
    const attached = await attachHls(video, source.url, onFailure);
    if (attached) {
      return attached;
    }
    if (!playsHlsNatively(video)) {
      onFailure('unsupported');
      return { destroy() {} };
    }
  }
  video.src = source.url;
  // `error` on the element covers the whole plain path: a 403 from a
  // site that only serves its own pages, a codec nobody has, a link that
  // expired between the lookup and the play.
  const onError = () => onFailure('failed');
  video.addEventListener('error', onError);
  return {
    destroy() {
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    },
  };
}

/**
 * Attaches through hls.js, or null when this browser cannot run it —
 * which is the caller's cue to try the element's own support rather than
 * to give up.
 */
async function attachHls(
  video: HTMLVideoElement,
  url: string,
  onFailure: (failure: SourceFailure) => void,
): Promise<AttachedSource | null> {
  let Hls: typeof import('hls.js').default;
  try {
    ({ default: Hls } = await import('hls.js'));
  } catch {
    return null; // blocked, offline, or a build without the chunk
  }
  if (!Hls.isSupported()) {
    return null;
  }
  const hls = new Hls({
    // A room watches together, so being close to the edge matters more
    // than a buffer nobody is going to need.
    lowLatencyMode: true,
    backBufferLength: 30,
  });
  /**
   * Recoveries spent. Bounded, and that bound is the whole point: a
   * segment that 404s mid-stream is ordinary and worth retrying, but a
   * stream whose variant playlists are simply gone raises the same fatal
   * error forever — and an unbounded retry answers that with a spinner
   * that never stops, which is the worst thing a stage can show. Found
   * on a real dead stream: master parsed, every variant 404, three
   * `levelLoadError`s and then silence.
   */
  let spent = 0;
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) {
      return;
    }
    const recoverable =
      data.type === Hls.ErrorTypes.NETWORK_ERROR || data.type === Hls.ErrorTypes.MEDIA_ERROR;
    if (!recoverable || spent >= MAX_RECOVERIES) {
      onFailure('failed');
      hls.destroy();
      return;
    }
    spent += 1;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
    } else {
      hls.recoverMediaError();
    }
  });
  hls.loadSource(url);
  hls.attachMedia(video);
  return {
    destroy() {
      hls.destroy();
    },
  };
}

/**
 * The furthest point that can be played right now, when the source has
 * one. For a live stream this is the edge everybody is trying to be at;
 * for a file it is simply its end, and no use to anybody.
 */
export function liveEdgeOf(video: HTMLVideoElement): number | undefined {
  const { seekable } = video;
  return seekable.length > 0 ? seekable.end(seekable.length - 1) : undefined;
}
