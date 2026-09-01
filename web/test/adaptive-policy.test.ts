import { describe, expect, it } from 'vitest';
import {
  CAMERA_ADAPTIVE,
  SCREEN_ADAPTIVE,
  LEVEL_FACTORS,
  adaptedEncoding,
  advance,
  congestionFromReports,
  factorFor,
  initialAdaptiveState,
  type AdaptiveState,
  type CongestionSample,
} from '../src/lib/adaptive-policy';

const CALM: CongestionSample = {
  limitation: 'none',
  fractionLost: 0,
  availableOutgoingBitrate: 10_000_000,
};

const SQUEEZED: CongestionSample = {
  limitation: 'bandwidth',
  fractionLost: 0.12,
  availableOutgoingBitrate: 800_000,
};

const SILENT: CongestionSample = {
  limitation: null,
  fractionLost: null,
  availableOutgoingBitrate: null,
};

function ticks(
  state: AdaptiveState,
  sample: CongestionSample,
  count: number,
  target = 1_000_000,
  config = CAMERA_ADAPTIVE,
): AdaptiveState {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    next = advance(next, sample, config, target);
  }
  return next;
}

describe('advance', () => {
  it('steps down after sustained congestion, not on the first bad tick', () => {
    const one = advance(initialAdaptiveState(), SQUEEZED, CAMERA_ADAPTIVE, 1_000_000);
    expect(one.level).toBe(0);
    const two = advance(one, SQUEEZED, CAMERA_ADAPTIVE, 1_000_000);
    expect(two.level).toBe(1);
  });

  it('holds during cooldown, then steps again while congestion lasts', () => {
    let state = ticks(initialAdaptiveState(), SQUEEZED, 2);
    expect(state.level).toBe(1);
    // Consecutive steps are spaced by the full cooldown: two held ticks,
    // then the third lands level 2 — 6 s apart at the 2 s cadence.
    state = ticks(state, SQUEEZED, 2);
    expect(state.level).toBe(1);
    state = ticks(state, SQUEEZED, 1);
    expect(state.level).toBe(2);
  });

  it('never leaves the ladder at the bottom rung', () => {
    const state = ticks(initialAdaptiveState(), SQUEEZED, 100);
    expect(state.level).toBe(LEVEL_FACTORS.length - 1);
    expect(factorFor(state)).toBe(LEVEL_FACTORS[LEVEL_FACTORS.length - 1]);
  });

  it('loss alone is congestion, even with no limitation reported', () => {
    const lossy: CongestionSample = {
      limitation: null,
      fractionLost: 0.08,
      availableOutgoingBitrate: null,
    };
    expect(ticks(initialAdaptiveState(), lossy, 2).level).toBe(1);
  });

  it('cpu pressure moves the camera ladder but not the screen ladder', () => {
    const cpuBound: CongestionSample = {
      limitation: 'cpu',
      fractionLost: 0,
      availableOutgoingBitrate: 10_000_000,
    };
    expect(ticks(initialAdaptiveState(), cpuBound, 4, 1_000_000, CAMERA_ADAPTIVE).level).toBe(1);
    expect(ticks(initialAdaptiveState(), cpuBound, 4, 1_000_000, SCREEN_ADAPTIVE).level).toBe(0);
  });

  it('recovers after a sustained clean streak', () => {
    let state = ticks(initialAdaptiveState(), SQUEEZED, 2);
    expect(state.level).toBe(1);
    // Cooldown (3) then upAfter (8) clean ticks.
    state = ticks(state, CALM, 3 + 8);
    expect(state.level).toBe(0);
  });

  it('steps up without a bandwidth estimate (browsers that never report one)', () => {
    const calmNoEstimate: CongestionSample = {
      limitation: 'none',
      fractionLost: 0,
      availableOutgoingBitrate: null,
    };
    let state = ticks(initialAdaptiveState(), SQUEEZED, 2);
    state = ticks(state, calmNoEstimate, 3 + 8);
    expect(state.level).toBe(0);
  });

  it('withholds the step while headroom is short, and lands it the tick headroom appears', () => {
    const calmTight: CongestionSample = {
      limitation: 'none',
      fractionLost: 0,
      availableOutgoingBitrate: 1_100_000, // < 1.3 × 1 Mbps target
    };
    let state = ticks(initialAdaptiveState(), SQUEEZED, 2);
    state = ticks(state, calmTight, 20);
    expect(state.level).toBe(1);
    // The clean streak was kept: one roomy tick is enough now.
    state = ticks(state, CALM, 1);
    expect(state.level).toBe(0);
  });

  it('silence is not calm: evidence-free ticks never climb', () => {
    let state = ticks(initialAdaptiveState(), SQUEEZED, 2);
    state = ticks(state, SILENT, 50);
    expect(state.level).toBe(1);
  });

  it('middling loss holds both streaks', () => {
    const middling: CongestionSample = {
      limitation: 'none',
      fractionLost: 0.03,
      availableOutgoingBitrate: 10_000_000,
    };
    let state = ticks(initialAdaptiveState(), SQUEEZED, 2);
    state = ticks(state, middling, 50);
    expect(state.level).toBe(1);
  });
});

describe('adaptedEncoding', () => {
  const base = {
    maxBitrate: 1_200_000,
    maxFramerate: 30,
    degradationPreference: 'balanced' as RTCDegradationPreference,
    priority: 'low' as RTCPriorityType,
  };

  it('applies the level factor and keeps the other fields', () => {
    const state: AdaptiveState = { ...initialAdaptiveState(), level: 1 };
    const adapted = adaptedEncoding(base, state, { floor: 150_000 });
    expect(adapted.maxBitrate).toBe(840_000);
    expect(adapted.maxFramerate).toBe(30);
    expect(adapted.priority).toBe('low');
    expect(adapted.scaleResolutionDownBy).toBeUndefined();
  });

  it('never cuts through the floor', () => {
    const state: AdaptiveState = { ...initialAdaptiveState(), level: LEVEL_FACTORS.length - 1 };
    const adapted = adaptedEncoding({ ...base, maxBitrate: 400_000 }, state, { floor: 150_000 });
    expect(adapted.maxBitrate).toBe(150_000);
  });

  it('shrinks the encode at deep levels when asked, and only then', () => {
    const shallow = adaptedEncoding(base, { ...initialAdaptiveState(), level: 1 }, {
      floor: 150_000,
      scaleDownAt: 0.5,
    });
    expect(shallow.scaleResolutionDownBy).toBeUndefined();
    const deep = adaptedEncoding(base, { ...initialAdaptiveState(), level: 2 }, {
      floor: 150_000,
      scaleDownAt: 0.5,
    });
    expect(deep.scaleResolutionDownBy).toBe(2);
  });

  it('never lowers an existing scale (a crushed passthrough donor stays crushed)', () => {
    const crushed = { ...base, scaleResolutionDownBy: 4 };
    const adapted = adaptedEncoding(crushed, { ...initialAdaptiveState(), level: 3 }, {
      floor: 150_000,
      scaleDownAt: 0.5,
    });
    expect(adapted.scaleResolutionDownBy).toBe(4);
  });
});

describe('congestionFromReports', () => {
  it('takes the worst limitation, the worst loss and the smallest estimate across peers', () => {
    const peerA = [
      { type: 'outbound-rtp', kind: 'video', qualityLimitationReason: 'none' },
      { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0.01 },
      {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        availableOutgoingBitrate: 5_000_000,
      },
    ];
    const peerB = [
      { type: 'outbound-rtp', kind: 'video', qualityLimitationReason: 'bandwidth' },
      { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0.09 },
      {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        availableOutgoingBitrate: 900_000,
      },
    ];
    expect(congestionFromReports([peerA, peerB])).toEqual({
      limitation: 'bandwidth',
      fractionLost: 0.09,
      availableOutgoingBitrate: 900_000,
    });
  });

  it('prefers the nominated pair over a busier failed-over one', () => {
    const report = [
      {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: false,
        bytesSent: 999_999,
        availableOutgoingBitrate: 8_000_000,
      },
      {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        bytesSent: 10,
        availableOutgoingBitrate: 2_000_000,
      },
    ];
    expect(congestionFromReports([report]).availableOutgoingBitrate).toBe(2_000_000);
  });

  it('ignores audio RTCP: the voice ladder does not exist', () => {
    const report = [
      { type: 'remote-inbound-rtp', kind: 'audio', fractionLost: 0.5 },
      { type: 'outbound-rtp', kind: 'audio', qualityLimitationReason: 'bandwidth' },
    ];
    expect(congestionFromReports([report])).toEqual({
      limitation: null,
      fractionLost: null,
      availableOutgoingBitrate: null,
    });
  });

  it('reads empty input as no evidence, not as calm', () => {
    expect(congestionFromReports([])).toEqual({
      limitation: null,
      fractionLost: null,
      availableOutgoingBitrate: null,
    });
  });
});
