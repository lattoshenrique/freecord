import { chromium } from 'playwright';
import ts from 'typescript';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { buildConnectivity, allocateMediaRoutes } from '../../server/dist/domain/media-topology.js';

const output = process.env.OUTPUT ?? '/tmp/freecord-sparse-research.json';
const decode = process.env.DECODE !== '0', batch = process.env.BATCH === '1';
const browserCount = Number(process.env.BROWSERS ?? 1);
if (!Number.isInteger(browserCount) || browserCount < 1 || browserCount > 10) throw new Error('BROWSERS must be 1..10');
const cases = (process.env.CASES ?? '5:1,10:4,20:4,50:1,50:4,50:10,50:50').split(',').map(item => {
  const [n, sources] = item.split(':').map(Number);
  if (!Number.isInteger(n) || n < 2 || n > 50 || !Number.isInteger(sources) || sources < 1 || sources > n) throw new Error('Expected N:S, 2 <= N <= 50 and 1 <= S <= N');
  return { n, sourceCount: sources };
});
const script = ts.transpileModule(await readFile(new URL('sparse-peer.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/peer.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/peer.js' ? script : '<!doctype html><title>Freecord sparse transport probe</title><script type="module" src="/peer.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browsers = [];
for (let i = 0; i < browserCount; i++) browsers.push(await chromium.launch({ headless: true }));
const sessions = await Promise.all(browsers.map(browser => browser.newBrowserCDPSession()));
const cpu = async () => (await Promise.all(sessions.map(cdp => cdp.send('SystemInfo.getProcessInfo'))))
  .reduce((total, report) => total + report.processInfo.reduce((sum, p) => sum + p.cpuTime, 0), 0);
const results = { at: new Date().toISOString(), decode, batch, browserCount, sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browser: browsers[0].version(),
  conditions: 'Independent browser contexts, real bounded-degree WebRTC connections, unordered maxRetransmits=0 DataChannels, mono 64 kbps Opus. Synthetic PCM is encoded once per source and decoded separately at every listener. No playout, capture/APM, E2EE, TURN, injected impairment, or product room signaling. This is a transport/decoder probe, not 50-user product acceptance.', runs: [] };
try {
  for (const scenario of cases) {
    const contexts = [], pages = [];
    const run = { ...scenario, decode, batch, browserCount, errors: [] }; results.runs.push(run);
    try {
      const ids = Array.from({ length: scenario.n }, (_, i) => `peer-${i}`);
      const graph = buildConnectivity(ids, 8, undefined, '0');
      const plan = allocateMediaRoutes(graph, ids.slice(0, scenario.sourceCount), new Map(ids.map(id => [id, { maxOutgoingCopies: scenario.n * scenario.sourceCount }])));
      if (!plan.ok) throw new Error('No routes');
      const index = id => Number(id.slice(5));
      const setupStart = performance.now();
      for (let id = 0; id < scenario.n; id++) {
        const context = await browsers[id % browsers.length].newContext(); contexts.push(context);
        const page = await context.newPage(); pages.push(page);
        page.on('pageerror', error => run.errors.push(String(error)));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => Boolean(window.sparse));
        const routes = Object.fromEntries(plan.routes.map(route => [index(route.sourceId), {
          parent: route.parent.get(ids[id]) === null ? null : index(route.parent.get(ids[id])),
          children: [...route.parent].filter(([, parent]) => parent === ids[id]).map(([child]) => index(child)),
        }]));
        await page.evaluate(config => window.sparse.init(config), { id, routes, decode, batch, sources: Array.from({ length: scenario.sourceCount }, (_, i) => i) });
      }
      const edges = [...graph.neighbors].flatMap(([a, neighbors]) => [...neighbors].filter(b => a < b).map(b => [index(a), index(b)]));
      // Each PC has its own negotiation; bounded batches avoid a harness-induced signaling storm.
      for (let start = 0; start < edges.length; start += 8) await Promise.all(edges.slice(start, start + 8).map(async ([a, b]) => {
        await pages[a].evaluate(peer => window.sparse.create(peer), b);
        await pages[b].evaluate(peer => window.sparse.create(peer), a);
        const offer = await pages[a].evaluate(peer => window.sparse.offer(peer), b);
        const answer = await pages[b].evaluate(({ peer, offer }) => window.sparse.answer(peer, offer), { peer: a, offer });
        await pages[a].evaluate(({ peer, answer }) => window.sparse.accept(peer, answer), { peer: b, answer });
      }));
      await Promise.all(pages.map(page => page.waitForFunction(() => window.sparse.ready(), null, { timeout: 20000 })));
      run.setupMs = performance.now() - setupStart; run.edges = edges.length;
      const startCpu = await cpu(), start = performance.now();
      await Promise.all(pages.map(page => page.evaluate(() => window.sparse.start())));
      // Deliberate five-second continuous-speaker measurement window.
      await new Promise(resolve => setTimeout(resolve, 5000));
      await Promise.all(pages.map(page => page.evaluate(() => window.sparse.stop())));
      const endCpu = await cpu();
      run.cpuCores = (endCpu - startCpu) / ((performance.now() - start) / 1000);
      await new Promise(resolve => setTimeout(resolve, 500));
      run.peers = await Promise.all(pages.map(page => page.evaluate(() => window.sparse.snapshot())));
      const originated = new Map(run.peers.map(peer => [peer.id, peer.metrics.packetsOriginated]));
      run.minDeliveryRatio = Math.min(...run.peers.flatMap(peer => peer.sources.map(source => source.packets / originated.get(source.source))));
      run.maxDegree = Math.max(...run.peers.map(peer => peer.pcs));
      run.pass = run.errors.length === 0 && run.maxDegree <= 8 && run.minDeliveryRatio >= .99 && run.peers.every(peer =>
        peer.errors.length === 0 && peer.pcs === peer.connected && peer.metrics.dropped === 0 && peer.metrics.selfReturned === 0 && peer.metrics.invalid === 0 &&
        (peer.id >= scenario.sourceCount || peer.metrics.packetsOriginated >= 200) &&
        peer.sources.length === scenario.sourceCount - (peer.id < scenario.sourceCount ? 1 : 0) &&
        (!decode || peer.sources.every(source => source.frames >= 200 && source.voicedFrames >= 190 &&
          Math.abs(source.frequencySum / source.voicedFrames - (600 + source.source * 37)) < 100)));
      console.log(JSON.stringify({ ...scenario, decode, batch, browserCount, pass: run.pass, edges: run.edges, degree: run.maxDegree,
        minDeliveryRatio: run.minDeliveryRatio, cpuCores: run.cpuCores, setupMs: run.setupMs }));
      if (!run.pass) process.exitCode = 1;
    } catch (error) { run.pass = false; run.error = String(error); process.exitCode = 1; console.error(run.error); }
    finally {
      for (const page of pages) await page.evaluate(() => window.sparse?.close()).catch(error => run.errors.push(String(error)));
      for (const context of contexts) await context.close();
      if (run.errors.length) { run.pass = false; process.exitCode = 1; }
      await writeFile(output, JSON.stringify(results, null, 2));
    }
  }
} finally { for (const browser of browsers) await browser.close(); await new Promise(resolve => server.close(resolve)); }
