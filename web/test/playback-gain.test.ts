import { describe, expect, it } from 'vitest';
import { playbackPlan } from '../src/lib/playback-gain';

describe('playback gain', () => {
  it('leaves attenuation on the media element', () => {
    expect(playbackPlan(0.35)).toEqual({
      elementVolume: 0.35,
      streamGain: 1,
      amplify: false,
    });
  });

  it('moves amplification into the stream and keeps the element valid', () => {
    expect(playbackPlan(2)).toEqual({
      elementVolume: 1,
      streamGain: 2,
      amplify: true,
    });
  });

  it('sanitizes levels before planning playback', () => {
    expect(playbackPlan(5).streamGain).toBe(2);
    expect(playbackPlan(Number.NaN)).toEqual({
      elementVolume: 1,
      streamGain: 1,
      amplify: false,
    });
  });
});
