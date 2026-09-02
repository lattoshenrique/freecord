import { describe, expect, it } from 'vitest';
import { advance, enqueue, playAt, removeAt, startWith } from './queue';
import { QUEUE_MAX, type ListenItem } from './state';

const item = (id: string): ListenItem => ({ kind: 'track', id });
const a = item('4cOdK2wGLETKBW3PvgPWqT');
const b = item('1DFixLWuPkv3KT3TnV35m3');
const c = item('512ojhOuo1ktJprKbVcKyQ');

describe('starting', () => {
  it('puts one thing on, with nothing behind it', () => {
    expect(startWith(a)).toEqual({ now: a, queue: [] });
  });
});

describe('the queue', () => {
  it('lines things up in order', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    expect(state).toEqual({ now: a, queue: [b, c] });
  });

  it('a full queue keeps what it has', () => {
    let state = startWith(a);
    for (let i = 0; i < QUEUE_MAX + 5; i++) {
      state = enqueue(state, b);
    }
    expect(state.queue).toHaveLength(QUEUE_MAX);
  });

  it('takes one out by where it is, and ignores an index that is not there', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    expect(removeAt(state, 0).queue).toEqual([c]);
    expect(removeAt(state, 7)).toBe(state);
    expect(removeAt(state, -1)).toBe(state);
  });
});

describe('walking it', () => {
  it('the next one comes on and the rest keep their places', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    expect(advance(state)).toEqual({ now: b, queue: [c] });
  });

  it('two people skipping the same song land on the same one', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    const once = advance(state);
    expect(advance(state)).toEqual(once);
  });

  it('with nothing lined up, what is on stays on', () => {
    const state = startWith(a);
    expect(advance(state)).toBe(state);
  });

  it('jumping down the queue passes on what it jumped over', () => {
    const state = enqueue(enqueue(startWith(a), b), c);
    expect(playAt(state, 1)).toEqual({ now: c, queue: [] });
    expect(playAt(state, 9)).toBe(state);
  });
});
