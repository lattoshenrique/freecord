import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import {
  SignalingSession,
  parseClientMessage,
  sweepStalePeers,
} from '../src/app/signaling.js';
import { ROOM_LIMITS, type ServerMessage } from '../src/domain/room.js';

function connect(registry: RoomRegistry, slug: string, name: string) {
  const inbox: ServerMessage[] = [];
  const channel = { send: (m: ServerMessage) => inbox.push(m), closed: false, close() {} };
  channel.close = () => {
    channel.closed = true;
  };
  const session = SignalingSession.join(registry, slug, name, channel);
  return { session, inbox, channel, last: () => inbox[inbox.length - 1] };
}

function setup(now?: () => number) {
  const registry = new RoomRegistry(now);
  const { slug } = registry.createRoom('Room');
  return { registry, slug };
}

describe('SignalingSession', () => {
  it('welcome carries the existing peers; joining is announced to the others', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    const welcome = bia.inbox[0]!;
    expect(welcome.t).toBe('welcome');
    if (welcome.t === 'welcome') {
      expect(welcome.peers).toEqual([{ id: ana.session.peerId, name: 'Ana' }]);
    }
    expect(ana.last()).toEqual({
      t: 'peer-joined',
      peer: { id: bia.session.peerId, name: 'Bia' },
    });
  });

  it('signal relay reaches only the addressee', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const carla = connect(registry, slug, 'Carla');

    ana.session.handleMessage({ t: 'signal', to: bia.session.peerId, data: { sdp: 'x' } });
    expect(bia.last()).toEqual({ t: 'signal', from: ana.session.peerId, data: { sdp: 'x' } });
    expect(carla.inbox.some((m) => m.t === 'signal')).toBe(false);
  });

  it('chat is broadcast to everyone, including the sender', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'chat', text: '  hi!  ' });
    const received = bia.last();
    expect(received.t).toBe('chat');
    if (received.t === 'chat') {
      expect(received.text).toBe('hi!');
      expect(received.from.name).toBe('Ana');
    }
    expect(ana.last().t).toBe('chat');
  });

  it('ping is echoed as pong only to whoever asked', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'ping', ts: 1234 });
    expect(ana.last()).toEqual({ t: 'pong', ts: 1234 });
    expect(bia.inbox.some((m) => m.t === 'pong')).toBe(false);
  });

  it('screen lock: one at a time, denied to the second, released on stop', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'balanced' });
    expect(bia.inbox.map((m) => m.t)).toContain('screen-started');
    expect(bia.inbox.at(-2)).toEqual({
      t: 'screen-started',
      id: ana.session.peerId,
      streamId: 's-ana',
    });

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'balanced' });
    expect(bia.last()).toEqual({ t: 'screen-denied' });

    ana.session.handleMessage({ t: 'screen-stop' });
    expect(bia.last()).toEqual({ t: 'screen-stopped' });

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'balanced' });
    expect(ana.inbox.some((m) => m.t === 'screen-started' && m.id === bia.session.peerId)).toBe(
      true,
    );
  });

  it('a deliberate leave releases the screen lock and announces the departure', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'balanced' });
    ana.session.handleMessage({ t: 'leave' });

    expect(ana.channel.closed).toBe(true);
    expect(bia.inbox.map((m) => m.t)).toContain('screen-stopped');
    expect(bia.last()).toEqual({ t: 'peer-left', id: ana.session.peerId });
    expect(registry.summarize(slug).participantCount).toBe(1);

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia' });
    expect(bia.inbox.some((m) => m.t === 'screen-started')).toBe(true);
  });
});

describe('sweepStalePeers', () => {
  it('kicks whoever stopped giving signs of life, emptying the room', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    ana.session.handleMessage({ t: 'ping', ts: 1 });

    expect(sweepStalePeers(registry)).toBe(1);
    expect(bia.channel.closed).toBe(true);
    expect(ana.last()).toEqual({ t: 'peer-left', id: bia.session.peerId });
    expect(registry.summarize(slug).participantCount).toBe(1);

    // With nobody giving signs of life, the room empties and starts expiring.
    clock += ROOM_LIMITS.peerTimeoutMs + 1;
    expect(sweepStalePeers(registry)).toBe(1);
    expect(registry.summarize(slug).participantCount).toBe(0);
    clock += ROOM_LIMITS.emptyTimeoutMs + 1;
    expect(registry.sweepExpired()).toBe(1);
  });

  it('releases the screen lock of whoever got kicked', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'balanced' });
    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    bia.session.handleMessage({ t: 'ping', ts: 1 });
    sweepStalePeers(registry);

    expect(bia.inbox.map((m) => m.t)).toContain('screen-stopped');
    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'balanced' });
    expect(bia.inbox.some((m) => m.t === 'screen-started' && m.id === bia.session.peerId)).toBe(
      true,
    );
  });
});

describe('screen relay tree', () => {
  function routesOf(inbox: ServerMessage[]) {
    return inbox.filter((m) => m.t === 'screen-route');
  }

  it('sharer receives its children; with fanout to spare, everyone is a direct child', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const carla = connect(registry, slug, 'Carla');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'sharp' });

    const anaRoute = routesOf(ana.inbox).at(-1)!;
    expect(anaRoute.t).toBe('screen-route');
    if (anaRoute.t === 'screen-route') {
      expect(anaRoute.source).toBeNull();
      expect(anaRoute.quality).toBe('sharp');
      expect([...anaRoute.children].sort()).toEqual(
        [bia.session.peerId, carla.session.peerId].sort(),
      );
    }
    const biaRoute = routesOf(bia.inbox).at(-1)!;
    if (biaRoute.t === 'screen-route') {
      expect(biaRoute.children).toEqual([]);
      expect(biaRoute.source).toEqual({ id: ana.session.peerId, streamId: 's-ana' });
    }
  });

  it('with a full room, a relay receives children and its report updates their source', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    const others = ['B', 'C', 'D', 'E'].map((name) => connect(registry, slug, name));

    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'balanced' });

    // 4 viewers, fanout 3: one of them relays to the fourth.
    const sharerRoute = routesOf(sharer.inbox).at(-1)!;
    if (sharerRoute.t !== 'screen-route') throw new Error('no sharer route');
    expect(sharerRoute.children).toHaveLength(3);

    const byId = new Map(others.map((o) => [o.session.peerId, o]));
    const relayId = [...byId.keys()].sort()[0]!; // BFS in lexicographic order
    const relay = byId.get(relayId)!;
    const relayRoute = routesOf(relay.inbox).at(-1)!;
    if (relayRoute.t !== 'screen-route') throw new Error('no relay route');
    expect(relayRoute.children).toHaveLength(1);
    const leafId = relayRoute.children[0]!;
    const leaf = byId.get(leafId)!;

    // Before the relay's report, the leaf doesn't know where to receive from.
    const leafBefore = routesOf(leaf.inbox).at(-1)!;
    if (leafBefore.t === 'screen-route') {
      expect(leafBefore.source).toBeNull();
    }

    relay.session.handleMessage({ t: 'screen-relay', streamId: 'fwd-1' });
    const leafAfter = routesOf(leaf.inbox).at(-1)!;
    if (leafAfter.t === 'screen-route') {
      expect(leafAfter.source).toEqual({ id: relayId, streamId: 'fwd-1' });
    }
  });

  it('a leaf cannot announce itself as a relay', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    const bia = connect(registry, slug, 'Bia');

    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'balanced' });
    const before = routesOf(bia.inbox).length;
    bia.session.handleMessage({ t: 'screen-relay', streamId: 'forged' });
    // With no children in the tree, the report is ignored: no new route goes out.
    expect(routesOf(bia.inbox).length).toBe(before);
  });

  it('a relay leaving reroutes the orphans', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    const others = ['B', 'C', 'D', 'E'].map((name) => connect(registry, slug, name));

    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'balanced' });
    const byId = new Map(others.map((o) => [o.session.peerId, o]));
    const relayId = [...byId.keys()].sort()[0]!;
    const relay = byId.get(relayId)!;

    // A deliberate leave (a bare transport close keeps the seat — and the
    // relay's still-flowing P2P legs — for a resume; see resume.test.ts).
    relay.session.handleMessage({ t: 'leave' });

    // With 3 viewers left, everyone becomes a direct child of the sharer.
    const sharerRoute = routesOf(sharer.inbox).at(-1)!;
    if (sharerRoute.t !== 'screen-route') throw new Error('no sharer route');
    expect([...sharerRoute.children].sort()).toEqual(
      [...byId.keys()].filter((id) => id !== relayId).sort(),
    );
    for (const [id, other] of byId) {
      if (id === relayId) continue;
      const route = routesOf(other.inbox).at(-1)!;
      if (route.t === 'screen-route') {
        expect(route.source).toEqual({ id: sharer.session.peerId, streamId: 's-1' });
        expect(route.children).toEqual([]);
      }
    }
  });

  it('whoever joins during the share receives a route', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'smooth' });

    const late = connect(registry, slug, 'Zoe');
    const route = routesOf(late.inbox).at(-1)!;
    expect(route.t).toBe('screen-route');
    if (route.t === 'screen-route') {
      expect(route.source).toEqual({ id: sharer.session.peerId, streamId: 's-1' });
      expect(route.quality).toBe('smooth');
    }
  });
});

describe('parseClientMessage', () => {
  it('accepts only the closed protocol', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text: 'hi' }))).toEqual({
      t: 'chat',
      text: 'hi',
    });
    expect(parseClientMessage(JSON.stringify({ t: 'signal', to: 'x', data: 1 }))).toEqual({
      t: 'signal',
      to: 'x',
      data: 1,
    });
    expect(parseClientMessage('not-json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'hack' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'chat' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'signal', to: 7, data: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'ping', ts: 42 }))).toEqual({ t: 'ping', ts: 42 });
    expect(parseClientMessage(JSON.stringify({ t: 'ping', ts: 'now' }))).toBeNull();
  });

  it('screen-request without a valid quality falls back to the default; screen-relay is validated', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'screen-request', streamId: 's' }))).toEqual({
      t: 'screen-request',
      streamId: 's',
      quality: 'balanced',
    });
    expect(
      parseClientMessage(JSON.stringify({ t: 'screen-request', streamId: 's', quality: 'sharp' })),
    ).toEqual({ t: 'screen-request', streamId: 's', quality: 'sharp' });
    expect(
      parseClientMessage(JSON.stringify({ t: 'screen-request', streamId: 's', quality: '4k' })),
    ).toEqual({ t: 'screen-request', streamId: 's', quality: 'balanced' });
    expect(parseClientMessage(JSON.stringify({ t: 'screen-relay', streamId: 'fwd' }))).toEqual({
      t: 'screen-relay',
      streamId: 'fwd',
    });
    expect(parseClientMessage(JSON.stringify({ t: 'screen-relay', streamId: 7 }))).toBeNull();
  });
});
