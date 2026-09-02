import { describe, expect, it } from 'vitest';
import { decideSync, type PlayerSample } from '../src/lib/watch-sync';

/** A reading one second after `previous`, as the sampler takes them. */
function tick(previous: PlayerSample, time: number, playing = previous.playing): PlayerSample {
  return { time, playing, at: previous.at + 1000 };
}

const playingAt = (time: number): PlayerSample => ({ time, playing: true, at: 10_000 });
const pausedAt = (time: number): PlayerSample => ({ time, playing: false, at: 10_000 });

describe('decideSync', () => {
  it('a video running along with the clock is nobody’s business', () => {
    const previous = playingAt(30);
    expect(decideSync(previous, tick(previous, 31), { playing: true, time: 31 })).toEqual({
      kind: 'idle',
    });
  });

  it('a person pausing is reported; a person playing is too', () => {
    const previous = playingAt(30);
    expect(decideSync(previous, tick(previous, 31, false), { playing: true, time: 31 })).toEqual({
      kind: 'report',
      playing: false,
      time: 31,
    });
    const paused = pausedAt(30);
    expect(decideSync(paused, tick(paused, 30, true), { playing: false, time: 30 })).toEqual({
      kind: 'report',
      playing: true,
      time: 30,
    });
  });

  it('a person dragging the bar is reported, playing or paused', () => {
    const previous = playingAt(30);
    expect(decideSync(previous, tick(previous, 300), { playing: true, time: 31 })).toMatchObject({
      kind: 'report',
      time: 300,
    });
    const paused = pausedAt(30);
    expect(decideSync(paused, tick(paused, 12), { playing: false, time: 30 })).toMatchObject({
      kind: 'report',
      time: 12,
    });
  });

  it('a stalling player never reports: it catches up on its own', () => {
    // Buffering: the clock moved a second, the video did not.
    let previous = playingAt(30);
    let room = 31;
    for (let i = 0; i < 5; i++) {
      const current = tick(previous, previous.time);
      const action = decideSync(previous, current, { playing: true, time: room });
      expect(action.kind).not.toBe('report');
      previous = current;
      room += 1;
    }
    // Once it is more than the tolerance behind, it seeks to the room.
    expect(decideSync(previous, tick(previous, previous.time), { playing: true, time: room })).toEqual({
      kind: 'seek',
      time: room,
    });
  });

  it('a viewer inside the tolerance is left alone', () => {
    const previous = playingAt(30);
    expect(decideSync(previous, tick(previous, 31), { playing: true, time: 32.5 })).toEqual({
      kind: 'idle',
    });
  });

  it('a paused player that is somewhere else is not dragged around', () => {
    // Everyone paused; this one sits where it was left. Nothing to do:
    // seeking a paused player would fight whoever pauses next.
    const previous = pausedAt(30);
    expect(decideSync(previous, tick(previous, 30), { playing: false, time: 30 })).toEqual({
      kind: 'idle',
    });
  });

  it('half speed and double speed are playback, not seeks', () => {
    const previous = playingAt(30);
    expect(decideSync(previous, tick(previous, 32), { playing: true, time: 31 })).toEqual({
      kind: 'idle',
    });
    expect(decideSync(previous, tick(previous, 30.25), { playing: true, time: 31 })).toEqual({
      kind: 'idle',
    });
  });
});
