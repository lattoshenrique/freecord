// Local-only quality experiment over the actual SparseAudio capture and playout.
// Variants alter the served experiment module, never the product source file.
// Synthetic PCM only, fresh browser profile, bounded eight-second recording.
// No microphone capture, remote target, production load, or acoustic quality claim.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'package.json');
const { chromium } = require('playwright');
const ts = require('typescript');
const variant = process.env.QUALITY_VARIANT ?? 'baseline';
if (!['baseline', 'ordered20', 'ordered60'].includes(variant)) throw new Error('Unknown variant');
const engine = process.env.BROWSER ?? 'chromium';
if (!['chromium', 'brave'].includes(engine)) throw new Error('BROWSER must be chromium or brave');
const cases = (process.env.QUALITY_CASES ?? 'clean,jitter,stall').split(',');
if (cases.some(value => !['clean', 'jitter', 'stall'].includes(value))) throw new Error('Unknown quality scenario');
const destination = process.env.OUTPUT ?? `/tmp/freecord-playout-${engine}-${variant}.json`;
const scripts = new Map();
for (const name of ['sparse-audio', 'audio-packet', 'audio-playout', 'audio-capture-worklet']) {
  let source = await readFile(root + `web/src/lib/${name}.ts`, 'utf8');
  if (name === 'sparse-audio' && variant !== 'baseline') {
    for (const seam of ['decoded: number;', 'source.decoder = new AudioDecoder', 'const { packet } = source.queue.shift()!;', 'source.queue[0]!.arrived >= 0.02']) {
      if (source.split(seam).length !== 2) throw new Error('Production queue changed; update the explicit experiment variant');
    }
    source = source.replace('decoded: number;', 'decoded: number; lastSubmitted: number;')
      .replace('source.decoder = new AudioDecoder', 'source.lastSubmitted = -Infinity; source.decoder = new AudioDecoder')
      .replace('const { packet } = source.queue.shift()!;', 'const { packet } = source.queue.shift()!; if (packet.timestamp <= source.lastSubmitted) { this.metrics.dropped++; continue; } source.lastSubmitted = packet.timestamp;');
    if (variant === 'ordered60') source = source.replace('source.queue[0]!.arrived >= 0.02', 'source.queue[0]!.arrived >= 0.06');
  }
  source = source.replace("import captureUrl from './audio-capture-worklet.ts?worker&url';", "const captureUrl = '/audio-capture-worklet.js';")
    .replaceAll("from './audio-packet'", "from './audio-packet.js'").replaceAll("from './audio-playout'", "from './audio-playout.js'")
    .replaceAll('import.meta.env.VITE_SPARSE_AUDIO_RESEARCH_20', "'0'").replaceAll('import.meta.env.VITE_SPARSE_AUDIO', "'1'");
  scripts.set(`/${name}.js`, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
scripts.set('/lab.js', `
import { SparseAudio } from './sparse-audio.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { const end = performance.now() + 10000; while (!fn()) { if (performance.now() > end) throw new Error('Readiness deadline'); await delay(20); } }
window.run = async scenario => {
  window.stage = 'initial audio context';
  const errors = [], captured = [], starts = [], caps = {}, ready = new Set();
  const pcs = [new RTCPeerConnection(), new RTCPeerConnection()];
  const channels = pcs.map(pc => pc.createDataChannel('audio-v1', { negotiated: true, id: 2, ordered: false, maxRetransmits: 0 }));
  const input = new AudioContext({ sampleRate: 48000 }); await input.resume();
  const tone = input.createOscillator(); tone.frequency.value = 220;
  const gain = input.createGain(); gain.gain.value = 0.1;
  const output = input.createMediaStreamDestination(); tone.connect(gain).connect(output); tone.start();
  const meshes = pcs.map((pc, i) => ({ outputs: new Map(), peerIds: () => [i ? 'a' : 'b'],
    getAudioChannel: () => channels[i], getPeerConnection: () => pc, ensurePeer: () => pc,
    setConnectivity() {}, setVoiceRtp() {}, setLogicalAudio(value) { this.outputs = value; },
  }));
  const audio = [];
  const send = id => event => {
    if (event.t === 'audio-capability') caps[id] = event.capability;
    if (event.t === 'audio-ready') { ready.add(id); if (ready.size === 2) for (const engine of audio) engine.commit(1); }
  };
  let tap, recorder, silent, blocker;
  try {
    window.stage = 'sparse A';
    audio.push(await SparseAudio.create('a', meshes[0], output.stream, send('a')));
    window.stage = 'sparse B';
    audio.push(await SparseAudio.create('b', meshes[1], null, send('b')));
    if (audio.some(x => !x) || !caps.a || !caps.b) throw new Error('Sparse capability unavailable');
    const nativeStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(at = 0, ...args) {
      if (this.context === audio[1].ctx) starts.push({ at, now: this.context.currentTime, duration: this.buffer?.duration ?? 0, rate: this.playbackRate.value, sampleRate: this.buffer?.sampleRate });
      return nativeStart.call(this, at, ...args);
    };
    window.stage = 'ICE';
    const offer = await pcs[0].createOffer(); await pcs[0].setLocalDescription(offer);
    await until(() => pcs[0].iceGatheringState === 'complete');
    await pcs[1].setRemoteDescription(pcs[0].localDescription);
    await pcs[1].setLocalDescription(await pcs[1].createAnswer());
    await until(() => pcs[1].iceGatheringState === 'complete');
    await pcs[0].setRemoteDescription(pcs[1].localDescription);
    await until(() => channels.every(c => c.readyState === 'open'));
    if (scenario === 'jitter') {
      const receive = channels[1].onmessage; let seq = 0;
      channels[1].onmessage = event => setTimeout(() => receive.call(channels[1], event), [0, 60, 10, 30][seq++ % 4]);
    }
    const plan = { generation: 1, mode: 'sparse', peers: ['a', 'b'], aware: ['a', 'b'], sources: caps,
      neighbors: { a: ['b'], b: ['a'] }, parents: { a: { a: null, b: 'a' }, b: { b: null, a: 'b' } } };
    window.stage = 'preparing';
    for (const engine of audio) await engine.prepare(plan);
    await until(() => ready.size === 2 && meshes[1].outputs.has('a'));
    window.stage = 'tap';
    tap = new AudioContext({ sampleRate: 48000 }); await tap.resume();
    await tap.audioWorklet.addModule('/audio-capture-worklet.js');
    recorder = new AudioWorkletNode(tap, 'freecord-audio-capture');
    silent = tap.createGain(); silent.gain.value = 0;
    tap.createMediaStreamSource(meshes[1].outputs.get('a').stream).connect(recorder).connect(silent).connect(tap.destination);
    // Record at most 8 seconds. The tap uses the production worklet credit bound.
    recorder.port.onmessage = event => { recorder.port.postMessage('ack'); if (captured.length < 384000) captured.push(...event.data.samples); };
    if (scenario === 'stall') blocker = setInterval(() => { const end = performance.now() + 80; while (performance.now() < end) {} }, 500);
    window.stage = 'recording';
    await delay(8000);
    if (blocker) clearInterval(blocker);
    const metrics = audio.map(engine => engine.snapshot());
    return { scenario, captured, starts, metrics, errors, sampleRate: tap.sampleRate };
  } finally {
    if (blocker) clearInterval(blocker);
    recorder?.port.close(); recorder?.disconnect(); silent?.disconnect(); await tap?.close();
    for (const engine of audio) engine?.close(); for (const pc of pcs) pc.close();
    tone.stop(); await input.close();
  }
};
`);
const server = createServer((req, res) => { res.setHeader('content-type', scripts.has(req.url) ? 'text/javascript' : 'text/html'); res.end(scripts.get(req.url) ?? '<script type="module" src="/lab.js"></script>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const result = { variant, engine, sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), browser: null, at: new Date().toISOString(), sourceHz: 220, conditions: 'Actual SparseAudio capture/codec/playout, two loopback PeerConnections, one host, synthetic tone, no microphone/APM or hardware speaker. Jitter delays 0/60/10/30ms; stall blocks main thread 80ms every 500ms.', runs: [] };
try {
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ...(engine === 'brave' ? { executablePath: process.env.BRAVE_EXECUTABLE ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
  result.browser = browser.version();
  for (const scenario of cases) {
    const context = await browser.newContext(); const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => window.run);
      await page.mouse.click(10, 10);
      let timeout;
      const run = JSON.parse(await Promise.race([page.evaluate(async scenario => JSON.stringify(await window.run(scenario)), scenario), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Experiment deadline exceeded')), 25000); })]).finally(() => clearTimeout(timeout)));
      let end = 0, overlaps = 0, largestOverlapMs = 0;
      for (const s of run.starts) { if (s.at < end - 0.0001) { overlaps++; largestOverlapMs = Math.max(largestOverlapMs, (end - s.at) * 1000); } end = Math.max(end, s.at + s.duration); }
      const peaks = []; let silentWindows = 0;
      for (let start = 4800; start + 4800 <= run.captured.length; start += 4800) {
        const samples = run.captured.slice(start, start + 4800);
        if (Math.sqrt(samples.reduce((s,x) => s + x*x, 0) / samples.length) < 0.01) { silentWindows++; continue; }
        let peak = 0, peakHz = 0;
        for (let hz = 95; hz <= 350; hz++) {
          const w = 2 * Math.cos(2 * Math.PI * hz / 48000); let q1 = 0, q2 = 0;
          for (let i = 0; i < samples.length; i++) { const q = samples[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (samples.length - 1))) + w*q1 - q2; q2 = q1; q1 = q; }
          const power = q1*q1 + q2*q2 - w*q1*q2; if (power > peak) { peak = power; peakHz = hz; }
        }
        peaks.push(peakHz);
      }
      const summary = { scenario, windows: peaks.length, silentWindows, dominantHz: { min: Math.min(...peaks), max: Math.max(...peaks), median: [...peaks].sort((a,b) => a-b)[Math.floor(peaks.length / 2)] }, overlaps, largestOverlapMs, rates: [...new Set(run.starts.map(s => s.rate))], sampleRates: [...new Set(run.starts.map(s => s.sampleRate))], metrics: run.metrics };
      summary.pass = peaks.length >= 60 && silentWindows === 0 && peaks.every(hz => Math.abs(hz - 220) <= 2.2) && overlaps === 0 && run.metrics.every(m => m.mode === 'sparse' && m.fallback === null);
      result.runs.push(summary); console.log(JSON.stringify(summary));
      if (!summary.pass) process.exitCode = 1;
    } catch (error) { result.runs.push({ scenario, error: String(error) }); console.error(error); process.exitCode = 1; }
    finally { await context.close(); }
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await writeFile(destination, JSON.stringify(result, null, 2)); }
