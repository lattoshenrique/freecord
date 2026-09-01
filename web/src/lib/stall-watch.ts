/**
 * Viewer-side watch over the screen's decode progress.
 *
 * The mesh has no referee: when the path that carries the screen dies
 * quietly — a NAT rebinding after hours of watching, a parent forwarding
 * bytes it cannot see are dead — nobody but the viewer notices, and until
 * now the viewer's only move was F5. This tracker turns flat framesDecoded
 * readings into an escalation ladder instead:
 *
 *   1. `notify-parent` — the relay note that demotes an encoded-passthrough
 *      child back to re-encode (screen-relay.ts). Cheap, and the right fix
 *      when the parent is blind.
 *   2. `restart-ice` — the note changed nothing, so the transport itself is
 *      suspect: an ICE restart renegotiates the path to the screen source.
 *
 * A truly static screen produces the same flat readings, so the restart
 * fires ONCE per stall episode: notes are harmless no-ops outside
 * passthrough, but restarting ICE every few seconds against a screen that
 * simply is not changing would be worse than the freeze it hunts. The
 * episode (and the restart budget) resets the moment frames move again.
 */

export interface StallState {
  /** Last cumulative framesDecoded reading; null before the first sample. */
  frames: number | null;
  /** Consecutive stalled samples (~2 s apart). */
  strikes: number;
  /** The one ICE restart this episode already spent. */
  restarted: boolean;
}

export type StallAction = 'none' | 'notify-parent' | 'restart-ice';

/** Samples until the first relay note (~4 s at the 2 s cadence). */
const NOTIFY_STRIKES = 2;
/** Samples until the transport itself is blamed (~8 s). */
const RESTART_STRIKES = 4;

export function initialStallState(): StallState {
  return { frames: null, strikes: 0, restarted: false };
}

/**
 * Feeds one stats sample; mutates the state and says what to do about it.
 * Stalled means framesDecoded is readable, flat AND nothing is arriving —
 * a slideshow at 1 fps still moves the counter and never trips this.
 */
export function advanceStall(
  state: StallState,
  framesDecoded: number | null,
  kbps: number | null,
): StallAction {
  const stalled =
    framesDecoded !== null && state.frames === framesDecoded && (kbps ?? 0) <= 1;
  state.frames = framesDecoded;
  if (!stalled) {
    state.strikes = 0;
    state.restarted = false;
    return 'none';
  }
  state.strikes += 1;
  if (state.strikes % NOTIFY_STRIKES !== 0) {
    return 'none';
  }
  if (state.strikes >= RESTART_STRIKES && !state.restarted) {
    state.restarted = true;
    return 'restart-ice';
  }
  // The note keeps its historical cadence: every other sample while the
  // stall lasts, so a parent that becomes demotable eventually hears it.
  return 'notify-parent';
}

/**
 * The voice's version of the same watch, per peer. Audio has no relay
 * tree and no parent to notify, so the ladder is one rung: a peer whose
 * inbound packet counter stops moving while its ICE path still claims to
 * be connected gets one ICE restart per episode (~8 s in). Chromium keeps
 * sending packets for a muted microphone (silence frames, no DTX), so a
 * flat counter means the path, not the person, went quiet. A peer that
 * never sent audio at all (no microphone permission) is not an episode:
 * the counter must have moved once before its stillness counts.
 */
export function advanceAudioStall(state: StallState, packetsReceived: number | null): StallAction {
  const stalled =
    packetsReceived !== null && state.frames !== null && state.frames > 0 && state.frames === packetsReceived;
  state.frames = packetsReceived;
  if (!stalled) {
    state.strikes = 0;
    state.restarted = false;
    return 'none';
  }
  state.strikes += 1;
  if (state.strikes >= RESTART_STRIKES && !state.restarted) {
    state.restarted = true;
    return 'restart-ice';
  }
  return 'none';
}
