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
  /** Secret that lets a dropped connection reclaim this seat (same peerId). */
  resumeToken: string;
  /**
   * When the transport dropped without a goodbye; null while attached.
   * A detached peer keeps its seat until `lastSeen` crosses
   * `peerTimeoutMs` — same clock as a zombie, so a resume never extends
   * the worst case the room already tolerates.
   */
  disconnectedAt: number | null;
}

/**
 * An ICE server handed to joining peers (STUN/TURN). Mirrors the shape of
 * the browser's RTCIceServer; credentials are ephemeral (see app/turn.ts).
 */
export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

/** Quality preset chosen by the sharer — relays in the tree replicate it. */
export type ScreenQuality = 'sharp' | 'balanced' | 'smooth';

export interface Room {
  slug: string;
  displayName: string;
  peers: Map<string, Peer>;
  /** Who holds the screen-share lock, if anyone. */
  screenSharer: { id: string; streamId: string; quality: ScreenQuality } | null;
  /** Who holds a camera slot right now (see cameraSlotsFor). */
  cameras: Set<string>;
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
   * P2P mesh: every peer keeps a connection to every other. 12 holds
   * because the variable cost adapts with size: cameras split a fixed
   * uplink budget and are slot-limited past 6 people (cameraSlotsFor),
   * the screen rides the forwarding tree, and audio is cheap. What
   * remains is the connection and encoder count per peer — at 12 still
   * within what a browser sustains.
   */
  maxParticipants: 12,
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
  /**
   * A disconnected sharer keeps the screen lock only this long. Shorter
   * than the seat's grace on purpose: one frozen screen blocks the whole
   * room, while a frozen tile blocks nobody.
   */
  screenLockGraceMs: 10 * 1000,
  displayNameMaxLength: 60,
  guestNameMaxLength: 40,
  /** Plaintext budget, enforced by the composer and re-clamped here. */
  chatMessageMaxLength: 500,
  /**
   * Wire cap for a sealed chat envelope. 500 UTF-16 chars are at most
   * ~1500 bytes of UTF-8; +16 (GCM tag) and base64url is ~2024 chars,
   * +21 of framing ("e2e:<iv>.") ≈ 2045 — 2800 leaves headroom.
   */
  chatEnvelopeMaxLength: 2800,
} as const;

/**
 * How many cameras may be live at once for a given room size. Mirrored in
 * web/src/lib/protocol.ts.
 *
 * Small rooms pay nothing: up to 6 people, everyone may turn the camera
 * on. Past that, live cameras are capped so the CAMERA uplink share of
 * each peer stays honest while audio and the screen keep their budgets.
 * The cap binds NEW activations only — a camera already live is never
 * shut off by the room growing past a threshold (grandfathering); slots
 * free up when someone turns the camera off or leaves.
 */
export function cameraSlotsFor(participantCount: number): number {
  if (participantCount <= 6) {
    return participantCount;
  }
  return participantCount <= 9 ? 4 : 3;
}

/**
 * A sealed end-to-end chat payload: `e2e:<iv>.<ciphertext>`, base64url.
 * Mirror of web/src/lib/chat-crypto.ts — the server can recognize the
 * shape, never the content.
 */
const CHAT_ENVELOPE = /^e2e:[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;

/**
 * What of a chat payload may be broadcast; null means drop the message.
 *
 * A sealed envelope is opaque: trimming or slicing it would corrupt the
 * ciphertext into a message NOBODY can read — sender included — so an
 * oversized envelope is rejected whole, never cut. Plaintext keeps the
 * historical trim-and-clamp.
 */
export function normalizeChatText(raw: string): string | null {
  if (CHAT_ENVELOPE.test(raw)) {
    return raw.length <= ROOM_LIMITS.chatEnvelopeMaxLength ? raw : null;
  }
  const text = raw.trim().slice(0, ROOM_LIMITS.chatMessageMaxLength);
  return text || null;
}

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
      /** Presenting this on reconnect reclaims the same peerId (see `resume`). */
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
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' | 'resume_invalid' };

/** Client → server messages. Mirrored in web/src/lib/protocol.ts. */
export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string; quality: ScreenQuality }
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
