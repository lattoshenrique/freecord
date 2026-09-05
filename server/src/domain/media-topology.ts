/**
 * Research-only connectivity and routing primitives. Room signaling does not
 * activate them yet: graph feasibility is not a browser/media capacity proof.
 * No browser APIs, media bytes, device profiles, or persisted telemetry.
 */
export interface ConnectivityTopology {
  generation: number;
  neighbors: ReadonlyMap<string, ReadonlySet<string>>;
}
export interface MediaRoute {
  sourceId: string;
  parent: ReadonlyMap<string, string | null>;
  depth: ReadonlyMap<string, number>;
}
export interface RelayCapacity { maxOutgoingCopies: number }
export interface RelayLoad { outgoingCopies: number; relayedSources: number }
export type RouteAllocation =
  | { ok: true; routes: MediaRoute[]; load: ReadonlyMap<string, RelayLoad> }
  | { ok: false; reason: 'capacity' | 'disconnected'; sourceId: string; peerId: string };

function rank(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Retain healthy edges; graft newcomers into a saturated graph instead of rebuilding it. */
export function buildConnectivity(
  peers: readonly string[], maxDegree = 6, previous?: ConnectivityTopology, seed = 'freecord',
): ConnectivityTopology {
  if (!Number.isInteger(maxDegree) || maxDegree < 2 || maxDegree > 8) throw new Error('Degree must be 2..8');
  if (peers.length > 200 || peers.some(id => !id || id.length > 128) || new Set(peers).size !== peers.length) {
    throw new Error('Expected at most 200 unique, nonempty peer IDs');
  }
  const generation = (previous?.generation ?? 0) + 1;
  if (!Number.isSafeInteger(generation) || generation < 1) throw new Error('Invalid topology generation');
  const ids = [...peers].sort();
  const graph = new Map(ids.map(id => [id, new Set<string>()]));
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i]!, ids[j]!]);
  pairs.sort((a, b) => rank(JSON.stringify([seed, ...a])) - rank(JSON.stringify([seed, ...b])) ||
    a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const add = (a: string, b: string) => { graph.get(a)!.add(b); graph.get(b)!.add(a); };
  const remove = (a: string, b: string) => { graph.get(a)!.delete(b); graph.get(b)!.delete(a); };
  const available = (id: string) => graph.get(id)!.size < maxDegree;
  if (previous) for (const [a, b] of pairs) {
    if (previous.neighbors.get(a)?.has(b)) {
      if (!previous.neighbors.get(b)?.has(a)) throw new Error('Previous topology must be symmetric');
      if (!available(a) || !available(b)) throw new Error('Previous topology exceeds degree budget');
      add(a, b);
    }
  }
  // A newcomer needs two spare endpoints. Replacing a--b with a--new--b
  // preserves connectivity even when a--b was a bridge, with one removed edge.
  if (previous) for (const id of ids) {
    if (graph.get(id)!.size || ids.some(other => other !== id && previous.neighbors.has(other) &&
      graph.get(other)!.size > 0 && available(other))) continue;
    // Attach each newcomer to established participants. Chaining an entire
    // join burst behind the first newcomer creates a narrow relay bottleneck.
    const edge = pairs.find(([a, b]) => previous.neighbors.has(a) && previous.neighbors.has(b) && graph.get(a)!.has(b));
    if (edge) { remove(...edge); add(edge[0], id); add(id, edge[1]); }
  }
  const components = new Map(ids.map(id => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (components.get(root) !== root) root = components.get(root)!;
    while (components.get(id) !== id) { const next = components.get(id)!; components.set(id, root); id = next; }
    return root;
  };
  const union = (a: string, b: string) => components.set(find(a), find(b));
  for (const [a, b] of pairs) if (graph.get(a)!.has(b)) union(a, b);
  for (const [a, b] of pairs) {
    if (find(a) !== find(b) && available(a) && available(b)) { add(a, b); union(a, b); }
  }
  if (new Set(ids.map(find)).size > 1) throw new Error('No connected overlay within the degree budget');
  // Fill lower-degree vertices first. These extra edges provide short paths
  // and alternatives; media routes below remain acyclic for each source.
  for (let degree = 2; degree <= maxDegree; degree++) for (const [a, b] of pairs) {
    if (!graph.get(a)!.has(b) && graph.get(a)!.size < degree && graph.get(b)!.size < degree) add(a, b);
  }
  return { generation, neighbors: graph };
}

/**
 * Allocate shortest-hop trees together, selecting a parent by global normalized
 * outgoing load. Capacity is a hard bound. Failure returns no partial room plan;
 * callers must try other paths or renegotiate budgets/bitrates, never silently
 * omit a source. A shortest-path allocation failure is not an infeasibility proof.
 */
export function allocateMediaRoutes(
  topology: ConnectivityTopology, sources: readonly string[],
  capacities: ReadonlyMap<string, RelayCapacity>, balance = true,
): RouteAllocation {
  const graph = topology.neighbors;
  if (new Set(sources).size !== sources.length || sources.some(id => !graph.has(id))) throw new Error('Invalid sources');
  for (const [id, neighbors] of graph) {
    const capacity = capacities.get(id)?.maxOutgoingCopies;
    if (capacity === undefined || !Number.isSafeInteger(capacity) || capacity < 0) throw new Error('Invalid relay capacity');
    if (neighbors.has(id) || [...neighbors].some(other => !graph.get(other)?.has(id))) throw new Error('Invalid overlay edge');
  }
  const load = new Map([...graph.keys()].map(id => [id, { outgoingCopies: 0, relayedSources: 0 }]));
  const routes: MediaRoute[] = [];
  for (const sourceId of [...sources].sort()) {
    const depth = new Map([[sourceId, 0]]);
    const queue = [sourceId];
    for (let i = 0; i < queue.length; i++) for (const neighbor of graph.get(queue[i]!)!) {
      if (!depth.has(neighbor)) { depth.set(neighbor, depth.get(queue[i]!)! + 1); queue.push(neighbor); }
    }
    for (const id of graph.keys()) if (!depth.has(id)) return { ok: false, reason: 'disconnected', sourceId, peerId: id };
    const parent = new Map<string, string | null>([[sourceId, null]]);
    const candidates = (id: string) => [...graph.get(id)!].filter(p => depth.get(p)! === depth.get(id)! - 1);
    const receivers = queue.slice(1).sort((a, b) => depth.get(a)! - depth.get(b)! ||
      candidates(a).length - candidates(b).length || a.localeCompare(b));
    const relays = new Set<string>();
    for (const id of receivers) {
      const eligible = candidates(id).filter(p => load.get(p)!.outgoingCopies < capacities.get(p)!.maxOutgoingCopies);
      eligible.sort((a, b) => {
        const normalized = (peer: string) => load.get(peer)!.outgoingCopies / capacities.get(peer)!.maxOutgoingCopies;
        return (balance ? normalized(a) - normalized(b) : 0) ||
          rank(JSON.stringify([sourceId, id, a])) - rank(JSON.stringify([sourceId, id, b])) || a.localeCompare(b);
      });
      const selected = eligible[0];
      if (!selected) return { ok: false, reason: 'capacity', sourceId, peerId: id };
      parent.set(id, selected);
      load.get(selected)!.outgoingCopies++;
      if (selected !== sourceId) relays.add(selected);
    }
    for (const relay of relays) load.get(relay)!.relayedSources++;
    routes.push({ sourceId, parent, depth });
  }
  return { ok: true, routes, load };
}
