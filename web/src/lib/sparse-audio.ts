import type { AudioCapability, AudioEvent, AudioPlan } from '../../../server/src/domain/audio-network';
import { audioPacketBody, AudioReplayWindow, parseAudioPacket, type AudioPacket } from './audio-packet';
import { AudioPlayoutClock } from './audio-playout';
import type { Mesh } from './mesh';
import captureUrl from './audio-capture-worklet.ts?worker&url';

const CODEC: AudioEncoderConfig = { codec: 'opus', sampleRate: 48000, numberOfChannels: 1,
  bitrate: 48000, opus: { frameDuration: 20000, usedtx: true } };
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' };
const MAX_QUEUE = 8;
// Twenty real product clients exceeded the local acceptance deadline. Keep
// that research path explicit; successful graph/transport probes do not open
// the production activation envelope. Room admission itself remains twenty.
const MAX_PARTICIPANTS = import.meta.env.VITE_SPARSE_AUDIO_RESEARCH_20 === '1' ? 20 : 10;
interface Source {
  key: CryptoKey;
  publicKey: string;
  original: string | null;
  decoder: AudioDecoder;
  output: MediaStreamAudioDestinationNode;
  clock: AudioPlayoutClock;
  replay: AudioReplayWindow;
  forwarded: Map<number, AudioReplayWindow>;
  pending: Set<string>;
  queue: Array<{ packet: AudioPacket; arrived: number }>;
  nodes: Set<AudioBufferSourceNode>;
  lastReceived: number;
  generations: Set<number>;
  decoded: number;
  lastPlayed: number;
  rateAt: number;
  rateCount: number;
}

/**
 * One encoder per logical microphone. Relays authenticate and forward the Opus
 * bytes; their own decoder is exclusively for listening. DTLS protects links;
 * signatures bind source/sequence/timestamp/generation across every relay.
 */
export class SparseAudio {
  private readonly ctx: AudioContext;
  private readonly channels = new Map<string, RTCDataChannel>();
  private readonly sources = new Map<string, Source>();
  private readonly plans = new Map<number, AudioPlan>();
  private readonly encoder: AudioEncoder;
  private readonly keys: CryptoKeyPair;
  private capture: AudioWorkletNode | null = null;
  private input: MediaStreamAudioSourceNode | null = null;
  private mute: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retirement: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  private signing = 0;
  private verifying = 0;
  private preparation = 0;
  private pending: AudioPlan | null = null;
  private committed = 0;
  private preparedAt = 0;
  private readySent = 0;
  private failed = false;
  private closed = false;
  private nativePolling = false;
  private nativePollAt = 0;
  private nativeReady = new Set<string>();
  private nativeBaseline = new Map<string, number>();
  private nativeComplete = false;
  private capabilityWait: ReturnType<typeof setTimeout> | null = null;
  private delayedPlan: AudioPlan | null = null;
  private capability: AudioCapability;
  readonly metrics = { mode: 'mesh', generation: 0, encoded: 0, received: 0, forwarded: 0,
    decoded: 0, dropped: 0, invalid: 0, duplicates: 0, selfReturned: 0,
    bytesSent: 0, bufferedAmount: 0, fallback: null as string | null };

  private constructor(private readonly selfId: string, private readonly mesh: Mesh,
    private readonly send: (event: AudioEvent) => void, keys: CryptoKeyPair, publicKey: string,
    streamId: string | null, ctx: AudioContext) {
    this.ctx = ctx; this.keys = keys; this.capability = { publicKey, streamId };
    ctx.onstatechange = () => {
      if (this.metrics.mode === 'sparse' && ctx.state === 'suspended') this.fail('playout-suspended');
    };
    this.encoder = new AudioEncoder({ error: () => this.fail('encoder'), output: chunk => {
      if (this.closed || !this.plans.size) return;
      if (this.signing >= MAX_QUEUE) { this.metrics.dropped++; return; }
      const payload = new Uint8Array(chunk.byteLength); chunk.copyTo(payload);
      const seq = this.sequence++;
      this.metrics.encoded++;
      for (const plan of this.plans.values()) {
        if (!plan.sources[this.selfId]) continue;
        this.signing++;
        void this.originate(plan, seq, chunk.timestamp, payload).catch(() => this.fail('signing'))
          .finally(() => { this.signing--; });
      }
    } });
    this.encoder.configure(CODEC);
  }

  static async create(selfId: string, mesh: Mesh, stream: MediaStream | null, send: (event: AudioEvent) => void, voiceProfile = true): Promise<SparseAudio | null> {
    let ctx: AudioContext | undefined, transport: SparseAudio | undefined;
    try {
      if (!voiceProfile || import.meta.env.VITE_SPARSE_AUDIO === '0' || !globalThis.AudioEncoder || !globalThis.AudioDecoder || !crypto.subtle ||
        !(await AudioEncoder.isConfigSupported(CODEC)).supported || !(await AudioDecoder.isConfigSupported(CODEC)).supported) {
        send({ t: 'audio-capability', capability: null }); return null;
      }
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      await ctx.resume();
      if (ctx.state !== 'running' || ctx.sampleRate !== 48000) throw new Error('Audio context unavailable');
      const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
      const publicKey = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      transport = new SparseAudio(selfId, mesh, send, keys, publicKey, stream?.id ?? null, ctx);
      await ctx.audioWorklet.addModule(captureUrl);
      transport.capture = new AudioWorkletNode(ctx, 'freecord-audio-capture');
      transport.mute = ctx.createGain(); transport.mute.gain.value = 0;
      transport.capture.connect(transport.mute).connect(ctx.destination);
      transport.capture.port.onmessage = event => {
        const audio = transport!;
        audio.capture?.port.postMessage('ack');
        audio.metrics.dropped += event.data.dropped;
        if (audio.closed || audio.encoder.state !== 'configured' || !audio.plans.size) return;
        if (audio.encoder.encodeQueueSize >= MAX_QUEUE) { audio.metrics.dropped++; return; }
        const data = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfChannels: 1,
          numberOfFrames: 960, timestamp: event.data.timestamp, data: event.data.samples });
        try { audio.encoder.encode(data); } catch { audio.fail('capture'); } finally { data.close(); }
      };
      const track = stream?.getAudioTracks()[0]; if (track) transport.replaceTrack(track);
      transport.timer = setInterval(() => transport!.tick(), 10);
      mesh.onVoiceTrack = track => transport!.replaceTrack(track);
      mesh.onAudioChannel = (id, channel) => transport!.attach(id, channel);
      // Existing PCs stay warm during capability negotiation.
      for (const id of mesh.peerIds()) {
        const channel = mesh.getAudioChannel(id); if (channel) transport.attach(id, channel);
      }
      send({ t: 'audio-capability', capability: transport.capability });
      return transport;
    } catch {
      if (transport) transport.close(); else if (ctx) await ctx.close().catch(() => {});
      send({ t: 'audio-capability', capability: null });
      return null;
    }
  }

  private replaceTrack(track: MediaStreamTrack): void {
    this.input?.disconnect();
    this.input = this.ctx.createMediaStreamSource(new MediaStream([track]));
    if (this.capture) this.input.connect(this.capture);
  }

  private attach(id: string, channel: RTCDataChannel): void {
    const old = this.channels.get(id); if (old) old.onmessage = null;
    this.channels.set(id, channel); channel.binaryType = 'arraybuffer';
    channel.addEventListener('close', () => { if (this.channels.get(id) === channel) this.channels.delete(id); });
    channel.onmessage = event => { void this.receive(id, event.data).catch(() => this.fail('receive')); };
  }

  async prepare(plan: AudioPlan, waitedForCapability = false): Promise<void> {
    if (this.closed || plan.generation < Math.max(this.pending?.generation ?? 0, this.delayedPlan?.generation ?? 0)) return;
    if (plan.mode === 'sparse' && plan.peers.length > MAX_PARTICIPANTS) {
      this.fail('validation-envelope'); return;
    }
    if (!waitedForCapability && this.metrics.mode === 'sparse' && plan.mode === 'mesh' &&
      plan.peers.some(id => !plan.aware.includes(id))) {
      // A join precedes its async codec/key probe. Keep the working routes
      // during that short window instead of restarting N-1 native senders
      // across the entire room on every capable arrival. Legacy peers still
      // get native fallback after one bounded wait; churn cannot extend it.
      this.delayedPlan = plan;
      this.capabilityWait ??= setTimeout(() => {
        this.capabilityWait = null;
        const delayed = this.delayedPlan; this.delayedPlan = null;
        if (delayed) void this.prepare(delayed, true);
      }, 1000);
      return;
    }
    if (this.capabilityWait) clearTimeout(this.capabilityWait);
    this.capabilityWait = null; this.delayedPlan = null;
    if (plan.generation === this.pending?.generation) {
      if (this.readySent === plan.generation) this.send({ t: 'audio-ready', generation: plan.generation });
      return;
    }
    this.pending = plan; this.preparedAt = performance.now();
    this.nativeReady.clear(); this.nativeBaseline.clear(); this.nativeComplete = false;
    const preparation = ++this.preparation;
    // Keep old links during the readiness barrier; the commit retires them.
    this.mesh.setConnectivity(null);
    if (plan.mode === 'mesh') {
      this.mesh.setVoiceRtp(true);
      for (const id of plan.peers) if (id !== this.selfId) this.mesh.ensurePeer(id, this.selfId < id || !plan.aware.includes(id));
      return;
    }
    if (this.failed) return;
    try {
      for (const id of plan.neighbors[this.selfId] ?? []) this.mesh.ensurePeer(id, this.selfId < id);
      for (const [id, cap] of Object.entries(plan.sources)) {
        if (id === this.selfId) continue;
        if (this.sources.get(id)?.publicKey === cap.publicKey) continue;
        const bytes = Uint8Array.from(atob(cap.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const key = await crypto.subtle.importKey('raw', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        if (this.closed || preparation !== this.preparation) return;
        this.removeSource(id);
        const source = {} as Source;
        const output = this.ctx.createMediaStreamDestination(); output.channelCount = 1;
        Object.assign(source, { key, publicKey: cap.publicKey, original: cap.streamId, output, clock: new AudioPlayoutClock(),
          replay: new AudioReplayWindow(), forwarded: new Map(), pending: new Set(), queue: [], nodes: new Set(),
          lastReceived: performance.now(), generations: new Set(), decoded: 0, lastPlayed: performance.now(), rateAt: 0, rateCount: 0 });
        source.decoder = new AudioDecoder({ error: () => this.fail('decoder'), output: data => this.play(source, data) });
        source.decoder.configure(CODEC); this.sources.set(id, source);
      }
      if (preparation !== this.preparation || this.closed) return;
      for (const generation of this.plans.keys()) if (generation !== this.committed) this.plans.delete(generation);
      this.plans.set(plan.generation, plan);
    } catch { this.fail('prepare'); }
  }

  commit(generation: number): void {
    const plan = this.pending;
    if (!plan || plan.generation !== generation || this.closed) return;
    if (plan.mode === 'sparse' && (this.failed || this.readySent !== generation)) return;
    this.committed = generation; this.metrics.generation = generation; this.metrics.mode = plan.mode;
    this.mesh.setVoiceRtp(plan.mode !== 'sparse');
    this.mesh.setLogicalAudio(plan.mode === 'sparse' ? new Map([...this.sources].filter(([id]) => plan.sources[id]?.streamId != null)
      .map(([id, source]) => [id, { stream: source.output.stream, original: plan.sources[id]!.streamId }])) : new Map());
    if (this.retirement) clearTimeout(this.retirement);
    this.retirement = setTimeout(() => {
      if (this.closed || this.pending?.generation !== generation) return;
      for (const old of this.plans.keys()) if (old !== generation || plan.mode !== 'sparse') this.plans.delete(old);
      for (const [id, source] of this.sources) {
        if (!plan.sources[id] || plan.mode !== 'sparse') this.removeSource(id);
        else {
          for (const old of source.forwarded.keys()) if (old !== generation) source.forwarded.delete(old);
          source.generations = new Set(source.generations.has(generation) ? [generation] : []);
        }
      }
      this.mesh.setConnectivity(plan.mode === 'sparse' ? plan.neighbors[this.selfId] ?? [] : null);
    }, 750);
  }

  private async originate(plan: AudioPlan, sequence: number, timestamp: number, payload: Uint8Array): Promise<void> {
    const body = audioPacketBody(plan.generation, plan.peers.indexOf(this.selfId), sequence, timestamp, payload);
    const signature = new Uint8Array(await crypto.subtle.sign(SIGNATURE, this.keys.privateKey, body));
    if (this.closed || !this.plans.has(plan.generation)) return;
    const packet = new Uint8Array(body.length + signature.length); packet.set(body); packet.set(signature, body.length);
    this.forward(plan, this.selfId, packet.buffer);
  }

  private forward(plan: AudioPlan, source: string, packet: ArrayBuffer): void {
    for (const [child, parent] of Object.entries(plan.parents[source] ?? {})) {
      if (parent !== this.selfId || child === source) continue;
      const channel = this.channels.get(child);
      if (!channel || channel.readyState !== 'open' || channel.bufferedAmount > 8192) { this.metrics.dropped++; continue; }
      try { channel.send(packet); } catch { this.metrics.dropped++; continue; }
      this.metrics.bytesSent += packet.byteLength;
      this.metrics.bufferedAmount = Math.max(this.metrics.bufferedAmount, channel.bufferedAmount);
      if (source !== this.selfId) this.metrics.forwarded++;
    }
  }

  private async receive(parent: string, value: unknown): Promise<void> {
    if (this.closed) return;
    const packet = parseAudioPacket(value);
    const plan = packet && this.plans.get(packet.generation), id = packet && plan?.peers[packet.source];
    if (id === this.selfId) { this.metrics.selfReturned++; return; }
    const source = id && this.sources.get(id);
    if (!packet || !plan || !id || !source || plan.parents[id]?.[this.selfId] !== parent) { this.metrics.invalid++; return; }
    const now = performance.now();
    if (now - source.rateAt >= 1000) { source.rateAt = now; source.rateCount = 0; }
    // Covers 50 packets/s plus two-route overlap and jitter bursts. A relay
    // cannot turn one authenticated source into an unbounded verify workload.
    if (++source.rateCount > 150) { this.metrics.dropped++; return; }
    let replay = source.forwarded.get(packet.generation);
    if (!replay) { replay = new AudioReplayWindow(); source.forwarded.set(packet.generation, replay); }
    const token = `${packet.generation}:${packet.sequence}`;
    if (!replay.accepts(packet.sequence) || source.pending.has(token)) { this.metrics.duplicates++; return; }
    if (source.pending.size >= MAX_QUEUE || this.verifying >= 64) { this.metrics.dropped++; return; }
    source.pending.add(token); this.verifying++;
    try {
      const valid = await crypto.subtle.verify(SIGNATURE, source.key, packet.signature, packet.signed);
      if (this.closed || !this.plans.has(packet.generation)) return;
      if (!valid) { this.metrics.invalid++; return; }
      if (!replay.add(packet.sequence)) { this.metrics.duplicates++; return; }
      this.forward(plan, id, value as ArrayBuffer);
      source.lastReceived = performance.now(); source.generations.add(packet.generation); this.metrics.received++;
      if (!source.replay.add(packet.sequence)) { this.metrics.duplicates++; return; } // Route overlap never doubles playback.
      source.clock.observe(packet.timestamp, this.ctx.currentTime);
      if (source.queue.length >= MAX_QUEUE) { this.metrics.dropped++; return; }
      source.queue.push({ packet, arrived: this.ctx.currentTime });
      source.queue.sort((a, b) => a.packet.timestamp - b.packet.timestamp);
    } finally { source.pending.delete(token); this.verifying--; }
  }

  private play(source: Source, data: AudioData): void {
    try {
      if (this.closed) return;
      const at = source.clock.schedule(data.timestamp, this.ctx.currentTime);
      if (at === null || source.nodes.size >= 16) { this.metrics.dropped++; return; }
      const samples = new Float32Array(data.numberOfFrames); data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
      const buffer = this.ctx.createBuffer(1, samples.length, data.sampleRate); buffer.copyToChannel(samples, 0);
      const node = this.ctx.createBufferSource(); node.buffer = buffer; node.connect(source.output);
      node.start(at); source.nodes.add(node);
      node.onended = () => { source.nodes.delete(node); node.disconnect(); };
      source.decoded++; this.metrics.decoded++;
      source.lastPlayed = performance.now();
    } finally { data.close(); }
  }

  private async restoreNative(plan: AudioPlan): Promise<void> {
    this.nativePolling = true; this.nativePollAt = performance.now();
    try {
      for (const [id, source] of this.sources) {
        if (this.nativeReady.has(id)) continue;
        const packets = source.original && plan.peers.includes(id)
          ? await this.mesh.nativeVoicePackets(id, source.original).catch(() => null) : null;
        if (this.closed || this.pending !== plan) return;
        if (!plan.peers.includes(id) || source.original === null) this.nativeReady.add(id);
        else if (packets !== null) {
          const previous = this.nativeBaseline.get(id);
          if (previous !== undefined && packets > previous) this.nativeReady.add(id);
          this.nativeBaseline.set(id, packets);
        }
      }
      if (this.closed || this.pending !== plan) return;
      // A dead participant cannot acknowledge a room-wide barrier. Switch
      // each living source only after native RTP actually advances, preserving
      // old playout for sources whose replacement is still being established.
      const waiting = [...this.sources].filter(([id, source]) => !this.nativeReady.has(id) &&
        (performance.now() - this.preparedAt < 3000 || performance.now() - source.lastReceived < 1200));
      this.mesh.setLogicalAudio(new Map(waiting.filter(([, source]) => source.original !== null)
        .map(([id, source]) => [id, { stream: source.output.stream, original: source.original }])));
      this.nativeComplete = waiting.length === 0;
      if (this.nativeComplete) {
        this.metrics.mode = 'mesh'; this.metrics.generation = plan.generation;
      }
    } finally { this.nativePolling = false; }
  }

  private tick(): void {
    if (this.closed) return;
    for (const source of this.sources.values()) {
      while (source.queue.length && this.ctx.currentTime - source.queue[0]!.arrived >= 0.02) {
        const { packet } = source.queue.shift()!;
        if (source.decoder.decodeQueueSize >= MAX_QUEUE) { this.metrics.dropped++; continue; }
        try { source.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: packet.timestamp, data: packet.payload })); }
        catch { this.fail('decode'); }
      }
    }
    const plan = this.pending; if (!plan) return;
    const elapsed = performance.now() - this.preparedAt;
    if (plan.mode === 'mesh' && this.sources.size && !this.nativeComplete && !this.nativePolling &&
      performance.now() - this.nativePollAt >= 100) void this.restoreNative(plan);
    if (this.readySent !== plan.generation) {
      const ready = plan.mode === 'mesh'
        ? this.sources.size ? this.nativeComplete : plan.peers.filter(id => id !== this.selfId)
          .every(id => this.mesh.getPeerConnection(id)?.connectionState === 'connected')
        : !this.failed && this.ctx.state === 'running' && (plan.neighbors[this.selfId] ?? []).every(id => this.channels.get(id)?.readyState === 'open') &&
          plan.peers.filter(id => id !== this.selfId).every(id => {
            const source = this.sources.get(id); return source?.generations.has(plan.generation) && source.decoded > 0;
          });
      if (ready) { this.readySent = plan.generation; this.send({ t: 'audio-ready', generation: plan.generation }); }
      else if (elapsed > 8000 && plan.mode === 'sparse') this.fail('activation-timeout');
    }
    const active = this.plans.get(this.committed);
    // Newcomers are still warming their route. Their first packets cannot be
    // judged against the health deadline of the already playing generation.
    if (this.metrics.mode === 'sparse' && active && [...this.sources].some(([id, source]) =>
      active.peers.includes(id) && performance.now() - source.lastReceived > 1200)) this.fail('source-timeout');
    if (this.metrics.mode === 'sparse' && active && [...this.sources].some(([id, source]) =>
      active.peers.includes(id) && performance.now() - source.lastPlayed > 1500)) this.fail('playout-timeout');
  }

  private fail(reason: string): void {
    if (this.closed || this.failed) return;
    this.failed = true; this.metrics.fallback = reason;
    this.mesh.setConnectivity(null); this.mesh.setVoiceRtp(true);
    for (const id of this.pending?.peers ?? []) if (id !== this.selfId) this.mesh.ensurePeer(id,
      this.selfId < id || !this.pending?.aware.includes(id));
    this.send({ t: 'audio-capability', capability: null });
  }

  /** Stereo music keeps the existing hi-fi RTP path until that codec profile is validated here. */
  useMusicProfile(): void { this.fail('music-profile'); }

  private removeSource(id: string): void {
    const source = this.sources.get(id); if (!source) return;
    this.sources.delete(id); source.decoder.close();
    for (const node of source.nodes) { node.onended = null; node.stop(); node.disconnect(); }
    source.output.disconnect(); source.output.stream.getAudioTracks().forEach(track => track.stop());
  }

  snapshot() {
    return { ...this.metrics, degree: this.mesh.peerIds().length, pending: this.pending?.generation ?? 0, ready: this.readySent,
      sources: [...this.sources].map(([id, source]) => ({ id, decoded: source.decoded,
        lossRate: source.replay.lossRate, jitterMs: source.clock.jitterMs, playoutDelayMs: source.clock.playoutDelayMs,
        underruns: source.clock.underruns, jitterLeadMs: source.clock.lead * 1000 })) };
  }

  close(): void {
    this.closed = true; this.preparation++;
    if (this.timer) clearInterval(this.timer); if (this.retirement) clearTimeout(this.retirement);
    if (this.capabilityWait) clearTimeout(this.capabilityWait);
    for (const channel of this.channels.values()) channel.onmessage = null;
    this.capture?.port.close(); this.capture?.disconnect(); this.input?.disconnect(); this.mute?.disconnect();
    this.encoder.close(); for (const id of this.sources.keys()) this.removeSource(id);
    this.mesh.onVoiceTrack = null; this.mesh.onAudioChannel = null;
    void this.ctx.close().catch(() => {});
  }
}
