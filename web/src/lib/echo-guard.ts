/**
 * Taking Freecord back out of the system audio it is about to send.
 *
 * The problem is the whole reason "share the sound too" is off by
 * default. A loopback capture is the machine's WHOLE output: the game,
 * the video — and the room. So the sharer sends everybody a copy of
 * everybody, a beat late, and the call turns into people hearing
 * themselves. Turning the sharer's speakers off would fix it by making
 * the sharer deaf, which is not a fix.
 *
 * What makes this tractable is that the echo here is not acoustic. There
 * is no room, no microphone, no wall: the loopback contains a DIGITAL
 * copy of a signal we ourselves rendered, and we still have the original.
 * So this is a textbook echo canceller with an unusually kind echo path —
 * a delay, a gain, and a slowly drifting clock:
 *
 *   1. FIND THE DELAY. The capture device and our output run on their own
 *      clocks and the OS buffers sit in between, so the copy comes back
 *      tens of milliseconds late and nobody says how many. A normalised
 *      cross-correlation of the two loudness envelopes says where, to
 *      within a hop, and repeats often enough to follow the drift.
 *   2. SUBTRACT IT. An NLMS filter over a few milliseconds around that
 *      point learns the rest — the exact sub-sample alignment, the system
 *      volume, whatever mixing the OS did — and subtracts its estimate.
 *      It adapts slowly while the near end (the game, the video: the part
 *      the room actually wants) is loud, which is the standard defence
 *      against a filter learning the wrong thing during double talk.
 *   3. DUCK WHAT IS LEFT. A linear filter never gets all of it. The
 *      leftover is estimated from how much the filter is currently
 *      leaking, and a Wiener-ish gain removes it — so a stretch that is
 *      nothing but the room goes properly quiet, while a stretch with
 *      real program audio in it is left alone.
 *
 * The leak estimate is what makes the whole thing safe to leave on. It
 * is measured, not assumed: if this capture does not contain our output
 * at all — a shared browser TAB, whose audio is only that tab's; a
 * machine playing the room through headphones while the capture takes
 * the speakers — the measurement says so and every stage becomes a
 * no-op. The guard cannot damage audio it cannot find itself in.
 *
 * What it does NOT reach: anything we play that we cannot also hand over
 * as a reference signal. The watch tool's vendor iframes are the case
 * that matters — a room watching a video while somebody shares system
 * audio will hear that video twice, and no reference exists for the
 * second copy because YouTube's player is not ours to tap. That is a
 * duplicate of something every peer already has, not a feedback loop.
 *
 * Pure DSP, no Web Audio: this file is what the worklet runs
 * (echo-worklet.ts) and what the tests drive directly.
 */

/** Samples per envelope point — the resolution the delay search works at. */
const HOP = 64;
/** Envelope points kept: must cover the search span plus the window. */
const ENVELOPE_POINTS = 1024;
/** Points of capture compared against the reference (~0.34 s at 48 kHz). */
const CORRELATION_WINDOW = 256;
/** How far back the search looks (~0.5 s at 48 kHz). */
const MAX_LAG_POINTS = 384;
/**
 * The narrowest search worth running, and the reason the guard starts
 * working in half the time it used to.
 *
 * A search needs a window of capture plus the lags it looks back over, so
 * waiting for the FULL half-second of range costs 0.85 s of history before
 * the first search can run at all — and every one of those milliseconds is
 * the room going out inside the share, which is the moment anybody
 * actually notices this feature failing. But a loopback delay is tens of
 * milliseconds; the far end of that range exists for a slow machine, not
 * for the common case. So the search runs as soon as the history covers
 * this much and widens as more arrives, which finds the ordinary delay
 * early and the unusual one exactly as late as before.
 */
const MIN_LAG_POINTS = 64;
/** Points between searches (~0.17 s at 48 kHz). */
const SEARCH_EVERY = 128;
/** Reference kept for the filter to reach back into; power of two. */
const REFERENCE_RING = 32768;

/**
 * The second pass, on the waveforms themselves.
 *
 * The envelope search answers to within a hop — 64 samples, which is an
 * eternity to a filter. Rather than build a filter long enough to cover
 * that ignorance, the winning lag is looked up again against the actual
 * samples over a window either side of it, which lands it on the sample.
 * Only ± one hop is searched, so the periodic near-matches a tonal signal
 * is full of are never in range to be chosen.
 *
 * That is what buys the SHORT filter below, and the short filter is what
 * keeps the guard honest: 96 taps against a path that is physically a
 * delay and a resampler have barely enough freedom to describe the echo,
 * and nowhere near enough to start describing the game as well.
 */
const WAVE_RING = 32768;
const FINE_WINDOW = 2048;
const FINE_SPAN = HOP;

/** Filter length (2 ms at 48 kHz) — slack around a sample-accurate delay. */
const TAPS = 96;
/** How much of that slack sits BEFORE the estimate. */
const PRE_TAPS = 32;
/** A realignment further than this leaves the weights meaningless. */
const REALIGN_TOLERANCE = 8;
/**
 * NLMS step. Fast enough to catch a drifting clock, small enough that
 * the noise it adds while chasing one (misadjustment, ~step/(2−step) of
 * the near-end power) stays under a decibel — which is what keeps a
 * search that locked onto nothing from making the audio worse.
 */
const STEP = 0.05;
/**
 * How much of itself the filter forgets per update.
 *
 * Without this, a REFERENCE that is nearly tonal — music, a game's
 * engine loop, a held note — leaves whole directions of the filter
 * unconstrained by anything in the signal, and the weights are free to
 * drift out along them for as long as they like. It costs nothing while
 * they are right (a correction the gradient makes back on the next
 * sample) and everything when they are not: the moment the alignment
 * moves, an unbounded weight vector stops being a stale echo estimate
 * and becomes a loud noise generator. Textbook leaky NLMS, and the
 * reason a canceller can be pointed at music at all.
 */
const LEAKAGE = 1e-4;
/** Keeps the normalisation honest when the reference goes quiet. */
const REGULARISATION = 1e-6;

/** Below this the reference is silence and nothing adapts or ducks. */
const REFERENCE_FLOOR = 1e-7;
/**
 * What a believable delay looks like. An absolute correlation is the
 * wrong test on its own: the capture also holds the game or the video
 * the room is there for, and against a loud one the copy of ourselves
 * correlates at 0.3 even when it is unmistakably present. What a real
 * alignment always does is STAND OUT from every other alignment — so the
 * peak is judged against the field it beat, and only floored absolutely
 * to keep pure noise from producing a winner.
 */
const MIN_CORRELATION = 0.15;
const PEAK_PROMINENCE = 2.5;
/**
 * Searches a candidate must win before it is adopted, and how much
 * better than the lag in force it has to be to take over.
 *
 * A delay that moves is far worse than one that is slightly wrong: the
 * filter's weights mean something only at the alignment they were learnt
 * at, so every jump throws them away. Making the estimate sticky costs
 * one search interval at startup and buys a filter that keeps what it
 * knows.
 */
const CONFIRMATIONS = 2;
const SWITCH_MARGIN = 1.25;
/** Samples the suppressor decides on at a time. */
const SUPPRESSION_BLOCK = 32;
/** The floor a fully-ducked block reaches (~−30 dB), never digital silence. */
const MIN_GAIN = 0.03;
/** One pole on the running powers: ~20 ms at 48 kHz. */
const POWER_SMOOTHING = 0.001;
/**
 * The smallest step a filter is left with during unrelenting double
 * talk. Zero would be safe and would also mean a room whose game never
 * stops never gets a canceller at all.
 */
const MIN_TRUST = 0.02;
/**
 * Leaving MORE than it was given, sustained, is the one thing this must
 * never do. Past it the filter is not stale, it is wrong, and the only
 * honest move is to drop what it knows and learn again.
 */
const DIVERGED = 1.3;
/** Leakage tracker: how the block energies it reads are smoothed first,
 * then how fast the estimate falls to a new low and creeps back up. */
const LEAK_SMOOTHING = 0.01;
const LEAK_FALL = 0.02;
const LEAK_RISE = 1.0005;
/** Bounds on it. The lower one is "we are not in this capture at all". */
const MIN_LEAK = 1e-5;
const MAX_LEAK = 1;
/**
 * The most leakage the suppressor is allowed to believe in.
 *
 * The leak estimate is a minimum taken over stretches where the near end
 * happens to be quiet — so a near end that is NEVER quiet (a game with a
 * constant engine, a room with music under it) has no such stretch, and
 * the minimum settles far too high. Acting on that would attribute the
 * game's own energy to us and duck the thing the room came to hear.
 *
 * So the suppressor's authority is capped at what a working filter's
 * leftovers actually look like. Past the cap it does almost nothing,
 * which is the right failure: a little echo left in is recoverable, and
 * a game that keeps going quiet for no reason is not.
 */
const SUPPRESSION_CEILING = 0.1;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Where the reference turns up inside the capture.
 *
 * Correlating the waveforms themselves would be both enormous and
 * fragile; correlating their loudness over time is small, cheap and
 * indifferent to the phase mangling an OS mixer does on the way. What it
 * buys is an estimate good to one hop — the adaptive filter is what turns
 * that into an alignment good to a fraction of a sample.
 */
export class DelayFinder {
  private readonly capture = new Float32Array(ENVELOPE_POINTS);
  private readonly reference = new Float32Array(ENVELOPE_POINTS);
  /** The samples themselves, for the second pass. */
  private readonly captureWave = new Float32Array(WAVE_RING);
  private readonly referenceWave = new Float32Array(WAVE_RING);
  private waveWrite = 0;
  /** Next envelope slot; the ring is read backwards from here. */
  private cursor = 0;
  private written = 0;
  private sinceSearch = 0;
  private captureSum = 0;
  private referenceSum = 0;
  private filled = 0;
  /** A lag that keeps winning, and how many searches it has won. */
  private candidate: number | null = null;
  private candidateHits = 0;

  /** Lag in envelope points, or null before anything convincing turns up. */
  lagPoints: number | null = null;
  /** How well the last accepted search matched, 0 … 1. */
  confidence = 0;
  /** Whether the last search found a peak worth believing. */
  locked = false;
  /** Bumped whenever the adopted lag MOVES far — the filter's cue to start over. */
  revision = 0;
  /** The sample-accurate lag, once the second pass has run. */
  private fineLag: number | null = null;

  /**
   * Feeds one sample of each. Returns true when a search has just run,
   * which is only useful to a test.
   */
  push(capture: number, reference: number): boolean {
    this.captureWave[this.waveWrite] = capture;
    this.referenceWave[this.waveWrite] = reference;
    this.waveWrite = (this.waveWrite + 1) & (WAVE_RING - 1);
    this.captureSum += capture * capture;
    this.referenceSum += reference * reference;
    this.filled += 1;
    if (this.filled < HOP) {
      return false;
    }
    // Magnitude, not energy: a squared envelope is all peaks, and a
    // correlation of peaks locks onto the loudest transient instead of
    // onto the signal.
    this.capture[this.cursor] = Math.sqrt(this.captureSum / HOP);
    this.reference[this.cursor] = Math.sqrt(this.referenceSum / HOP);
    this.cursor = (this.cursor + 1) % ENVELOPE_POINTS;
    this.written += 1;
    this.filled = 0;
    this.captureSum = 0;
    this.referenceSum = 0;
    this.sinceSearch += 1;
    if (this.sinceSearch < SEARCH_EVERY || this.written < MIN_LAG_POINTS + CORRELATION_WINDOW) {
      return false;
    }
    this.sinceSearch = 0;
    this.search();
    return true;
  }

  /** The lag in samples, or null while nothing is locked. */
  delaySamples(): number | null {
    return this.fineLag;
  }

  /** Envelope point `back` positions before the newest one. */
  private at(buffer: Float32Array, back: number): number {
    const index = this.cursor - 1 - back;
    return buffer[((index % ENVELOPE_POINTS) + ENVELOPE_POINTS) % ENVELOPE_POINTS]!;
  }

  private search(): void {
    // Only as far back as there is history to compare against; the ring
    // beyond that holds zeros, and correlating against them invents peaks.
    const span = Math.min(MAX_LAG_POINTS, this.written - CORRELATION_WINDOW);
    // Pearson over the window, per lag: the mean matters, because a
    // loudness envelope never goes negative and its DC would otherwise
    // make every lag look like a good one.
    let captureMean = 0;
    for (let i = 0; i < CORRELATION_WINDOW; i += 1) {
      captureMean += this.at(this.capture, i);
    }
    captureMean /= CORRELATION_WINDOW;
    let captureNorm = 0;
    for (let i = 0; i < CORRELATION_WINDOW; i += 1) {
      const value = this.at(this.capture, i) - captureMean;
      captureNorm += value * value;
    }
    if (captureNorm <= REFERENCE_FLOOR) {
      return; // nothing being captured to explain
    }

    let bestLag = -1;
    let best = 0;
    /** The field the winner has to beat: every other alignment tried. */
    let field = 0;
    let counted = 0;
    /** How the lag in force is doing, so a challenger can be measured against it. */
    let holding = 0;
    for (let lag = 0; lag < span; lag += 1) {
      let referenceMean = 0;
      for (let i = 0; i < CORRELATION_WINDOW; i += 1) {
        referenceMean += this.at(this.reference, i + lag);
      }
      referenceMean /= CORRELATION_WINDOW;
      let dot = 0;
      let referenceNorm = 0;
      for (let i = 0; i < CORRELATION_WINDOW; i += 1) {
        const r = this.at(this.reference, i + lag) - referenceMean;
        dot += (this.at(this.capture, i) - captureMean) * r;
        referenceNorm += r * r;
      }
      if (referenceNorm <= REFERENCE_FLOOR) {
        continue;
      }
      const score = dot / Math.sqrt(captureNorm * referenceNorm);
      if (score > 0) {
        field += score;
        counted += 1;
      }
      if (lag === this.lagPoints) {
        holding = score;
      }
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }

    const average = counted > 0 ? field / counted : 0;
    // A winner sitting on the last lag searched, while the search is still
    // growing, is not a peak — it is the shoulder of one that lies past
    // the edge. Believing it would lock the filter onto the near side of a
    // delay it has not seen yet, and the switch margin would then defend
    // that wrong answer against the right one arriving a search later.
    const onTheEdge = span < MAX_LAG_POINTS && bestLag === span - 1;
    const stands =
      bestLag >= 0 && !onTheEdge && best >= MIN_CORRELATION && best >= PEAK_PROMINENCE * average;
    if (stands) {
      this.candidateHits = bestLag === this.candidate ? this.candidateHits + 1 : 1;
      this.candidate = bestLag;
      // A challenger has to win twice, and — against a lag already in
      // force — win clearly. Both together are what stop the estimate
      // wandering between two plausible alignments, throwing the filter
      // away each time it moves.
      const beats = this.lagPoints === null || best > holding * SWITCH_MARGIN;
      if (this.candidateHits >= CONFIRMATIONS && beats && bestLag !== this.lagPoints) {
        this.lagPoints = bestLag;
      }
    } else {
      this.candidate = null;
      this.candidateHits = 0;
    }

    // A lag, once found, is HELD: one search that finds nothing means the
    // last third of a second was quiet, not that the machine's buffers
    // moved. What a poor search does cost is confidence, and confidence
    // is what the filter sizes its steps by — so the guard fades out on
    // its own where there is nothing to cancel, instead of switching off
    // on a threshold and back on at the first loud moment.
    this.locked = this.lagPoints !== null;
    this.confidence = this.lagPoints === null ? 0 : Math.max(0, holding);
    if (this.lagPoints !== null) {
      this.refine(this.lagPoints * HOP);
    }
  }

  /**
   * Second pass: the same lag, looked for again in the samples rather
   * than in their loudness, over one hop either side.
   *
   * Squared correlation, so a path that arrives inverted is found rather
   * than avoided — the filter is perfectly happy with a negative weight,
   * and an OS mixer is under no obligation to preserve polarity.
   */
  private refine(coarse: number): void {
    const low = Math.max(PRE_TAPS, coarse - FINE_SPAN);
    const high = coarse + FINE_SPAN;
    let bestLag = -1;
    let best = 0;
    for (let lag = low; lag <= high; lag += 1) {
      let dot = 0;
      let norm = 0;
      for (let i = 0; i < FINE_WINDOW; i += 1) {
        const c = this.captureWave[(this.waveWrite - 1 - i) & (WAVE_RING - 1)]!;
        const r = this.referenceWave[(this.waveWrite - 1 - i - lag) & (WAVE_RING - 1)]!;
        dot += c * r;
        norm += r * r;
      }
      if (norm <= REFERENCE_FLOOR) {
        continue;
      }
      const score = (dot * dot) / norm;
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
    if (bestLag < 0) {
      return;
    }
    if (this.fineLag === null || Math.abs(bestLag - this.fineLag) > REALIGN_TOLERANCE) {
      // Small drift is what the filter's own slack is for; a real move is
      // a different path, and everything learnt about the old one is now
      // a wrong answer applied at full strength.
      if (this.fineLag !== null) {
        this.revision += 1;
      }
      this.fineLag = bestLag;
    }
  }
}

export interface EchoGuardStats {
  /** Echo return loss enhancement, dB: how much of our own output is gone. */
  erleDb: number;
  /** Where the copy was found, in milliseconds, or null while unlocked. */
  delayMs: number | null;
  /** How much of the echo estimate survives the filter, 0 … 1. */
  leak: number;
  /** True once the guard is both locked on and actually removing something. */
  active: boolean;
  /** The suppressor's gain in force, 0 … 1 — 1 while it is standing aside. */
  gain: number;
}

/** One channel's adaptive filter, aligned by the shared delay estimate. */
class ChannelFilter {
  private readonly weights = new Float32Array(TAPS);
  private readonly ring = new Float32Array(REFERENCE_RING);
  private write = 0;
  /** Running reference power over the filter window, for the N in NLMS. */
  private power = 0;

  /** Stores one reference sample; must be called once per sample, in order. */
  push(sample: number): void {
    this.ring[this.write] = sample;
    this.write = (this.write + 1) & (REFERENCE_RING - 1);
  }

  /**
   * The echo estimate for the sample just pushed, reading the reference
   * from `delay` samples ago. The window straddles that point (PRE_TAPS
   * of it sit earlier), so a search that landed a hop out is still inside
   * what the filter can reach.
   */
  estimate(delay: number): number {
    const start = this.write - 1 - delay + PRE_TAPS;
    let sum = 0;
    let power = 0;
    for (let tap = 0; tap < TAPS; tap += 1) {
      const value = this.ring[(start - tap) & (REFERENCE_RING - 1)]!;
      sum += this.weights[tap]! * value;
      power += value * value;
    }
    this.power = power;
    return sum;
  }

  /**
   * One NLMS step, on the alignment `estimate` just used. `trust` scales
   * it down while the near end is loud — the cheap, standard stand-in for
   * a double-talk detector: when most of the error is program audio
   * rather than un-cancelled echo, the gradient is mostly noise and the
   * filter should barely move.
   */
  adapt(error: number, delay: number, trust: number): void {
    const step = (STEP * trust * error) / (this.power + REGULARISATION);
    const keep = 1 - LEAKAGE;
    const start = this.write - 1 - delay + PRE_TAPS;
    for (let tap = 0; tap < TAPS; tap += 1) {
      this.weights[tap]! =
        keep * this.weights[tap]! + step * this.ring[(start - tap) & (REFERENCE_RING - 1)]!;
    }
  }

  /**
   * Throws away what it learnt, keeping the reference history — the
   * weights are meaningless at a new alignment, the recorded reference
   * is not.
   */
  forgetPath(): void {
    this.weights.fill(0);
    this.power = 0;
  }
}

/**
 * The guard itself: capture in, capture-without-us out.
 *
 * Channel counts are whatever turns up. A stereo capture gets a filter
 * per side (the two sides of a game are not the same signal); a mono
 * reference against a stereo capture is fanned out, which is right,
 * because it is the same thing we played into both.
 */
export class EchoGuard {
  private readonly finder = new DelayFinder();
  private readonly filters: ChannelFilter[] = [];
  /** Wiener gain in force, carried across blocks so it ramps instead of steps. */
  private gain = 1;
  private leak = MAX_LEAK;
  /** The alignment the filters were last built for. */
  private alignment = 0;
  /** Slow averages, for the reading the room's HUD shows. */
  private captureEnergy = 0;
  private residualEnergy = 0;
  /**
   * Block averages the leak is measured on. Measuring it on one block of
   * 32 samples means taking the minimum of thousands of noisy ratios an
   * hour, which finds a fluke every time and reports it as the truth.
   */
  private echoAverage = 0;
  private residualAverage = 0;
  /** Fast averages, for deciding how much to trust the next gradient. */
  private echoPower = 0;
  private errorPower = 0;
  private referencePower = 0;
  private capturePower = 0;
  private locked = false;

  constructor(readonly sampleRate: number) {}

  stats(): EchoGuardStats {
    const erle =
      this.residualEnergy > 0 && this.captureEnergy > 0
        ? 10 * Math.log10(this.captureEnergy / this.residualEnergy)
        : 0;
    return {
      erleDb: Math.max(0, erle),
      delayMs:
        this.finder.delaySamples() === null
          ? null
          : (this.finder.delaySamples()! / this.sampleRate) * 1000,
      leak: this.leak,
      active: this.locked && this.leak < 0.5,
      gain: this.gain,
    };
  }

  /**
   * Cleans one render quantum in place-ish: `capture` and `reference` are
   * whatever the graph handed over, `output` is written. All three carry
   * the same number of frames; channel counts may differ.
   */
  process(
    capture: readonly Float32Array[],
    reference: readonly Float32Array[],
    output: readonly Float32Array[],
  ): void {
    const frames = capture[0]?.length ?? 0;
    const channels = capture.length;
    while (this.filters.length < channels) {
      this.filters.push(new ChannelFilter());
    }
    if (this.finder.revision !== this.alignment) {
      // The search moved. Every weight describes an echo path measured
      // from the OLD point, so keeping them would not be a stale estimate
      // but a wrong one, subtracted at full strength.
      this.alignment = this.finder.revision;
      this.startOver();
    }

    for (let start = 0; start < frames; start += SUPPRESSION_BLOCK) {
      const end = Math.min(start + SUPPRESSION_BLOCK, frames);
      let captureEnergy = 0;
      let echoEnergy = 0;
      let residualEnergy = 0;
      let referenceEnergy = 0;

      for (let n = start; n < end; n += 1) {
        // The delay estimate is driven by the first channel of each side:
        // the alignment is a property of the path, not of a channel.
        const referenceMono = reference[0]?.[n] ?? 0;
        this.finder.push(capture[0]?.[n] ?? 0, referenceMono);
        referenceEnergy += referenceMono * referenceMono;
        const found = this.finder.delaySamples();
        // Reaching back less than PRE_TAPS would have the filter read
        // reference it has not been given yet.
        const delay = found === null ? null : Math.max(found, PRE_TAPS);
        this.referencePower +=
          POWER_SMOOTHING * (referenceMono * referenceMono - this.referencePower);
        const adapting =
          delay !== null && this.finder.locked && this.referencePower > REFERENCE_FLOOR;
        // How much of the capture the correlation says is us, before the
        // filter has an opinion of its own. Squaring turns a correlation
        // of amplitudes into a share of power, which is what a step size
        // wants: adapt in proportion to how much of this signal is even
        // ours to remove.
        const prior = this.finder.confidence * this.finder.confidence;
        // The step, sized by how much of this capture is ours to remove.
        //
        // Deliberately NOT by how much the filter thinks it is removing:
        // a filter over-fitting the near end also reports that it is
        // explaining everything, so letting it grade its own work is how
        // it talks itself into eating the game. The correlation is
        // evidence from outside the loop. The floor keeps it creeping
        // toward a solution even through unrelenting double talk, where
        // the ratio never looks good.
        const trust = clamp(prior, MIN_TRUST, 1);

        for (let channel = 0; channel < channels; channel += 1) {
          const filter = this.filters[channel]!;
          // A mono reference against a stereo capture feeds both sides —
          // it IS what was played into both.
          const source = reference[Math.min(channel, reference.length - 1)];
          filter.push(source?.[n] ?? 0);
          const desired = capture[channel]![n]!;
          const echo = delay === null ? 0 : filter.estimate(delay);
          const error = desired - echo;
          output[channel]![n] = error;
          if (adapting) {
            filter.adapt(error, delay, trust);
          }
          if (channel === 0) {
            captureEnergy += desired * desired;
            echoEnergy += echo * echo;
            residualEnergy += error * error;
            this.echoPower += POWER_SMOOTHING * (echo * echo - this.echoPower);
            this.errorPower += POWER_SMOOTHING * (error * error - this.errorPower);
            this.capturePower += POWER_SMOOTHING * (desired * desired - this.capturePower);
          }
        }
      }

      const span = end - start;
      const active = referenceEnergy / span > REFERENCE_FLOOR;
      this.locked = this.finder.locked;
      if (
        this.capturePower > REFERENCE_FLOOR &&
        this.errorPower > DIVERGED * this.capturePower
      ) {
        this.startOver();
      }

      if (active && this.locked) {
        this.trackLeak(echoEnergy / span, residualEnergy / span);
        this.captureEnergy += 0.02 * (captureEnergy - this.captureEnergy);
        this.residualEnergy += 0.02 * (residualEnergy - this.residualEnergy);
      }

      const target = active && this.locked ? this.suppression(echoEnergy, residualEnergy) : 1;
      this.applyGain(output, start, end, target);
    }
  }

  /** Drops everything learnt and every average built on it. */
  private startOver(): void {
    for (const filter of this.filters) {
      filter.forgetPath();
    }
    this.echoPower = 0;
    this.errorPower = 0;
    this.capturePower = 0;
    this.echoAverage = 0;
    this.residualAverage = 0;
    this.leak = MAX_LEAK;
  }

  /**
   * How much of the echo estimate is still in the output, measured on
   * the quietest blocks we see while the reference is loud.
   *
   * The floor it settles at IS the answer to "is our own sound even in
   * this capture" — a shared browser tab, or a machine whose room plays
   * to headphones, drives it to nothing and switches the guard off by
   * arithmetic rather than by a flag somebody has to set.
   */
  private trackLeak(echoPower: number, residualPower: number): void {
    this.echoAverage += LEAK_SMOOTHING * (echoPower - this.echoAverage);
    this.residualAverage += LEAK_SMOOTHING * (residualPower - this.residualAverage);
    if (this.echoAverage <= REFERENCE_FLOOR) {
      return;
    }
    // The minimum is what is wanted, and it is only meaningful over the
    // stretches where the reference is loud and the near end is not: a
    // block with the game in it has a huge ratio and is ignored by
    // construction, which is exactly what makes this an echo-only
    // measurement without having to detect echo-only stretches.
    const ratio = this.residualAverage / this.echoAverage;
    this.leak =
      ratio < this.leak
        ? this.leak + LEAK_FALL * (ratio - this.leak)
        : Math.min(MAX_LEAK, this.leak * LEAK_RISE);
    this.leak = clamp(this.leak, MIN_LEAK, MAX_LEAK);
  }

  /**
   * What is left of the echo, taken out by gain rather than by
   * subtraction. Spectral subtraction's argument in the time domain: of
   * the energy still here, this much is ours, so keep the rest.
   */
  private suppression(echoEnergy: number, residualEnergy: number): number {
    const stillOurs = Math.min(this.leak, SUPPRESSION_CEILING) * echoEnergy;
    if (residualEnergy <= REFERENCE_FLOOR) {
      return 1;
    }
    const theirs = residualEnergy - stillOurs;
    return clamp(theirs / residualEnergy, MIN_GAIN, 1);
  }

  /** Ramps to the block's gain instead of stepping onto it (a step clicks). */
  private applyGain(
    output: readonly Float32Array[],
    start: number,
    end: number,
    target: number,
  ): void {
    const span = end - start;
    const from = this.gain;
    for (let n = start; n < end; n += 1) {
      const gain = from + ((target - from) * (n - start + 1)) / span;
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel]![n]! *= gain;
      }
    }
    this.gain = target;
  }
}
