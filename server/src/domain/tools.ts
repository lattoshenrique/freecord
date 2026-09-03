/**
 * The tool shelf's shared state — the one thing a tool needs from us.
 *
 * A tool is a thing a room brings in besides the people in it: a video
 * everyone watches, a board everyone draws on, a timer everyone can see.
 * They are written by other people (docs/tools.md), which is why the
 * server knows NOTHING about any of them: it keeps one opaque JSON value
 * per tool id, hands it to whoever joins, and echoes every change to the
 * room. A new tool costs zero lines here.
 *
 * Two properties are the core contract:
 *
 * 1. LAST WORD WINS by default. Whoever touches a tool says what its state
 *    is, and everybody — the sender included — plays from what comes back.
 *    The built-in watch tool is the deliberate exception: its first setter
 *    controls it until it is cleared (canControlTool, below).
 *
 * 2. THE CLOCK IS OURS. A state is stored with the clock reading that
 *    produced it, and goes out with its AGE in milliseconds instead of a
 *    timestamp. A tool that cares about time (where a video is, how much
 *    of a timer is left) advances its own numbers by that age, and never
 *    has to trust one browser's clock against another's.
 *
 * What the server refuses is deliberately shallow — an id it can key by,
 * a value it can store, and a cap on how many and how big. It cannot
 * validate a tool's state without knowing the tool, so validating it is
 * the tool's job, on the way in, in every client (`parseState`).
 */

/** One tool's state, as the room holds it. */
export interface ToolEntry {
  /** Whatever the tool put there. Opaque: JSON in, JSON out. */
  state: unknown;
  /** The peer that last set it — a tool may say who did what. */
  by: string;
  /** Server clock when it was set (see the note on the clock above). */
  at: number;
}

/** Every tool with something on, by tool id. */
export type ToolStates = Record<string, ToolEntry>;

/** One tool's state as the room hears it: age instead of a timestamp. */
export interface ToolProjection {
  tool: string;
  state: unknown;
  by: string;
  /** Milliseconds since this state was set, by the server's clock. */
  age: number;
}

export const TOOL_LIMITS = {
  /**
   * A tool id is a wire key and a storage key: lowercase, dashed, short.
   * Third-party ids are namespaced by convention (`acme-whiteboard`), not
   * by rule — the room is not a marketplace and collisions are settled by
   * whoever assembles the build.
   */
  idPattern: /^[a-z][a-z0-9-]{1,31}$/,
  /**
   * A state is echoed to everyone on every change and stored in a Durable
   * Object value (128 KiB for all of them together): 4 KiB per tool is
   * room for a cursor, a playlist or a scoreboard, and far short of a
   * tool trying to move its documents through here. A tool with real data
   * to move has the file channel and the mesh for it.
   */
  maxStateBytes: 4 * 1024,
  /** How many tools a room may have on at once. */
  maxTools: 8,
} as const;

/**
 * Built-in tools whose first setter remains their controller until the
 * tool is turned off. This is deliberately a server policy, not a field
 * inside the opaque state: trusting a client-supplied controller id would
 * let any peer appoint themselves.
 */
const STARTER_CONTROLLED_TOOLS = new Set(['watch']);

/** Whether `peerId` may change or clear this tool's current state. */
export function canControlTool(states: ToolStates, tool: string, peerId: string): boolean {
  const current = states[tool];
  return !current || !STARTER_CONTROLLED_TOOLS.has(tool) || current.by === peerId;
}

export function isToolId(value: unknown): value is string {
  return typeof value === 'string' && TOOL_LIMITS.idPattern.test(value);
}

/**
 * Whether a value may be stored as a tool's state: JSON-shaped and inside
 * the byte cap. `undefined` is not a state — clearing a tool is `null`,
 * which is handled by the caller (clearToolState).
 */
export function isStorableState(state: unknown): boolean {
  if (state === undefined) {
    return false;
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(state);
  } catch {
    return false; // cycles, BigInt: nothing that could have come off a wire
  }
  return typeof encoded === 'string' && encoded.length <= TOOL_LIMITS.maxStateBytes;
}

/**
 * Sets one tool's state. Returns the new map, or null when the room is
 * already carrying `maxTools` other tools — a cap the caller reports as a
 * refusal rather than applying half of it.
 */
export function setToolState(
  states: ToolStates,
  tool: string,
  entry: ToolEntry,
): ToolStates | null {
  if (!(tool in states) && Object.keys(states).length >= TOOL_LIMITS.maxTools) {
    return null;
  }
  return { ...states, [tool]: entry };
}

/** Clears one tool. Absent is the same as cleared, so this never fails. */
export function clearToolState(states: ToolStates, tool: string): ToolStates {
  if (!(tool in states)) {
    return states;
  }
  const next = { ...states };
  delete next[tool];
  return next;
}

/** One tool's state as the room hears it. */
export function projectTool(
  tool: string,
  entry: ToolEntry | undefined,
  now: number,
): ToolProjection | null {
  if (!entry) {
    return null;
  }
  return {
    tool,
    state: entry.state,
    by: entry.by,
    // A clock that went backwards must not hand out a negative age.
    age: Math.max(0, now - entry.at),
  };
}

/** Everything on right now, for a `welcome`. */
export function projectTools(states: ToolStates, now: number): ToolProjection[] {
  return Object.entries(states)
    .map(([tool, entry]) => projectTool(tool, entry, now))
    .filter((projection): projection is ToolProjection => projection !== null);
}
