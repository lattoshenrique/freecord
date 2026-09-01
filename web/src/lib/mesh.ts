/**
 * Mesh P2P: uma RTCPeerConnection por par, com o padrão de negociação
 * perfeita (MDN) para resolver glare em renegociações (ex.: ligar câmera
 * ou compartilhar tela no meio da chamada).
 *
 * A mídia flui direto entre navegadores; o servidor só transporta os
 * envelopes de sinalização (SDP/ICE) — solução 100% própria.
 */

const ICE_SERVERS: RTCIceServer[] = [
  // STUN público para descoberta de endereço. TURN próprio (coturn) entra
  // como hardening — ver docs/architecture.md.
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

interface PeerState {
  pc: RTCPeerConnection;
  /** No glare, o polite cede (rollback); o impolite ignora a oferta rival. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /**
   * Sinais do mesmo par são aplicados um por vez, na ordem de chegada.
   * Sem isso, um offer examina o signalingState antes do answer anterior
   * terminar de aplicar e é descartado como colisão falsa.
   */
  queue: Promise<void>;
  streams: Map<string, MediaStream>;
}

interface SignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export class Mesh {
  private readonly selfId: string;
  private readonly sendSignal: (to: string, data: SignalPayload) => void;
  private readonly peers = new Map<string, PeerState>();
  private readonly localTracks = new Map<MediaStreamTrack, MediaStream>();
  private readonly listeners = new Set<() => void>();
  private closed = false;

  constructor(selfId: string, sendSignal: (to: string, data: SignalPayload) => void) {
    this.selfId = selfId;
    this.sendSignal = sendSignal;
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

  /** Streams remotos de um par, na ordem de chegada. */
  getPeerStreams(peerId: string): MediaStream[] {
    return [...(this.peers.get(peerId)?.streams.values() ?? [])];
  }

  addLocalTrack(track: MediaStreamTrack, stream: MediaStream): void {
    this.localTracks.set(track, stream);
    for (const state of this.peers.values()) {
      state.pc.addTrack(track, stream);
    }
  }

  removeLocalTrack(track: MediaStreamTrack): void {
    this.localTracks.delete(track);
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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const state: PeerState = {
      pc,
      polite: this.selfId < peerId,
      makingOffer: false,
      ignoreOffer: false,
      queue: Promise.resolve(),
      streams: new Map(),
    };
    this.peers.set(peerId, state);

    for (const [track, stream] of this.localTracks) {
      pc.addTrack(track, stream);
    }
    // Sem mídia local (permissão negada), ainda precisamos negociar para
    // RECEBER os outros: transceivers recvonly disparam a oferta.
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
        // conexão fechada no meio da negociação
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
      // sinalização de par que já caiu: estado local é limpo no peer-left
    }
  }

  removePeer(peerId: string): void {
    const state = this.peers.get(peerId);
    if (state) {
      state.pc.close();
      this.peers.delete(peerId);
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
