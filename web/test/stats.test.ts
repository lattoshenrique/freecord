import { describe, expect, it } from 'vitest';
import { packetLossRate } from '../src/lib/stats';

describe('packetLossRate', () => {
  it('measures the interval, not the whole call', () => {
    // 5 lost out of 105 sent in this window, after a clean first minute.
    expect(packetLossRate({ lost: 0, received: 3000 }, { lost: 5, received: 3100 })).toBeCloseTo(
      5 / 105,
    );
  });

  it('reads a window that lost nothing as zero, not as no reading', () => {
    expect(packetLossRate({ lost: 4, received: 100 }, { lost: 4, received: 200 })).toBe(0);
  });

  it('has nothing to report when nothing was expected', () => {
    // An idle link and a clean one would otherwise read the same.
    expect(packetLossRate({ lost: 4, received: 100 }, { lost: 4, received: 100 })).toBeNull();
  });

  it('treats a packet that arrived late as no loss at all', () => {
    // packetsLost is allowed to go back down; a negative rate is not a thing.
    expect(packetLossRate({ lost: 6, received: 100 }, { lost: 4, received: 150 })).toBe(0);
  });
});
