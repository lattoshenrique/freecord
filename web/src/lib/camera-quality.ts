/**
 * Adaptive camera send cap — the screen's split (screen-quality.ts), with
 * the roles reversed. The screen splits its budget across the tree's
 * children; the camera has no tree, so its budget splits across every
 * connected peer (N−1) and shrinks as the room grows. Audio and the
 * screen keep their own budgets untouched: the camera is the variable
 * that adapts to room size.
 */

import type { TrackEncoding } from './mesh';

/** Assumed upload budget for the camera (bps), across all its copies. */
export const CAMERA_UPLINK_BUDGET = 4_000_000;

/** Per-peer ceiling: more than this buys nothing at camera resolutions. */
const CAMERA_MAX_BITRATE = 2_500_000;

/**
 * Floor of the split: below this a face stops being a face. With 12
 * seats the split never reaches it (4 Mbps / 11 ≈ 360 kbps) — it guards
 * against a future cap raise, not today's arithmetic.
 */
const CAMERA_MIN_BITRATE = 150_000;

const CAMERA_MAX_FRAMERATE = 30;

/** Per-peer camera cap: the budget share, clamped to [floor, per-camera max]. */
export function cameraBitrateFor(peerCount: number): number {
  const share = Math.floor(CAMERA_UPLINK_BUDGET / Math.max(1, peerCount));
  return Math.max(CAMERA_MIN_BITRATE, Math.min(CAMERA_MAX_BITRATE, share));
}

/**
 * The camera track's send cap for a room with `peerCount` connected
 * peers. 'balanced' degradation: a talking head tolerates losing a bit
 * of both axes better than collapsing either one. Priority 'low' — under
 * congestion the camera is sacrificed first (see mesh.ts).
 */
export function cameraEncoding(peerCount: number): TrackEncoding {
  return {
    maxBitrate: cameraBitrateFor(peerCount),
    maxFramerate: CAMERA_MAX_FRAMERATE,
    degradationPreference: 'balanced',
    priority: 'low',
  };
}
