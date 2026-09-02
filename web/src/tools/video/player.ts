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
 *   hls    a manifest. Safari plays it natively; everybody else needs
 *          Media Source Extensions driven by hls.js, which is imported
 *          only when a stream actually turns up — it is the heaviest
 *          thing in this build and no room that never opens a stream
 *          should pay for it.
 *   dash   attached as-is. A handful of browsers manage it; the rest
 *          fail, and the stage says so rather than spinning.
 *
 * Nothing here proxies anything: the bytes go from wherever the video
 * lives to this browser, and the room only ever agreed on the address.
 */
import type { VideoPlay } from './state';

/** What a mounted source hands back: a way to let go of it. */
export interface AttachedSource {
  destroy(): void;
}

/** Whether this browser plays HLS without any help (Safari, iOS). */
function playsHlsNatively(video: HTMLVideoElement): boolean {
  return (
    video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    video.canPlayType('application/x-mpegURL') !== ''
  );
}

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
  source: { play: VideoPlay; url: string },
  onFailure: (failure: SourceFailure) => void,
): Promise<AttachedSource> {
  if (source.play === 'hls' && !playsHlsNatively(video)) {
    return attachHls(video, source.url, onFailure);
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

async function attachHls(
  video: HTMLVideoElement,
  url: string,
  onFailure: (failure: SourceFailure) => void,
): Promise<AttachedSource> {
  let Hls: typeof import('hls.js').default;
  try {
    ({ default: Hls } = await import('hls.js'));
  } catch {
    onFailure('unsupported');
    return { destroy() {} };
  }
  if (!Hls.isSupported()) {
    onFailure('unsupported');
    return { destroy() {} };
  }
  const hls = new Hls({
    // A room watches together, so being close to the edge matters more
    // than a buffer nobody is going to need.
    lowLatencyMode: true,
    backBufferLength: 30,
  });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) {
      return;
    }
    // A fatal network or media error is worth one recovery attempt —
    // a segment that 404s mid-stream is ordinary — and after that it is
    // an honest failure rather than a spinner forever.
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
      return;
    }
    onFailure('failed');
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
