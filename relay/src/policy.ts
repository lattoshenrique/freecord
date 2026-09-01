/**
 * What to do with one local-encoder frame while substituting.
 *
 * In passthrough mode the local encoder is only a cadence donor: each frame
 * it produces is an opportunity to emit one queued upstream frame in its
 * place. The catch is that a frame's key/delta TYPE cannot be rewritten by
 * the RTCEncodedVideoFrame constructor — it comes from the donor frame — so
 * the donor's type must match the upstream frame it carries:
 *
 * - upstream key wants a donor key: ask the local encoder for one and wait
 *   (`need-local-key`);
 * - a spontaneous donor key with upstream deltas queued means the child
 *   asked for a keyframe (PLI reaches the donor encoder, not the upstream)
 *   — serve it from upstream instead: flush and refresh (`refresh-upstream`);
 * - an empty queue starves the cadence: drop the donor frame, and if it was
 *   a key, forward the refresh intent upstream.
 *
 * `refresh-upstream` is also what chains keyframe requests through nested
 * relays: each hop's donor keyframe turns into an RTCP request to its own
 * parent, all the way to the sharer.
 */

export type FrameType = 'key' | 'delta';

export type SubstitutionAction = 'emit' | 'drop' | 'need-local-key' | 'refresh-upstream';

export function decideSubstitution(
  donorType: FrameType,
  head: { type: FrameType } | null,
): SubstitutionAction {
  if (!head) {
    return donorType === 'key' ? 'refresh-upstream' : 'drop';
  }
  if (head.type === 'key') {
    return donorType === 'key' ? 'emit' : 'need-local-key';
  }
  return donorType === 'key' ? 'refresh-upstream' : 'emit';
}
