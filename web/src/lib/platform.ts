/**
 * Which build the visitor needs.
 *
 * Mirrors the targets in `server/src/domain/downloads.ts` (the same relation
 * `protocol.ts` has with the server protocol).
 *
 * The hard case is the Mac: **Intel and Apple Silicon run different binaries**
 * and the browser will not say which one it is. Three signals, in order of
 * confidence:
 *
 * 1. `userAgentData.getHighEntropyValues(['architecture'])` — the official
 *    answer, but Chromium only.
 * 2. The WebGL renderer — what is left in Safari. An Intel/AMD/NVIDIA GPU only
 *    exists in an Intel Mac; "Apple M…"/"Apple GPU" only in Apple Silicon.
 * 3. A guess at Apple Silicon (most Macs in use), flagged `confident: false` —
 *    the UI then keeps the other build one click away instead of hiding it.
 */

export type DesktopTarget =
  | 'mac-arm64'
  | 'mac-x64'
  | 'windows-x64'
  | 'linux-appimage'
  | 'linux-deb';

export type DetectedOs = 'mac' | 'windows' | 'linux' | 'mobile' | 'unknown';

export interface PlatformGuess {
  os: DetectedOs;
  /** Recommended build, or null on mobile / unknown OS. */
  target: DesktopTarget | null;
  /** `false` = plausible guess; the UI highlights how to switch. */
  confident: boolean;
}

interface UserAgentData {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?(hints: string[]): Promise<{ architecture?: string }>;
}

export interface PlatformProbe {
  userAgent: string;
  uaData?: UserAgentData | null;
  maxTouchPoints?: number;
  /** WebGL renderer string, or null when unavailable. */
  renderer?: () => string | null;
}

function osOf(probe: PlatformProbe): DetectedOs {
  const ua = probe.userAgent;
  if (probe.uaData?.mobile || /Android|iPhone|iPod/i.test(ua)) {
    return 'mobile';
  }
  const platform = probe.uaData?.platform ?? '';
  if (/macOS/i.test(platform) || /Mac/i.test(ua)) {
    // An iPad in "desktop mode" claims to be a Macintosh; touch gives it away.
    return /iPad/i.test(ua) || (probe.maxTouchPoints ?? 0) > 1 ? 'mobile' : 'mac';
  }
  if (/Windows/i.test(platform) || /Windows|Win64|WOW64/i.test(ua)) {
    return 'windows';
  }
  if (/Linux|Chrome OS/i.test(platform) || /Linux|X11|CrOS/i.test(ua)) {
    return 'linux';
  }
  return 'unknown';
}

/** Reads the current browser's WebGL renderer (null if no context opens). */
export function webglRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      return null;
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const value = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Mac architecture from the renderer — null when the signal does not decide. */
export function macArchFromRenderer(renderer: string | null): 'arm64' | 'x64' | null {
  if (!renderer) {
    return null;
  }
  // A third-party GPU only exists in an Intel Mac — test it first, because
  // Safari sometimes prefixes everything with "Apple".
  if (/intel|radeon|amd|nvidia|geforce/i.test(renderer)) {
    return 'x64';
  }
  if (/apple\s*(m\d|gpu|silicon)/i.test(renderer)) {
    return 'arm64';
  }
  return null;
}

function browserProbe(): PlatformProbe {
  const nav = navigator as Navigator & { userAgentData?: UserAgentData };
  return {
    userAgent: nav.userAgent,
    uaData: nav.userAgentData ?? null,
    maxTouchPoints: nav.maxTouchPoints,
    renderer: webglRenderer,
  };
}

export async function detectPlatform(probe: PlatformProbe = browserProbe()): Promise<PlatformGuess> {
  const os = osOf(probe);
  if (os === 'windows') {
    // Windows on ARM runs the x64 installer through emulation: one build.
    return { os, target: 'windows-x64', confident: true };
  }
  if (os === 'linux') {
    return { os, target: 'linux-appimage', confident: true };
  }
  if (os !== 'mac') {
    return { os, target: null, confident: false };
  }

  const architecture = await probe.uaData?.getHighEntropyValues?.(['architecture'])
    .then((values) => values.architecture)
    .catch(() => undefined);
  if (architecture === 'arm') {
    return { os, target: 'mac-arm64', confident: true };
  }
  if (architecture === 'x86') {
    return { os, target: 'mac-x64', confident: true };
  }

  const arch = macArchFromRenderer(probe.renderer?.() ?? null);
  if (arch) {
    return { os, target: arch === 'arm64' ? 'mac-arm64' : 'mac-x64', confident: true };
  }
  return { os, target: 'mac-arm64', confident: false };
}

/** Already inside the app: nobody in Electron needs to download Electron. */
export function isDesktopApp(): boolean {
  return Boolean((window as { freecordDesktop?: unknown }).freecordDesktop);
}
