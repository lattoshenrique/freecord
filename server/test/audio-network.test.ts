import { describe, expect, it } from 'vitest';
import { advanceAudioNetwork, parseAudioEvent, type AudioNetworkState } from '../src/domain/audio-network.js';

const cap = { publicKey: 'B'.repeat(87), streamId: 'voice' };
function readyRoom(count: number) {
  const ids = Array.from({ length: count }, (_, i) => `peer-${i}`);
  let state = advanceAudioNetwork(undefined, ids).state;
  for (const id of ids) state = advanceAudioNetwork(state, ids, id, { t: 'audio-capability', capability: cap }).state;
  return { ids, state };
}
describe('audio network activation', () => {
  it('keeps native media until every capable listener confirms the same generation', () => {
    const { ids, state } = readyRoom(10);
    expect(state.plan.mode).toBe('sparse'); expect(state.committed).toBe(false);
    let next = state;
    for (const id of ids.slice(0, -1)) next = advanceAudioNetwork(next, ids, id, { t: 'audio-ready', generation: next.plan.generation }).state;
    expect(next.committed).toBe(false);
    expect(advanceAudioNetwork(next, ids, ids.at(-1), { t: 'audio-ready', generation: next.plan.generation - 1 }).updates).toEqual([]);
    const result = advanceAudioNetwork(next, ids, ids.at(-1), { t: 'audio-ready', generation: next.plan.generation });
    expect(result.updates).toEqual([{ t: 'audio-commit', generation: next.plan.generation }]);
  });
  it('caps connectivity and total relay work without dropping logical sources at 20 seats', () => {
    const { ids, state } = readyRoom(20);
    expect(state.plan.mode).toBe('sparse'); expect(Object.keys(state.plan.parents)).toHaveLength(20);
    const copies = new Map(ids.map(id => [id, 0]));
    for (const id of ids) {
      expect(state.plan.neighbors[id]!.length).toBeLessThanOrEqual(8);
      expect(state.plan.parents[id]![id]).toBeNull();
      expect(Object.keys(state.plan.parents[id]!)).toHaveLength(20);
      for (const parent of Object.values(state.plan.parents[id]!)) if (parent) copies.set(parent, copies.get(parent)! + 1);
    }
    expect(Math.max(...copies.values())).toBeLessThanOrEqual(32);
  });
  it('bounds the influence of capability lies and repeated failures', () => {
    let { ids, state } = readyRoom(3);
    state = advanceAudioNetwork(state, ids, ids[0], { t: 'audio-capability', capability: null }).state;
    expect(state.plan.mode).toBe('mesh');
    for (let i = 0; i < 20; i++) {
      const result = advanceAudioNetwork(state, ids, ids[0], { t: 'audio-capability', capability: i % 2 ? null : cap });
      expect(result.updates).toEqual([]); expect(result.state.plan.generation).toBe(state.plan.generation);
    }
  });
  it('survives a serialized coordinator restart and prunes departed identities', () => {
    const { ids, state } = readyRoom(10);
    const stored = JSON.parse(JSON.stringify(state)) as AudioNetworkState;
    const result = advanceAudioNetwork(stored, ids.slice(1));
    expect(result.state.plan.mode).toBe('sparse');
    expect(result.state.capabilities[ids[0]!]).toBeUndefined();
    expect(result.state.plan.generation).toBeGreaterThan(state.plan.generation);
  });
  it('rejects unbounded keys, malformed stream identities and invalid generations', () => {
    for (const value of [{ t: 'audio-ready', generation: NaN }, { t: 'audio-ready', generation: -1 },
      { t: 'audio-capability', capability: { ...cap, publicKey: 'a'.repeat(999) } },
      { t: 'audio-capability', capability: { ...cap, streamId: [] } }]) expect(parseAudioEvent(value)).toBeNull();
    expect(parseAudioEvent({ t: 'audio-capability', capability: cap })).toEqual({ t: 'audio-capability', capability: cap });
  });
});
