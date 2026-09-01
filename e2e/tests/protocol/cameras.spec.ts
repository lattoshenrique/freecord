/**
 * Server-refereed camera slots (mirror of cameraSlotsFor):
 * <=6 participants: everyone may go live; 7–9: 4 slots; 10–12: 3 slots.
 * The cap binds NEW activations only (grandfathering).
 */
import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { ProtoClient, cleanup } from '../../helpers/ws-client';

async function joinMany(slug: string, count: number, prefix = 'guest'): Promise<ProtoClient[]> {
  const clients: ProtoClient[] = [];
  for (let i = 0; i < count; i += 1) {
    clients.push(await ProtoClient.join(slug, `${prefix}-${i}`));
  }
  return clients;
}

/** Requests a camera and waits for the requester's own grant broadcast. */
async function grantCamera(client: ProtoClient): Promise<void> {
  client.send({ t: 'camera-request' });
  for (;;) {
    const started = await client.expect('camera-started');
    if (started.id === client.selfId) {
      return;
    }
  }
}

test.describe('camera slots', () => {
  test('room of 6: all six cameras are granted', async () => {
    const { slug } = await createRoom('cams-6');
    const clients = await joinMany(slug, 6);
    try {
      for (const client of clients) {
        await grantCamera(client);
      }
      // A late observer sees all six in the welcome roster.
      const observer = await ProtoClient.join(slug, 'observer');
      expect(new Set(observer.welcome!.cameras)).toEqual(new Set(clients.map((c) => c.selfId)));
      observer.leave();
    } finally {
      await cleanup(clients);
    }
  });

  test('room of 7: four grants, the fifth request is denied', async () => {
    const { slug } = await createRoom('cams-7');
    const clients = await joinMany(slug, 7);
    try {
      for (const client of clients.slice(0, 4)) {
        await grantCamera(client);
      }
      clients[4].send({ t: 'camera-request' });
      await clients[4].expect('camera-denied');
      // The denial is private: nobody else hears anything about it.
      await clients[0].expectSilence((m) => m.t === 'camera-denied' || (m.t === 'camera-started' && m.id === clients[4].selfId));
    } finally {
      await cleanup(clients);
    }
  });

  test('a slot frees on camera-stop and can be retaken', async () => {
    const { slug } = await createRoom('cams-stop');
    const clients = await joinMany(slug, 7);
    try {
      for (const client of clients.slice(0, 4)) {
        await grantCamera(client);
      }
      clients[4].send({ t: 'camera-request' });
      await clients[4].expect('camera-denied');

      clients[0].send({ t: 'camera-stop' });
      const stopped = await clients[4].expect('camera-stopped');
      expect(stopped.id).toBe(clients[0].selfId);

      await grantCamera(clients[4]);
    } finally {
      await cleanup(clients);
    }
  });

  test('a slot frees when its holder disconnects (no grace for cameras)', async () => {
    const { slug } = await createRoom('cams-drop');
    const clients = await joinMany(slug, 7);
    try {
      for (const client of clients.slice(0, 4)) {
        await grantCamera(client);
      }
      // Abrupt transport death: the seat enters the resume grace, but the
      // camera slot is released immediately.
      const dropped = clients[1];
      dropped.terminate();
      const stopped = await clients[0].expect('camera-stopped');
      expect(stopped.id).toBe(dropped.selfId);
      // The seat itself is NOT vacated yet.
      await clients[0].expectSilence((m) => m.t === 'peer-left' && m.id === dropped.selfId);

      await grantCamera(clients[5]);
    } finally {
      await cleanup(clients.filter((c) => c !== clients[1]));
    }
  });

  test('grandfathering: cameras live before growth keep their slots', async () => {
    const { slug } = await createRoom('cams-grandfather');
    const clients = await joinMany(slug, 6);
    try {
      // All six go live while the room is small (cap = 6).
      for (const client of clients) {
        await grantCamera(client);
      }
      // The room grows to 7: the cap for NEW activations is now 4, but the
      // six live cameras keep their slots — the newcomer's welcome lists
      // all of them.
      const seventh = await ProtoClient.join(slug, 'seventh');
      clients.push(seventh);
      expect(seventh.welcome!.cameras).toHaveLength(6);

      // The newcomer cannot go live: 6 held >= 4 allowed.
      seventh.send({ t: 'camera-request' });
      await seventh.expect('camera-denied');

      // One holder stopping is not enough (5 >= 4)...
      clients[0].send({ t: 'camera-stop' });
      await seventh.expect('camera-stopped');
      seventh.send({ t: 'camera-request' });
      await seventh.expect('camera-denied');

      // ...but dropping below the cap opens the door (3 < 4).
      clients[1].send({ t: 'camera-stop' });
      clients[2].send({ t: 'camera-stop' });
      await seventh.expect('camera-stopped');
      await seventh.expect('camera-stopped');
      await grantCamera(seventh);
    } finally {
      await cleanup(clients);
    }
  });

  test('a holder re-requesting is re-granted, not double-counted', async () => {
    const { slug } = await createRoom('cams-rerequest');
    const clients = await joinMany(slug, 7);
    try {
      for (const client of clients.slice(0, 4)) {
        await grantCamera(client);
      }
      // The 4 slots are taken; a holder re-requests (the resume path does
      // this) and is granted again instead of denied.
      await grantCamera(clients[0]);
    } finally {
      await cleanup(clients);
    }
  });
});
