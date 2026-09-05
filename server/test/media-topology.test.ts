import { describe, expect, it } from 'vitest';
import { allocateMediaRoutes, buildConnectivity } from '../src/domain/media-topology.js';

const peers = (n: number) => Array.from({ length: n }, (_, i) => `peer-${i}`);
const capacities = (ids: string[], copies: number) => new Map(ids.map(id => [id, { maxOutgoingCopies: copies }]));
const edges = (graph: ReturnType<typeof buildConnectivity>) => new Set([...graph.neighbors].flatMap(([a, neighbors]) =>
  [...neighbors].filter(b => a < b).map(b => `${a}/${b}`)));

describe('research media topology', () => {
  for (const n of [1, 5, 10, 20, 30, 50, 100, 200]) it(`reaches every listener at ${n} peers without an N-1 degree`, () => {
    const ids = peers(n);
    const graph = buildConnectivity(ids);
    expect(Math.max(...[...graph.neighbors.values()].map(v => v.size))).toBeLessThanOrEqual(6);
    const plan = allocateMediaRoutes(graph, ids, capacities(ids, n * 3));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.routes).toHaveLength(n);
    for (const route of plan.routes) {
      expect(route.parent.size).toBe(n);
      expect(route.parent.get(route.sourceId)).toBe(null);
      for (const [id, parent] of route.parent) if (parent !== null) {
        expect(graph.neighbors.get(id)!.has(parent)).toBe(true);
        expect(route.depth.get(id)).toBe(route.depth.get(parent)! + 1);
      }
    }
    expect([...plan.load.values()].reduce((n, l) => n + l.outgoingCopies, 0)).toBe(n * (n - 1));
  });
  it('keeps topology independent of media activity and participant ordering', () => {
    expect(buildConnectivity(peers(50))).toEqual(buildConnectivity(peers(50).reverse()));
    const graph = buildConnectivity(peers(50));
    const before = [...edges(graph)];
    for (const count of [1, 4, 10, 20, 50]) {
      expect(allocateMediaRoutes(graph, peers(count), capacities(peers(50), 150)).ok).toBe(true);
    }
    expect([...edges(graph)]).toEqual(before);
  });
  it('preserves existing connections on a join and heals multiple departures', () => {
    const first = buildConnectivity(peers(50));
    const joined = buildConnectivity(peers(51), 6, first);
    expect([...edges(first)].filter(e => !edges(joined).has(e)).length).toBeLessThanOrEqual(1);
    expect(joined.generation).toBe(first.generation + 1);
    const survivors = peers(51).filter((_, i) => ![0, 3, 17].includes(i));
    const repaired = buildConnectivity(survivors, 6, joined);
    expect(allocateMediaRoutes(repaired, survivors, capacities(survivors, 150)).ok).toBe(true);
    expect([...repaired.neighbors.values()].every(n => n.size <= 6)).toBe(true);
  });
  it('rejects insufficient capacity explicitly instead of losing selected sources', () => {
    const ids = peers(10);
    expect(allocateMediaRoutes(buildConnectivity(ids), ids, capacities(ids, 1))).toMatchObject({ ok: false, reason: 'capacity' });
  });
  it('admits a batch of newcomers into an already saturated overlay', () => {
    const before = buildConnectivity(peers(50));
    const after = buildConnectivity(peers(60), 6, before);
    expect(allocateMediaRoutes(after, peers(60), capacities(peers(60), 180)).ok).toBe(true);
    expect([...after.neighbors.values()].every(n => n.size <= 6)).toBe(true);
    expect([...edges(before)].filter(edge => !edges(after).has(edge)).length).toBeLessThanOrEqual(10);
  });
  it('can give an individual peer zero forwarding work when paths permit it', () => {
    const ids = peers(5);
    const budget = capacities(ids, 20);
    budget.set('peer-4', { maxOutgoingCopies: 0 });
    const plan = allocateMediaRoutes(buildConnectivity(ids), ['peer-0'], budget);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.load.get('peer-4')!.outgoingCopies).toBe(0);
  });
  it('does not return a partial plan for a disconnected overlay', () => {
    const ids = peers(2);
    const graph = { generation: 1, neighbors: new Map(ids.map(id => [id, new Set<string>()])) };
    expect(allocateMediaRoutes(graph, ['peer-0'], capacities(ids, 10))).toMatchObject({ ok: false, reason: 'disconnected' });
  });
  it('rejects malformed IDs, degree, generations and budgets', () => {
    expect(() => buildConnectivity(['a', 'a'])).toThrow();
    expect(() => buildConnectivity([''])).toThrow();
    expect(() => buildConnectivity(peers(201))).toThrow();
    expect(() => buildConnectivity(peers(5), 9)).toThrow();
    const graph = buildConnectivity(peers(5));
    expect(() => buildConnectivity(peers(5), 6, { ...graph, generation: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => allocateMediaRoutes(graph, ['peer-0'], capacities(peers(5), NaN))).toThrow();
    expect(() => allocateMediaRoutes(graph, ['absent'], capacities(peers(5), 10))).toThrow();
  });
});
