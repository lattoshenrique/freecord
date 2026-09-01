import {
  ROOM_LIMITS,
  type ClientMessage,
  type PeerChannel,
  type Room,
  type ScreenQuality,
  type ServerMessage,
} from '../domain/room.js';
import { computeScreenTree } from '../domain/screen-tree.js';
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
  const sharer = room.screenSharer;
  if (!sharer) {
    return;
  }
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
          : room.screenRelays.has(route.parentId)
            ? { id: route.parentId, streamId: room.screenRelays.get(route.parentId)! }
            : null;
    peer.channel.send({
      t: 'screen-route',
      children: route.children,
      source,
      quality: sharer.quality,
    });
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
  private closed = false;

  constructor(registry: RoomRegistry, slug: string, name: string, channel: PeerChannel) {
    this.registry = registry;
    this.slug = slug;
    this.name = name;
    const { room, peerId } = registry.addPeer(slug, name, channel);
    this.peerId = peerId;

    channel.send({
      t: 'welcome',
      selfId: peerId,
      room: { slug: room.slug, displayName: room.displayName },
      peers: [...room.peers.entries()]
        .filter(([id]) => id !== peerId)
        .map(([id, peer]) => ({ id, name: peer.name })),
      screen: room.screenSharer
        ? { id: room.screenSharer.id, streamId: room.screenSharer.streamId }
        : null,
    });
    broadcast(room, { t: 'peer-joined', peer: { id: peerId, name } }, peerId);
    // Screen share in progress: the newcomer needs a route, and the tree changes.
    broadcastScreenRoutes(room);
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
        target?.channel.send({ t: 'signal', from: this.peerId, data: message.data });
        return;
      }
      case 'chat': {
        const text = message.text.trim().slice(0, ROOM_LIMITS.chatMessageMaxLength);
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
      case 'screen-request': {
        // Product rule enforced on the server: one screen at a time.
        if (room.screenSharer && room.screenSharer.id !== this.peerId) {
          room.peers.get(this.peerId)?.channel.send({ t: 'screen-denied' });
          return;
        }
        // A re-send by the sharer itself = live quality change.
        const restarted = room.screenSharer?.streamId !== message.streamId;
        room.screenSharer = {
          id: this.peerId,
          streamId: message.streamId,
          quality: message.quality,
        };
        if (restarted) {
          room.screenRelays.clear();
        }
        broadcast(room, { t: 'screen-started', id: this.peerId, streamId: message.streamId });
        broadcastScreenRoutes(room);
        return;
      }
      case 'screen-relay': {
        // Only relays in the current tree may announce a forwarding stream.
        if (!room.screenSharer || room.screenSharer.id === this.peerId) {
          return;
        }
        const tree = computeScreenTree(room.screenSharer.id, room.peers.keys());
        if ((tree.get(this.peerId)?.children.length ?? 0) === 0) {
          return;
        }
        room.screenRelays.set(this.peerId, message.streamId);
        broadcastScreenRoutes(room);
        return;
      }
      case 'screen-stop': {
        if (room.screenSharer?.id === this.peerId) {
          room.screenSharer = null;
          room.screenRelays.clear();
          broadcast(room, { t: 'screen-stopped' });
        }
        return;
      }
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const hadScreen = this.registry.getRoomSafe(this.slug)?.screenSharer?.id === this.peerId;
    const room = this.registry.removePeer(this.slug, this.peerId);
    if (room) {
      if (hadScreen) {
        broadcast(room, { t: 'screen-stopped' });
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
  const stale = registry.stalePeers();
  for (const { slug, peerId } of stale) {
    const before = registry.getRoomSafe(slug);
    const channel = before?.peers.get(peerId)?.channel;
    const hadScreen = before?.screenSharer?.id === peerId;
    const room = registry.removePeer(slug, peerId);
    channel?.close();
    if (room) {
      if (hadScreen) {
        broadcast(room, { t: 'screen-stopped' });
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
      return typeof message.streamId === 'string' && message.streamId.length <= 128
        ? { t: 'screen-relay', streamId: message.streamId }
        : null;
    case 'screen-stop':
      return { t: 'screen-stop' };
    case 'ping':
      return typeof message.ts === 'number' && Number.isFinite(message.ts)
        ? { t: 'ping', ts: message.ts }
        : null;
    default:
      return null;
  }
}
