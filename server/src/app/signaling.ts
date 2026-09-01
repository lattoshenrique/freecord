import {
  ROOM_LIMITS,
  type ClientMessage,
  type PeerSender,
  type Room,
  type ServerMessage,
} from '../domain/room.js';
import type { RoomRegistry } from './room-registry.js';

function broadcast(room: Room, message: ServerMessage, exceptId?: string): void {
  for (const [id, peer] of room.peers) {
    if (id !== exceptId) {
      peer.send(message);
    }
  }
}

/**
 * Sessão de sinalização de um participante: relay de SDP/ICE entre pares,
 * chat e o lock server-side de "uma tela por vez". Independente de
 * transporte — o WebSocket entra só como PeerSender + chamadas a
 * handleMessage/close.
 */
export class SignalingSession {
  private readonly registry: RoomRegistry;
  private readonly slug: string;
  readonly peerId: string;
  private readonly name: string;
  private closed = false;

  constructor(registry: RoomRegistry, slug: string, name: string, send: PeerSender) {
    this.registry = registry;
    this.slug = slug;
    this.name = name;
    const { room, peerId } = registry.addPeer(slug, name, send);
    this.peerId = peerId;

    send({
      t: 'welcome',
      selfId: peerId,
      room: { slug: room.slug, displayName: room.displayName },
      peers: [...room.peers.entries()]
        .filter(([id]) => id !== peerId)
        .map(([id, peer]) => ({ id, name: peer.name })),
      screen: room.screenSharer,
    });
    broadcast(room, { t: 'peer-joined', peer: { id: peerId, name } }, peerId);
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
      case 'signal': {
        const target = room.peers.get(message.to);
        target?.send({ t: 'signal', from: this.peerId, data: message.data });
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
        // Regra de produto garantida no servidor: uma tela por vez.
        if (room.screenSharer && room.screenSharer.id !== this.peerId) {
          room.peers.get(this.peerId)?.send({ t: 'screen-denied' });
          return;
        }
        room.screenSharer = { id: this.peerId, streamId: message.streamId };
        broadcast(room, { t: 'screen-started', id: this.peerId, streamId: message.streamId });
        return;
      }
      case 'screen-stop': {
        if (room.screenSharer?.id === this.peerId) {
          room.screenSharer = null;
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
    }
  }
}

/** Parse defensivo da borda: só formatos do protocolo fechado passam. */
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
    case 'screen-request':
      return typeof message.streamId === 'string' && message.streamId.length <= 128
        ? { t: 'screen-request', streamId: message.streamId }
        : null;
    case 'screen-stop':
      return { t: 'screen-stop' };
    default:
      return null;
  }
}
