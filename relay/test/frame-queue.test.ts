import { describe, expect, it } from 'vitest';
import { FrameQueue } from '../src/frame-queue';

type Frame = { type: 'key' | 'delta'; id: number };

const key = (id: number): Frame => ({ type: 'key', id });
const delta = (id: number): Frame => ({ type: 'delta', id });

describe('FrameQueue', () => {
  it('keeps arrival order for a decodable run', () => {
    const queue = new FrameQueue<Frame>(8);
    expect(queue.push(key(1))).toBe('queued');
    expect(queue.push(delta(2))).toBe('queued');
    expect(queue.push(delta(3))).toBe('queued');
    expect(queue.shift()?.id).toBe(1);
    expect(queue.shift()?.id).toBe(2);
    expect(queue.shift()?.id).toBe(3);
    expect(queue.shift()).toBeUndefined();
  });

  it('a keyframe supersedes the whole backlog', () => {
    const queue = new FrameQueue<Frame>(8);
    queue.push(key(1));
    queue.push(delta(2));
    queue.push(delta(3));
    expect(queue.push(key(4))).toBe('queued');
    expect(queue.length).toBe(1);
    expect(queue.peek()?.id).toBe(4);
  });

  it('delta overflow drops the run and waits for a keyframe', () => {
    const queue = new FrameQueue<Frame>(3);
    queue.push(key(1));
    queue.push(delta(2));
    queue.push(delta(3));
    expect(queue.push(delta(4))).toBe('reset');
    expect(queue.length).toBe(0);
    expect(queue.isAwaitingKey).toBe(true);
  });

  it('while awaiting a keyframe, deltas are undecodable and dropped', () => {
    const queue = new FrameQueue<Frame>(2);
    queue.push(delta(1));
    queue.push(delta(2));
    expect(queue.push(delta(3))).toBe('reset');
    expect(queue.push(delta(4))).toBe('dropped');
    expect(queue.length).toBe(0);
    expect(queue.push(key(5))).toBe('queued');
    expect(queue.isAwaitingKey).toBe(false);
    expect(queue.push(delta(6))).toBe('queued');
    expect(queue.shift()?.id).toBe(5);
    expect(queue.shift()?.id).toBe(6);
  });

  it('clear({ awaitKey }) parks the queue on the next keyframe', () => {
    const queue = new FrameQueue<Frame>(8);
    queue.push(key(1));
    queue.push(delta(2));
    queue.clear({ awaitKey: true });
    expect(queue.length).toBe(0);
    expect(queue.push(delta(3))).toBe('dropped');
    expect(queue.push(key(4))).toBe('queued');
  });
});
