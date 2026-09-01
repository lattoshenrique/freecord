import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import { SignalingSession, sweepStalePeers } from '../src/app/signaling.js';
import {
  ROOM_LIMITS,
  RoomFullError,
  enqueueSignal,
  type ServerMessage,
} from '../src/domain/room.js';

function connect(registry: RoomRegistry, slug: string, name: string) {
  const inbox: ServerMessage[] = [];
  const channel = { send: (m: ServerMessage) => inbox.push(m), closed: false, close() {} };
  channel.close = () => {
    channel.closed = true;
  };
  const session = SignalingSession.join(registry, slug, name, channel);
  return { session, inbox, channel, last: () => inbox[inbox.length - 1] };
}

function welcomeOf(inbox: ServerMessage[]) {
  const welcome = inbox[0];
  if (welcome?.t !== 'welcome') throw new Error('no welcome');
  return welcome;
}

function resumeWith(registry: RoomRegistry, slug: string, token: string) {
  const inbox: ServerMessage[] = [];
  const channel = { send: (m: ServerMessage) => inbox.push(m), closed: false, close() {} };
  channel.close = () => {
    channel.closed = true;
  };
  const session = SignalingSession.resume(registry, slug, token, channel);
  return { session, inbox, channel };
}

function setup(now?: () => number) {
  const registry = new RoomRegistry(now);
  const { slug } = registry.createRoom('Room');
  return { registry, slug };
}

describe('session resume', () => {
  it('a transport drop keeps the seat: no peer-left, room still counts the peer', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.close();

    expect(bia.inbox.some((m) => m.t === 'peer-left')).toBe(false);
    expect(registry.summarize(slug).participantCount).toBe(2);
  });

  it('resuming reclaims the same peerId on a new channel; the mesh identity survives', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const token = welcomeOf(ana.inbox).resumeToken;

    ana.session.close();
    const back = resumeWith(registry, slug, token);

    expect(back.session).not.toBeNull();
    expect(back.session!.peerId).toBe(ana.session.peerId);
    const welcome = welcomeOf(back.inbox);
    expect(welcome.selfId).toBe(ana.session.peerId);
    expect(welcome.peers).toEqual([{ id: bia.session.peerId, name: 'Bia' }]);
    // The seat was never vacated: nobody hears a duplicate arrival.
    expect(bia.inbox.some((m) => m.t === 'peer-joined' && m.peer.id === ana.session.peerId)).toBe(
      false,
    );

    // Traffic flows through the new channel.
    bia.session.handleMessage({ t: 'signal', to: ana.session.peerId, data: { sdp: 'x' } });
    expect(back.inbox.at(-1)).toEqual({ t: 'signal', from: bia.session.peerId, data: { sdp: 'x' } });
  });

  it('an unknown token is refused', () => {
    const { registry, slug } = setup();
    connect(registry, slug, 'Ana');

    expect(resumeWith(registry, slug, 'forged-token').session).toBeNull();
  });

  it('a seat not resumed expires on the zombie clock — no extra grace', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const token = welcomeOf(ana.inbox).resumeToken;

    ana.session.close();
    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    bia.session.handleMessage({ t: 'ping', ts: 1 });
    sweepStalePeers(registry);

    expect(bia.last()).toEqual({ t: 'peer-left', id: ana.session.peerId });
    expect(registry.summarize(slug).participantCount).toBe(1);
    expect(resumeWith(registry, slug, token).session).toBeNull();
  });

  it("the screen lock's grace is shorter than the seat's", () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'balanced' });
    ana.session.close();

    clock = ROOM_LIMITS.screenLockGraceMs + 1;
    bia.session.handleMessage({ t: 'ping', ts: 1 });
    sweepStalePeers(registry);

    // The screen is free, but the seat is not: Ana may still resume.
    expect(bia.inbox.map((m) => m.t)).toContain('screen-stopped');
    expect(bia.inbox.some((m) => m.t === 'peer-left')).toBe(false);
    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'balanced' });
    expect(bia.inbox.some((m) => m.t === 'screen-started' && m.id === bia.session.peerId)).toBe(
      true,
    );
  });

  it('a detached seat still counts toward capacity', () => {
    const { registry, slug } = setup();
    const first = connect(registry, slug, 'P0');
    for (let i = 1; i < ROOM_LIMITS.maxParticipants; i += 1) {
      connect(registry, slug, `P${i}`);
    }

    first.session.close();
    expect(() => connect(registry, slug, 'Late')).toThrow(RoomFullError);
  });

  it("a newcomer's welcome lists detached peers — they are still in the room", () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    ana.session.close();

    const bia = connect(registry, slug, 'Bia');
    expect(welcomeOf(bia.inbox).peers).toEqual([{ id: ana.session.peerId, name: 'Ana' }]);
  });

  it('resuming over a half-dead socket replaces it', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const token = welcomeOf(ana.inbox).resumeToken;

    // No close() first: the server never saw the old socket die.
    const back = resumeWith(registry, slug, token);

    expect(back.session!.peerId).toBe(ana.session.peerId);
    expect(ana.channel.closed).toBe(true);
    const mark = back.inbox.length;
    bia.session.handleMessage({ t: 'chat', text: 'hi' });
    expect(back.inbox.length).toBeGreaterThan(mark);

    // The late close event of the replaced socket must not detach the fresh one.
    ana.session.close();
    const before = registry.summarize(slug).participantCount;
    expect(before).toBe(2);
  });

  it('welcome hands the ICE servers given to the join', () => {
    const { registry, slug } = setup();
    const inbox: ServerMessage[] = [];
    const channel = { send: (m: ServerMessage) => inbox.push(m), close() {} };
    const ice = [{ urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'c' }];

    SignalingSession.join(registry, slug, 'Ana', channel, ice);

    expect(welcomeOf(inbox).ice).toEqual(ice);
  });
});

describe('signals held across a resume', () => {
  it('a signal to a detached peer is held, not dropped, and delivered after welcome', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const token = welcomeOf(ana.inbox).resumeToken;

    ana.session.close();
    bia.session.handleMessage({ t: 'signal', to: ana.session.peerId, data: { candidate: 'c1' } });
    bia.session.handleMessage({ t: 'signal', to: ana.session.peerId, data: { candidate: 'c2' } });
    // The dead channel never sees them.
    expect(ana.inbox.filter((m) => m.t === 'signal')).toHaveLength(0);

    const back = resumeWith(registry, slug, token);
    expect(back.inbox[0]!.t).toBe('welcome');
    expect(back.inbox.slice(1, 3)).toEqual([
      { t: 'signal', from: bia.session.peerId, data: { candidate: 'c1' } },
      { t: 'signal', from: bia.session.peerId, data: { candidate: 'c2' } },
    ]);
    // Delivered once: a second resume starts with an empty queue.
    back.session!.close();
    const again = resumeWith(registry, slug, token);
    expect(again.inbox.filter((m) => m.t === 'signal')).toHaveLength(0);
  });

  it('a signal to an attached peer still goes straight through', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    bia.session.handleMessage({ t: 'signal', to: ana.session.peerId, data: { candidate: 'c' } });
    expect(ana.last()).toEqual({ t: 'signal', from: bia.session.peerId, data: { candidate: 'c' } });
  });

  it('a swept seat forgets its queue with the seat', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const token = welcomeOf(ana.inbox).resumeToken;
    ana.session.close();
    bia.session.handleMessage({ t: 'signal', to: ana.session.peerId, data: { candidate: 'c' } });
    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    sweepStalePeers(registry);
    expect(resumeWith(registry, slug, token).session).toBeNull();
  });
});

describe('enqueueSignal', () => {
  const from = 'X';
  const signal = (data: unknown, sender = from): Extract<ServerMessage, { t: 'signal' }> => ({
    t: 'signal',
    from: sender,
    data,
  });

  it('keeps arrival order for candidates', () => {
    let queue: ServerMessage[] = [];
    queue = enqueueSignal(queue, signal({ candidate: 1 }));
    queue = enqueueSignal(queue, signal({ candidate: 2 }));
    expect(queue.map((m) => (m as { data: { candidate: number } }).data.candidate)).toEqual([1, 2]);
  });

  it('a new description from a sender supersedes that sender\'s older offer and candidates', () => {
    let queue: ServerMessage[] = [];
    queue = enqueueSignal(queue, signal({ description: { type: 'offer', sdp: 'v1' } }));
    queue = enqueueSignal(queue, signal({ candidate: 'for-v1' }));
    queue = enqueueSignal(queue, signal({ candidate: 'other' }, 'Y'));
    queue = enqueueSignal(queue, signal({ description: { type: 'offer', sdp: 'v2' } }));
    expect(queue).toEqual([signal({ candidate: 'other' }, 'Y'), signal({ description: { type: 'offer', sdp: 'v2' } })]);
  });

  it('drops the oldest past the item cap', () => {
    let queue: ServerMessage[] = [];
    for (let i = 0; i < ROOM_LIMITS.detachedSignalMaxItems + 5; i += 1) {
      queue = enqueueSignal(queue, signal({ candidate: i }));
    }
    expect(queue).toHaveLength(ROOM_LIMITS.detachedSignalMaxItems);
    expect((queue[0] as { data: { candidate: number } }).data.candidate).toBe(5);
  });

  it('drops the oldest past the byte cap, never the newest', () => {
    const big = 'x'.repeat(40 * 1024);
    let queue: ServerMessage[] = [];
    queue = enqueueSignal(queue, signal({ candidate: `1${big}` }));
    queue = enqueueSignal(queue, signal({ candidate: `2${big}` }));
    queue = enqueueSignal(queue, signal({ candidate: `3${big}` }));
    expect(queue).toHaveLength(2);
    expect(JSON.stringify(queue).length).toBeLessThan(ROOM_LIMITS.detachedSignalMaxBytes + 100);
    expect((queue[1] as { data: { candidate: string } }).data.candidate.startsWith('3')).toBe(true);
  });
});
