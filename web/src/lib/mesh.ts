/**
 * P2P mesh: one RTCPeerConnection per peer, using the perfect negotiation
 * pattern (MDN) to resolve glare on renegotiations (e.g. turning on the
 * camera or starting a screen share mid-call).
 *
 * Media flows directly between browsers; the server only transports the
 * signaling envelopes (SDP/ICE) — a fully self-owned solution.
 */

/**
 * Fallback when the edge hands out no ICE servers (TURN unconfigured):
 * public STUN for address discovery, as before TURN existed.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

interface PeerState {
  pc: RTCPeerConnection;
  /** On glare, the polite side yields (rollback); the impolite one ignores the rival offer. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /**
   * Signals from the same peer are applied one at a time, in arrival
   * order. Without this, an offer inspects signalingState before the
   * previous answer finishes applying and gets dropped as a false
   * collision.
   */
  queue: Promise<void>;
  streams: Map<string, MediaStream>;
  /**
   * Since when signalingState has been off 'stable' — the clock behind
   * the negotiation watchdog. A lost offer (signaling down at the wrong
   * moment) leaves a connection in have-local-offer forever: the
   * browser fires negotiationneeded only from 'stable', and an impolite
   * side ignores every rival offer meanwhile. Null while stable.
   */
  unstableSince: number | null;
  /** Since when ICE has been 'disconnected' or 'failed'; null while up. */
  iceDownSince: number | null;
  /** Restarts spent on the current ICE-down episode; spaces the next one. */
  iceRestarts: number;
  /** When the last ICE restart of the episode fired (the retry clock). */
  lastIceRestartAt: number | null;
  /** The `files` data channel (see file-transfer.ts); closed with the peer. */
  files: RTCDataChannel;
}

interface SignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * A track's send cap — applied identically across all peers. Only the
 * bitrate is mandatory: an audio cap (mic profile) has no framerate or
 * degradation axis, and an absent field leaves the browser's value alone.
 */
export interface TrackEncoding {
  maxBitrate: number;
  maxFramerate?: number;
  degradationPreference?: RTCDegradationPreference;
  /**
   * >1 shrinks the encode before it leaves. Used when a sender's encoder
   * output is discarded (encoded-relay passthrough): the encoder keeps
   * running as a cadence donor, so its cost is crushed instead of paid.
   */
  scaleResolutionDownBy?: number;
  /**
   * Where congestion cuts first. Audio always wins (see addSender): the
   * camera rides 'low' and the screen 'medium', so a squeezed uplink
   * sacrifices camera before screen and never the voice.
   */
  priority?: RTCPriorityType;
}

/** `networkPriority` (DSCP marking in Chromium) is not in every lib.dom yet. */
interface PriorityEncoding extends RTCRtpEncodingParameters {
  networkPriority?: RTCPriorityType;
}

interface LocalTrack {
  stream: MediaStream;
  encoding: TrackEncoding | null;
  /**
   * Who this track is sent to; null = every peer (camera/voice). The
   * screen uses explicit targets: in the forwarding tree each peer sends
   * only to its own children, never to the whole room.
   */
  targets: Set<string> | null;
  /**
   * Codec order offered for this track (e.g. AV1 first for a screen when
   * hardware-encodable); null = the browser's default. Applied per
   * transceiver, so each hop negotiates independently.
   */
  codecs: RTCRtpCodec[] | null;
}

/** Chrome/Edge: requests the smallest playout buffer possible (not in lib.dom). */
interface LowLatencyReceiver extends RTCRtpReceiver {
  playoutDelayHint?: number;
}

/**
 * How long ICE may sit in 'disconnected' before a restart. Short blips
 * self-heal well inside this; what the grace filters out is restarting a
 * path that was about to come back on its own. A restart that changes
 * nothing is followed by another, the wait doubling up to
 * ICE_RESTART_MAX_BACKOFF (7 s, 14 s, 28 s, 28 s...): one lost restart
 * offer used to be the end of the road.
 */
const ICE_DISCONNECTED_GRACE_MS = 7_000;
const ICE_RESTART_MAX_BACKOFF = 2;

/**
 * How long a negotiation may stay open before it is presumed lost and
 * rolled back. Longer than the other side's whole resume run in the
 * common case (its reconnect backoff reaches ~7 s by the fourth try), so
 * a blip resolves through the held signals first and the rollback only
 * fires for an offer that is genuinely not coming back.
 */
const NEGOTIATION_STALL_MS = 12_000;
/**
 * On a resumed signaling session (reconcile) an open negotiation is
 * presumed lost after this much instead: long enough to spare one that
 * started on the socket that just came back, short enough to matter.
 */
const RECONCILE_STALL_MS = 1_000;

/** Cadence of the health pass over every peer. */
const WATCHDOG_INTERVAL_MS = 2_000;

/**
 * The file-transfer channel is pre-negotiated on a fixed SCTP stream: both
 * sides create it, so it exists the moment the connection does and neither
 * has to wait for `ondatachannel`. Creating it also bootstraps the SCTP
 * transport in the first offer, which the media-only mesh never needed.
 */
const FILES_CHANNEL_LABEL = 'files';
const FILES_CHANNEL_ID = 0;

export class Mesh {
  private readonly selfId: string;
  private readonly sendSignal: (to: string, data: SignalPayload) => void;
  private readonly iceServers: RTCIceServer[];
  private readonly peers = new Map<string, PeerState>();
  private readonly localTracks = new Map<MediaStreamTrack, LocalTrack>();
  /**
   * Per-peer exceptions to a track's encoding — the screen relay crushes
   * only the children riding passthrough while the others keep the full
   * re-encode cap. Consulted before the track-level encoding.
   */
  private readonly encodingOverrides = new Map<MediaStreamTrack, Map<string, TrackEncoding>>();
  private readonly listeners = new Set<() => void>();
  /**
   * Rewrites every REMOTE description's SDP before it is applied (offers
   * and answers alike) — the seam for wire-invisible upgrades such as
   * lifting the Opus receive ceiling. Never sees rollbacks: those carry
   * no SDP and must reach the negotiation state machine untouched.
   */
  private readonly remoteSdpTransform: ((sdp: string) => string) | null;
  private closed = false;
  /** The health pass (see heal); armed by the first peer, stopped by close. */
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /**
   * Hands each peer's `files` data channel to whoever moves files over it
   * (file-transfer.ts). Set right after construction, before the first
   * `ensurePeer`; peers created earlier are not replayed.
   */
  onDataChannel: ((peerId: string, channel: RTCDataChannel) => void) | null = null;

  constructor(
    selfId: string,
    sendSignal: (to: string, data: SignalPayload) => void,
    iceServers?: RTCIceServer[],
    remoteSdpTransform?: (sdp: string) => string,
  ) {
    this.selfId = selfId;
    this.sendSignal = sendSignal;
    this.iceServers = iceServers && iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
    this.remoteSdpTransform = remoteSdpTransform ?? null;
  }

  /** A throwing transform must cost a missed upgrade, not the negotiation. */
  private transformRemote(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
    if (!this.remoteSdpTransform || description.type === 'rollback' || !description.sdp) {
      return description;
    }
    try {
      return { ...description, sdp: this.remoteSdpTransform(description.sdp) };
    } catch {
      return description;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** A peer's remote streams, in arrival order. */
  getPeerStreams(peerId: string): MediaStream[] {
    return [...(this.peers.get(peerId)?.streams.values() ?? [])];
  }

  peerIds(): string[] {
    return [...this.peers.keys()];
  }

  getPeerConnection(peerId: string): RTCPeerConnection | null {
    return this.peers.get(peerId)?.pc ?? null;
  }

  addLocalTrack(
    track: MediaStreamTrack,
    stream: MediaStream,
    encoding?: TrackEncoding,
    targets?: string[] | null,
    codecs?: RTCRtpCodec[] | null,
  ): void {
    const targetSet = targets === undefined || targets === null ? null : new Set(targets);
    const local: LocalTrack = {
      stream,
      encoding: encoding ?? null,
      targets: targetSet,
      codecs: codecs ?? null,
    };
    this.localTracks.set(track, local);
    for (const [peerId, state] of this.peers) {
      if (targetSet === null || targetSet.has(peerId)) {
        this.addSender(peerId, state.pc, track, local);
      }
    }
  }

  /**
   * Creates the sender and, in the same tick, its codec preference — it
   * must land on the transceiver before `negotiationneeded` fires, or the
   * first offer goes out with the default order.
   */
  private addSender(
    peerId: string,
    pc: RTCPeerConnection,
    track: MediaStreamTrack,
    local: LocalTrack,
  ): void {
    const sender = pc.addTrack(track, local.stream);
    if (local.codecs) {
      const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
      try {
        transceiver?.setCodecPreferences(local.codecs);
      } catch {
        // codec list rejected by this browser: negotiation falls back
      }
    }
    if (track.kind === 'audio') {
      void this.applyAudioPriority(sender);
    }
    void this.applyEncoding(peerId, pc, track);
  }

  /**
   * Audio always wins: the mic (and the screen's system audio) rides
   * priority 'high', so congestion sacrifices the camera ('low') and the
   * screen ('medium') before a word is lost. Best effort, like
   * applyEncoding — a browser that rejects pre-negotiation parameters
   * just keeps its default.
   */
  private async applyAudioPriority(sender: RTCRtpSender): Promise<void> {
    const parameters = sender.getParameters();
    if (parameters.encodings.length === 0) {
      parameters.encodings = [{}];
    }
    for (const layer of parameters.encodings as PriorityEncoding[]) {
      layer.priority = 'high';
      layer.networkPriority = 'high';
    }
    try {
      await sender.setParameters(parameters);
    } catch {
      // parameters rejected: the default priority stands
    }
  }

  /**
   * Reconciles who a track is sent to: adds a sender for new targets and
   * removes it from dropped ones — each change renegotiates only that peer.
   */
  setTrackTargets(track: MediaStreamTrack, targets: string[]): void {
    const local = this.localTracks.get(track);
    if (!local) {
      return;
    }
    const targetSet = new Set(targets);
    local.targets = targetSet;
    for (const [peerId, state] of this.peers) {
      const sender = state.pc.getSenders().find((s) => s.track === track);
      if (targetSet.has(peerId) && !sender) {
        this.addSender(peerId, state.pc, track, local);
      } else if (!targetSet.has(peerId) && sender) {
        state.pc.removeTrack(sender);
        this.encodingOverrides.get(track)?.delete(peerId);
      }
    }
  }

  /**
   * Re-applies a track's send cap across all peers.
   *
   * Called when the chosen quality changes or when someone joins/leaves —
   * the uplink split depends on how many are receiving.
   */
  setTrackEncoding(track: MediaStreamTrack, encoding: TrackEncoding): void {
    const local = this.localTracks.get(track);
    if (!local) {
      return;
    }
    local.encoding = encoding;
    for (const [peerId, state] of this.peers) {
      void this.applyEncoding(peerId, state.pc, track);
    }
  }

  /**
   * Replaces (or clears, with null) one peer's exception to the track's
   * encoding. Survives later setTrackEncoding calls: the base cap can move
   * with quality/route changes while a crushed passthrough child stays
   * crushed.
   */
  setPeerEncodingOverride(
    peerId: string,
    track: MediaStreamTrack,
    encoding: TrackEncoding | null,
  ): void {
    let overrides = this.encodingOverrides.get(track);
    if (encoding === null) {
      overrides?.delete(peerId);
      if (overrides?.size === 0) {
        this.encodingOverrides.delete(track);
      }
    } else {
      if (!overrides) {
        overrides = new Map();
        this.encodingOverrides.set(track, overrides);
      }
      overrides.set(peerId, encoding);
    }
    const state = this.peers.get(peerId);
    if (state) {
      void this.applyEncoding(peerId, state.pc, track);
    }
  }

  private async applyEncoding(
    peerId: string,
    pc: RTCPeerConnection,
    track: MediaStreamTrack,
  ): Promise<void> {
    const encoding =
      this.encodingOverrides.get(track)?.get(peerId) ?? this.localTracks.get(track)?.encoding;
    const sender = pc.getSenders().find((s) => s.track === track);
    if (!encoding || !sender) {
      return;
    }
    const parameters = sender.getParameters();
    // A freshly created sender may come without encodings until the first negotiation.
    if (parameters.encodings.length === 0) {
      parameters.encodings = [{}];
    }
    for (const layer of parameters.encodings as PriorityEncoding[]) {
      layer.maxBitrate = encoding.maxBitrate;
      if (encoding.maxFramerate !== undefined) {
        layer.maxFramerate = encoding.maxFramerate;
      }
      if (track.kind === 'video') {
        // Video-only knob: `?? 1` clears a stale crush when an override lifts.
        layer.scaleResolutionDownBy = encoding.scaleResolutionDownBy ?? 1;
      }
      if (encoding.priority) {
        layer.priority = encoding.priority;
        layer.networkPriority = encoding.priority;
      }
    }
    if (encoding.degradationPreference !== undefined) {
      parameters.degradationPreference = encoding.degradationPreference;
    }
    try {
      await sender.setParameters(parameters);
    } catch {
      // parameters rejected (peer going down): the next application retries
    }
  }

  /**
   * Live source swap (picking another microphone mid-call): the senders keep
   * their negotiated m-line, so no renegotiation and no glare — only the
   * bytes change. Bookkeeping moves to the new track so per-track encodings
   * and per-peer overrides survive the swap.
   */
  async replaceLocalTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): Promise<void> {
    const local = this.localTracks.get(oldTrack);
    if (!local) {
      return;
    }
    this.localTracks.delete(oldTrack);
    this.localTracks.set(newTrack, local);
    const overrides = this.encodingOverrides.get(oldTrack);
    if (overrides) {
      this.encodingOverrides.delete(oldTrack);
      this.encodingOverrides.set(newTrack, overrides);
    }
    await Promise.all(
      [...this.peers.values()].map(async (state) => {
        const sender = state.pc.getSenders().find((s) => s.track === oldTrack);
        if (!sender) {
          return;
        }
        try {
          await sender.replaceTrack(newTrack);
        } catch {
          // peer tearing down: its next negotiation re-adds the track
        }
      }),
    );
  }

  removeLocalTrack(track: MediaStreamTrack): void {
    this.localTracks.delete(track);
    this.encodingOverrides.delete(track);
    for (const state of this.peers.values()) {
      const sender = state.pc.getSenders().find((s) => s.track === track);
      if (sender) {
        state.pc.removeTrack(sender);
      }
    }
  }

  ensurePeer(peerId: string): void {
    if (this.closed || this.peers.has(peerId)) {
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const files = pc.createDataChannel(FILES_CHANNEL_LABEL, {
      negotiated: true,
      id: FILES_CHANNEL_ID,
      ordered: true,
    });
    const state: PeerState = {
      pc,
      polite: this.selfId < peerId,
      makingOffer: false,
      ignoreOffer: false,
      queue: Promise.resolve(),
      streams: new Map(),
      unstableSince: null,
      iceDownSince: null,
      iceRestarts: 0,
      lastIceRestartAt: null,
      files,
    };
    this.peers.set(peerId, state);
    this.onDataChannel?.(peerId, files);
    this.watchdog ??= setInterval(() => this.healAll(false), WATCHDOG_INTERVAL_MS);

    for (const [track, local] of this.localTracks) {
      if (local.targets === null || local.targets.has(peerId)) {
        this.addSender(peerId, pc, track, local);
      }
    }
    // With no local media (permission denied), we still need to negotiate
    // in order to RECEIVE the others: recvonly transceivers trigger the offer.
    if (pc.getSenders().length === 0) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    pc.onnegotiationneeded = async () => {
      try {
        state.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          this.sendSignal(peerId, { description: pc.localDescription.toJSON() });
        }
      } catch {
        // connection closed mid-negotiation
      } finally {
        state.makingOffer = false;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, { candidate: event.candidate.toJSON() });
      }
    };

    pc.onsignalingstatechange = () => {
      state.unstableSince =
        pc.signalingState === 'stable' ? null : (state.unstableSince ?? Date.now());
    };

    pc.oniceconnectionstatechange = () => {
      // 'failed' restarts at once. 'disconnected' gets a grace first: it
      // often self-heals in seconds (wi-fi hiccup), but Chrome can also sit
      // there indefinitely after a NAT rebinding — the long-watch freeze —
      // so a lingering 'disconnected' earns the same restart, from the
      // health pass (heal), which also retries a restart that did not
      // take. Every other state ends the episode.
      const ice = pc.iceConnectionState;
      if (ice === 'failed') {
        state.iceDownSince ??= Date.now();
        this.restartPeerIce(state);
      } else if (ice === 'disconnected') {
        state.iceDownSince ??= Date.now();
      } else {
        state.iceDownSince = null;
        state.iceRestarts = 0;
        state.lastIceRestartAt = null;
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) {
        return;
      }
      if (event.track.kind === 'video') {
        // Without this the browser accumulates hundreds of ms of buffer: on
        // a shared screen that is the difference between following along
        // and watching the past.
        (event.receiver as LowLatencyReceiver).playoutDelayHint = 0;
      }
      state.streams.set(stream.id, stream);
      stream.onremovetrack = () => {
        if (stream.getTracks().length === 0) {
          state.streams.delete(stream.id);
        }
        this.notify();
      };
      event.track.onunmute = () => this.notify();
      this.notify();
    };
  }

  handleSignal(peerId: string, data: unknown): void {
    this.ensurePeer(peerId);
    const state = this.peers.get(peerId);
    if (!state) {
      return;
    }
    state.queue = state.queue.then(() => this.applySignal(state, peerId, data));
  }

  private async applySignal(state: PeerState, peerId: string, data: unknown): Promise<void> {
    const { pc } = state;
    const payload = (typeof data === 'object' && data !== null ? data : {}) as SignalPayload;

    try {
      if (payload.description) {
        const description = this.transformRemote(payload.description);
        const offerCollision =
          description.type === 'offer' && (state.makingOffer || pc.signalingState !== 'stable');
        state.ignoreOffer = !state.polite && offerCollision;
        if (state.ignoreOffer) {
          return;
        }
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription) {
            this.sendSignal(peerId, { description: pc.localDescription.toJSON() });
          }
        }
      } else if (payload.candidate) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (error) {
          if (!state.ignoreOffer) {
            throw error;
          }
        }
      }
    } catch {
      // signaling from a peer that already dropped: local state is cleaned on peer-left
    }
  }

  /** Guarded: restartIce is missing from older Safari's RTCPeerConnection. */
  private restartPeerIce(state: PeerState): void {
    state.iceRestarts += 1;
    state.lastIceRestartAt = Date.now();
    if (typeof state.pc.restartIce === 'function') {
      state.pc.restartIce();
    }
  }

  /**
   * Health pass over one peer. Two things a connection cannot fix by
   * itself once signaling has failed it:
   *
   * 1. A negotiation left open past NEGOTIATION_STALL_MS: the offer or
   *    the answer was lost in transit. Rolling back to 'stable' and
   *    restarting ICE re-offers through the regular negotiationneeded
   *    path — with the current tracks, and with glare handled as always.
   * 2. ICE down past its grace, or a restart that changed nothing: another
   *    restart, spaced by a doubling backoff so a dead peer is not
   *    hammered while its seat runs out.
   *
   * `force` shortens the clocks — a resumed signaling session calls it on
   * every peer at once, because whatever broke during the outage has
   * already waited long enough.
   */
  private heal(state: PeerState, now: number, force: boolean): void {
    const { pc } = state;
    if (pc.signalingState === 'closed') {
      return;
    }
    if (pc.signalingState !== 'stable' && !state.makingOffer) {
      const since = state.unstableSince ?? now;
      if (now - since >= (force ? RECONCILE_STALL_MS : NEGOTIATION_STALL_MS)) {
        // The clock restarts so a second rollback waits a full period.
        state.unstableSince = now;
        state.queue = state.queue.then(() => this.renegotiate(state));
        return;
      }
    }
    const ice = pc.iceConnectionState;
    if (ice !== 'disconnected' && ice !== 'failed') {
      return;
    }
    const since = state.iceDownSince ?? now;
    state.iceDownSince = since;
    const wait =
      ICE_DISCONNECTED_GRACE_MS * 2 ** Math.min(state.iceRestarts, ICE_RESTART_MAX_BACKOFF);
    if (force || now - (state.lastIceRestartAt ?? since) >= wait) {
      this.restartPeerIce(state);
    }
  }

  private healAll(force: boolean): void {
    if (this.closed) {
      return;
    }
    const now = Date.now();
    for (const state of this.peers.values()) {
      this.heal(state, now, force);
    }
  }

  /**
   * Abandons an open negotiation and starts a fresh one. Runs on the
   * peer's signal queue, so it never interleaves with an answer that is
   * being applied. A browser without rollback (old Safari) skips to the
   * restart, which at least reoffers once the state clears.
   */
  private async renegotiate(state: PeerState): Promise<void> {
    const { pc } = state;
    if (pc.signalingState === 'closed' || this.closed) {
      return;
    }
    if (pc.signalingState !== 'stable') {
      try {
        await pc.setLocalDescription({ type: 'rollback' });
      } catch {
        // rollback unsupported or already stable: fall through to the restart
      }
    }
    this.restartPeerIce(state);
  }

  /**
   * The signaling session came back on the same seat: whatever a peer
   * was waiting on while it was down is presumed lost. Every open
   * negotiation is rolled back and reoffered, every downed ICE path
   * restarted — now, not on the watchdog's clock. A healthy peer is left
   * alone.
   */
  reconcile(): void {
    this.healAll(true);
  }

  /**
   * Renegotiates the path to one peer, keeping tracks and senders — the
   * escalation for a transport that claims to be connected while nothing
   * flows (the viewer's stall watch, stall-watch.ts). The new offer rides
   * the regular negotiationneeded path, so glare resolves as always.
   */
  restartIce(peerId: string): void {
    const state = this.peers.get(peerId);
    if (!state || this.closed) {
      return;
    }
    this.restartPeerIce(state);
  }

  removePeer(peerId: string): void {
    const state = this.peers.get(peerId);
    if (state) {
      state.files.close();
      state.pc.close();
      this.peers.delete(peerId);
      for (const overrides of this.encodingOverrides.values()) {
        overrides.delete(peerId);
      }
      this.notify();
    }
  }

  close(): void {
    this.closed = true;
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    for (const state of this.peers.values()) {
      state.files.close();
      state.pc.close();
    }
    this.peers.clear();
    this.notify();
  }
}
