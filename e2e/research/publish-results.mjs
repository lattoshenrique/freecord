/** Export only synthetic benchmark shape. Never publish SDP, ICE addresses, or raw browser state. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const audio = await read(process.env.AUDIO_RESULT ?? '/tmp/freecord-audio-matrix.json');
const topology = await read(process.env.TOPOLOGY_RESULT ?? '/tmp/freecord-topology-research.json');
const sparse = await read(process.env.SPARSE_RESULT ?? '/tmp/freecord-sparse-research.json');
const additional = await Promise.all(process.argv.slice(2).map(read));
const validation = process.env.VALIDATION_RESULT ? await read(process.env.VALIDATION_RESULT) : { status: 'not provided' };
const q = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? null;
const groups = new Map();
for (const run of audio.runs) {
  const key = `${run.mode}:${run.hops}${run.dtx ? ':dtx' : ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(run);
}
const result = {
  schemaVersion: 1, sourceBaseCommit: audio.sha, measuredAt: audio.at, browser: audio.browser,
  hardware: audio.hardware, releaseScope: 'Experimental research only. Production room limit remains 20. Sparse media is not enabled in product rooms.',
  validation,
  audioConditions: audio.conditions,
  audio: [...groups].map(([name, runs]) => {
    const valid = runs.filter(run => run.pass && run.sourceOnsets === run.sinkOnsets && run.onsetMs.values.every(ms => ms >= 0));
    const delays = valid.flatMap(run => run.onsetMs.values);
    return { name, runs: runs.length, passed: runs.filter(run => run.pass).length,
      latencyValidRuns: valid.length, onsetP50Ms: q(delays, .5), onsetP95Ms: q(delays, .95),
      medianCpuCores: q(runs.map(run => run.cpuCores).filter(Number.isFinite), .5),
      silenceSourcePps: q(runs.flatMap(run => run.silence?.filter(s => s.peer === 0).map(s => s.pps) ?? []), .5),
      silenceSourceKbps: q(runs.flatMap(run => run.silence?.filter(s => s.peer === 0).map(s => s.kbps) ?? []), .5),
      failedPulseCounts: runs.filter(run => !run.pass).map(run => ({ source: run.sourceOnsets, listener: run.sinkOnsets })),
    };
  }),
  latencyCaveat: 'Latency percentiles include only repetitions with exact, correctly aligned pulse counts. Failed repetitions remain explicit and disqualify a candidate. Tap onset excludes physical capture and hardware playback.',
  additionalProbes: additional.map(record => ({ engine: record.engine, browser: record.browser, at: record.at,
    runs: record.runs.map(run => ({ mode: run.mode, hops: run.hops, dtx: run.dtx, passed: run.pass,
      failedToInitialize: Boolean(run.error), sourcePulses: run.sourceOnsets, listenerPulses: run.sinkOnsets,
      onsetMs: run.onsetMs, payloadMatchRatio: run.payloadMatchRatio,
      counters: run.snapshots?.map(snapshot => ({ received: snapshot.workerStats.received,
        writerAccepted: snapshot.workerStats.sent, substituted: snapshot.workerStats.substituted,
        emptyInputBlocks: snapshot.datagram?.emptyInputBlocks })) })),
  })),
  topologyConditions: topology.conditions, topology: topology.records,
  sparseConditions: sparse.conditions,
  sparse: sparse.runs.map(run => ({ participants: run.n, sources: run.sourceCount, passed: run.pass,
    browserInstances: run.browserCount ?? 1, decoding: run.decode ?? true, batching: run.batch ?? false,
    setupMs: run.setupMs, edges: run.edges, maxDegree: run.maxDegree, minDeliveryRatio: run.minDeliveryRatio,
    cpuCores: run.cpuCores, error: run.error,
    totals: run.peers ? { decodedFrames: run.peers.reduce((n, p) => n + p.sources.reduce((s, v) => s + v.frames, 0), 0),
      selfReturned: run.peers.reduce((n, p) => n + p.metrics.selfReturned, 0),
      dropped: run.peers.reduce((n, p) => n + p.metrics.dropped, 0),
      duplicates: run.peers.reduce((n, p) => n + p.metrics.duplicates, 0),
      invalid: run.peers.reduce((n, p) => n + p.metrics.invalid, 0),
      errors: run.errors.length + run.peers.reduce((n, p) => n + p.errors.length, 0) } : null,
  })),
};
const target = new URL('../../web/public/research/p2p-audio.json', import.meta.url);
// The path is repository-relative, never supplied by network input.
await mkdir(new URL('.', target), { recursive: true });
await writeFile(target, JSON.stringify(result, null, 2) + '\n');
console.log(`Exported ${result.audio.length} audio cohorts and ${result.sparse.length} sparse scenarios`);
