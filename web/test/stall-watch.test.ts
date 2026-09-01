import { describe, expect, it } from 'vitest';
import { advanceStall, initialStallState, type StallAction } from '../src/lib/stall-watch';

/** Feeds `count` identical stalled samples (flat frames, silent wire). */
function stalledTicks(
  state: ReturnType<typeof initialStallState>,
  count: number,
  frames = 100,
): StallAction[] {
  const actions: StallAction[] = [];
  for (let i = 0; i < count; i += 1) {
    actions.push(advanceStall(state, frames, 0));
  }
  return actions;
}

describe('advanceStall', () => {
  it('stays quiet while frames keep moving', () => {
    const state = initialStallState();
    expect(advanceStall(state, 100, 500)).toBe('none');
    expect(advanceStall(state, 130, 480)).toBe('none');
    expect(advanceStall(state, 160, 510)).toBe('none');
  });

  it('a slideshow that still decodes never counts as a stall', () => {
    const state = initialStallState();
    advanceStall(state, 100, 2);
    // frames moved even though the wire is nearly silent
    expect(advanceStall(state, 101, 0)).toBe('none');
    expect(state.strikes).toBe(0);
  });

  it('bytes still arriving means the path is alive, whatever the decoder shows', () => {
    const state = initialStallState();
    advanceStall(state, 100, 500);
    expect(advanceStall(state, 100, 200)).toBe('none');
    expect(state.strikes).toBe(0);
  });

  it('notifies the parent first, then restarts ICE if the freeze survives', () => {
    const state = initialStallState();
    advanceStall(state, 100, 500);
    expect(stalledTicks(state, 4)).toEqual(['none', 'notify-parent', 'none', 'restart-ice']);
  });

  it('spends the restart once per episode, keeping the note cadence after', () => {
    const state = initialStallState();
    advanceStall(state, 100, 500);
    stalledTicks(state, 4); // note, then restart
    // A static screen keeps reading as stalled forever: only notes now.
    expect(stalledTicks(state, 4)).toEqual(['none', 'notify-parent', 'none', 'notify-parent']);
  });

  it('frames moving again re-arms the restart for the next episode', () => {
    const state = initialStallState();
    advanceStall(state, 100, 500);
    stalledTicks(state, 4);
    expect(advanceStall(state, 250, 500)).toBe('none'); // recovered
    advanceStall(state, 250, 0); // strike 1 of a new episode
    const actions = stalledTicks(state, 3, 250);
    expect(actions).toContain('restart-ice');
  });

  it('unreadable framesDecoded never trips the watch', () => {
    const state = initialStallState();
    for (let i = 0; i < 6; i += 1) {
      expect(advanceStall(state, null, 0)).toBe('none');
    }
  });

  it('the first reading alone is not a stall', () => {
    const state = initialStallState();
    expect(advanceStall(state, 100, null)).toBe('none');
    expect(state.strikes).toBe(0);
  });
});
