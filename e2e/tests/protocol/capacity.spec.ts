import { expect, test } from '@playwright/test';
import { createRoom, getRoom } from '../../helpers/http';
import { ProtoClient, cleanup } from '../../helpers/ws-client';

test.describe('room capacity', () => {
  test('12 join, the 13th is refused with room_full and closed', async () => {
    const { slug } = await createRoom('capacity');
    const clients: ProtoClient[] = [];
    try {
      for (let i = 0; i < 12; i += 1) {
        clients.push(await ProtoClient.join(slug, `guest-${i}`));
      }
      // The last joiner sees the other 11 seats taken.
      expect(clients[11].welcome!.peers).toHaveLength(11);
      expect((await getRoom(slug)).participantCount).toBe(12);

      const refusal = await ProtoClient.joinExpectingError(slug, 'thirteenth');
      expect(refusal).toEqual({ t: 'error', code: 'room_full' });

      // The refusal took no seat.
      expect((await getRoom(slug)).participantCount).toBe(12);
    } finally {
      await cleanup(clients);
    }
  });

  test('a vacated seat can be retaken', async () => {
    const { slug } = await createRoom('capacity-retake');
    const clients: ProtoClient[] = [];
    try {
      for (let i = 0; i < 12; i += 1) {
        clients.push(await ProtoClient.join(slug, `guest-${i}`));
      }
      const leaver = clients.pop()!;
      leaver.leave();
      // A deliberate goodbye vacates immediately: everyone hears peer-left.
      const left = await clients[0].expect('peer-left');
      expect(left.id).toBe(leaver.selfId);

      clients.push(await ProtoClient.join(slug, 'replacement'));
      expect((await getRoom(slug)).participantCount).toBe(12);
    } finally {
      await cleanup(clients);
    }
  });

  test('joining an unknown room is refused with room_not_found', async () => {
    const refusal = await ProtoClient.joinExpectingError('no-such-room', 'ghost');
    expect(refusal).toEqual({ t: 'error', code: 'room_not_found' });
  });
});
