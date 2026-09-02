/**
 * When a room counts as a room that happened.
 *
 * Creating a room is one click, so "rooms created" would count clicks, not
 * conversations: a link pasted nowhere, a page reloaded twice and a test run
 * all look the same from there. What is worth counting is company — two
 * people or more in the same room, long enough that they were doing
 * something. That is the number the home shows.
 *
 * The clock only runs while the room has company: a room with one person
 * waiting for an hour has zero, and two stretches of eleven minutes with a
 * gap between them add up and count. A room reports itself once, ever
 * (`counted`), so the total only ever goes up by one per room.
 *
 * Transport-free on purpose: both edges (Fastify and the Durable Object)
 * fold their own head count through the same three functions.
 */
export const ROOM_STATS = {
  /** Company starts at two: alone in a room is not a conversation. */
  minPeers: 2,
  /** How long the company has to last before the room counts. */
  minCompanyMs: 20 * 60 * 1000,
} as const;

/** A room's company clock. Small and JSON-shaped: it lives in storage. */
export interface RoomCompany {
  /** Company time already closed, in ms. */
  ms: number;
  /** Start of the stretch running right now, or null when under `minPeers`. */
  since: number | null;
  /** Already added to the global total — a room is counted once, ever. */
  counted: boolean;
}

/** A room nobody has joined yet. */
export const NO_COMPANY: RoomCompany = { ms: 0, since: null, counted: false };

/** Company so far, including the stretch still running. */
export function companyMsAt(state: RoomCompany, now: number): number {
  return state.ms + (state.since === null ? 0 : Math.max(0, now - state.since));
}

/**
 * Folds the room's current head count in.
 *
 * Returns the state unchanged (same reference) when nothing happened, so a
 * caller can skip the storage write on the sweeps where the room is simply
 * going on as it was — which is almost all of them.
 */
export function withPeerCount(state: RoomCompany, peers: number, now: number): RoomCompany {
  const hasCompany = peers >= ROOM_STATS.minPeers;
  if (hasCompany === (state.since !== null)) {
    return state;
  }
  return hasCompany
    ? { ...state, since: now }
    : { ...state, ms: companyMsAt(state, now), since: null };
}

/** True while the room has earned its place in the total and has not taken it. */
export function countable(state: RoomCompany, now: number): boolean {
  return !state.counted && companyMsAt(state, now) >= ROOM_STATS.minCompanyMs;
}
