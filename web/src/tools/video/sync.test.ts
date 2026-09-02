import { describe, expect, it } from 'vitest';
import {
  DRIFT_TOLERANCE_SECONDS,
  LIVE_EDGE_SECONDS,
  correctionFor,
  liveCorrectionFor,
} from './sync';

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
    // The whole difference from the YouTube tool: an element that is
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
