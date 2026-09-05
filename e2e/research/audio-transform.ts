/** Local research only. Count received payloads, not successful writes, as evidence. */
export {};

interface Frame {
  data: ArrayBuffer;
  getMetadata(): { rtpTimestamp?: number; [key: string]: unknown };
}
interface Transformer {
  options: { role: 'receive' | 'send'; mode: string };
  readable: ReadableStream<Frame>;
  writable: WritableStream<Frame>;
}
const scope = self as unknown as {
  RTCEncodedAudioFrame?: new (frame: Frame, options?: { metadata: object }) => Frame;
  onrtctransform: (event: { transformer: Transformer }) => void;
  onmessage: (event: MessageEvent) => void;
  postMessage: (data: unknown) => void;
};
const queue: { data: ArrayBuffer; timestamp?: number; frame?: Frame; at: number }[] = [];
const metrics = { received: 0, sent: 0, substituted: 0, overflow: 0, expired: 0,
  empty: 0, maxQueue: 0, copiedBytes: 0, errors: [] as string[], hashes: [] as number[] };
function hash(buffer: ArrayBuffer): number {
  let value = 2166136261;
  for (const byte of new Uint8Array(buffer)) value = Math.imul(value ^ byte, 16777619);
  return value >>> 0;
}
scope.onrtctransform = ({ transformer }) => {
  const { role, mode } = transformer.options;
  const reader = transformer.readable.getReader();
  const writer = transformer.writable.getWriter();
  void (async () => {
    for (;;) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      if (role === 'receive') {
        metrics.received++;
        if (metrics.hashes.length < 4096) metrics.hashes.push(hash(frame.data));
        if (mode.startsWith('encoded') || mode === 'foreign') {
          // Writing a frame detaches its bytes. The downstream needs its own copy.
          const data = frame.data.slice(0);
          metrics.copiedBytes += data.byteLength;
          if (queue.length === 6) { queue.shift(); metrics.overflow++; }
          queue.push({ data, timestamp: frame.getMetadata().rtpTimestamp, at: performance.now(),
            frame: mode === 'foreign' && scope.RTCEncodedAudioFrame
              ? new scope.RTCEncodedAudioFrame(frame) : undefined });
          metrics.maxQueue = Math.max(metrics.maxQueue, queue.length);
        }
        await writer.write(frame);
      } else if (mode.startsWith('encoded') || mode === 'foreign') {
        while (queue.length && performance.now() - queue[0].at > 120) {
          queue.shift(); metrics.expired++;
        }
        const pending = queue.shift();
        if (!pending) { metrics.empty++; continue; }
        let output = pending.frame;
        if (mode === 'encoded-inplace') {
          output = frame;
          output.data = pending.data;
        } else if (mode === 'encoded') {
          if (!scope.RTCEncodedAudioFrame) throw new Error('RTCEncodedAudioFrame constructor unavailable');
          output = new scope.RTCEncodedAudioFrame(frame, {
            metadata: { ...frame.getMetadata(), rtpTimestamp: pending.timestamp },
          });
          output.data = pending.data;
        }
        if (!output) throw new Error('Foreign-frame probe could not construct its control');
        await writer.write(output);
        metrics.substituted++;
      } else if (mode === 'clone') {
        if (!scope.RTCEncodedAudioFrame) throw new Error('Frame constructor unavailable');
        await writer.write(new scope.RTCEncodedAudioFrame(frame));
      } else {
        await writer.write(frame);
      }
      if (role === 'send') metrics.sent++;
    }
  })().catch(error => metrics.errors.push(String(error)));
};
scope.onmessage = () => scope.postMessage(metrics);
