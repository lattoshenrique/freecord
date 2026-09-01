import { describe, expect, it } from 'vitest';
import { RoomRegistry, generateRoomSlug } from '../src/app/room-registry.js';
import { ROOM_LIMITS, RoomFullError, RoomNotFoundError } from '../src/domain/room.js';

const noop = { send: () => {}, close: () => {} };

describe('RoomRegistry', () => {
  it('creates a room with an unguessable slug and a default name', () => {
    const registry = new RoomRegistry();
    const room = registry.createRoom();
    expect(room.slug.length).toBeGreaterThanOrEqual(10);
    expect(room.displayName).toBe('Sala sem nome');
    expect(registry.summarize(room.slug).participantCount).toBe(0);
  });

  it('generates unique slugs', () => {
    const slugs = new Set(Array.from({ length: 1000 }, () => generateRoomSlug()));
    expect(slugs.size).toBe(1000);
  });

  it('rejects a nonexistent room', () => {
    const registry = new RoomRegistry();
    expect(() => registry.summarize('does-not-exist')).toThrow(RoomNotFoundError);
  });

  it('caps room occupancy', () => {
    const registry = new RoomRegistry();
    const { slug } = registry.createRoom();
    for (let i = 0; i < ROOM_LIMITS.maxParticipants; i += 1) {
      registry.addPeer(slug, `p${i}`, noop);
    }
    expect(() => registry.addPeer(slug, 'overflow', noop)).toThrow(RoomFullError);
  });

  it('expires an empty room past the timeout, but not an occupied one', () => {
    let clock = 0;
    const registry = new RoomRegistry(() => clock);
    const empty = registry.createRoom('Empty');
    const occupied = registry.createRoom('Occupied');
    registry.addPeer(occupied.slug, 'Ana', noop);

    clock = ROOM_LIMITS.emptyTimeoutMs + 1;
    expect(registry.sweepExpired()).toBe(1);
    expect(() => registry.summarize(empty.slug)).toThrow(RoomNotFoundError);
    expect(registry.summarize(occupied.slug).participantCount).toBe(1);
  });

  it('flags a peer silent past the timeout as a zombie', () => {
    let clock = 0;
    const registry = new RoomRegistry(() => clock);
    const { slug } = registry.createRoom();
    const alive = registry.addPeer(slug, 'Ana', noop);
    const zombie = registry.addPeer(slug, 'Bia', noop);

    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    registry.touchPeer(slug, alive.peerId);
    expect(registry.stalePeers()).toEqual([{ slug, peerId: zombie.peerId }]);
  });

  it('a room that empties starts counting toward expiry again', () => {
    let clock = 0;
    const registry = new RoomRegistry(() => clock);
    const { slug } = registry.createRoom();
    const { peerId } = registry.addPeer(slug, 'Ana', noop);
    clock = ROOM_LIMITS.emptyTimeoutMs * 10;
    expect(registry.sweepExpired()).toBe(0);

    registry.removePeer(slug, peerId);
    clock += ROOM_LIMITS.emptyTimeoutMs + 1;
    expect(registry.sweepExpired()).toBe(1);
  });
});
