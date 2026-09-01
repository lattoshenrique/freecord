/**
 * Screen-share quality presets.
 *
 * Letting the browser decide (`getDisplayMedia({ video: true })`) gives
 * the worst of both worlds: it degrades resolution AND fps at the same
 * time while aiming at a conservative bitrate. Here the choice is
 * explicit — and what to sacrifice when bandwidth gets tight becomes the
 * sharer's decision.
 *
 * User-facing preset names and hints live in the i18n catalog, keyed by
 * id (`quality.<id>.label` / `quality.<id>.hint`) — never hardcoded here.
 */

export type ScreenQualityId = 'sharp' | 'balanced' | 'smooth';

export interface ScreenQualityPreset {
  id: ScreenQualityId;
  width: number;
  height: number;
  frameRate: number;
  /** Per-peer cap (bps), before the uplink split. */
  maxBitrate: number;
  contentHint: 'text' | 'detail' | 'motion';
  degradationPreference: RTCDegradationPreference;
}

export const SCREEN_QUALITY_PRESETS: readonly ScreenQualityPreset[] = [
  {
    id: 'sharp',
    width: 1920,
    height: 1080,
    frameRate: 15,
    maxBitrate: 3_000_000,
    contentHint: 'text',
    degradationPreference: 'maintain-resolution',
  },
  {
    id: 'balanced',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 6_000_000,
    contentHint: 'detail',
    degradationPreference: 'maintain-resolution',
  },
  {
    id: 'smooth',
    width: 1280,
    height: 720,
    frameRate: 60,
    maxBitrate: 8_000_000,
    contentHint: 'motion',
    degradationPreference: 'maintain-framerate',
  },
];

export const DEFAULT_SCREEN_QUALITY: ScreenQualityId = 'balanced';

/**
 * Assumed upload budget for the screen (bps).
 *
 * With the forwarding tree (server/src/domain/screen-tree.ts) each peer
 * uploads at most SCREEN_FANOUT copies — the split divides the budget by
 * the CHILDREN in the tree, not by N−1, so the ceiling no longer drops
 * with room size.
 */
export const SCREEN_UPLINK_BUDGET = 10_000_000;

export function presetById(id: ScreenQualityId): ScreenQualityPreset {
  return SCREEN_QUALITY_PRESETS.find((preset) => preset.id === id) ?? SCREEN_QUALITY_PRESETS[1]!;
}

/** Per-peer cap: the lower of the preset's cap and the uplink share. */
export function bitrateFor(preset: ScreenQualityPreset, viewerCount: number): number {
  return Math.min(preset.maxBitrate, Math.floor(SCREEN_UPLINK_BUDGET / Math.max(1, viewerCount)));
}

export function screenConstraints(preset: ScreenQualityPreset): MediaTrackConstraints {
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
  };
}

/**
 * Codec order for hops that ENCODE the screen (the sharer and the tree's
 * relays, which re-encode for their children).
 *
 * AV1's screen-content tools give sharper text at the same bitrate, but a
 * software AV1 encoder is expensive — and a relay pays that price for its
 * whole subtree. So AV1 is only put first when MediaCapabilities reports
 * a power-efficient (hardware) encoder at the preset's load; otherwise
 * `null` keeps the browser's default order (VP9/H.264). The receive side
 * follows the offer, so each hop negotiates independently and a mixed
 * room just works.
 */
export async function screenCodecPreferences(
  preset: ScreenQualityPreset,
): Promise<RTCRtpCodec[] | null> {
  const capabilities = RTCRtpSender.getCapabilities?.('video');
  const av1 = capabilities?.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/av1') ?? [];
  if (!capabilities || av1.length === 0) {
    return null;
  }
  try {
    const info = await navigator.mediaCapabilities.encodingInfo({
      type: 'webrtc',
      video: {
        contentType: 'video/av1',
        width: preset.width,
        height: preset.height,
        framerate: preset.frameRate,
        bitrate: preset.maxBitrate,
      },
    } as MediaEncodingConfiguration);
    if (!info.supported || !info.powerEfficient) {
      return null;
    }
  } catch {
    return null;
  }
  return [...av1, ...capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/av1')];
}
