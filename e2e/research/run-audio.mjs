import { chromium, firefox, webkit } from 'playwright';
import ts from 'typescript';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.OUTPUT ?? '/tmp/freecord-audio-research.json';
const repetitions = Number(process.env.REPEATS ?? 3);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('REPEATS must be 1..10');
const scenarios = (process.env.CASES ?? 'track:1,track:2,track:3,track:4,encoded:2,encoded:3,foreign:2,track:1:dtx,track:2:dtx,encoded:2:dtx').split(',').map(value => {
  const [mode, hops, dtx] = value.split(':');
  if (!['track', 'encoded', 'encoded-inplace', 'clone', 'foreign', 'datachannel'].includes(mode) || !/^[1-4]$/.test(hops) || (dtx && dtx !== 'dtx')) throw new Error(`Invalid case ${value}`);
  if (mode === 'datachannel' && dtx) throw new Error('DataChannel DTX is not implemented');
  return { mode, hops: Number(hops), dtx: dtx === 'dtx' };
});
const scripts = new Map();
for (const name of ['audio-peer', 'audio-transform', 'audio-datagram', 'audio-capture']) {
  const source = await readFile(new URL(`${name}.ts`, import.meta.url), 'utf8');
  scripts.set(`/${name}.js`, ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText);
}
// Always loopback. This harness has no production target or media upload endpoint.
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', scripts.has(req.url) ? 'text/javascript' : 'text/html');
  res.end(scripts.get(req.url) ?? '<!doctype html><title>Freecord local audio experiment</title><script type="module" src="/audio-peer.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error('Unknown BROWSER');
let browser;
const result = { schemaVersion: 1, engine, sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  at: new Date().toISOString(), node: process.version, hardware: { cpu: cpus()[0].model, memoryBytes: totalmem() },
  conditions: 'Independent contexts on one machine; loopback RTP; mono 48 kHz Web Audio synthetic 750 Hz pulses; no capture/APM, TURN or injected impairment. Onset is a 5 ms polled Web Audio tap, not acoustic latency. CPU includes all browser processes. Foreign-frame mode is an expected negative control, not a working transport.', runs: [] };
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] ?? null;
try {
  browser = await browserType.launch({ headless: true,
    ...(engine === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {}),
    ...(engine === 'firefox' ? { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false } } : {}),
  });
  result.browser = browser.version();
  const cdp = engine === 'chromium' ? await browser.newBrowserCDPSession() : null;
  const cpu = async () => cdp ? (await cdp.send('SystemInfo.getProcessInfo')).processInfo.reduce((sum, p) => sum + p.cpuTime, 0) : null;
  for (let repeat = 0; repeat < repetitions; repeat++) {
    // Reverse alternate repetitions to expose order and warm-up bias.
    for (const scenario of repeat % 2 ? [...scenarios].reverse() : scenarios) {
      const contexts = [], pages = [], errors = [];
      const run = { ...scenario, repeat, errors };
      result.runs.push(run);
      try {
        for (let id = 0; id <= scenario.hops; id++) {
          const context = await browser.newContext();
          contexts.push(context);
          const page = await context.newPage();
          pages.push(page);
          page.on('pageerror', error => errors.push(String(error)));
          await page.goto(url);
          await page.waitForFunction(() => Boolean(window.lab));
          await page.evaluate(async value => {
            let deadline;
            try {
              return await Promise.race([window.lab.init(value), new Promise((_, reject) => {
                deadline = setTimeout(() => reject(new Error('Audio initialization deadline exceeded')), 5000);
              })]);
            } finally { clearTimeout(deadline); }
          }, { ...scenario, id });
        }
        for (let i = 0; i < scenario.hops; i++) {
          await pages[i].evaluate(({ next, previous }) => window.lab.create(next, previous), { next: i + 1, previous: i ? i - 1 : 'source' });
          await pages[i + 1].evaluate(previous => window.lab.create(previous, null), i);
          const offer = await pages[i].evaluate(next => window.lab.offer(next), i + 1);
          const answer = await pages[i + 1].evaluate(({ previous, offer }) => window.lab.answer(previous, offer), { previous: i, offer });
          await pages[i].evaluate(({ next, answer }) => window.lab.accept(next, answer), { next: i + 1, answer });
          await pages[i + 1].waitForFunction(previous => window.lab.hasTrack(previous) && window.lab.ready(), i, { timeout: 10000 });
        }
        await Promise.all(pages.map(page => page.waitForFunction(() => window.lab.ready(), null, { timeout: 10000 })));
        await pages[0].evaluate(() => window.lab.continuous(true));
        await pause(1200);
        await pages[0].evaluate(() => window.lab.continuous(false));
        // DTX requires sustained silence, independently from the short pulse gaps.
        await pause(1500);
        const silenceStart = await Promise.all(pages.map(page => page.evaluate(() => window.lab.snapshot())));
        await pause(4000);
        const silenceEnd = await Promise.all(pages.map(page => page.evaluate(() => window.lab.snapshot())));
        await Promise.all(pages.map(page => page.evaluate(() => window.lab.clear())));
        const startCpu = await cpu(), start = performance.now();
        for (let pulse = 0; pulse < 6; pulse++) {
          await pages[0].evaluate(() => window.lab.pulse());
          await pause(1000);
        }
        const endCpu = await cpu();
        const snapshots = await Promise.all(pages.map(page => page.evaluate(() => window.lab.snapshot())));
        const sources = snapshots[0].taps.find(t => t.label === 'source').onsets;
        const sink = snapshots.at(-1).taps.find(t => t.label === `peer-${scenario.hops - 1}`);
        const deltas = sources.map((at, i) => sink.onsets[i] - at);
        run.onsetAlignmentValid = sources.length === sink.onsets.length && deltas.every(ms => Number.isFinite(ms) && ms >= 0);
        const latency = run.onsetAlignmentValid ? deltas : [];
        run.cpuCores = cdp ? (endCpu - startCpu) / ((performance.now() - start) / 1000) : null;
        run.onsetMs = { count: latency.length, p50: quantile(latency, .5), p95: quantile(latency, .95), values: latency };
        run.sourceOnsets = sources.length;
        run.sinkOnsets = sink.onsets.length;
        const known = new Set(snapshots[1].workerStats.hashes);
        const hashes = snapshots.at(-1).workerStats.hashes;
        run.payloadMatchRatio = hashes.length ? hashes.filter(hash => known.has(hash)).length / hashes.length : null;
        run.silence = silenceEnd.map((end, i) => {
          const begin = silenceStart[i];
          const sum = (sample, field) => sample.datagram
            ? (field === 'packetsSent' ? sample.datagram.sent : sample.datagram.bytesSent)
            : sample.media.filter(s => s.type === 'outbound-rtp').reduce((n, s) => n + (s[field] ?? 0), 0);
          const seconds = (end.at - begin.at) / 1000;
          return { peer: i, pps: (sum(end, 'packetsSent') - sum(begin, 'packetsSent')) / seconds,
            kbps: (sum(end, 'bytesSent') - sum(begin, 'bytesSent')) * 8 / 1000 / seconds };
        });
        run.snapshots = snapshots;
        const expectedSink = scenario.mode === 'foreign' ? 0 : 6;
        const transformErrors = snapshots.flatMap(s => s.workerStats.errors);
        const negativeControlValid = scenario.mode !== 'foreign' ||
          (snapshots[1].taps.find(t => t.label === 'peer-0').onsets.length === 6 && snapshots[1].workerStats.substituted > 0);
        run.pass = sources.length === 6 && sink.onsets.length === expectedSink && errors.length === 0
          && snapshots.every(s => s.errors.length === 0) && negativeControlValid
          && transformErrors.length === 0 && (!(scenario.mode.startsWith('encoded') || scenario.mode === 'datachannel') || run.payloadMatchRatio > .98)
          && latency.every(ms => ms >= 0 && ms < 900);
        console.log(JSON.stringify({ ...scenario, repeat, pass: run.pass, latency: run.onsetMs,
          cpuCores: run.cpuCores, payloadMatchRatio: run.payloadMatchRatio, silence: run.silence, transformErrors }));
        if (!run.pass) process.exitCode = 1;
      } catch (error) { run.error = String(error); run.pass = false; process.exitCode = 1; console.error(run.error); }
      finally {
        for (const page of pages) await page.evaluate(() => window.lab?.close()).catch(error => errors.push(String(error)));
        for (const context of contexts) await context.close();
        if (errors.length) { run.pass = false; process.exitCode = 1; }
        await writeFile(output, JSON.stringify(result, null, 2));
      }
    }
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(output, JSON.stringify(result, null, 2));
}
