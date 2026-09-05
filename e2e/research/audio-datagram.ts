/**
 * Deliberately local-only prototype, not a room transport. It has no sender
 * authentication, E2EE, adaptive jitter buffer, clock recovery, FEC, or BWE.
 * Unordered SCTP still has congestion control; bounded queues drop stale voice.
 */
export async function createDatagramAudio(ctx: AudioContext, id: number, fail: (error: string) => void) {
  const codec = { codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 64000 };
  if (!('AudioEncoder' in window) || !('AudioDecoder' in window)) throw new Error('Audio WebCodecs unavailable');
  if (!(await AudioEncoder.isConfigSupported(codec)).supported || !(await AudioDecoder.isConfigSupported(codec)).supported) {
    throw new Error('Mono Opus WebCodecs unavailable');
  }
  const channels = new Map<number, RTCDataChannel>();
  const metrics = { sent: 0, received: 0, bytesSent: 0, bytesReceived: 0, dropped: 0,
    duplicates: 0, decoded: 0, underruns: 0, maxBufferedAmount: 0, emptyInputBlocks: 0, hashes: [] as number[] };
  let sequence = 0, lastSequence = -1, anchorTimestamp: number | null = null, anchorPlay = 0;
  const scheduled = new Set<AudioBufferSourceNode>();
  const output = ctx.createMediaStreamDestination();
  output.channelCount = 1;
  function send(packet: ArrayBuffer) {
    const channel = channels.get(id + 1);
    if (!channel) return;
    metrics.maxBufferedAmount = Math.max(metrics.maxBufferedAmount, channel.bufferedAmount);
    if (channel.readyState !== 'open' || channel.bufferedAmount > 64 * 1024) { metrics.dropped++; return; }
    channel.send(packet);
    metrics.sent++;
    metrics.bytesSent += packet.byteLength;
  }
  const decoder = new AudioDecoder({
    error: error => fail(String(error)),
    output: data => {
      try {
        const samples = new Float32Array(data.numberOfFrames);
        data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
        const buffer = ctx.createBuffer(1, data.numberOfFrames, data.sampleRate);
        buffer.copyToChannel(samples, 0);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(output);
        // Preserve timestamp gaps: some encoders omit silent packets. Joining
        // decoded buffers end-to-end would compress silence and split onsets.
        // The 40 ms lead is fixed; this is still not an adaptive jitter buffer.
        let playAt = anchorTimestamp === null ? -Infinity : anchorPlay + (data.timestamp - anchorTimestamp) / 1e6;
        if (playAt < ctx.currentTime) {
          if (anchorTimestamp !== null) metrics.underruns++;
          anchorTimestamp = data.timestamp;
          anchorPlay = ctx.currentTime + 0.04;
          playAt = anchorPlay;
        }
        if (playAt > ctx.currentTime + 0.2) { metrics.dropped++; node.disconnect(); return; }
        node.start(playAt);
        scheduled.add(node);
        node.onended = () => { scheduled.delete(node); node.disconnect(); };
        metrics.decoded++;
      } finally { data.close(); }
    },
  });
  decoder.configure(codec);
  const encoder = new AudioEncoder({ error: error => fail(String(error)), output: chunk => {
    const packet = new ArrayBuffer(16 + chunk.byteLength);
    const header = new DataView(packet);
    header.setUint8(0, 1);
    header.setUint16(2, id);
    header.setUint32(4, sequence++);
    header.setFloat64(8, chunk.timestamp);
    chunk.copyTo(new Uint8Array(packet, 16));
    send(packet);
  } });
  encoder.configure(codec);
  await ctx.audioWorklet.addModule('/audio-capture.js');
  const input = new AudioWorkletNode(ctx, 'research-capture');
  const mute = ctx.createGain();
  mute.gain.value = 0;
  input.connect(mute).connect(ctx.destination);
  input.port.onmessage = event => {
    metrics.emptyInputBlocks = event.data.emptyInputBlocks;
    if (id !== 0 || encoder.state !== 'configured') return;
    if (encoder.encodeQueueSize > 6) { metrics.dropped++; return; }
    const data = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: 960,
      numberOfChannels: 1, timestamp: event.data.timestamp, data: event.data.samples });
    try { encoder.encode(data); } finally { data.close(); }
  };
  return {
    input, output: output.stream.getAudioTracks()[0], metrics,
    attach(peer: number, channel: RTCDataChannel) {
      channels.set(peer, channel);
      channel.binaryType = 'arraybuffer';
      channel.onmessage = event => {
        const packet = event.data;
        if (!(packet instanceof ArrayBuffer) || packet.byteLength <= 16 || packet.byteLength > 4096 || peer !== id - 1) {
          metrics.dropped++; return;
        }
        const header = new DataView(packet);
        const seq = header.getUint32(4), timestamp = header.getFloat64(8);
        if (header.getUint8(0) !== 1 || header.getUint16(2) !== 0 || !Number.isSafeInteger(timestamp) || timestamp < 0) {
          metrics.dropped++; return;
        }
        if (seq <= lastSequence) { metrics.duplicates++; return; }
        lastSequence = seq;
        metrics.received++;
        metrics.bytesReceived += packet.byteLength;
        let hash = 2166136261;
        for (const byte of new Uint8Array(packet, 16)) hash = Math.imul(hash ^ byte, 16777619);
        if (metrics.hashes.length < 4096) metrics.hashes.push(hash >>> 0);
        // Forward independently from this participant's own decode/playout.
        send(packet);
        if (decoder.decodeQueueSize > 6) { metrics.dropped++; return; }
        decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp, data: new Uint8Array(packet, 16) }));
      };
    },
    ready: () => [...channels.values()].every(channel => channel.readyState === 'open'),
    close() {
      encoder.close(); decoder.close(); input.port.close(); input.disconnect(); mute.disconnect();
      for (const node of scheduled) { node.stop(); node.disconnect(); }
      output.stream.getTracks().forEach(track => track.stop());
    },
  };
}
