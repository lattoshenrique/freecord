import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import type { PeerChannel } from '../src/domain/room.js';
import {
  NO_COMPANY,
  ROOM_STATS,
  companyMsAt,
  countable,
  withPeerCount,
} from '../src/domain/room-stats.js';

const MINUTE = 60 * 1000;

describe('room company clock', () => {
  it('does not run for someone alone in a room', () => {
    const start = withPeerCount(NO_COMPANY, 1, 0);
    expect(start.since).toBeNull();
    expect(companyMsAt(start, 60 * MINUTE)).toBe(0);
    expect(countable(start, 60 * MINUTE)).toBe(false);
  });

  it('starts when a second person arrives and closes when they leave', () => {
    const together = withPeerCount(NO_COMPANY, 2, 0);
    expect(companyMsAt(together, 5 * MINUTE)).toBe(5 * MINUTE);
    const alone = withPeerCount(together, 1, 5 * MINUTE);
    expect(alone.since).toBeNull();
    // The clock stopped: an hour later it still reads five minutes.
    expect(companyMsAt(alone, 65 * MINUTE)).toBe(5 * MINUTE);
  });

  it('adds up stretches with gaps between them', () => {
    let state = withPeerCount(NO_COMPANY, 3, 0);
    state = withPeerCount(state, 1, 11 * MINUTE);
    state = withPeerCount(state, 2, 30 * MINUTE);
    expect(countable(state, 38 * MINUTE)).toBe(false);
    // Eleven minutes, then nine more: the room crosses the mark on the
    // second stretch, twenty-eight minutes of wall clock after it opened.
    expect(countable(state, 39 * MINUTE)).toBe(true);
  });

  it('counts a room only once it has held company for the minimum', () => {
    const together = withPeerCount(NO_COMPANY, 2, 0);
    expect(countable(together, ROOM_STATS.minCompanyMs - 1)).toBe(false);
    expect(countable(together, ROOM_STATS.minCompanyMs)).toBe(true);
    // And never again, once it has taken its place in the total.
    const counted = { ...together, counted: true };
    expect(countable(counted, 10 * ROOM_STATS.minCompanyMs)).toBe(false);
  });

  it('leaves the state alone while the head count says the same thing', () => {
    const together = withPeerCount(NO_COMPANY, 2, 0);
    // Same reference: this is what lets a sweep skip the storage write.
    expect(withPeerCount(together, 5, MINUTE)).toBe(together);
    const alone = withPeerCount(together, 0, MINUTE);
    expect(withPeerCount(alone, 1, 2 * MINUTE)).toBe(alone);
  });

  it('survives a clock that jumps backwards', () => {
    const together = withPeerCount(NO_COMPANY, 2, 10 * MINUTE);
    expect(companyMsAt(together, 9 * MINUTE)).toBe(0);
  });
});

/** A peer that goes nowhere: this suite is about the clock, not the wire. */
function silentChannel(): PeerChannel {
  return { send: () => {}, close: () => {} };
}

describe('registry room count', () => {
  it('counts a room once two people stay past the mark, and only once', () => {
    let now = 0;
    const registry = new RoomRegistry(() => now);
    const { slug } = registry.createRoom('standup');
    expect(registry.countedRooms).toBe(0);

    const first = registry.addPeer(slug, 'ana', silentChannel());
    now = 5 * MINUTE;
    // One person for hours is not a room that happened.
    registry.tallyCompany();
    expect(registry.countedRooms).toBe(0);

    registry.addPeer(slug, 'bo', silentChannel());
    now = 5 * MINUTE + ROOM_STATS.minCompanyMs - 1;
    registry.tallyCompany();
    expect(registry.countedRooms).toBe(0);

    now += 1;
    registry.tallyCompany();
    expect(registry.countedRooms).toBe(1);

    // The room goes on; the total does not move again for it.
    now += 60 * MINUTE;
    registry.tallyCompany();
    registry.removePeer(slug, first.peerId);
    expect(registry.countedRooms).toBe(1);
  });

  it('does not count a room whose company never adds up', () => {
    let now = 0;
    const registry = new RoomRegistry(() => now);
    const { slug } = registry.createRoom('');
    registry.addPeer(slug, 'ana', silentChannel());
    const second = registry.addPeer(slug, 'bo', silentChannel());
    now = 19 * MINUTE;
    registry.removePeer(slug, second.peerId);
    now = 90 * MINUTE;
    registry.tallyCompany();
    expect(registry.countedRooms).toBe(0);
  });
});
