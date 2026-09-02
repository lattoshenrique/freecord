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
  /**
   * Signals addressed to this peer while it was detached, delivered in
   * order on resume (see enqueueSignal). Empty while attached.
   */
  pending: ServerMessage[];
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

/** One live screen share: whose, which stream, at what preset. */
export interface ScreenShare {
  id: string;
  streamId: string;
  quality: ScreenQuality;
}

export interface Room {
  slug: string;
  displayName: string;
  peers: Map<string, Peer>;
  /**
   * Live screen shares by sharer id, in start order — at most
   * ROOM_LIMITS.maxScreens at once, each with a forwarding tree of its own.
   */
  screens: Map<string, ScreenShare>;
  /** Who holds a camera slot right now (see cameraSlotsFor). */
  cameras: Set<string>;
  /** Who has their speakers off (`deafen`), so newcomers see it too. */
  deafened: Set<string>;
  /** Who has their microphone off (`mute`) — presence only, like `deafened`. */
  muted: Set<string>;
  /**
   * Forwarding streams reported by the relays of each screen's tree:
   * sharer peerId → (relay peerId → streamId it forwards to its children).
   */
  screenRelays: Map<string, Map<string, string>>;
  /** When the room became empty, for expiration. */
  emptyAt: number | null;
}

export const ROOM_LIMITS = {
  /**
   * P2P mesh: every peer keeps a connection to every other. 20 holds
   * because the variable cost adapts with size: cameras split a fixed
   * uplink budget and are slot-limited past 6 people (cameraSlotsFor),
   * the screen rides the forwarding tree (depth 3 at fanout 3, cheap
   * with encoded passthrough), and voice is the only stream still paid
   * N−1 times — ~1 Mbps of Opus at 19 copies. What remains is the
   * connection and encoder count per peer — at 20 still within what a
   * desktop browser sustains; past it the honest answer is a media node
   * (docs/architecture.md, "The scaling path").
   */
  maxParticipants: 20,
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
  /**
   * How many screens may be shared at once. Every viewer receives every
   * screen, so this is a downlink budget more than an uplink one: three
   * is a whiteboard, a document and a demo, and still fits a laptop link.
   */
  maxScreens: 3,
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
  /**
   * Signals held for a detached peer (see enqueueSignal). Items bound the
   * memory per seat; bytes keep the Worker's copy under a Durable Object
   * storage value (128 KiB) with room to spare.
   */
  detachedSignalMaxItems: 32,
  detachedSignalMaxBytes: 96 * 1024,
} as const;

/**
 * Holds a signal for a peer whose transport is down, so a renegotiation
 * that happens during its resume grace is not silently lost — that loss
 * left the offering side stuck in have-local-offer for good (a frozen
 * tile that only F5 fixed).
 *
 * The queue is coherent per sender, not merely bounded: a new session
 * DESCRIPTION from X supersedes everything X queued before it (the older
 * offer and its ICE candidates belong to a negotiation X has since rolled
 * back), so the resumer only ever sees the latest offer plus its own
 * candidates. That is the one field of the opaque envelope the server
 * looks at — `data.description` — and it reads its presence, never its
 * content. Beyond the caps, the oldest items go first; the client's own
 * negotiation watchdog is the backstop for anything dropped here.
 */
export function enqueueSignal(
  queue: ServerMessage[],
  message: Extract<ServerMessage, { t: 'signal' }>,
): ServerMessage[] {
  const supersedes = carriesDescription(message.data);
  const kept = supersedes
    ? queue.filter((held) => held.t !== 'signal' || held.from !== message.from)
    : [...queue];
  kept.push(message);
  let bytes = kept.reduce((sum, held) => sum + JSON.stringify(held).length, 0);
  while (
    kept.length > 1 &&
    (kept.length > ROOM_LIMITS.detachedSignalMaxItems || bytes > ROOM_LIMITS.detachedSignalMaxBytes)
  ) {
    bytes -= JSON.stringify(kept.shift()).length;
  }
  return kept;
}

function carriesDescription(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'description' in data;
}

/**
 * How many cameras may be live at once for a given room size. Mirrored in
 * web/src/lib/protocol.ts.
 *
 * Small rooms pay nothing: up to 6 people, everyone may turn the camera
 * on. Past that, live cameras are capped so the CAMERA uplink share of
 * each peer stays honest while audio and the screen keep their budgets:
 * 7–9 people carry four, 10–16 three, 17–20 two. The last step keeps the
 * per-viewer split (4 Mbps / 19 ≈ 210 kbps) clear of the floor where a
 * face stops being a face, with fewer encoders competing for it. The cap
 * binds NEW activations only — a camera already live is never shut off
 * by the room growing past a threshold (grandfathering); slots free up
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
      /** Screens being shared right now, in start order (see `maxScreens`). */
      screens: Array<{ id: string; streamId: string }>;
      /** Live cameras, so joiners and resumers see the slots in use. */
      cameras: string[];
      /** Who has their speakers off (see `deafen`), so joiners see it too. */
      deafened: string[];
      /** Who has their microphone off (see `mute`). */
      muted: string[];
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
   * This peer's role in the screen-forwarding tree.
   *
   * `children`: who I must send the screen to (the sharer sends the
   * original; a relay forwards the received track). `source`: who I
   * receive from (null for the sharer, or while the parent relay has not
   * yet reported its forwarding stream). Re-emitted on every tree change.
   */
  | {
      t: 'screen-route';
      /** Whose screen this tree carries: the sharer's peer id. */
      of: string;
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
   * Deliberate goodbye: leave immediately instead of holding the seat for
   * a resume. A bare transport close is treated as an accident.
   */
  | { t: 'leave' }
  | { t: 'ping'; ts: number };
