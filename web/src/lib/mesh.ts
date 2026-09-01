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
}

interface SignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/** A track's send cap — applied identically across all peers. */
export interface TrackEncoding {
  maxBitrate: number;
  maxFramerate: number;
  degradationPreference: RTCDegradationPreference;
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
  private closed = false;

  constructor(
    selfId: string,
    sendSignal: (to: string, data: SignalPayload) => void,
    iceServers?: RTCIceServer[],
  ) {
    this.selfId = selfId;
    this.sendSignal = sendSignal;
    this.iceServers = iceServers && iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
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
      layer.maxFramerate = encoding.maxFramerate;
      layer.scaleResolutionDownBy = encoding.scaleResolutionDownBy ?? 1;
      if (encoding.priority) {
        layer.priority = encoding.priority;
        layer.networkPriority = encoding.priority;
      }
    }
    parameters.degradationPreference = encoding.degradationPreference;
    try {
      await sender.setParameters(parameters);
    } catch {
      // parameters rejected (peer going down): the next application retries
    }
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
    const state: PeerState = {
      pc,
      polite: this.selfId < peerId,
      makingOffer: false,
      ignoreOffer: false,
      queue: Promise.resolve(),
      streams: new Map(),
    };
    this.peers.set(peerId, state);

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

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
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
        const description = payload.description;
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

  removePeer(peerId: string): void {
    const state = this.peers.get(peerId);
    if (state) {
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
    for (const state of this.peers.values()) {
      state.pc.close();
    }
    this.peers.clear();
    this.notify();
  }
}
