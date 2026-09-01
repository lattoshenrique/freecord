/**
 * Resume: a dropped transport reclaims its seat (same peerId) by token.
 * The seat survives the grace; the camera slot deliberately does not.
 */
import { expect, test } from '@playwright/test';
import { createRoom, getRoom } from '../../helpers/http';
import { ProtoClient, cleanup } from '../../helpers/ws-client';

test.describe('resume', () => {
  test('a dropped peer resumes with the same peerId; the room never saw it leave', async () => {
    const { slug } = await createRoom('resume-basic');
    const alice = await ProtoClient.join(slug, 'alice');
    const bob = await ProtoClient.join(slug, 'bob');
    try {
      const aliceId = alice.selfId;
      const token = alice.welcome!.resumeToken;

      alice.terminate();
      // The seat is kept: no peer-left inside the grace window.
      await bob.expectSilence((m) => m.t === 'peer-left', 1_000);
      expect((await getRoom(slug)).participantCount).toBe(2);

      const alice2 = await ProtoClient.resume(slug, token, 'alice-resumed');
      expect(alice2.welcome).not.toBeNull();
      expect(alice2.selfId).toBe(aliceId);
      expect(alice2.welcome!.peers).toEqual([{ id: bob.selfId, name: 'bob' }]);

      // A resume is not a join: nobody hears peer-joined.
      await bob.expectSilence((m) => m.t === 'peer-joined');

      alice2.leave();
    } finally {
      await cleanup([bob]);
    }
  });

  test('signals sent during the outage are held and delivered after the resume welcome', async () => {
    const { slug } = await createRoom('resume-held-signals');
    const alice = await ProtoClient.join(slug, 'alice');
    const bob = await ProtoClient.join(slug, 'bob');
    try {
      const token = alice.welcome!.resumeToken;
      alice.terminate();
      await bob.expectSilence((m) => m.t === 'peer-left', 300);

      // Bob renegotiates while alice's transport is down: an offer, then
      // its candidates, then a fresh offer that supersedes the first.
      bob.send({ t: 'signal', to: alice.selfId!, data: { description: { type: 'offer', sdp: 'v1' } } });
      bob.send({ t: 'signal', to: alice.selfId!, data: { candidate: 'for-v1' } });
      bob.send({ t: 'signal', to: alice.selfId!, data: { description: { type: 'offer', sdp: 'v2' } } });
      bob.send({ t: 'signal', to: alice.selfId!, data: { candidate: 'for-v2' } });

      const alice2 = await ProtoClient.resume(slug, token);
      expect(alice2.welcome).not.toBeNull();
      const first = await alice2.expect('signal');
      const second = await alice2.expect('signal');
      expect([first, second]).toEqual([
        { t: 'signal', from: bob.selfId, data: { description: { type: 'offer', sdp: 'v2' } } },
        { t: 'signal', from: bob.selfId, data: { candidate: 'for-v2' } },
      ]);
      // Nothing else was held: the superseded offer and its candidate are gone.
      await alice2.expectSilence((m) => m.t === 'signal');

      alice2.leave();
    } finally {
      await cleanup([bob]);
    }
  });

  test('the camera slot is released on disconnect and re-granted on re-request', async () => {
    const { slug } = await createRoom('resume-camera');
    const alice = await ProtoClient.join(slug, 'alice');
    const bob = await ProtoClient.join(slug, 'bob');
    try {
      alice.send({ t: 'camera-request' });
      await alice.expect('camera-started');
      const token = alice.welcome!.resumeToken;

      alice.terminate();
      // No grace for cameras: the slot frees the moment the transport dies.
      const stopped = await bob.expect('camera-stopped');
      expect(stopped.id).toBe(alice.selfId);

      const alice2 = await ProtoClient.resume(slug, token);
      // The welcome roster tells the resumer its slot is gone...
      expect(alice2.welcome!.cameras).toEqual([]);
      // ...and the client-side contract is to re-request (room of 2: granted).
      alice2.send({ t: 'camera-request' });
      const restarted = await alice2.expect('camera-started');
      expect(restarted.id).toBe(alice.selfId);

      alice2.leave();
    } finally {
      await cleanup([bob]);
    }
  });

  test('an unknown resume token is refused with resume_invalid', async () => {
    const { slug } = await createRoom('resume-bogus');
    const anchor = await ProtoClient.join(slug, 'anchor'); // keeps the room alive
    try {
      const ghost = await ProtoClient.resume(slug, 'not-a-real-token');
      expect(ghost.welcome).toBeNull();
      const error = await ghost.expect('error');
      expect(error.code).toBe('resume_invalid');
      await ghost.whenClosed();
    } finally {
      await cleanup([anchor]);
    }
  });

  test('a deliberate leave invalidates the token: the seat was vacated for real', async () => {
    const { slug } = await createRoom('resume-after-leave');
    const alice = await ProtoClient.join(slug, 'alice');
    const bob = await ProtoClient.join(slug, 'bob');
    try {
      const token = alice.welcome!.resumeToken;
      alice.leave();
      await bob.expect('peer-left');

      const ghost = await ProtoClient.resume(slug, token);
      expect(ghost.welcome).toBeNull();
      const error = await ghost.expect('error');
      expect(error.code).toBe('resume_invalid');
    } finally {
      await cleanup([bob]);
    }
  });

  test('resuming replaces a half-dead socket that never closed', async () => {
    const { slug } = await createRoom('resume-replace');
    const alice = await ProtoClient.join(slug, 'alice');
    const bob = await ProtoClient.join(slug, 'bob');
    try {
      const token = alice.welcome!.resumeToken;
      // No terminate: the old socket is still OPEN from the server's view.
      const alice2 = await ProtoClient.resume(slug, token);
      expect(alice2.selfId).toBe(alice.selfId);
      // The server closes the stale transport it replaced.
      await alice.whenClosed();
      expect((await getRoom(slug)).participantCount).toBe(2);
      alice2.leave();
    } finally {
      await cleanup([bob]);
    }
  });
});
