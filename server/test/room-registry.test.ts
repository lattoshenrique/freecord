import { describe, expect, it } from 'vitest';
import { RoomRegistry, generateRoomSlug } from '../src/app/room-registry.js';
import { ROOM_LIMITS, RoomFullError, RoomNotFoundError } from '../src/domain/room.js';

const noop = { send: () => {}, close: () => {} };

describe('RoomRegistry', () => {
  it('cria sala com slug não adivinhável e nome padrão', () => {
    const registry = new RoomRegistry();
    const room = registry.createRoom();
    expect(room.slug.length).toBeGreaterThanOrEqual(10);
    expect(room.displayName).toBe('Sala sem nome');
    expect(registry.summarize(room.slug).participantCount).toBe(0);
  });

  it('gera slugs únicos', () => {
    const slugs = new Set(Array.from({ length: 1000 }, () => generateRoomSlug()));
    expect(slugs.size).toBe(1000);
  });

  it('rejeita sala inexistente', () => {
    const registry = new RoomRegistry();
    expect(() => registry.summarize('nao-existe')).toThrow(RoomNotFoundError);
  });

  it('limita a lotação da sala', () => {
    const registry = new RoomRegistry();
    const { slug } = registry.createRoom();
    for (let i = 0; i < ROOM_LIMITS.maxParticipants; i += 1) {
      registry.addPeer(slug, `p${i}`, noop);
    }
    expect(() => registry.addPeer(slug, 'lotado', noop)).toThrow(RoomFullError);
  });

  it('expira sala vazia após o timeout, mas não sala ocupada', () => {
    let clock = 0;
    const registry = new RoomRegistry(() => clock);
    const vazia = registry.createRoom('Vazia');
    const ocupada = registry.createRoom('Ocupada');
    registry.addPeer(ocupada.slug, 'Ana', noop);

    clock = ROOM_LIMITS.emptyTimeoutMs + 1;
    expect(registry.sweepExpired()).toBe(1);
    expect(() => registry.summarize(vazia.slug)).toThrow(RoomNotFoundError);
    expect(registry.summarize(ocupada.slug).participantCount).toBe(1);
  });

  it('par mudo além do timeout é apontado como zumbi', () => {
    let clock = 0;
    const registry = new RoomRegistry(() => clock);
    const { slug } = registry.createRoom();
    const viva = registry.addPeer(slug, 'Ana', noop);
    const zumbi = registry.addPeer(slug, 'Bia', noop);

    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    registry.touchPeer(slug, viva.peerId);
    expect(registry.stalePeers()).toEqual([{ slug, peerId: zumbi.peerId }]);
  });

  it('sala esvaziada volta a contar para expiração', () => {
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
