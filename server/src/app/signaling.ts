import {
  cameraSlotsFor,
  enqueueSignal,
  normalizeChatText,
  ROOM_LIMITS,
  type ClientMessage,
  type IceServerConfig,
  type PeerChannel,
  type Room,
  type ScreenQuality,
  type ServerMessage,
} from '../domain/room.js';
import { computeScreenTree } from '../domain/screen-tree.js';
import {
  canControlTool,
  clearToolState,
  isStorableState,
  isToolId,
  projectTool,
  projectTools,
  setToolState,
} from '../domain/tools.js';
import type { RoomRegistry } from './room-registry.js';

function broadcast(room: Room, message: ServerMessage, exceptId?: string): void {
  for (const [id, peer] of room.peers) {
    if (id !== exceptId) {
      peer.channel.send(message);
    }
  }
}

/**
 * (Re)distributes the screen-forwarding tree roles.
 *
 * Called on every change that affects topology: screen started, someone
 * joined/left, or a relay reported its forwarding stream. Each peer gets
 * its route; children of a relay that has not reported yet stay with
 * `source: null` until the report arrives.
 */
function broadcastScreenRoutes(room: Room): void {
  // One tree per screen: a peer may be a child in one and a relay in another.
  for (const sharer of room.screens.values()) {
    const relays = room.screenRelays.get(sharer.id);
    const tree = computeScreenTree(sharer.id, room.peers.keys());
    for (const [peerId, peer] of room.peers) {
      const route = tree.get(peerId);
      if (!route) {
        continue;
      }
      const source =
        route.parentId === null
          ? null
          : route.parentId === sharer.id
            ? { id: sharer.id, streamId: sharer.streamId }
            : relays?.has(route.parentId)
              ? { id: route.parentId, streamId: relays.get(route.parentId)! }
              : null;
      peer.channel.send({
        t: 'screen-route',
        of: sharer.id,
        children: route.children,
        source,
        quality: sharer.quality,
      });
    }
  }
}

/**
 * One participant's signaling session: SDP/ICE relay between peers, chat,
 * and the server-side "one screen at a time" lock. Transport-independent —
 * the WebSocket only appears as a PeerChannel plus handleMessage/close
 * calls.
 */
export class SignalingSession {
  private readonly registry: RoomRegistry;
  private readonly slug: string;
  readonly peerId: string;
  private readonly name: string;
  private readonly channel: PeerChannel;
  private closed = false;

  private constructor(
    registry: RoomRegistry,
    slug: string,
    peerId: string,
    name: string,
    channel: PeerChannel,
  ) {
    this.registry = registry;
    this.slug = slug;
    this.peerId = peerId;
    this.name = name;
    this.channel = channel;
  }

  /** A new participant takes a seat and everyone is told. */
  static join(
    registry: RoomRegistry,
    slug: string,
    name: string,
    channel: PeerChannel,
    ice: IceServerConfig[] = [],
  ): SignalingSession {
    const { room, peerId } = registry.addPeer(slug, name, channel);
    const session = new SignalingSession(registry, slug, peerId, name, channel);
    session.sendWelcome(room, ice);
    broadcast(room, { t: 'peer-joined', peer: { id: peerId, name } }, peerId);
    // Screen share in progress: the newcomer needs a route, and the tree changes.
    broadcastScreenRoutes(room);
    return session;
  }

  /**
   * A dropped connection reclaims its seat by resume token.
   *
   * No `peer-joined` goes out — the seat was never vacated, and clients
   * de-duplicate peers by id anyway. Routes are re-emitted because the
   * tree may have changed shape while this peer was away, and the
   * signals that arrived meanwhile are delivered right after `welcome`,
   * in order — the client reconciles its mesh on the welcome first.
   */
  static resume(
    registry: RoomRegistry,
    slug: string,
    token: string,
    channel: PeerChannel,
    ice: IceServerConfig[] = [],
  ): SignalingSession | null {
    const resumed = registry.resumePeer(slug, token, channel);
    if (!resumed) {
      return null;
    }
    const session = new SignalingSession(registry, slug, resumed.peerId, resumed.name, channel);
    session.sendWelcome(resumed.room, ice);
    for (const held of resumed.pending) {
      channel.send(held);
    }
    broadcastScreenRoutes(resumed.room);
    return session;
  }

  private sendWelcome(room: Room, ice: IceServerConfig[]): void {
    this.channel.send({
      t: 'welcome',
      selfId: this.peerId,
      resumeToken: room.peers.get(this.peerId)!.resumeToken,
      ice,
      room: { slug: room.slug, displayName: room.displayName },
      peers: [...room.peers.entries()]
        .filter(([id]) => id !== this.peerId)
        .map(([id, peer]) => ({ id, name: peer.name })),
      screens: [...room.screens.values()].map(({ id, streamId }) => ({ id, streamId })),
      cameras: [...room.cameras],
      deafened: [...room.deafened],
      muted: [...room.muted],
      // Late to the film: each tool's state goes out with its age, so a
      // newcomer catches up on a video already playing without asking.
      tools: projectTools(room.tools ?? {}, Date.now()),
    });
  }

  handleMessage(message: ClientMessage): void {
    if (this.closed) {
      return;
    }
    const room = this.registry.getRoomSafe(this.slug);
    if (!room) {
      return;
    }

    switch (message.t) {
      case 'ping': {
        // Proof of life + latency measure: the client times the echo.
        this.registry.touchPeer(this.slug, this.peerId);
        room.peers.get(this.peerId)?.channel.send({ t: 'pong', ts: message.ts });
        return;
      }
      case 'signal': {
        const target = room.peers.get(message.to);
        if (!target) {
          return;
        }
        const envelope = { t: 'signal', from: this.peerId, data: message.data } as const;
        if (target.disconnectedAt !== null) {
          // Transport down, seat kept: hold the signal for the resume
          // instead of dropping it into a dead socket (enqueueSignal).
          target.pending = enqueueSignal(target.pending, envelope);
          return;
        }
        target.channel.send(envelope);
        return;
      }
      case 'chat': {
        const text = normalizeChatText(message.text);
        if (!text) {
          return;
        }
        broadcast(room, {
          t: 'chat',
          from: { id: this.peerId, name: this.name },
          text,
          ts: Date.now(),
        });
        return;
      }
      case 'tool-state': {
        const now = Date.now();
        const states = room.tools ?? {};
        if (!canControlTool(states, message.tool, this.peerId)) {
          // A starter-controlled tool keeps its first setter. Send the
          // canonical state back so an older client also undoes whatever
          // its local player let a viewer try.
          const current = projectTool(message.tool, states[message.tool], now);
          if (current) {
            this.channel.send({ t: 'tool-state', ...current });
          }
          return;
        }
        if (message.state === null) {
          room.tools = clearToolState(states, message.tool);
          broadcast(room, { t: 'tool-state', tool: message.tool, state: null, by: this.peerId, age: 0 });
          return;
        }
        const next = setToolState(states, message.tool, {
          state: message.state,
          by: this.peerId,
          at: now,
        });
        if (!next) {
          // The room is already carrying as many tools as it may. Only
          // the one that asked hears it: nothing changed for the others.
          this.channel.send({ t: 'tool-denied', tool: message.tool });
          return;
        }
        room.tools = next;
        // Echoed to the sender too: its own copy is the one that moved,
        // but a client that guessed wrong must end up on the room's
        // numbers rather than on its own.
        const projection = projectTool(message.tool, next[message.tool], now)!;
        broadcast(room, { t: 'tool-state', ...projection });
        return;
      }
      case 'screen-request': {
        // Product rule enforced on the server: at most maxScreens at once.
        // A holder re-requesting (quality change, resume) never counts.
        const mine = room.screens.get(this.peerId);
        if (!mine && room.screens.size >= ROOM_LIMITS.maxScreens) {
          room.peers.get(this.peerId)?.channel.send({ t: 'screen-denied' });
          return;
        }
        // A re-send by the sharer itself = live quality change; a new
        // stream id restarts its tree's relays.
        if (mine?.streamId !== message.streamId) {
          room.screenRelays.delete(this.peerId);
        }
        room.screens.set(this.peerId, {
          id: this.peerId,
          streamId: message.streamId,
          quality: message.quality,
        });
        broadcast(room, { t: 'screen-started', id: this.peerId, streamId: message.streamId });
        broadcastScreenRoutes(room);
        return;
      }
      case 'screen-relay': {
        // Only relays in that screen's current tree may announce a
        // forwarding stream — and never the sharer itself.
        const sharer = room.screens.get(message.of);
        if (!sharer || sharer.id === this.peerId) {
          return;
        }
        const tree = computeScreenTree(sharer.id, room.peers.keys());
        if ((tree.get(this.peerId)?.children.length ?? 0) === 0) {
          return;
        }
        let relays = room.screenRelays.get(sharer.id);
        if (!relays) {
          relays = new Map();
          room.screenRelays.set(sharer.id, relays);
        }
        relays.set(this.peerId, message.streamId);
        broadcastScreenRoutes(room);
        return;
      }
      case 'screen-stop': {
        if (room.screens.delete(this.peerId)) {
          room.screenRelays.delete(this.peerId);
          broadcast(room, { t: 'screen-stopped', id: this.peerId });
        }
        return;
      }
      case 'camera-request': {
        // Product rule enforced on the server, like the screen lock: live
        // cameras are capped by room size. Only NEW activations count —
        // a camera granted before the room grew keeps its slot
        // (grandfathering), so `cameras.size` may sit above the cap.
        if (
          !room.cameras.has(this.peerId) &&
          room.cameras.size >= cameraSlotsFor(room.peers.size)
        ) {
          room.peers.get(this.peerId)?.channel.send({ t: 'camera-denied' });
          return;
        }
        // A re-request by a holder (e.g. after a resume) is re-granted.
        room.cameras.add(this.peerId);
        broadcast(room, { t: 'camera-started', id: this.peerId });
        return;
      }
      case 'camera-stop': {
        if (room.cameras.delete(this.peerId)) {
          broadcast(room, { t: 'camera-stopped', id: this.peerId });
        }
        return;
      }
      case 'mute': {
        // Same presence rule as deafen: no resource, survives a resume,
        // repeats are quiet.
        const changed = message.on
          ? !room.muted.has(this.peerId) && !!room.muted.add(this.peerId)
          : room.muted.delete(this.peerId);
        if (changed) {
          broadcast(room, { t: 'peer-muted', id: this.peerId, on: message.on });
        }
        return;
      }
      case 'deafen': {
        // Presence, not a resource: no cap, no grant, and it survives a
        // resume (the client re-sends on welcome anyway). Repeats are quiet.
        const changed = message.on
          ? !room.deafened.has(this.peerId) && !!room.deafened.add(this.peerId)
          : room.deafened.delete(this.peerId);
        if (changed) {
          broadcast(room, { t: 'peer-deafened', id: this.peerId, on: message.on });
        }
        return;
      }
      case 'leave': {
        // Deliberate goodbye: vacate the seat now, no resume grace.
        this.terminate();
        return;
      }
    }
  }

  /**
   * Transport dropped without a goodbye: keep the seat (and, briefly, any
   * screen lock — see ROOM_LIMITS.screenLockGraceMs) for a resume. The
   * media mesh is P2P, so an intact WebRTC path keeps flowing while the
   * signaling reconnects. No `peer-left` goes out here; if no resume
   * arrives, the regular zombie sweep announces it on the same clock as
   * before this grace existed.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // The camera slot gets no grace, unlike the screen lock: a slot held
    // through an outage blocks someone else's camera for nothing, while
    // the resumer only pays a re-request (its welcome roster says the
    // slot is gone). The P2P track keeps flowing meanwhile; if the
    // re-request is denied, the client turns the camera off then. Only
    // the peer's CURRENT channel may release — a close event from a
    // socket already replaced by a resume must not free the fresh seat's
    // slot (same guard as detachPeer).
    const room = this.registry.getRoomSafe(this.slug);
    if (
      room &&
      room.peers.get(this.peerId)?.channel === this.channel &&
      room.cameras.delete(this.peerId)
    ) {
      broadcast(room, { t: 'camera-stopped', id: this.peerId });
    }
    this.registry.detachPeer(this.slug, this.peerId, this.channel);
  }

  private terminate(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const hadScreen = this.registry.getRoomSafe(this.slug)?.screens.has(this.peerId) ?? false;
    const room = this.registry.removePeer(this.slug, this.peerId);
    this.channel.close();
    if (room) {
      if (hadScreen) {
        broadcast(room, { t: 'screen-stopped', id: this.peerId });
      }
      broadcast(room, { t: 'peer-left', id: this.peerId });
      // A relay or a leaf left: the screen tree changes shape.
      broadcastScreenRoutes(room);
    }
  }
}

/**
 * Kicks peers that stopped showing signs of life and tells the others.
 *
 * Without this, a zombie connection (network gone, no close frame) holds
 * its seat forever: the room never empties and never expires. Returns how
 * many were removed.
 */
export function sweepStalePeers(registry: RoomRegistry): number {
  // The screen lock's grace is shorter than the seat's: a sharer that
  // dropped and did not resume in time frees the room's screen first.
  for (const { room, id } of registry.releaseAbandonedScreenLocks()) {
    broadcast(room, { t: 'screen-stopped', id });
  }
  const stale = registry.stalePeers();
  for (const { slug, peerId } of stale) {
    const before = registry.getRoomSafe(slug);
    const channel = before?.peers.get(peerId)?.channel;
    const hadScreen = before?.screens.has(peerId) ?? false;
    const room = registry.removePeer(slug, peerId);
    channel?.close();
    if (room) {
      if (hadScreen) {
        broadcast(room, { t: 'screen-stopped', id: peerId });
      }
      broadcast(room, { t: 'peer-left', id: peerId });
      broadcastScreenRoutes(room);
    }
  }
  return stale.length;
}

/** Defensive edge parsing: only closed-protocol shapes get through. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const message = value as Record<string, unknown>;
  switch (message.t) {
    case 'signal':
      return typeof message.to === 'string' && 'data' in message
        ? { t: 'signal', to: message.to, data: message.data }
        : null;
    case 'chat':
      return typeof message.text === 'string' ? { t: 'chat', text: message.text } : null;
    case 'screen-request': {
      if (typeof message.streamId !== 'string' || message.streamId.length > 128) {
        return null;
      }
      const quality: ScreenQuality =
        message.quality === 'sharp' || message.quality === 'smooth' ? message.quality : 'balanced';
      return { t: 'screen-request', streamId: message.streamId, quality };
    }
    case 'screen-relay':
      return typeof message.of === 'string' &&
        typeof message.streamId === 'string' &&
        message.streamId.length <= 128
        ? { t: 'screen-relay', of: message.of, streamId: message.streamId }
        : null;
    case 'tool-state': {
      // The server cannot know what a tool's state should look like — it
      // does not know the tool. What it checks is what it has to store
      // and key by: an id it can use, and a value that fits (tools.ts).
      // The shape inside is the tool's own business, checked by every
      // client that receives it (`parseState`, docs/tools.md).
      if (!isToolId(message.tool)) {
        return null;
      }
      const state = message.state ?? null;
      return state === null || isStorableState(state)
        ? { t: 'tool-state', tool: message.tool, state }
        : null;
    }
    case 'screen-stop':
      return { t: 'screen-stop' };
    case 'camera-request':
      return { t: 'camera-request' };
    case 'camera-stop':
      return { t: 'camera-stop' };
    case 'deafen':
      return typeof message.on === 'boolean' ? { t: 'deafen', on: message.on } : null;
    case 'mute':
      return typeof message.on === 'boolean' ? { t: 'mute', on: message.on } : null;
    case 'leave':
      return { t: 'leave' };
    case 'ping':
      return typeof message.ts === 'number' && Number.isFinite(message.ts)
        ? { t: 'ping', ts: message.ts }
        : null;
    default:
      return null;
  }
}
