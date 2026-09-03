import { describe, expect, it } from 'vitest';
import { EchoGuard } from '../src/lib/echo-guard';

const RATE = 48_000;
const QUANTUM = 128;

function random(seed: number): () => number {
  let state = (seed * 2654435761) % 2147483647 || 7;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * Something with the shape of speech: harmonics under an envelope that
 * wanders instead of repeating.
 *
 * Both halves matter to what is being tested. Flat noise would be the
 * easy case for an adaptive filter and the useless one for a delay
 * search, which works on loudness over time and has nothing to lock onto
 * in a signal that never changes. A PERIODIC envelope is worse than
 * either: it correlates just as well one period out as at the truth, so
 * a search across it has no single answer and a test built on one would
 * be measuring the signal rather than the code.
 */
function voice(samples: number, seed: number): Float32Array {
  const out = new Float32Array(samples);
  const next = random(seed);
  // A new syllable target every ~60 ms, glided to rather than stepped.
  const stride = Math.round(RATE * 0.06);
  let level = next();
  let target = next();
  for (let n = 0; n < samples; n += 1) {
    if (n % stride === 0) {
      target = next() ** 2; // mostly quiet, occasionally loud
    }
    level += (target - level) * 0.0008;
    const t = n / RATE;
    out[n] =
      (0.15 + level) *
      (0.5 * Math.sin(2 * Math.PI * (110 + seed * 37) * t) +
        0.3 * Math.sin(2 * Math.PI * (221 + seed * 53) * t) +
        0.2 * Math.sin(2 * Math.PI * (663 + seed * 91) * t) +
        (next() - 0.5) * 0.05);
  }
  return out;
}

/** What a loopback hands back: the signal, late, quieter, slightly smeared. */
function echoOf(source: Float32Array, delay: number, gain: number): Float32Array {
  const out = new Float32Array(source.length);
  for (let n = delay + 2; n < source.length; n += 1) {
    out[n] =
      gain * (0.82 * source[n - delay]! + 0.14 * source[n - delay - 1]! + 0.04 * source[n - delay - 2]!);
  }
  return out;
}

function energy(signal: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let n = from; n < to; n += 1) {
    sum += signal[n]! * signal[n]!;
  }
  return sum / (to - from);
}

function db(before: number, after: number): number {
  return 10 * Math.log10(before / Math.max(after, 1e-20));
}

/** Runs a whole signal through in render quanta, as the worklet does. */
function run(capture: Float32Array, reference: Float32Array): Float32Array {
  const guard = new EchoGuard(RATE);
  const out = new Float32Array(capture.length);
  for (let start = 0; start + QUANTUM <= capture.length; start += QUANTUM) {
    const block = [capture.subarray(start, start + QUANTUM)];
    const ref = [reference.subarray(start, start + QUANTUM)];
    const dest = [out.subarray(start, start + QUANTUM)];
    guard.process(block, ref, dest);
  }
  return out;
}

const SECONDS = 6;
const LENGTH = RATE * SECONDS;
/** Measured over the last second, once the filter has had time to settle. */
const SETTLED = LENGTH - RATE;
const DELAY = 2_000; // ~42 ms, a plausible output-plus-capture buffer

describe('a capture that is only the room coming back', () => {
  const room = voice(LENGTH, 1);
  const capture = echoOf(room, DELAY, 0.7);
  const cleaned = run(capture, room);

  it('finds where the copy is and how late', () => {
    const guard = new EchoGuard(RATE);
    const out = new Float32Array(QUANTUM);
    let stats = guard.stats();
    for (let start = 0; start + QUANTUM <= LENGTH; start += QUANTUM) {
      guard.process(
        [capture.subarray(start, start + QUANTUM)],
        [room.subarray(start, start + QUANTUM)],
        [out],
      );
      stats = guard.stats();
    }
    expect(stats.delayMs).not.toBeNull();
    // Found to within the resolution of the envelope search plus the
    // slack the filter itself covers.
    expect(stats.delayMs!).toBeGreaterThan(35);
    expect(stats.delayMs!).toBeLessThan(50);
    expect(stats.active).toBe(true);
  });

  it('takes it back out', () => {
    const before = energy(capture, SETTLED, LENGTH);
    const after = energy(cleaned, SETTLED, LENGTH);
    expect(db(before, after)).toBeGreaterThan(20);
  });
});

describe('a capture with a game in it as well as the room', () => {
  const room = voice(LENGTH, 1);
  const game = voice(LENGTH, 4);
  const capture = new Float32Array(LENGTH);
  const echo = echoOf(room, DELAY, 0.7);
  for (let n = 0; n < LENGTH; n += 1) {
    capture[n] = game[n]! + echo[n]!;
  }
  const cleaned = run(capture, room);

  it('leaves the game where it was', () => {
    // What the viewer came for must survive: measured against the game
    // alone, not against the capture, so removing the echo does not read
    // as damage.
    const kept = energy(cleaned, SETTLED, LENGTH);
    const wanted = energy(game, SETTLED, LENGTH);
    expect(kept / wanted).toBeGreaterThan(0.35);
    expect(kept / wanted).toBeLessThan(2);
  });

  it('gets the room out from under it', () => {
    // The error against the game alone is what is left of the room.
    //
    // The bar is low on purpose, because this case is the hostile one:
    // the game is 4 dB LOUDER than the echo and both are near-tonal, so
    // the filter is learning through the worst masking it will ever see,
    // at the smallest step the double-talk rule allows. It keeps
    // converging afterwards — the same signals measured at twenty
    // seconds are past 6 dB — so what this guards is the difference
    // between working slowly and not working at all.
    let leftover = 0;
    for (let n = SETTLED; n < LENGTH; n += 1) {
      const diff = cleaned[n]! - game[n]!;
      leftover += diff * diff;
    }
    leftover /= LENGTH - SETTLED;
    expect(db(energy(echo, SETTLED, LENGTH), leftover)).toBeGreaterThan(3);
  });
});

describe('how long it takes', () => {
  it('is cancelling inside a couple of seconds', () => {
    // The floor is the delay search itself: it needs its whole history
    // filled before the first search, and a second search to confirm.
    // Nothing after that point is free either, so this is the number to
    // watch if the search's constants ever move.
    const room = voice(LENGTH, 1);
    const capture = echoOf(room, DELAY, 0.7);
    const guard = new EchoGuard(RATE);
    const out = new Float32Array(QUANTUM);
    let firstUseful = -1;
    for (let start = 0; start + QUANTUM <= LENGTH; start += QUANTUM) {
      guard.process(
        [capture.subarray(start, start + QUANTUM)],
        [room.subarray(start, start + QUANTUM)],
        [out],
      );
      if (firstUseful < 0 && guard.stats().erleDb > 10) {
        firstUseful = start;
      }
    }
    expect(firstUseful).toBeGreaterThan(0);
    expect(firstUseful / RATE).toBeLessThan(2);
  });
});

describe('a capture we are not in at all', () => {
  it('leaves a shared tab alone', () => {
    // Sharing one browser tab captures that tab, not the machine: our own
    // output never enters it, and the guard must be a wire.
    const room = voice(LENGTH, 1);
    const tab = voice(LENGTH, 7);
    const cleaned = run(tab, room);
    const kept = energy(cleaned, SETTLED, LENGTH);
    expect(kept / energy(tab, SETTLED, LENGTH)).toBeGreaterThan(0.9);
  });

  it('passes silence from the room straight through', () => {
    const game = voice(LENGTH, 4);
    const cleaned = run(game, new Float32Array(LENGTH));
    for (let n = SETTLED; n < LENGTH; n += 1) {
      expect(cleaned[n]).toBeCloseTo(game[n]!, 6);
    }
  });
});

describe('stereo', () => {
  it('cleans each side against the side that made it', () => {
    const left = voice(LENGTH, 1);
    const right = voice(LENGTH, 2);
    const captureLeft = echoOf(left, DELAY, 0.7);
    const captureRight = echoOf(right, DELAY, 0.55);
    const guard = new EchoGuard(RATE);
    const outLeft = new Float32Array(LENGTH);
    const outRight = new Float32Array(LENGTH);
    for (let start = 0; start + QUANTUM <= LENGTH; start += QUANTUM) {
      const to = start + QUANTUM;
      guard.process(
        [captureLeft.subarray(start, to), captureRight.subarray(start, to)],
        [left.subarray(start, to), right.subarray(start, to)],
        [outLeft.subarray(start, to), outRight.subarray(start, to)],
      );
    }
    expect(
      db(energy(captureLeft, SETTLED, LENGTH), energy(outLeft, SETTLED, LENGTH)),
    ).toBeGreaterThan(15);
    expect(
      db(energy(captureRight, SETTLED, LENGTH), energy(outRight, SETTLED, LENGTH)),
    ).toBeGreaterThan(15);
  });
});
