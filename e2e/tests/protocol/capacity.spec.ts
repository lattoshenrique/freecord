import { expect, test } from '@playwright/test';
import { ROOM_LIMITS } from '../../../server/src/domain/room.js';
import { createRoom, getRoom } from '../../helpers/http';
import { ProtoClient, cleanup } from '../../helpers/ws-client';

const MAX = ROOM_LIMITS.maxParticipants;

test.describe('room capacity', () => {
  test(`${MAX} join, the next is refused with room_full and closed`, async () => {
    const { slug } = await createRoom('capacity');
    const clients: ProtoClient[] = [];
    try {
      for (let i = 0; i < MAX; i += 1) {
        clients.push(await ProtoClient.join(slug, `guest-${i}`));
      }
      // The last joiner sees every other seat taken.
      expect(clients[MAX - 1].welcome!.peers).toHaveLength(MAX - 1);
      expect((await getRoom(slug)).participantCount).toBe(MAX);

      const refusal = await ProtoClient.joinExpectingError(slug, 'one-too-many');
      expect(refusal).toEqual({ t: 'error', code: 'room_full' });

      // The refusal took no seat.
      expect((await getRoom(slug)).participantCount).toBe(MAX);
    } finally {
      await cleanup(clients);
    }
  });

  test('a vacated seat can be retaken', async () => {
    const { slug } = await createRoom('capacity-retake');
    const clients: ProtoClient[] = [];
    try {
      for (let i = 0; i < MAX; i += 1) {
        clients.push(await ProtoClient.join(slug, `guest-${i}`));
      }
      const leaver = clients.pop()!;
      leaver.leave();
      // A deliberate goodbye vacates immediately: everyone hears peer-left.
      const left = await clients[0].expect('peer-left');
      expect(left.id).toBe(leaver.selfId);

      clients.push(await ProtoClient.join(slug, 'replacement'));
      expect((await getRoom(slug)).participantCount).toBe(MAX);
    } finally {
      await cleanup(clients);
    }
  });

  test('joining an unknown room is refused with room_not_found', async () => {
    const refusal = await ProtoClient.joinExpectingError('no-such-room', 'ghost');
    expect(refusal).toEqual({ t: 'error', code: 'room_not_found' });
  });
});
