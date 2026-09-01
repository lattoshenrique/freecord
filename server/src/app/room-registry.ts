import { randomBytes } from 'node:crypto';
import {
  ROOM_LIMITS,
  RoomFullError,
  RoomNotFoundError,
  type PeerChannel,
  type Room,
} from '../domain/room.js';

/** Slug não adivinhável: o link É a credencial de descoberta da sala. */
export function generateRoomSlug(): string {
  return randomBytes(9).toString('base64url');
}

export interface RoomSummary {
  slug: string;
  displayName: string;
  participantCount: number;
}

/**
 * Estado das salas em memória — a fonte de verdade do que está vivo.
 *
 * Uma instância por processo atende milhares de salas pequenas (o custo
 * pesado, a mídia, nem passa por aqui). O caminho para múltiplas
 * instâncias está mapeado em docs/architecture.md.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  createRoom(displayNameRaw?: string): RoomSummary {
    const displayName = displayNameRaw?.trim() || 'Sala sem nome';
    const slug = generateRoomSlug();
    this.rooms.set(slug, {
      slug,
      displayName,
      peers: new Map(),
      screenSharer: null,
      emptyAt: this.now(),
    });
    return { slug, displayName, participantCount: 0 };
  }

  getRoom(slug: string): Room {
    const room = this.rooms.get(slug);
    if (!room) {
      throw new RoomNotFoundError(slug);
    }
    return room;
  }

  getRoomSafe(slug: string): Room | null {
    return this.rooms.get(slug) ?? null;
  }

  summarize(slug: string): RoomSummary {
    const room = this.getRoom(slug);
    return {
      slug: room.slug,
      displayName: room.displayName,
      participantCount: room.peers.size,
    };
  }

  addPeer(slug: string, name: string, channel: PeerChannel): { room: Room; peerId: string } {
    const room = this.getRoom(slug);
    if (room.peers.size >= ROOM_LIMITS.maxParticipants) {
      throw new RoomFullError(slug);
    }
    const peerId = randomBytes(8).toString('base64url');
    room.peers.set(peerId, { name, channel, lastSeen: this.now() });
    room.emptyAt = null;
    return { room, peerId };
  }

  /** Ping recebido: o par continua vivo. */
  touchPeer(slug: string, peerId: string): void {
    const peer = this.rooms.get(slug)?.peers.get(peerId);
    if (peer) {
      peer.lastSeen = this.now();
    }
  }

  removePeer(slug: string, peerId: string): Room | null {
    const room = this.rooms.get(slug);
    if (!room || !room.peers.delete(peerId)) {
      return null;
    }
    if (room.screenSharer?.id === peerId) {
      room.screenSharer = null;
    }
    if (room.peers.size === 0) {
      room.emptyAt = this.now();
    }
    return room;
  }

  /** Pares mudos além do timeout — conexões que caíram sem avisar. */
  stalePeers(): Array<{ slug: string; peerId: string }> {
    const cutoff = this.now() - ROOM_LIMITS.peerTimeoutMs;
    const stale: Array<{ slug: string; peerId: string }> = [];
    for (const [slug, room] of this.rooms) {
      for (const [peerId, peer] of room.peers) {
        if (peer.lastSeen <= cutoff) {
          stale.push({ slug, peerId });
        }
      }
    }
    return stale;
  }

  /** Remove salas vazias há mais tempo que o timeout. Retorna quantas. */
  sweepExpired(): number {
    const cutoff = this.now() - ROOM_LIMITS.emptyTimeoutMs;
    let removed = 0;
    for (const [slug, room] of this.rooms) {
      if (room.emptyAt !== null && room.emptyAt <= cutoff) {
        this.rooms.delete(slug);
        removed += 1;
      }
    }
    return removed;
  }
}
