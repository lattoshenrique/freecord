import { describe, expect, it } from 'vitest';
import {
  DRIFT_TOLERANCE_SECONDS,
  LIVE_EDGE_SECONDS,
  SEEK_REPORT_DEBOUNCE_MS,
  correctionFor,
  decideControllerSync,
  decideSync,
  liveCorrectionFor,
  type PlayerSample,
} from './sync';

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

  it('a player still on its way says nothing about position', () => {
    // The joiner's bug: a video asked to start at 9:30 reads 0:00 while
    // it loads. Reported, that drags the whole room back to the start.
    const previous: PlayerSample = { time: 570, playing: true, at: 10_000 };
    const loading = tick(previous, 0);
    expect(decideSync(previous, loading, { playing: true, time: 571 }, true)).toEqual({
      kind: 'wait',
    });
    // Without the settling flag, the same reading is a person seeking.
    expect(decideSync(previous, loading, { playing: true, time: 571 }, false)).toMatchObject({
      kind: 'report',
      time: 0,
    });
  });

  it('a player on its way still reports a hand on the pause button', () => {
    const previous = playingAt(570);
    const paused = tick(previous, 0, false);
    expect(decideSync(previous, paused, { playing: true, time: 571 }, true)).toMatchObject({
      kind: 'report',
      playing: false,
    });
  });

  it('once it arrives it is a player like any other', () => {
    const previous = playingAt(569);
    const arrived = tick(previous, 570);
    expect(decideSync(previous, arrived, { playing: true, time: 571 }, true)).toEqual({
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

describe('a controller settling on a position', () => {
  it('turns a burst of seeks into one final room update', () => {
    const first = playingAt(30);
    const jumpOne = tick(first, 100);
    const one = decideControllerSync(first, jumpOne, { playing: true, time: 31 });
    expect(one.action).toEqual({ kind: 'wait' });
    expect(one.pending).toMatchObject({ time: 100, lastJumpAt: jumpOne.at });

    const jumpTwo = tick(jumpOne, 200);
    const two = decideControllerSync(jumpOne, jumpTwo, { playing: true, time: 32 }, false, one.pending);
    expect(two.action).toEqual({ kind: 'wait' });
    expect(two.pending).toMatchObject({ time: 200, lastJumpAt: jumpTwo.at });

    const stillSettling = tick(jumpTwo, 201);
    const three = decideControllerSync(
      jumpTwo,
      stillSettling,
      { playing: true, time: 33 },
      false,
      two.pending,
    );
    expect(stillSettling.at - jumpTwo.at).toBeLessThan(SEEK_REPORT_DEBOUNCE_MS);
    expect(three.action).toEqual({ kind: 'wait' });

    const settled = tick(stillSettling, 202);
    const four = decideControllerSync(
      stillSettling,
      settled,
      { playing: true, time: 34 },
      false,
      three.pending,
    );
    expect(four).toEqual({
      action: { kind: 'report', playing: true, time: 202 },
      pending: null,
    });
  });

  it('does not delay a pause behind a pending seek', () => {
    const previous = playingAt(100);
    const pending = { time: 100, playing: true, lastJumpAt: previous.at };
    const paused = tick(previous, 100, false);
    expect(
      decideControllerSync(previous, paused, { playing: true, time: 30 }, false, pending),
    ).toEqual({
      action: { kind: 'report', playing: false, time: 100 },
      pending: null,
    });
  });
});

const at = (time: number, extra: Partial<{ paused: boolean; busy: boolean; liveEdge: number }> = {}) => ({
  time,
  paused: false,
  busy: false,
  ...extra,
});

describe('catching our own player up', () => {
  it('starts it when the room is playing and it is not', () => {
    expect(correctionFor(at(10, { paused: true }), { playing: true, time: 10 })).toEqual({
      kind: 'play',
    });
  });

  it('stops it when the room is not playing and it is', () => {
    expect(correctionFor(at(10), { playing: false, time: 10 })).toEqual({ kind: 'pause' });
  });

  it('leaves a position alone while nobody could tell the difference', () => {
    expect(correctionFor(at(10 + DRIFT_TOLERANCE_SECONDS - 0.1), { playing: true, time: 10 })).toEqual({
      kind: 'idle',
    });
  });

  it('seeks when it has drifted past that', () => {
    expect(correctionFor(at(40), { playing: true, time: 10 })).toEqual({ kind: 'seek', time: 10 });
    expect(correctionFor(at(2), { playing: true, time: 10 })).toEqual({ kind: 'seek', time: 10 });
  });

  it('says nothing about a player that is still on its way', () => {
    // The whole difference from YouTube's iframe: an element that is
    // seeking or starving SAYS so, and while it does its position is not
    // evidence of anything. This is the case that, read as a seek, drags
    // a room back to the start of a film for one slow connection.
    expect(correctionFor(at(0, { busy: true }), { playing: true, time: 600 })).toEqual({
      kind: 'idle',
    });
  });
});

describe('catching up to a broadcast, which has only one position', () => {
  it('keeps it running', () => {
    expect(liveCorrectionFor(at(0, { paused: true }), { playing: true })).toEqual({ kind: 'play' });
    expect(liveCorrectionFor(at(0), { playing: false })).toEqual({ kind: 'pause' });
  });

  it('jumps to the edge when it has fallen a long way behind it', () => {
    const behind = at(100, { liveEdge: 100 + LIVE_EDGE_SECONDS + 5 });
    expect(liveCorrectionFor(behind, { playing: true })).toEqual({
      kind: 'seek',
      time: behind.liveEdge,
    });
  });

  it('tolerates the few seconds a buffer honestly costs', () => {
    expect(liveCorrectionFor(at(100, { liveEdge: 105 }), { playing: true })).toEqual({
      kind: 'idle',
    });
  });

  it('does not chase an edge it has no idea about', () => {
    expect(liveCorrectionFor(at(100), { playing: true })).toEqual({ kind: 'idle' });
  });
});
