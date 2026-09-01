import { describe, expect, it } from 'vitest';
import { RelayRegistry } from '../src/registry';

type FakeTransformer = { name: string };

describe('RelayRegistry', () => {
  it('routes downstreams to their pipe regardless of attach order', () => {
    const registry = new RelayRegistry<FakeTransformer>();
    const down = registry.attachDownstream('p1', 'd1', { name: 'sender' }, 'identity');
    const pipe = registry.attachUpstream('p1', { name: 'receiver' });
    expect(pipe.downstreams.get('d1')).toBe(down);
    expect(pipe.upstream?.name).toBe('receiver');
  });

  it('keeps pipes isolated by id', () => {
    const registry = new RelayRegistry<FakeTransformer>();
    registry.attachDownstream('p1', 'd1', { name: 'a' }, 'identity');
    registry.attachDownstream('p2', 'd2', { name: 'b' }, 'identity');
    expect(registry.getPipe('p1')?.downstreams.has('d2')).toBe(false);
    expect(registry.getPipe('p2')?.downstreams.has('d1')).toBe(false);
  });

  it('promotion to substitute parks the queue on the next keyframe', () => {
    const registry = new RelayRegistry<FakeTransformer>();
    const down = registry.attachDownstream('p1', 'd1', { name: 'a' }, 'identity');
    down.queue.push({ type: 'delta', data: new ArrayBuffer(1), metadata: {} });
    registry.setMode('p1', 'd1', 'substitute');
    expect(down.mode).toBe('substitute');
    expect(down.queue.length).toBe(0);
    expect(down.queue.isAwaitingKey).toBe(true);
  });

  it('setting the current mode again does not flush the queue', () => {
    const registry = new RelayRegistry<FakeTransformer>();
    const down = registry.attachDownstream('p1', 'd1', { name: 'a' }, 'identity');
    registry.setMode('p1', 'd1', 'substitute');
    down.queue.push({ type: 'key', data: new ArrayBuffer(1), metadata: {} });
    registry.setMode('p1', 'd1', 'substitute');
    expect(down.queue.length).toBe(1);
  });

  it('removal marks the downstream closed so a stuck pump can tell', () => {
    const registry = new RelayRegistry<FakeTransformer>();
    const down = registry.attachDownstream('p1', 'd1', { name: 'a' }, 'substitute');
    const removed = registry.removeDownstream('p1', 'd1');
    expect(removed).toBe(down);
    expect(down.closed).toBe(true);
    expect(registry.getPipe('p1')?.downstreams.size).toBe(0);
  });

  it('closing a pipe closes every downstream and forgets the id', () => {
    const registry = new RelayRegistry<FakeTransformer>();
    const down = registry.attachDownstream('p1', 'd1', { name: 'a' }, 'substitute');
    registry.closePipe('p1');
    expect(down.closed).toBe(true);
    expect(registry.getPipe('p1')).toBeNull();
  });
});
