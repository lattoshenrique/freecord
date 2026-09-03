import { describe, expect, it } from 'vitest';
import { LinkHealthTracker } from '../src/lib/link-health';
import type { PeerLatency } from '../src/lib/stats';

function reading(overrides: Partial<PeerLatency> = {}): PeerLatency {
  return {
    state: 'connected',
    rttMs: 40,
    audioPackets: 100,
    lossRate: 0,
    ...overrides,
  };
}

function sample(tracker: LinkHealthTracker, value: PeerLatency) {
  return tracker.sample(new Map([['parent', value]]));
}

describe('LinkHealthTracker', () => {
  it('reports a persistently lossy path, not one noisy sample', () => {
    const tracker = new LinkHealthTracker();

    expect(sample(tracker, reading({ lossRate: 0.08 }))).toEqual([]);
    expect(sample(tracker, reading({ lossRate: 0.09 }))).toEqual([
      { peerId: 'parent', poor: true },
    ]);
    expect(sample(tracker, reading({ lossRate: 0.1 }))).toEqual([]);
  });

  it('requires a longer, clearly healthy run before returning the route', () => {
    const tracker = new LinkHealthTracker();
    sample(tracker, reading({ rttMs: 700 }));
    sample(tracker, reading({ rttMs: 700 }));

    for (let index = 0; index < 14; index += 1) {
      expect(sample(tracker, reading())).toEqual([]);
    }
    expect(sample(tracker, reading())).toEqual([{ peerId: 'parent', poor: false }]);
  });

  it('does not call a negotiating or borderline path bad', () => {
    const tracker = new LinkHealthTracker();

    expect(sample(tracker, reading({ state: 'connecting', rttMs: null, lossRate: null }))).toEqual(
      [],
    );
    expect(sample(tracker, reading({ rttMs: 350, lossRate: 0.03 }))).toEqual([]);
    expect(sample(tracker, reading({ rttMs: 350, lossRate: 0.03 }))).toEqual([]);
  });

  it('forgets a departed peer so a reused tracker starts it clean', () => {
    const tracker = new LinkHealthTracker();
    sample(tracker, reading({ state: 'failed' }));
    tracker.sample(new Map());

    expect(sample(tracker, reading({ state: 'failed' }))).toEqual([]);
  });

  it('can reassert both poor and recovered state after signaling resumes', () => {
    const tracker = new LinkHealthTracker();
    sample(tracker, reading({ state: 'failed' }));
    sample(tracker, reading({ state: 'failed' }));

    expect(tracker.snapshot()).toEqual([{ peerId: 'parent', poor: true }]);
    for (let index = 0; index < 15; index += 1) {
      sample(tracker, reading());
    }
    expect(tracker.snapshot()).toEqual([{ peerId: 'parent', poor: false }]);
  });
});
