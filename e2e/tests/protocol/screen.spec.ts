/**
 * Screen lock + forwarding tree. The expected topology comes from the
 * server's own computeScreenTree (imported from the compiled dist), so a
 * change to the algorithm shows up here as a deliberate diff, not drift.
 */
import { expect, test } from '@playwright/test';
// @ts-expect-error compiled server module without bundled types
import { computeScreenTree, SCREEN_FANOUT } from '@freecord/server/dist/domain/screen-tree.js';
import { createRoom } from '../../helpers/http';
import { ProtoClient, cleanup, type Msg } from '../../helpers/ws-client';

async function joinMany(slug: string, count: number): Promise<ProtoClient[]> {
  const clients: ProtoClient[] = [];
  for (let i = 0; i < count; i += 1) {
    clients.push(await ProtoClient.join(slug, `guest-${i}`));
  }
  return clients;
}

test.describe('screen share lock and route tree', () => {
  test('12 peers: routes form the deterministic fanout-3 tree, depth <= 2', async () => {
    const { slug } = await createRoom('screen-12');
    const clients = await joinMany(slug, 12);
    try {
      const sharer = clients[5];
      sharer.send({ t: 'screen-request', streamId: 'stream-original', quality: 'balanced' });

      // Everyone hears the lock being taken.
      for (const client of clients) {
        const started = await client.expect('screen-started');
        expect(started).toEqual({ t: 'screen-started', id: sharer.selfId, streamId: 'stream-original' });
      }

      // Every peer gets its role; compare against the server's own algorithm.
      const allIds = clients.map((c) => c.selfId);
      const expected: Map<string, { children: string[]; parentId: string | null }> =
        computeScreenTree(sharer.selfId, allIds);

      const routes = new Map<string, Msg>();
      for (const client of clients) {
        routes.set(client.selfId, await client.expect('screen-route'));
      }

      for (const client of clients) {
        const route = routes.get(client.selfId)!;
        const want = expected.get(client.selfId)!;
        expect(route.children).toEqual(want.children);
        expect(route.quality).toBe('balanced');
        // Fanout cap holds for every node.
        expect(route.children.length).toBeLessThanOrEqual(SCREEN_FANOUT);
        // Before any relay reports, only direct children of the sharer
        // have a usable source; everyone else waits with source: null.
        if (want.parentId === sharer.selfId) {
          expect(route.source).toEqual({ id: sharer.selfId, streamId: 'stream-original' });
        } else {
          expect(route.source).toBeNull();
        }
      }

      // Lexicographic determinism: the sharer's children are the 3 lowest ids.
      const viewersSorted = allIds.filter((id) => id !== sharer.selfId).sort();
      expect(routes.get(sharer.selfId)!.children).toEqual(viewersSorted.slice(0, 3));

      // Depth <= 2: every viewer is a child of the sharer or of one of its children.
      const level1 = new Set<string>(expected.get(sharer.selfId)!.children);
      for (const id of viewersSorted) {
        const parent = expected.get(id)!.parentId;
        expect(parent === sharer.selfId || level1.has(parent!)).toBe(true);
      }

      // The tree covers all 11 viewers exactly once.
      const allChildren = [...expected.values()].flatMap((r) => r.children);
      expect(allChildren.sort()).toEqual(viewersSorted);
    } finally {
      await cleanup(clients);
    }
  });

  test('the lock is exclusive: a second sharer is denied, privately', async () => {
    const { slug } = await createRoom('screen-lock');
    const clients = await joinMany(slug, 3);
    try {
      clients[0].send({ t: 'screen-request', streamId: 's-a', quality: 'sharp' });
      await clients[1].expect('screen-started');

      clients[1].send({ t: 'screen-request', streamId: 's-b', quality: 'sharp' });
      await clients[1].expect('screen-denied');
      await clients[2].expectSilence((m) => m.t === 'screen-started' && m.streamId === 's-b');
    } finally {
      await cleanup(clients);
    }
  });

  test('a relay reporting its stream updates its children; a leaf is ignored', async () => {
    const { slug } = await createRoom('screen-relay');
    const clients = await joinMany(slug, 8);
    try {
      const sharer = clients[0];
      sharer.send({ t: 'screen-request', streamId: 's-root', quality: 'smooth' });
      const byId = new Map(clients.map((c) => [c.selfId, c]));
      const expected = computeScreenTree(sharer.selfId, clients.map((c) => c.selfId));

      const firstRelayId = expected.get(sharer.selfId)!.children.find(
        (id: string) => expected.get(id)!.children.length > 0,
      )!;
      const relay = byId.get(firstRelayId)!;
      const relayChildIds: string[] = expected.get(firstRelayId)!.children;

      // Drain the initial route round.
      for (const client of clients) {
        await client.expect('screen-route');
      }

      relay.send({ t: 'screen-relay', streamId: 's-forwarded' });
      // The report re-broadcasts routes to EVERYONE; the relay's children
      // now see it as their source. Drain the round on every client so the
      // silence assertion below only watches what comes next.
      for (const client of clients) {
        const route = await client.expect('screen-route');
        if (relayChildIds.includes(client.selfId)) {
          expect(route.source).toEqual({ id: firstRelayId, streamId: 's-forwarded' });
          expect(route.quality).toBe('smooth');
        }
      }

      // A leaf (no children) announcing a relay stream changes nothing.
      const leafId = clients.map((c) => c.selfId).find((id) => expected.get(id)!.children.length === 0)!;
      byId.get(leafId)!.send({ t: 'screen-relay', streamId: 's-bogus' });
      await sharer.expectSilence((m) => m.t === 'screen-route');
    } finally {
      await cleanup(clients);
    }
  });

  test('a late joiner during a share gets the screen in welcome plus a route', async () => {
    const { slug } = await createRoom('screen-late');
    const clients = await joinMany(slug, 5);
    try {
      clients[0].send({ t: 'screen-request', streamId: 's-live', quality: 'balanced' });
      await clients[0].expect('screen-started');

      const late = await ProtoClient.join(slug, 'latecomer');
      clients.push(late);
      expect(late.welcome!.screen).toEqual({ id: clients[0].selfId, streamId: 's-live' });
      const route = await late.expect('screen-route');
      expect(Array.isArray(route.children)).toBe(true);
    } finally {
      await cleanup(clients);
    }
  });

  test('screen-stop releases the lock for the next sharer', async () => {
    const { slug } = await createRoom('screen-stop');
    const clients = await joinMany(slug, 3);
    try {
      clients[0].send({ t: 'screen-request', streamId: 's-1', quality: 'balanced' });
      await clients[1].expect('screen-started');
      clients[0].send({ t: 'screen-stop' });
      await clients[1].expect('screen-stopped');

      clients[1].send({ t: 'screen-request', streamId: 's-2', quality: 'balanced' });
      const started = await clients[2].expectWhere(
        (m) => m.t === 'screen-started' && m.streamId === 's-2',
        'screen-started for s-2',
      );
      expect(started.id).toBe(clients[1].selfId);
    } finally {
      await cleanup(clients);
    }
  });
});
