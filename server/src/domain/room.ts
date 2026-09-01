/**
 * Room domain model. Media flows P2P between browsers (WebRTC mesh); the
 * server owns room state, signaling, and the product rules (capacity, one
 * screen at a time, expiration).
 */

export interface PeerInfo {
  id: string;
  name: string;
}

/**
 * A participant's outbound channel — abstracts the WebSocket (testable).
 * It must know how to disconnect: a peer with no sign of life gets kicked
 * by the server.
 */
export interface PeerChannel {
  send(message: ServerMessage): void;
  close(): void;
}

export interface Peer {
  name: string;
  channel: PeerChannel;
  /** Last ping received — the basis for kicking zombie connections. */
  lastSeen: number;
}

/** Quality preset chosen by the sharer — relays in the tree replicate it. */
export type ScreenQuality = 'sharp' | 'balanced' | 'smooth';

export interface Room {
  slug: string;
  displayName: string;
  peers: Map<string, Peer>;
  /** Who holds the screen-share lock, if anyone. */
  screenSharer: { id: string; streamId: string; quality: ScreenQuality } | null;
  /**
   * Forwarding streams reported by the screen tree's relays:
   * relay peerId → streamId it uses to forward to its children.
   */
  screenRelays: Map<string, string>;
  /** When the room became empty, for expiration. */
  emptyAt: number | null;
}

export const ROOM_LIMITS = {
  /**
   * P2P mesh: every peer keeps a connection to every other. With video,
   * beyond ~8 the participants' upload becomes the bottleneck — a product
   * AND technical limit.
   */
  maxParticipants: 8,
  /** An empty room expires after this (ms) — enough time for the link to circulate. */
  emptyTimeoutMs: 15 * 60 * 1000,
  /** Client ping cadence: measures latency and proves the peer is still alive. */
  heartbeatIntervalMs: 10 * 1000,
  /**
   * With no ping for this long, the peer is considered dead and removed.
   *
   * A network drop without a FIN (laptop lid closed, wi-fi vanishing)
   * fires no close event: without this, the room stays occupied by ghosts
   * and never becomes empty — hence never expires.
   */
  peerTimeoutMs: 35 * 1000,
  displayNameMaxLength: 60,
  guestNameMaxLength: 40,
  chatMessageMaxLength: 500,
} as const;

export class RoomNotFoundError extends Error {
  constructor(slug: string) {
    super(`room not found: ${slug}`);
    this.name = 'RoomNotFoundError';
  }
}

export class RoomFullError extends Error {
  constructor(slug: string) {
    super(`room full: ${slug}`);
    this.name = 'RoomFullError';
  }
}

/** Server → client messages. Mirrored in web/src/lib/protocol.ts. */
export type ServerMessage =
  | {
      t: 'welcome';
      selfId: string;
      room: { slug: string; displayName: string };
      peers: PeerInfo[];
      screen: { id: string; streamId: string } | null;
    }
  | { t: 'peer-joined'; peer: PeerInfo }
  | { t: 'peer-left'; id: string }
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'chat'; from: PeerInfo; text: string; ts: number }
  | { t: 'screen-started'; id: string; streamId: string }
  | { t: 'screen-stopped' }
  | { t: 'screen-denied' }
  /**
   * This peer's role in the screen-forwarding tree.
   *
   * `children`: who I must send the screen to (the sharer sends the
   * original; a relay forwards the received track). `source`: who I
   * receive from (null for the sharer, or while the parent relay has not
   * yet reported its forwarding stream). Re-emitted on every tree change.
   */
  | {
      t: 'screen-route';
      children: string[];
      source: { id: string; streamId: string } | null;
      quality: ScreenQuality;
    }
  /** Ping echo: the client measures signaling latency with `ts`. */
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' };

/** Client → server messages. Mirrored in web/src/lib/protocol.ts. */
export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string; quality: ScreenQuality }
  | { t: 'screen-stop' }
  /** A screen-tree relay announces the stream it uses for forwarding. */
  | { t: 'screen-relay'; streamId: string }
  | { t: 'ping'; ts: number };
