/**
 * Signaling protocol — mirror of server/src/domain/room.ts.
 * Changed there, change here (and vice versa).
 */

import type { ScreenQualityId } from './screen-quality';

export interface PeerInfo {
  id: string;
  name: string;
}

/** Mirror of ROOM_LIMITS.maxParticipants — the room's seat count. */
export const MAX_PARTICIPANTS = 20;

/** Mirror of ROOM_LIMITS.maxScreens — how many screens may be shared at once. */
export const MAX_SCREENS = 3;

/**
 * How many cameras may be live at once for a given room size — mirror of
 * the server's cameraSlotsFor (≤6: everyone; 7–9: four; 10–16: three;
 * 17–20: two). The cap binds NEW activations only: a camera already live
 * is never shut off by the room growing past a threshold; slots free up
 * when someone turns the camera off or leaves.
 */
export function cameraSlotsFor(participantCount: number): number {
  if (participantCount <= 6) {
    return participantCount;
  }
  if (participantCount <= 9) {
    return 4;
  }
  return participantCount <= 16 ? 3 : 2;
}

/**
 * One tool's shared state — mirror of the server's ToolProjection
 * (server/src/domain/tools.ts). The state is whatever the tool put there:
 * opaque on the wire and to the server, checked on arrival by the tool
 * itself (`parseState`, web/src/tools/contract.ts).
 */
export interface ToolProjection {
  tool: string;
  state: unknown;
  /** The peer that set it. */
  by: string;
  /** Milliseconds since it was set, by the server's clock. */
  age: number;
}

/** An ICE server handed out by the edge (STUN/TURN, ephemeral credentials). */
export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export type ServerMessage =
  | {
      t: 'welcome';
      selfId: string;
      /** Presenting this on reconnect reclaims the same peerId. */
      resumeToken: string;
      /** STUN/TURN for the mesh; empty = client falls back to public STUN. */
      ice: IceServerConfig[];
      room: { slug: string; displayName: string };
      peers: PeerInfo[];
      /** Screens being shared right now, in start order (at most MAX_SCREENS). */
      screens: Array<{ id: string; streamId: string }>;
      /** Live cameras, so joiners and resumers see the slots in use. */
      cameras: string[];
      /** Who has their speakers off (see `deafen`), so joiners see it too. */
      deafened: string[];
      /** Who has their microphone off (see `mute`). */
      muted: string[];
      /** Every tool with something on, with the age of each state. */
      tools: ToolProjection[];
    }
  | { t: 'peer-joined'; peer: PeerInfo }
  | { t: 'peer-left'; id: string }
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'chat'; from: PeerInfo; text: string; ts: number }
  | { t: 'screen-started'; id: string; streamId: string }
  | { t: 'screen-stopped'; id: string }
  | { t: 'screen-denied' }
  /** A camera slot was granted (the requester hears this as its grant). */
  | { t: 'camera-started'; id: string }
  | { t: 'camera-stopped'; id: string }
  | { t: 'camera-denied' }
  /** A peer switched its speakers off (`on: true`) or back on. */
  | { t: 'peer-deafened'; id: string; on: boolean }
  /** A peer muted its microphone (`on: true`) or unmuted it. */
  | { t: 'peer-muted'; id: string; on: boolean }
  /**
   * This peer's role in the screen-forwarding tree: who I send to
   * (`children`) and who I receive from (`source`; null for the sharer or
   * while the parent relay has not yet reported its forwarding stream).
   */
  | {
      t: 'screen-route';
      /** Whose screen this tree carries: the sharer's peer id. */
      of: string;
      children: string[];
      source: { id: string; streamId: string } | null;
      quality: ScreenQualityId;
    }
  /**
   * A tool's state changed; `state` null means it was turned off for the
   * room. `by` is who touched it — the actor's own copy is already there
   * and must not be corrected.
   */
  | { t: 'tool-state'; tool: string; state: unknown; by: string; age: number }
  /** The room is already carrying as many tools as it may. */
  | { t: 'tool-denied'; tool: string }
  /** Ping echo: the client measures signaling latency with `ts`. */
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' | 'resume_invalid' };

export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string; quality: ScreenQualityId }
  | { t: 'screen-stop' }
  /** A screen-tree relay announces the stream it uses for forwarding. */
  | { t: 'screen-relay'; of: string; streamId: string }
  /** Camera slots mirror the screen lock: ask first, publish on grant. */
  | { t: 'camera-request' }
  | { t: 'camera-stop' }
  /**
   * Speakers off: nothing about the media changes on the wire (playback
   * is muted locally), the room is told so nobody talks to a wall.
   */
  | { t: 'deafen'; on: boolean }
  /**
   * Microphone off: the track keeps flowing (silence) so the mesh sees no
   * change; the room is told so the tile can show it.
   */
  | { t: 'mute'; on: boolean }
  /**
   * Whoever touches a tool says what its state is, for everybody; `state`
   * null turns it off for the room. There is no host — the last word wins.
   */
  | { t: 'tool-state'; tool: string; state: unknown }
  /**
   * Deliberate goodbye: leave immediately instead of holding the seat for
   * a resume. A bare transport close is treated as an accident.
   */
  | { t: 'leave' }
  | { t: 'ping'; ts: number };
