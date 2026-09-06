import { allocateMediaRoutes, buildConnectivity } from './media-topology.js';

/** Ephemeral identity, bound to the authenticated signaling seat. No device profile. */
export interface AudioCapability { publicKey: string; streamId: string | null }
export interface AudioPlan {
  generation: number;
  mode: 'mesh' | 'sparse';
  peers: string[];
  aware: string[];
  sources: Record<string, AudioCapability>;
  neighbors: Record<string, string[]>;
  parents: Record<string, Record<string, string | null>>;
}
export interface AudioNetworkState {
  capabilities: Record<string, AudioCapability | null>;
  plan: AudioPlan;
  ready: string[];
  committed: boolean;
}
export type AudioEvent =
  | { t: 'audio-capability'; capability: AudioCapability | null }
  | { t: 'audio-ready'; generation: number };
export type AudioUpdate =
  | { t: 'audio-plan'; plan: AudioPlan }
  | { t: 'audio-commit'; generation: number };

/** A bad capability cannot allocate an unbounded key, stream, or parser workload. */
export function parseAudioEvent(value: Record<string, unknown>): AudioEvent | null {
  if (value.t === 'audio-ready') {
    return Number.isSafeInteger(value.generation) && (value.generation as number) > 0
      ? { t: 'audio-ready', generation: value.generation as number } : null;
  }
  if (value.t !== 'audio-capability') return null;
  if (value.capability === null) return { t: 'audio-capability', capability: null };
  const cap = value.capability as Partial<AudioCapability> | null;
  if (!cap || typeof cap !== 'object' || typeof cap.publicKey !== 'string' ||
    !/^[A-Za-z0-9_-]{87}$/.test(cap.publicKey) ||
    !(cap.streamId === null || typeof cap.streamId === 'string' && cap.streamId.length > 0 && cap.streamId.length <= 128)) return null;
  return { t: 'audio-capability', capability: { publicKey: cap.publicKey, streamId: cap.streamId } };
}

/**
 * Shared Node/DO two-phase activation. Membership changes routes; speaking does
 * not. A seat may advertise once and withdraw once: failure cannot oscillate
 * the whole room between transports. A fresh seat is the explicit retry.
 */
export function advanceAudioNetwork(
  previous: AudioNetworkState | undefined, peers: readonly string[],
  actor?: string, event?: AudioEvent,
): { state: AudioNetworkState; updates: AudioUpdate[] } {
  const ids = [...new Set(peers)].sort();
  if (ids.length > 20 || ids.some(id => !id || id.length > 128)) throw new Error('Audio admission exceeds the validated room envelope');
  const capabilities = Object.fromEntries(Object.entries(previous?.capabilities ?? {}).filter(([id]) => ids.includes(id)));
  let changed = !previous || JSON.stringify(ids) !== JSON.stringify(previous.plan.peers);
  if (actor && ids.includes(actor) && event?.t === 'audio-capability') {
    // Neither a late capability retry nor a key substitution can undo withdrawal.
    if (!Object.hasOwn(capabilities, actor) || event.capability === null && capabilities[actor] !== null) {
      capabilities[actor] = event.capability;
      changed = true;
    }
  }
  if (!changed && !(event?.t === 'audio-ready' && actor && ids.includes(actor) &&
    event.generation === previous!.plan.generation && Object.hasOwn(capabilities, actor) && !previous!.ready.includes(actor))) {
    return { state: previous!, updates: [] };
  }
  let state: AudioNetworkState;
  const updates: AudioUpdate[] = [];
  if (changed) {
    const generation = (previous?.plan.generation ?? 0) + 1;
    const plan: AudioPlan = { generation, mode: 'mesh', peers: ids, aware: Object.keys(capabilities),
      sources: Object.fromEntries(Object.entries(capabilities).filter((entry): entry is [string, AudioCapability] => entry[1] !== null)),
      neighbors: {}, parents: {} };
    if (ids.length > 1 && ids.every(id => capabilities[id])) {
      const old = previous?.plan.mode === 'sparse' ? {
        generation: previous.plan.generation,
        neighbors: new Map(Object.entries(previous.plan.neighbors).map(([id, neighbors]) => [id, new Set(neighbors)])),
      } : undefined;
      const graph = buildConnectivity(ids, 8, old);
      // At 20 members this caps each relay's aggregate copies, including its
      // own source. No source is dropped to make an allocation fit.
      const allocation = allocateMediaRoutes(graph, ids, new Map(ids.map(id => [id, { maxOutgoingCopies: 32 }])));
      if (allocation.ok) {
        plan.mode = 'sparse';
        plan.neighbors = Object.fromEntries([...graph.neighbors].map(([id, neighbors]) => [id, [...neighbors]]));
        plan.parents = Object.fromEntries(allocation.routes.map(route => [route.sourceId, Object.fromEntries(route.parent)]));
      }
    }
    state = { capabilities, plan, ready: [], committed: false };
    updates.push({ t: 'audio-plan', plan });
  } else state = { ...previous!, capabilities, ready: [...previous!.ready] };
  if (event?.t === 'audio-ready' && actor && ids.includes(actor) && event.generation === state.plan.generation &&
    Object.hasOwn(capabilities, actor) && !state.ready.includes(actor)) state.ready.push(actor);
  const required = ids.filter(id => Object.hasOwn(capabilities, id));
  if (!state.committed && required.every(id => state.ready.includes(id))) {
    state.committed = true;
    updates.push({ t: 'audio-commit', generation: state.plan.generation });
  }
  return { state, updates };
}
