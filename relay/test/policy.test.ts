import { describe, expect, it } from 'vitest';
import { decideSubstitution } from '../src/policy';

describe('decideSubstitution', () => {
  it('starved queue: donor frames are dropped', () => {
    expect(decideSubstitution('delta', null)).toBe('drop');
  });

  it('starved queue with a donor keyframe means the child asked for one: refresh upstream', () => {
    expect(decideSubstitution('key', null)).toBe('refresh-upstream');
  });

  it('a queued keyframe rides only on a donor keyframe', () => {
    expect(decideSubstitution('key', { type: 'key' })).toBe('emit');
    expect(decideSubstitution('delta', { type: 'key' })).toBe('need-local-key');
  });

  it('steady state: delta rides delta', () => {
    expect(decideSubstitution('delta', { type: 'delta' })).toBe('emit');
  });

  it('a spontaneous donor keyframe over queued deltas is a PLI: served from upstream', () => {
    expect(decideSubstitution('key', { type: 'delta' })).toBe('refresh-upstream');
  });
});
