/** No room APIs or captured user media: independent pages exchange synthetic audio over real WebRTC. */
import { createDatagramAudio } from './audio-datagram.js';

type Mode = 'track' | 'encoded' | 'encoded-inplace' | 'clone' | 'foreign' | 'datachannel';
interface LabConfig { id: number; hops: number; mode: Mode; dtx: boolean }
interface Tap { label: string; onsets: number[]; frequencies: number[]; rms: number; high: boolean }
interface Transformable { transform: unknown }
interface TransformConstructor { new(worker: Worker, options: object): unknown }
const host = window as unknown as { lab: typeof lab; RTCRtpScriptTransform?: TransformConstructor };
const pcs = new Map<number, RTCPeerConnection>();
const tracks = new Map<number, MediaStreamTrack>();
const taps: Tap[] = [];
const errors: string[] = [];
const nodes: AudioNode[] = [];
const elements: HTMLAudioElement[] = [];
const timers: ReturnType<typeof setInterval>[] = [];
let config: LabConfig;
let ctx: AudioContext;
let gain: GainNode;
let local: MediaStreamTrack;
let worker: Worker;
let datagram: Awaited<ReturnType<typeof createDatagramAudio>> | undefined;

function tap(track: MediaStreamTrack, label: string): void {
  const stream = new MediaStream([track]);
  if (label !== 'source') {
    // Chromium's remote audio renderer must be consuming the stream before
    // a Web Audio tap (and a forwarded track) receives decoded samples.
    const element = new Audio();
    element.srcObject = stream;
    element.volume = 0;
    elements.push(element);
    void element.play().catch(error => errors.push(String(error)));
  }
  const input = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const mute = ctx.createGain();
  mute.gain.value = 0;
  input.connect(analyser).connect(mute).connect(ctx.destination);
  nodes.push(input, analyser, mute);
  const state: Tap = { label, onsets: [], frequencies: [], rms: 0, high: false };
  taps.push(state);
  const samples = new Float32Array(analyser.fftSize);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  timers.push(setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    state.rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
    const high = state.rms > 0.025;
    if (high && !state.high) {
      state.onsets.push(performance.timeOrigin + performance.now());
      analyser.getFloatFrequencyData(spectrum);
      let peak = 1;
      for (let i = 2; i < spectrum.length; i++) if (spectrum[i] > spectrum[peak]) peak = i;
      state.frequencies.push(peak * ctx.sampleRate / analyser.fftSize);
    }
    if (high || state.rms < 0.008) state.high = high;
  }, 5));
}
function opus(sdp: string): string {
  if (!config.dtx) return sdp;
  const payloads = [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000/gi)].map(m => m[1]);
  return sdp.replace(/^a=fmtp:(\d+) (.*)$/gm, (line, id: string, value: string) => {
    if (!payloads.includes(id)) return line;
    return `a=fmtp:${id} ${value.replace(/;?usedtx=\d/g, '').trim()};usedtx=1`;
  });
}
function transform(target: RTCRtpSender | RTCRtpReceiver, role: 'send' | 'receive'): void {
  const Ctor = host.RTCRtpScriptTransform;
  if (!Ctor) throw new Error('RTCRtpScriptTransform unavailable');
  (target as unknown as Transformable).transform = new Ctor(worker, {
    role, mode: config.id > 0 && config.id < config.hops ? config.mode : 'track',
  });
}
const lab = {
  async init(value: LabConfig) {
    config = value;
    ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    worker = new Worker('/audio-transform.js', { type: 'module' });
    worker.onerror = e => errors.push(e.message);
    const tone = ctx.createOscillator();
    tone.frequency.value = 750;
    gain = ctx.createGain();
    gain.gain.value = 0;
    const destination = ctx.createMediaStreamDestination();
    destination.channelCount = 1;
    tone.connect(gain).connect(destination);
    tone.start();
    nodes.push(tone, gain, destination);
    local = destination.stream.getAudioTracks()[0];
    tap(local, 'source');
    if (config.mode === 'datachannel') {
      datagram = await createDatagramAudio(ctx, config.id, error => errors.push(error));
      if (config.id === 0) gain.connect(datagram.input);
      else tap(datagram.output, `peer-${config.id - 1}`);
    }
    return { scriptTransform: Boolean(host.RTCRtpScriptTransform), sampleRate: ctx.sampleRate };
  },
  create(peer: number, sendFrom: number | 'source' | null) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pcs.set(peer, pc);
    if (datagram) {
      datagram.attach(peer, pc.createDataChannel('research-audio', {
        negotiated: true, id: 0, ordered: false, maxRetransmits: 0,
      }));
      return;
    }
    pc.ontrack = event => {
      tracks.set(peer, event.track);
      transform(event.receiver, 'receive');
      tap(event.track, `peer-${peer}`);
    };
    if (sendFrom !== null) {
      const track = sendFrom === 'source' ? local : tracks.get(sendFrom);
      if (!track) throw new Error(`Missing track from ${sendFrom}`);
      const sender = pc.addTrack(track, new MediaStream([track]));
      transform(sender, 'send');
    }
  },
  async offer(peer: number) {
    const pc = pcs.get(peer)!;
    await pc.setLocalDescription(await pc.createOffer());
    return lab.description(peer);
  },
  async answer(peer: number, sdp: RTCSessionDescriptionInit) {
    const pc = pcs.get(peer)!;
    await pc.setRemoteDescription({ ...sdp, sdp: opus(sdp.sdp!) });
    await pc.setLocalDescription(await pc.createAnswer());
    return lab.description(peer);
  },
  async accept(peer: number, sdp: RTCSessionDescriptionInit) {
    await pcs.get(peer)!.setRemoteDescription({ ...sdp, sdp: opus(sdp.sdp!) });
    const sender = pcs.get(peer)!.getSenders().find(s => s.track?.kind === 'audio');
    if (sender) {
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings.map(e => ({ ...e, maxBitrate: 64000 }));
      await sender.setParameters(parameters);
    }
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
  ready() { return [...pcs.values()].every(pc => pc.connectionState === 'connected') && (!datagram || datagram.ready()); },
  hasTrack(peer: number) { return Boolean(datagram) || tracks.has(peer); },
  pulse() {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.4);
  },
  continuous(enabled: boolean) { gain.gain.setValueAtTime(enabled ? 0.15 : 0, ctx.currentTime); },
  clear() { for (const state of taps) { state.onsets = []; state.frequencies = []; } },
  async snapshot() {
    const reports = await Promise.all([...pcs.values()].map(pc => pc.getStats()));
    const media = reports.flatMap(r => [...r.values()].filter(s =>
      (s.type === 'inbound-rtp' || s.type === 'outbound-rtp') && s.kind === 'audio'));
    const workerStats = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Transform metrics deadline exceeded')), 3000);
      worker.onmessage = e => { clearTimeout(timeout); resolve(e.data); };
      worker.postMessage('snapshot');
    });
    return { at: performance.timeOrigin + performance.now(), taps, media,
      workerStats: datagram ? { ...workerStats as object, hashes: datagram.metrics.hashes } : workerStats,
      datagram: datagram?.metrics, errors,
      pcs: [...pcs.values()].map(pc => ({ state: pc.connectionState,
        localSdp: pc.localDescription?.sdp, remoteSdp: pc.remoteDescription?.sdp })) };
  },
  async close() {
    timers.forEach(clearInterval);
    for (const pc of pcs.values()) pc.close();
    local.stop();
    worker.terminate();
    datagram?.close();
    nodes.forEach(node => node.disconnect());
    for (const element of elements) { element.pause(); element.srcObject = null; }
    await ctx.close();
  },
};
host.lab = lab;
