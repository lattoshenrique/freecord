import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { buildConnectivity, allocateMediaRoutes } from '../../server/dist/domain/media-topology.js';
import { computeScreenTree } from '../../server/dist/domain/screen-tree.js';

const records = [];
for (const n of [5, 10, 20, 30, 50, 100, 200]) {
  const ids = Array.from({ length: n }, (_, i) => `peer-${i}`);
  for (const s of [...new Set([1, 4, 10, 20, n].filter(s => s <= n))]) {
    const sources = ids.slice(0, s);
    const trees = sources.map(source => computeScreenTree(source, ids));
    const union = new Map(ids.map(id => [id, new Set()]));
    const copies = new Map(ids.map(id => [id, 0]));
    for (const tree of trees) for (const [id, route] of tree) {
      copies.set(id, copies.get(id) + route.children.length);
      for (const child of route.children) { union.get(id).add(child); union.get(child).add(id); }
    }
    records.push({ n, sources: s, mode: 'independent-screen-trees',
      maxDegree: Math.max(...[...union.values()].map(v => v.size)),
      edges: [...union.values()].reduce((a, v) => a + v.size, 0) / 2,
      maxCopies: Math.max(...copies.values()) });
    for (let seed = 0; seed < 5; seed++) for (const degree of [6, 8]) {
      const graphStart = performance.now();
      const graph = buildConnectivity(ids, degree, undefined, String(seed));
      const graphMs = performance.now() - graphStart;
      for (const balanced of [false, true]) {
        // First measure unconstrained demand, then verify that its measured cap
        // is a hard admission constraint (separate from an upload measurement).
        const capacities = new Map(ids.map(id => [id, { maxOutgoingCopies: n * s }]));
        const start = performance.now();
        const plan = allocateMediaRoutes(graph, sources, capacities, balanced);
        const routeMs = performance.now() - start;
        if (!plan.ok) throw new Error(`Unexpected disconnected plan: ${JSON.stringify(plan)}`);
        const maxCopies = Math.max(...[...plan.load.values()].map(v => v.outgoingCopies));
        const bounded = allocateMediaRoutes(graph, sources, new Map(ids.map(id => [id, { maxOutgoingCopies: maxCopies }])), balanced);
        if (!bounded.ok) throw new Error('Measured copy budget was not reproducible');
        records.push({ n, sources: s, mode: balanced ? 'overlay-balanced' : 'overlay-unbalanced', seed, degree,
          maxDegree: Math.max(...[...graph.neighbors.values()].map(v => v.size)),
          edges: [...graph.neighbors.values()].reduce((a, v) => a + v.size, 0) / 2,
          maxCopies, meanCopies: s * (n - 1) / n,
          maxRelayedSources: Math.max(...[...plan.load.values()].map(v => v.relayedSources)),
          maxDepth: Math.max(...plan.routes.flatMap(r => [...r.depth.values()])), graphMs, routeMs });
      }
    }
  }
}
const result = { sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  at: new Date().toISOString(), conditions: 'Pure graph experiment, five deterministic seeds; no media, CPU codec, bandwidth or room-capacity claim.', records };
await writeFile(process.env.OUTPUT ?? '/tmp/freecord-topology-research.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(records.filter(r => [50, 100, 200].includes(r.n) && r.sources === r.n && (r.seed === 0 || r.seed === undefined)), null, 2));
