/**
 * What this person takes part in: the screens other people share, and the
 * tools the room turns on. Both are refusable, and both refusals are
 * LOCAL — the server never learns them, and the room never carries them.
 *
 * A refusal is not a preference about how the room behaves; it is about
 * what arrives here. So it costs nothing to anybody else, needs no
 * protocol message, and cannot be a word in a tool's shared state — that
 * value is one thing the whole room agrees on (web/src/tools/contract.ts),
 * and one person writing "no thanks" into it would be editing everyone's
 * copy.
 *
 * Refusing a TOOL is settled here in the page: the stage is simply not
 * built for this viewer, so the tool's video, its third-party frame and
 * its scripts never load. Nothing has to be told to anyone.
 *
 * Refusing a SCREEN has to reach the peer that would send it, or the
 * bytes arrive whether or not anything draws them. That note rides the
 * opaque `signal` envelope the server forwards without inspecting —
 * the same envelope the relay-health note already uses (screen-relay.ts)
 * — so no server code, no room state, and an older client that does not
 * know the note simply keeps sending, which is exactly today's behaviour.
 *
 * The one rule that makes this safe: **a refusal is only ever sent from a
 * leaf of the screen tree.** The tree (server/src/domain/screen-tree.ts)
 * makes every viewer a possible relay, and the server tells each peer
 * only its OWN role — so the peer holding the refusal is the only one who
 * knows whether anybody is downstream of it. A relay that stopped
 * receiving would take its children's screen down with it, which is a
 * much worse thing than one person spending bandwidth. While this peer
 * has children it keeps carrying the screen for them, and it still does
 * not draw it: the decode and the pixels are the part it can always
 * refuse alone.
 */

/** The two switches, as this person left them. */
export interface Participation {
  /** Receive the screens other people share. */
  screens: boolean;
  /** Build the stage and panel of a tool the room turned on. */
  tools: boolean;
}

/** Taking part in everything: what a room does until somebody says otherwise. */
export const DEFAULT_PARTICIPATION: Participation = { screens: true, tools: true };

const STORAGE_KEY = 'freecord:participation';

export function loadParticipation(): Participation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PARTICIPATION;
    }
    const parsed = JSON.parse(raw) as Partial<Participation>;
    return {
      screens: parsed.screens !== false,
      tools: parsed.tools !== false,
    };
  } catch {
    return DEFAULT_PARTICIPATION;
  }
}

export function saveParticipation(value: Participation): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // private browsing: the choice lasts only this session
  }
}

/**
 * A refusal, as it travels to the peer that would send. `of` names the
 * tree — whose screen this is about — because a peer can be a leaf in one
 * tree and a relay in another, and the answer differs per tree.
 *
 * Versioned and ignored-if-unknown, like the relay note: a client that
 * does not understand it sees a signal envelope with neither description
 * nor candidate and no-ops, and goes on sending.
 */
export interface ScreenRefusal {
  v: 1;
  of: string;
  /** `true`: stop sending me this screen. `false`: I am back. */
  on: boolean;
}

export function makeScreenRefusal(of: string, on: boolean): { screens: ScreenRefusal } {
  return { screens: { v: 1, of, on } };
}

export function extractScreenRefusal(data: unknown): ScreenRefusal | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const note = (data as { screens?: unknown }).screens;
  if (typeof note !== 'object' || note === null) {
    return null;
  }
  const { v, of, on } = note as { v?: unknown; of?: unknown; on?: unknown };
  if (v !== 1 || typeof of !== 'string' || typeof on !== 'boolean') {
    return null;
  }
  return { v: 1, of, on };
}

/**
 * Who this peer still sends a screen to, once the people who refused it
 * are taken out. Sending to nobody is a normal outcome — a sharer whose
 * only viewer stepped out keeps the capture running for whoever joins.
 */
export function sendingTargets(
  children: readonly string[],
  refused: ReadonlySet<string>,
): string[] {
  return children.filter((id) => !refused.has(id));
}

/**
 * Whether a refusal may be sent for this tree right now: only from a leaf.
 * See the note at the top — a relay's children have nowhere else to get
 * the screen from, and this peer is the only one who knows they are there.
 */
export function mayRefuse(participation: Participation, children: readonly string[]): boolean {
  return !participation.screens && children.length === 0;
}

/**
 * When to offer the switch instead of waiting for somebody to find it.
 *
 * The evidence is the screen this person is RECEIVING: bytes are arriving
 * and the picture is still crawling, which is the shape of a link that
 * cannot carry what the room is sending. A dead path is not this — that is
 * the stall watch's job (stall-watch.ts), and it has its own ladder.
 *
 * The offer is made once. A suggestion that returns every time the link
 * dips is a nag, and the switch it points at is in the settings from then
 * on; somebody who said no meant no.
 */
export interface StrainState {
  /** Consecutive crawling samples (~2 s apart). */
  crawling: number;
  /** The one offer this session has already made. */
  offered: boolean;
}

/** Below this the screen has stopped being a screen and is a slideshow. */
const CRAWLING_FPS = 5;
/** Samples before offering (~8 s at the 2 s cadence): a dip is not a verdict. */
const CRAWLING_SAMPLES = 4;

export function initialStrainState(): StrainState {
  return { crawling: 0, offered: false };
}

/** One stats sample; mutates the state and says whether to offer now. */
export function advanceStrain(
  state: StrainState,
  sample: { direction: 'sending' | 'receiving'; fps: number | null; kbps: number | null } | null,
): boolean {
  const crawling =
    sample !== null &&
    sample.direction === 'receiving' &&
    sample.fps !== null &&
    sample.fps < CRAWLING_FPS &&
    (sample.kbps ?? 0) > 1;
  if (!crawling) {
    state.crawling = 0;
    return false;
  }
  state.crawling += 1;
  if (state.crawling < CRAWLING_SAMPLES || state.offered) {
    return false;
  }
  state.offered = true;
  return true;
}
