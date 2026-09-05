/** Real multi-source Opus/DataChannel transport probe. No product room or user media. */
export {};
interface Route { parent: number | null; children: number[] }
interface Configuration { id: number; sources: number[]; routes: Record<number, Route>; decode: boolean; batch: boolean }
interface SourceStats { packets: number; frames: number; energy: number; frequencySum: number; voicedFrames: number }
const host = window as unknown as { sparse: typeof sparse };
const pcs = new Map<number, RTCPeerConnection>();
const channels = new Map<number, RTCDataChannel>();
const decoders = new Map<number, AudioDecoder>();
const sources = new Map<number, SourceStats>();
const lastSequence = new Map<number, number>();
const pending = new Map<number, ArrayBuffer[]>();
const flushTimers = new Map<number, ReturnType<typeof setTimeout>>();
const errors: string[] = [];
const codec = { codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 64000 };
const metrics = { packetsOriginated: 0, forwardedCopies: 0, bytesSent: 0, dropped: 0,
  duplicates: 0, selfReturned: 0, invalid: 0, maxBufferedAmount: 0, transportMessages: 0 };
let config: Configuration;
let encoder: AudioEncoder | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let sequence = 0;
function transmit(child: number, packet: ArrayBuffer, logicalPackets = 1) {
  const channel = channels.get(child);
  metrics.maxBufferedAmount = Math.max(metrics.maxBufferedAmount, channel?.bufferedAmount ?? 0);
  if (!channel || channel.readyState !== 'open' || channel.bufferedAmount > 65536) { metrics.dropped += logicalPackets; return; }
  channel.send(packet); metrics.bytesSent += packet.byteLength; metrics.transportMessages++;
}
function flush(child: number) {
  flushTimers.delete(child);
  const queued = pending.get(child) ?? [];
  pending.delete(child);
  while (queued.length) {
    const frames: ArrayBuffer[] = [];
    let size = 2;
    while (queued.length && size + 2 + queued[0].byteLength <= 1200) {
      const frame = queued.shift()!; frames.push(frame); size += 2 + frame.byteLength;
    }
    if (!frames.length) { transmit(child, queued.shift()!); continue; }
    const packet = new ArrayBuffer(size), header = new DataView(packet), bytes = new Uint8Array(packet);
    header.setUint8(0, 2); header.setUint8(1, frames.length);
    let offset = 2;
    for (const frame of frames) {
      header.setUint16(offset, frame.byteLength); bytes.set(new Uint8Array(frame), offset + 2); offset += frame.byteLength + 2;
    }
    transmit(child, packet, frames.length);
  }
}
function send(source: number, packet: ArrayBuffer) {
  for (const child of config.routes[source].children) {
    if (config.batch) {
      const queue = pending.get(child) ?? [];
      if (queue.length >= 64) { metrics.dropped++; continue; }
      queue.push(packet); pending.set(child, queue);
      // One short scheduling window amortizes SCTP envelopes without allowing
      // a bulk queue to delay voice. The byte bound stays below 1200 per batch.
      if (!flushTimers.has(child)) flushTimers.set(child, setTimeout(() => flush(child), 2));
    } else transmit(child, packet);
    if (source !== config.id) metrics.forwardedCopies++;
  }
}
function receive(parent: number, packet: unknown) {
  if (!(packet instanceof ArrayBuffer) || packet.byteLength < 2 || packet.byteLength > 4096) { metrics.invalid++; return; }
  const header = new DataView(packet);
  if (header.getUint8(0) === 2) {
    const count = header.getUint8(1), frames: ArrayBuffer[] = [];
    let offset = 2;
    if (!count || count > 64) { metrics.invalid++; return; }
    for (let i = 0; i < count; i++) {
      if (offset + 2 > packet.byteLength) { metrics.invalid++; return; }
      const size = header.getUint16(offset); offset += 2;
      if (size <= 16 || offset + size > packet.byteLength || header.getUint8(offset) !== 1) { metrics.invalid++; return; }
      frames.push(packet.slice(offset, offset + size)); offset += size;
    }
    if (offset !== packet.byteLength) { metrics.invalid++; return; }
    for (const frame of frames) receive(parent, frame);
    return;
  }
  if (packet.byteLength <= 16) { metrics.invalid++; return; }
  const source = header.getUint16(2), seq = header.getUint32(4), timestamp = header.getFloat64(8);
  if (source === config.id) { metrics.selfReturned++; return; }
  if (header.getUint8(0) !== 1 || !Number.isSafeInteger(timestamp) || timestamp < 0 || config.routes[source]?.parent !== parent) {
    metrics.invalid++; return;
  }
  if (seq <= (lastSequence.get(source) ?? -1)) { metrics.duplicates++; return; }
  lastSequence.set(source, seq);
  const stats = sources.get(source)!;
  stats.packets++;
  send(source, packet);
  if (!config.decode) return;
  const decoder = decoders.get(source)!;
  if (decoder.decodeQueueSize > 6) { metrics.dropped++; return; }
  decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp, data: new Uint8Array(packet, 16) }));
}
const sparse = {
  async init(value: Configuration) {
    config = value;
    if (!(await AudioEncoder.isConfigSupported(codec)).supported || !(await AudioDecoder.isConfigSupported(codec)).supported) {
      throw new Error('Mono Opus WebCodecs unavailable');
    }
    for (const source of config.sources) {
      if (source === config.id) continue;
      const stats: SourceStats = { packets: 0, frames: 0, energy: 0, frequencySum: 0, voicedFrames: 0 };
      sources.set(source, stats);
      if (!config.decode) continue;
      const decoder = new AudioDecoder({ error: e => errors.push(String(e)), output: data => {
        try {
          const samples = new Float32Array(data.numberOfFrames);
          data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
          let energy = 0, crossings = 0;
          for (let i = 0; i < samples.length; i++) {
            energy += samples[i] * samples[i];
            if (i && samples[i] >= 0 && samples[i - 1] < 0) crossings++;
          }
          stats.frames++;
          stats.energy += energy;
          if (energy / samples.length > 0.001) {
            stats.frequencySum += crossings * data.sampleRate / samples.length;
            stats.voicedFrames++;
          }
        } finally { data.close(); }
      } });
      decoder.configure(codec);
      decoders.set(source, decoder);
    }
    if (config.sources.includes(config.id)) {
      encoder = new AudioEncoder({ error: e => errors.push(String(e)), output: chunk => {
        const packet = new ArrayBuffer(16 + chunk.byteLength);
        const header = new DataView(packet);
        header.setUint8(0, 1); header.setUint16(2, config.id);
        header.setUint32(4, metrics.packetsOriginated++); header.setFloat64(8, chunk.timestamp);
        chunk.copyTo(new Uint8Array(packet, 16)); send(config.id, packet);
      } });
      encoder.configure(codec);
    }
  },
  create(peer: number) {
    if (pcs.has(peer)) throw new Error('Duplicate edge');
    const pc = new RTCPeerConnection({ iceServers: [] });
    pcs.set(peer, pc);
    const channel = pc.createDataChannel('research-audio', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    channel.binaryType = 'arraybuffer'; channel.onmessage = event => receive(peer, event.data);
    channels.set(peer, channel);
  },
  async description(peer: number) {
    const pc = pcs.get(peer)!;
    if (pc.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ICE gathering deadline exceeded')), 5000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
      });
    });
    return pc.localDescription!.toJSON();
  },
  async offer(peer: number) { await pcs.get(peer)!.setLocalDescription(await pcs.get(peer)!.createOffer()); return sparse.description(peer); },
  async answer(peer: number, offer: RTCSessionDescriptionInit) {
    const pc = pcs.get(peer)!;
    await pc.setRemoteDescription(offer); await pc.setLocalDescription(await pc.createAnswer()); return sparse.description(peer);
  },
  async accept(peer: number, answer: RTCSessionDescriptionInit) { await pcs.get(peer)!.setRemoteDescription(answer); },
  ready() { return [...channels.values()].every(channel => channel.readyState === 'open'); },
  start() {
    if (!encoder || timer) return;
    timer = setInterval(() => {
      if (encoder!.encodeQueueSize > 6) { metrics.dropped++; return; }
      const samples = new Float32Array(960), frequency = 600 + config.id * 37;
      for (let i = 0; i < samples.length; i++) samples[i] = 0.15 * Math.sin(2 * Math.PI * frequency * (sequence * 960 + i) / 48000);
      const data = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: 960,
        numberOfChannels: 1, timestamp: sequence++ * 20000, data: samples });
      try { encoder!.encode(data); } finally { data.close(); }
    }, 20);
  },
  async stop() { clearInterval(timer); timer = undefined; if (encoder) await encoder.flush(); },
  async snapshot() {
    for (const decoder of decoders.values()) await decoder.flush();
    const edges = await Promise.all([...pcs].map(async ([peer, pc]) => {
      const reports = [...(await pc.getStats()).values()];
      const pair = reports.find(report => report.type === 'candidate-pair' && report.nominated);
      return { peer, bufferedAmount: channels.get(peer)!.bufferedAmount,
        rtt: pair?.currentRoundTripTime, availableOutgoingBitrate: pair?.availableOutgoingBitrate,
        channels: reports.filter(report => report.type === 'data-channel').map(report => ({
          sent: report.messagesSent, received: report.messagesReceived,
          bytesSent: report.bytesSent, bytesReceived: report.bytesReceived,
        })) };
    }));
    return { id: config.id, pcs: pcs.size, connected: [...pcs.values()].filter(pc => pc.connectionState === 'connected').length,
      metrics, sources: [...sources].map(([source, stats]) => ({ source, ...stats })), errors, edges };
  },
  close() {
    clearInterval(timer); encoder?.close();
    for (const timeout of flushTimers.values()) clearTimeout(timeout);
    pending.clear();
    // Detach message handlers before closing codecs: already queued transport
    // events can otherwise call a closed decoder during teardown.
    for (const channel of channels.values()) channel.onmessage = null;
    for (const decoder of decoders.values()) decoder.close();
    for (const pc of pcs.values()) pc.close();
  },
};
host.sparse = sparse;
