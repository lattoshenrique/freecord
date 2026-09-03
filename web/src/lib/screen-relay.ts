/**
 * Encoded passthrough at the screen tree's relay position.
 *
 * A relay that decodes and re-encodes pays ~50–150 ms and one compression
 * generation per hop. Where the browser supports encoded transforms
 * (@freecord/encoded-relay), this controller forwards the received encoded
 * frames to each child instead — per child, and only after proving it safe:
 * the child starts on the ordinary re-encode path and is promoted when its
 * negotiated codec matches the upstream's active one and upstream frames
 * are demonstrably flowing. Any trouble (worker stall, a child's stall note
 * through the signal channel, construction failures) demotes that child
 * back to re-encode, sticky for the rest of the share — passthrough must
 * never leave anyone worse off than today's tree.
 */

import {
  RelayPipe,
  codecsMatch,
  encodedRelaySupported,
  preferredCodecOrder,
  type CodecDescriptor,
} from '@freecord/encoded-relay';
import type { Mesh, TrackEncoding } from './mesh';

export type ScreenRelayMode = 'passthrough' | 'reencode' | 'mixed';

/**
 * Notes a viewer sends back UP its branch, piggybacked on the opaque
 * `signal` envelope the server forwards without inspection (`data.relay`).
 * Versioned and ignored-if-unknown: an old client's mesh sees a payload
 * with neither description nor candidate and no-ops, which for both kinds
 * is exactly today's behaviour.
 *
 *   `stall`   — frames stopped arriving: demote this child off encoded
 *               passthrough, because the parent may be forwarding bytes it
 *               cannot see are dead.
 *   `missing` — nothing has EVER arrived for that tree: the parent
 *               reconciles its senders, which re-adds one that was
 *               dropped. It names the tree, because a peer may be a leaf
 *               in one and a relay in another and the answer differs.
 */
export type RelayNote = { v: 1; kind: 'stall' } | { v: 1; kind: 'missing'; of: string };

export function makeRelayNote(): { relay: RelayNote } {
  return { relay: { v: 1, kind: 'stall' } };
}

export function makeMissingNote(of: string): { relay: RelayNote } {
  return { relay: { v: 1, kind: 'missing', of } };
}

export function extractRelayNote(data: unknown): RelayNote | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const note = (data as { relay?: unknown }).relay;
  if (typeof note !== 'object' || note === null) {
    return null;
  }
  const { v, kind, of } = note as { v?: unknown; kind?: unknown; of?: unknown };
  if (v !== 1) {
    return null;
  }
  if (kind === 'stall') {
    return { v: 1, kind: 'stall' };
  }
  return kind === 'missing' && typeof of === 'string' ? { v: 1, kind: 'missing', of } : null;
}

/**
 * The cadence donor's cost, once its output is discarded: quarter
 * resolution and a token bitrate. maxFramerate stays high on purpose — the
 * donor's cadence is the substitution clock, and throttling it below the
 * upstream fps would throttle the child.
 */
const DONOR_ENCODING: TrackEncoding = {
  maxBitrate: 100_000,
  maxFramerate: 60,
  degradationPreference: 'maintain-framerate',
  scaleResolutionDownBy: 4,
};

const VERIFY_INTERVAL_MS = 2_000;
/** Codec verification gives up here; the child just stays on re-encode. */
const VERIFY_TIMEOUT_MS = 20_000;

type ChildMode = 'pending' | 'passthrough' | 'reencode';

interface ChildState {
  sender: RTCRtpSender;
  mode: ChildMode;
  since: number;
}

/** The active codec of a live RTP stream — negotiation says what MAY run. */
function activeCodec(
  report: RTCStatsReport,
  type: 'inbound-rtp' | 'outbound-rtp',
): CodecDescriptor | null {
  for (const stat of report.values() as Iterable<Record<string, unknown>>) {
    if (stat.type !== type || stat.kind !== 'video' || typeof stat.codecId !== 'string') {
      continue;
    }
    const codec = report.get(stat.codecId) as Record<string, unknown> | undefined;
    if (codec && typeof codec.mimeType === 'string') {
      return {
        mimeType: codec.mimeType,
        clockRate: typeof codec.clockRate === 'number' ? codec.clockRate : undefined,
        sdpFmtpLine: typeof codec.sdpFmtpLine === 'string' ? codec.sdpFmtpLine : undefined,
      };
    }
  }
  return null;
}

export class ScreenRelayController {
  private readonly mesh: Mesh;
  private pipe: RelayPipe | null = null;
  private upstream: { peerId: string; track: MediaStreamTrack } | null = null;
  private readonly children = new Map<string, ChildState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private verifying = false;
  private closed = false;

  constructor(mesh: Mesh) {
    this.mesh = mesh;
  }

  static supported(): boolean {
    return encodedRelaySupported();
  }

  private receiverFor(peerId: string, track: MediaStreamTrack): RTCRtpReceiver | null {
    return (
      this.mesh
        .getPeerConnection(peerId)
        ?.getReceivers()
        .find((receiver) => receiver.track === track) ?? null
    );
  }

  private senderFor(peerId: string, track: MediaStreamTrack): RTCRtpSender | null {
    return (
      this.mesh
        .getPeerConnection(peerId)
        ?.getSenders()
        .find((sender) => sender.track === track) ?? null
    );
  }

  /**
   * Codec order for the children: the upstream's negotiated codecs first,
   * so the child's answer can land on the exact codec whose bytes it will
   * receive. Must be handed to addLocalTrack in the SAME tick (mesh.ts
   * documents the negotiationneeded timing). Returns null — caller keeps
   * its default — when there is nothing to pin, or when the upstream leads
   * with AV1 and this machine has no hardware AV1 encoder: pinning would
   * also pin the RE-ENCODE fallback to a software AV1 encode, making
   * failure worse than today.
   */
  childCodecPreferences(
    parentId: string,
    track: MediaStreamTrack,
    hardwareAv1: boolean,
  ): RTCRtpCodec[] | null {
    if (this.closed || !encodedRelaySupported()) {
      return null;
    }
    const negotiated = this.receiverFor(parentId, track)?.getParameters().codecs ?? [];
    const capabilities = RTCRtpSender.getCapabilities?.('video')?.codecs ?? [];
    if (negotiated.length === 0 || capabilities.length === 0) {
      return null;
    }
    const lead = negotiated.find((codec) => !codec.mimeType.toLowerCase().startsWith('video/rtx'));
    if (!hardwareAv1 && lead?.mimeType.toLowerCase() === 'video/av1') {
      return null;
    }
    const ordered = preferredCodecOrder(negotiated, capabilities);
    return ordered === capabilities ? null : (ordered as RTCRtpCodec[]);
  }

  /**
   * Reconciles the pipe with the current tree role. Called after the mesh's
   * senders exist (addLocalTrack/setTrackTargets are synchronous), and again
   * on every mesh notification — missing pieces are picked up then.
   */
  sync(parentId: string, parentTrack: MediaStreamTrack, childIds: string[]): void {
    if (this.closed || !encodedRelaySupported()) {
      return;
    }
    if (
      this.upstream &&
      (this.upstream.peerId !== parentId || this.upstream.track !== parentTrack)
    ) {
      // The tree moved this relay under a new parent: every promotion was
      // proven against the old upstream, none of it transfers.
      this.teardownPipe();
    }
    if (!this.pipe) {
      const receiver = this.receiverFor(parentId, parentTrack);
      if (!receiver) {
        return;
      }
      const pipe = new RelayPipe();
      pipe.onstall = (sender) => this.demoteSender(sender);
      if (!pipe.attachUpstream(receiver)) {
        pipe.close();
        return;
      }
      this.pipe = pipe;
      this.upstream = { peerId: parentId, track: parentTrack };
    }
    for (const [childId, child] of this.children) {
      if (!childIds.includes(childId)) {
        this.pipe.removeDownstream(child.sender);
        this.mesh.setPeerEncodingOverride(childId, parentTrack, null);
        this.children.delete(childId);
      }
    }
    for (const childId of childIds) {
      if (this.children.has(childId)) {
        continue;
      }
      const sender = this.senderFor(childId, parentTrack);
      if (sender && this.pipe.addDownstream(sender) !== null) {
        this.children.set(childId, { sender, mode: 'pending', since: Date.now() });
      }
    }
    if (this.timer === null) {
      this.timer = setInterval(() => void this.verifyPending(), VERIFY_INTERVAL_MS);
    }
  }

  /**
   * Promotion gate, revisited every 2 s: a pending child goes passthrough
   * only when the upstream's ACTIVE codec (stats, not negotiation) matches
   * the child's active send codec, and the worker confirms upstream frames
   * are flowing. A mismatch or a 20 s silence parks it on re-encode.
   */
  private async verifyPending(): Promise<void> {
    if (this.closed || this.verifying || !this.pipe || !this.upstream) {
      return;
    }
    const pending = [...this.children.entries()].filter(([, child]) => child.mode === 'pending');
    if (pending.length === 0) {
      return;
    }
    this.verifying = true;
    try {
      const receiver = this.receiverFor(this.upstream.peerId, this.upstream.track);
      const upstreamCodec = receiver ? activeCodec(await receiver.getStats(), 'inbound-rtp') : null;
      for (const [childId, child] of pending) {
        if (this.closed || child.mode !== 'pending') {
          continue;
        }
        if (Date.now() - child.since > VERIFY_TIMEOUT_MS) {
          child.mode = 'reencode';
          continue;
        }
        if (!upstreamCodec) {
          continue;
        }
        let childCodec: CodecDescriptor | null = null;
        try {
          childCodec = activeCodec(await child.sender.getStats(), 'outbound-rtp');
        } catch {
          continue;
        }
        if (!childCodec) {
          continue;
        }
        if (!codecsMatch(upstreamCodec, childCodec)) {
          child.mode = 'reencode';
          continue;
        }
        if (!this.pipe || !this.pipe.upstreamFlowing) {
          continue;
        }
        child.mode = 'passthrough';
        this.pipe.setDownstreamMode(child.sender, 'substitute');
        this.mesh.setPeerEncodingOverride(childId, this.upstream.track, DONOR_ENCODING);
        this.pipe.requestKeyFrame();
      }
    } finally {
      this.verifying = false;
    }
  }

  /** A viewer's stall note: its video died while we forwarded blind. */
  handleStallNote(fromId: string): void {
    const child = this.children.get(fromId);
    if (child && child.mode === 'passthrough') {
      this.demote(fromId, child);
    }
  }

  private demoteSender(sender: RTCRtpSender): void {
    for (const [childId, child] of this.children) {
      if (child.sender === sender) {
        this.demote(childId, child);
        return;
      }
    }
  }

  /** Back to re-encode, sticky for this share: recovery beats optimism. */
  private demote(childId: string, child: ChildState): void {
    child.mode = 'reencode';
    this.pipe?.setDownstreamMode(child.sender, 'identity');
    if (this.upstream) {
      this.mesh.setPeerEncodingOverride(childId, this.upstream.track, null);
    }
  }

  /** Which forwarding path is live, for the screen telemetry. */
  modeSummary(): ScreenRelayMode | null {
    if (this.children.size === 0) {
      return null;
    }
    let passthrough = 0;
    for (const child of this.children.values()) {
      if (child.mode === 'passthrough') {
        passthrough += 1;
      }
    }
    if (passthrough === 0) {
      return 'reencode';
    }
    return passthrough === this.children.size ? 'passthrough' : 'mixed';
  }

  private teardownPipe(): void {
    for (const [childId] of this.children) {
      if (this.upstream) {
        this.mesh.setPeerEncodingOverride(childId, this.upstream.track, null);
      }
    }
    this.children.clear();
    this.pipe?.close();
    this.pipe = null;
    this.upstream = null;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.teardownPipe();
  }
}
