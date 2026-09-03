/**
 * Viewer-side watch over the screen's decode progress — and over its
 * absence.
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

export type StallAction = 'none' | 'notify-parent' | 'restart-ice' | 'ask-source';

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

/** Samples before the first nudge to the source (~6 s at the 2 s cadence). */
const ASK_STRIKES = 3;
/**
 * Samples before the transport itself is blamed (~16 s) — deliberately
 * behind the mesh's own NEGOTIATION_STALL_MS rollback (12 s), so a lost
 * offer gets healed by the watchdog that knows about it before this one
 * starts restarting ICE over the top of it.
 */
const MISSING_RESTART_STRIKES = 8;

/**
 * The watch for a branch that never delivered anything at all.
 *
 * Everything above measures a track: flat frames, silent bytes. But the
 * commonest black screen has no track to measure — the tree named a
 * source, and nothing ever arrived from it. Nobody notices: the sampler
 * has no receiver to read, the relay note has no pipe to demote, and the
 * source is happily sending to everyone else. One person sits on a black
 * tile until they reload.
 *
 * So the absence gets its own ladder, and it is deliberately slower than
 * the frozen one — a tree that is still settling (a relay that has not
 * reported its forwarding stream, an offer in flight) looks exactly like
 * a dead branch for the first few seconds, and healing it would mean
 * fighting a negotiation that was about to succeed:
 *
 *   1. `ask-source` — tell the source we are still expecting this screen.
 *      It reconciles its senders for that tree, which re-adds one that
 *      was dropped; and if IT has no upstream either, its own watch is
 *      one rung behind ours, so the repair walks up the branch.
 *   2. `restart-ice` — the ask changed nothing, so the path to the source
 *      is suspect. Once per episode, like the frozen watch.
 *
 * The asks keep their cadence after the restart is spent: a source that
 * becomes able to send eventually hears one.
 */
export function advanceMissing(state: StallState, present: boolean): StallAction {
  if (present) {
    state.strikes = 0;
    state.restarted = false;
    return 'none';
  }
  state.strikes += 1;
  if (state.strikes >= MISSING_RESTART_STRIKES && !state.restarted) {
    state.restarted = true;
    return 'restart-ice';
  }
  return state.strikes % ASK_STRIKES === 0 ? 'ask-source' : 'none';
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
