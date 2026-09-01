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
      screen: { id: string; streamId: string } | null;
      /** Live cameras, so joiners and resumers see the slots in use. */
      cameras: string[];
    }
  | { t: 'peer-joined'; peer: PeerInfo }
  | { t: 'peer-left'; id: string }
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'chat'; from: PeerInfo; text: string; ts: number }
  | { t: 'screen-started'; id: string; streamId: string }
  | { t: 'screen-stopped' }
  | { t: 'screen-denied' }
  /** A camera slot was granted (the requester hears this as its grant). */
  | { t: 'camera-started'; id: string }
  | { t: 'camera-stopped'; id: string }
  | { t: 'camera-denied' }
  /**
   * This peer's role in the screen-forwarding tree: who I send to
   * (`children`) and who I receive from (`source`; null for the sharer or
   * while the parent relay has not yet reported its forwarding stream).
   */
  | {
      t: 'screen-route';
      children: string[];
      source: { id: string; streamId: string } | null;
      quality: ScreenQualityId;
    }
  /** Ping echo: the client measures signaling latency with `ts`. */
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' | 'resume_invalid' };

export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string; quality: ScreenQualityId }
  | { t: 'screen-stop' }
  /** A screen-tree relay announces the stream it uses for forwarding. */
  | { t: 'screen-relay'; streamId: string }
  /** Camera slots mirror the screen lock: ask first, publish on grant. */
  | { t: 'camera-request' }
  | { t: 'camera-stop' }
  /**
   * Deliberate goodbye: leave immediately instead of holding the seat for
   * a resume. A bare transport close is treated as an accident.
   */
  | { t: 'leave' }
  | { t: 'ping'; ts: number };
