/**
 * Feature detection for encoded-frame passthrough.
 *
 * Three things must hold: RTCRtpScriptTransform (Safari and Chromium),
 * module Workers, and a CONSTRUCTIBLE RTCEncodedVideoFrame with a metadata
 * override — Chromium-only today, and the piece Safari lacks. The last one
 * is the awkward probe: the constructor needs a real frame as its first
 * argument, which only exists inside a transform, so from the outside the
 * best available signal is how construction fails. A non-constructible DOM
 * interface throws "Illegal constructor"; a constructible one complains
 * about the missing argument. Message-sniffing is fragile by nature, which
 * is why the runtime treats any construction failure inside the worker as
 * a per-child fallback — this function only has to be right often enough
 * to avoid pointless setup.
 */

interface DetectionScope {
  Worker?: unknown;
  RTCRtpScriptTransform?: unknown;
  RTCEncodedVideoFrame?: unknown;
}

function frameConstructible(scope: DetectionScope): boolean {
  const ctor = scope.RTCEncodedVideoFrame;
  if (typeof ctor !== 'function') {
    return false;
  }
  try {
    new (ctor as new () => unknown)();
    return true;
  } catch (error) {
    return error instanceof TypeError && !/illegal constructor/i.test(String(error.message));
  }
}

export function encodedRelaySupported(
  scope: DetectionScope = globalThis as DetectionScope,
): boolean {
  return (
    typeof scope.Worker === 'function' &&
    typeof scope.RTCRtpScriptTransform === 'function' &&
    frameConstructible(scope)
  );
}
