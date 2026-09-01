/**
 * Adaptive uplink policy: the feedback loop that turns getStats() readings
 * into send-cap decisions.
 *
 * Every cap in this codebase is a budget assumption (screen-quality.ts
 * assumes a 10 Mbps uplink, camera-quality.ts a 4 Mbps one). This module
 * closes the loop on those assumptions: it reads what the network actually
 * says — the encoder's qualityLimitationReason, RTCP loss reports and the
 * congestion controller's own bandwidth estimate — and moves a per-track
 * factor down a ladder when the link is squeezed, back up when it proves
 * clean. The user's preset stays the ceiling; the ladder only ever takes
 * away, and gives back what it took.
 *
 * The shape is AIMD with hysteresis: multiplicative decrease on sustained
 * congestion, slow recovery on sustained calm, and a cooldown after every
 * step so a change can settle before the next verdict. Deliberately pure —
 * plain data in, plain data out — so the whole state machine is testable
 * without a browser, and so it owes nothing to the files that will feed it
 * (mesh.ts applies the caps, use-room.ts owns the tick).
 */

export type CongestionCause = 'bandwidth' | 'cpu' | 'other' | 'none';

/** One tick's aggregated evidence for a single adapted track. */
export interface CongestionSample {
  /** Worst qualityLimitationReason across the track's senders; null = not reported. */
  limitation: CongestionCause | null;
  /** Worst RTCP-reported loss fraction (0..1) across receivers; null = no reports yet. */
  fractionLost: number | null;
  /** Smallest GCC bandwidth estimate (bps) across the transports in use; null where unsupported. */
  availableOutgoingBitrate: number | null;
}

export interface AdaptiveConfig {
  /** Consecutive congested ticks before stepping down. */
  downAfter: number;
  /** Consecutive clean ticks before stepping back up. */
  upAfter: number;
  /** Ticks held after any step, so its effect lands before the next verdict. */
  cooldown: number;
  /** Loss fraction that counts as congestion on its own. */
  lossDown: number;
  /** Loss fraction below which a tick counts as clean. */
  lossClean: number;
  /** Step up only with this much estimated headroom over the target (when the estimate exists). */
  headroom: number;
  /**
   * Whether an encoder-bound tick ('cpu') counts as congestion. The camera
   * says yes — a lower cap plus a resolution cut genuinely unloads the
   * encoder. The screen says no: its degradationPreference already picks
   * which axis to sacrifice, and a second hand on the same wheel oscillates.
   */
  reactToCpu: boolean;
}

/**
 * At a 2 s stats cadence: down in ~4 s of sustained congestion, another
 * step no sooner than 6 s later, back up after ~16 s of proven calm.
 * Congestion is answered fast and forgiven slowly — the reverse order is
 * how calls oscillate.
 */
export const CAMERA_ADAPTIVE: AdaptiveConfig = {
  downAfter: 2,
  upAfter: 8,
  cooldown: 3,
  lossDown: 0.05,
  lossClean: 0.01,
  headroom: 1.3,
  reactToCpu: true,
};

export const SCREEN_ADAPTIVE: AdaptiveConfig = {
  ...CAMERA_ADAPTIVE,
  reactToCpu: false,
};

/**
 * The ladder. Each step keeps roughly 70% of the last — deep enough that
 * the bottom rung (25%) survives a link four times worse than assumed,
 * short enough that recovery is a handful of steps.
 */
export const LEVEL_FACTORS: readonly number[] = [1, 0.7, 0.5, 0.35, 0.25];

export interface AdaptiveState {
  /** Index into LEVEL_FACTORS; 0 = the preset's full cap. */
  level: number;
  congestedTicks: number;
  cleanTicks: number;
  cooldown: number;
}

export function initialAdaptiveState(): AdaptiveState {
  return { level: 0, congestedTicks: 0, cleanTicks: 0, cooldown: 0 };
}

export function factorFor(state: AdaptiveState): number {
  return LEVEL_FACTORS[Math.min(state.level, LEVEL_FACTORS.length - 1)]!;
}

/**
 * One tick of the state machine.
 *
 * `targetBitrate` is what the caller currently asks of the measured
 * transports (bps, all of its tracks summed): stepping up is gated on the
 * congestion controller estimating `headroom` times that much — when it
 * publishes an estimate at all. A tick with no evidence in any field holds
 * everything: silence is not proof of calm.
 */
export function advance(
  state: AdaptiveState,
  sample: CongestionSample,
  config: AdaptiveConfig,
  targetBitrate: number,
): AdaptiveState {
  const next: AdaptiveState = { ...state, cooldown: Math.max(0, state.cooldown - 1) };

  const noEvidence =
    sample.limitation === null &&
    sample.fractionLost === null &&
    sample.availableOutgoingBitrate === null;
  const congested =
    sample.limitation === 'bandwidth' ||
    (config.reactToCpu && sample.limitation === 'cpu') ||
    (sample.fractionLost !== null && sample.fractionLost >= config.lossDown);
  const clean =
    !noEvidence &&
    !congested &&
    (sample.limitation === 'none' || sample.limitation === null) &&
    (sample.fractionLost === null || sample.fractionLost < config.lossClean);

  if (congested) {
    next.cleanTicks = 0;
    next.congestedTicks = state.congestedTicks + 1;
    if (
      next.congestedTicks >= config.downAfter &&
      next.cooldown === 0 &&
      next.level < LEVEL_FACTORS.length - 1
    ) {
      next.level += 1;
      next.cooldown = config.cooldown;
      next.congestedTicks = 0;
    }
    return next;
  }

  next.congestedTicks = 0;
  if (!clean) {
    // Middling (some loss, an 'other' limitation, or no evidence): hold.
    next.cleanTicks = 0;
    return next;
  }

  next.cleanTicks = state.cleanTicks + 1;
  const headroomOk =
    sample.availableOutgoingBitrate === null ||
    targetBitrate <= 0 ||
    sample.availableOutgoingBitrate >= targetBitrate * config.headroom;
  // Insufficient headroom keeps the clean streak: the step lands on the
  // first tick the estimate allows it, not upAfter ticks later.
  if (next.cleanTicks >= config.upAfter && next.cooldown === 0 && next.level > 0 && headroomOk) {
    next.level -= 1;
    next.cooldown = config.cooldown;
    next.cleanTicks = 0;
  }
  return next;
}

/**
 * Applies the ladder to a send cap. `floor` is the bitrate below which the
 * medium stops working (a face stops being a face, text stops being
 * readable) — the ladder never cuts through it. At `scaleDownAt` and below
 * (when given), the encode itself is shrunk: at deep congestion half
 * resolution both saves the bits and unloads the encoder, and looks better
 * than full resolution starved of bitrate.
 */
export function adaptedEncoding<T extends { maxBitrate: number; scaleResolutionDownBy?: number }>(
  encoding: T,
  state: AdaptiveState,
  options: { floor: number; scaleDownAt?: number },
): T {
  const factor = factorFor(state);
  const adapted: T = {
    ...encoding,
    maxBitrate: Math.max(options.floor, Math.round(encoding.maxBitrate * factor)),
  };
  if (options.scaleDownAt !== undefined && factor <= options.scaleDownAt) {
    adapted.scaleResolutionDownBy = Math.max(encoding.scaleResolutionDownBy ?? 1, 2);
  }
  return adapted;
}

const CAUSE_SEVERITY: Record<CongestionCause, number> = {
  none: 0,
  other: 1,
  cpu: 2,
  bandwidth: 3,
};

function asCause(value: unknown): CongestionCause | null {
  return value === 'bandwidth' || value === 'cpu' || value === 'other' || value === 'none'
    ? value
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Aggregates one tick's evidence from raw stats reports — one report per
 * peer the track is sent to, each being the values() of an RTCStatsReport
 * (from sender.getStats() or pc.getStats(); both carry what this reads).
 *
 * Worst-of across peers on purpose: in a mesh the slowest link defines
 * what the room sees, so it also gets to define the verdict. Video-only on
 * loss — audio rides uncapped and its RTCP would muddy the video ladder.
 */
export function congestionFromReports(
  reports: Iterable<Record<string, unknown>>[],
): CongestionSample {
  let limitation: CongestionCause | null = null;
  let fractionLost: number | null = null;
  let availableOutgoingBitrate: number | null = null;

  for (const report of reports) {
    // Per report, prefer the nominated candidate pair; failing that, the
    // busiest succeeded one (same tie-break as stats.ts).
    let pairEstimate: number | null = null;
    let bestWeight = -1;
    for (const stat of report) {
      if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
        const cause = asCause(stat.qualityLimitationReason);
        if (
          cause !== null &&
          (limitation === null || CAUSE_SEVERITY[cause] > CAUSE_SEVERITY[limitation])
        ) {
          limitation = cause;
        }
      } else if (stat.type === 'remote-inbound-rtp' && stat.kind === 'video') {
        const lost = num(stat.fractionLost);
        if (lost !== null && (fractionLost === null || lost > fractionLost)) {
          fractionLost = lost;
        }
      } else if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        const weight =
          stat.nominated === true ? Number.MAX_SAFE_INTEGER : (num(stat.bytesSent) ?? 0);
        const estimate = num(stat.availableOutgoingBitrate);
        if (estimate !== null && weight > bestWeight) {
          bestWeight = weight;
          pairEstimate = estimate;
        }
      }
    }
    if (
      pairEstimate !== null &&
      (availableOutgoingBitrate === null || pairEstimate < availableOutgoingBitrate)
    ) {
      availableOutgoingBitrate = pairEstimate;
    }
  }

  return { limitation, fractionLost, availableOutgoingBitrate };
}
