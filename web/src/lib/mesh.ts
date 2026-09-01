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

/** Teto de envio de um track — aplicado igual em todos os pares. */
export interface TrackEncoding {
  maxBitrate: number;
  maxFramerate: number;
  degradationPreference: RTCDegradationPreference;
}

interface LocalTrack {
  stream: MediaStream;
  encoding: TrackEncoding | null;
  /**
   * Para quem este track é enviado; null = todos os pares (câmera/voz).
   * A tela usa alvos explícitos: na árvore de retransmissão cada par envia
   * só para os próprios filhos, não para a sala inteira.
   */
  targets: Set<string> | null;
}

/** Chrome/Edge: pede o menor buffer de reprodução possível (não está no lib.dom). */
interface LowLatencyReceiver extends RTCRtpReceiver {
  playoutDelayHint?: number;
}

export class Mesh {
  private readonly selfId: string;
  private readonly sendSignal: (to: string, data: SignalPayload) => void;
  private readonly peers = new Map<string, PeerState>();
  private readonly localTracks = new Map<MediaStreamTrack, LocalTrack>();
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
  ): void {
    const targetSet = targets === undefined || targets === null ? null : new Set(targets);
    this.localTracks.set(track, { stream, encoding: encoding ?? null, targets: targetSet });
    for (const [peerId, state] of this.peers) {
      if (targetSet === null || targetSet.has(peerId)) {
        state.pc.addTrack(track, stream);
        void this.applyEncoding(state.pc, track);
      }
    }
  }

  /**
   * Reconcilia para quem um track é enviado: adiciona sender nos alvos
   * novos e remove dos que saíram — cada mudança renegocia só aquele par.
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
        state.pc.addTrack(track, local.stream);
        void this.applyEncoding(state.pc, track);
      } else if (!targetSet.has(peerId) && sender) {
        state.pc.removeTrack(sender);
      }
    }
  }

  /**
   * Reaplica o teto de envio de um track em todos os pares.
   *
   * Chamado quando a qualidade escolhida muda ou quando entra/sai gente —
   * o rateio do uplink depende de quantos estão recebendo.
   */
  setTrackEncoding(track: MediaStreamTrack, encoding: TrackEncoding): void {
    const local = this.localTracks.get(track);
    if (!local) {
      return;
    }
    local.encoding = encoding;
    for (const state of this.peers.values()) {
      void this.applyEncoding(state.pc, track);
    }
  }

  private async applyEncoding(pc: RTCPeerConnection, track: MediaStreamTrack): Promise<void> {
    const encoding = this.localTracks.get(track)?.encoding;
    const sender = pc.getSenders().find((s) => s.track === track);
    if (!encoding || !sender) {
      return;
    }
    const parameters = sender.getParameters();
    // Sender recém-criado pode vir sem encodings até a primeira negociação.
    if (parameters.encodings.length === 0) {
      parameters.encodings = [{}];
    }
    for (const layer of parameters.encodings) {
      layer.maxBitrate = encoding.maxBitrate;
      layer.maxFramerate = encoding.maxFramerate;
    }
    parameters.degradationPreference = encoding.degradationPreference;
    try {
      await sender.setParameters(parameters);
    } catch {
      // parâmetros recusados (par caindo): a próxima aplicação tenta de novo
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

    for (const [track, local] of this.localTracks) {
      if (local.targets === null || local.targets.has(peerId)) {
        pc.addTrack(track, local.stream);
        void this.applyEncoding(pc, track);
      }
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
      if (event.track.kind === 'video') {
        // Sem isso o navegador acumula centenas de ms de buffer: numa tela
        // compartilhada isso é a diferença entre acompanhar e ver o passado.
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
