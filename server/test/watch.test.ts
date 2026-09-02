import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import { SignalingSession, parseClientMessage } from '../src/app/signaling.js';
import type { ServerMessage } from '../src/domain/room.js';
import { WATCH_LIMITS, isPosition, isVideoId, projectWatch } from '../src/domain/watch.js';

function connect(registry: RoomRegistry, slug: string, name: string) {
  const inbox: ServerMessage[] = [];
  const channel = { send: (m: ServerMessage) => inbox.push(m), close() {} };
  const session = SignalingSession.join(registry, slug, name, channel);
  return { session, inbox, last: () => inbox[inbox.length - 1] };
}

function setup() {
  const registry = new RoomRegistry();
  const { slug } = registry.createRoom('Room');
  return { registry, slug };
}

/** The projection of the last `watch-state` an inbox saw. */
function lastWatch(inbox: ServerMessage[]) {
  const message = [...inbox].reverse().find((m) => m.t === 'watch-state');
  return message?.t === 'watch-state' ? message.watch : undefined;
}

describe('watch state', () => {
  it('a paused video sits still; a playing one moves with the clock', () => {
    const state = { video: 'dQw4w9WgXcQ', playing: false, time: 30, at: 1_000 };

    expect(projectWatch(state, 61_000)?.time).toBe(30);
    expect(projectWatch({ ...state, playing: true }, 61_000)?.time).toBe(90);
  });

  it('nothing to watch projects to null', () => {
    expect(projectWatch(null, 1_000)).toBeNull();
    expect(projectWatch(undefined, 1_000)).toBeNull();
  });

  it('a clock that went backwards never rewinds the room', () => {
    const state = { video: 'dQw4w9WgXcQ', playing: true, time: 30, at: 10_000 };
    expect(projectWatch(state, 9_000)?.time).toBe(30);
  });

  it('only an eleven-character id is a video id', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isVideoId('dQw4w9WgXc')).toBe(false);
    expect(isVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(isVideoId('<script>xxx')).toBe(false);
    expect(isVideoId(null)).toBe(false);
  });

  it('a position is a real number of seconds inside a day', () => {
    expect(isPosition(0)).toBe(true);
    expect(isPosition(12.5)).toBe(true);
    expect(isPosition(-1)).toBe(false);
    expect(isPosition(Number.NaN)).toBe(false);
    expect(isPosition(WATCH_LIMITS.maxPositionSeconds + 1)).toBe(false);
    expect(isPosition('30')).toBe(false);
  });
});

describe('parseClientMessage: watch', () => {
  it('accepts an id with a position, and a close', () => {
    expect(
      parseClientMessage(JSON.stringify({ t: 'watch', video: 'dQw4w9WgXcQ', playing: true, time: 12 })),
    ).toEqual({ t: 'watch', video: 'dQw4w9WgXcQ', playing: true, time: 12 });
    expect(parseClientMessage(JSON.stringify({ t: 'watch', video: null, playing: false, time: 0 }))).toEqual(
      { t: 'watch', video: null, playing: false, time: 0 },
    );
  });

  it('drops anything the room could not load', () => {
    for (const message of [
      { t: 'watch', video: 'javascript:alert(1)', playing: true, time: 0 },
      { t: 'watch', video: 'dQw4w9WgXcQ', playing: 'yes', time: 0 },
      { t: 'watch', video: 'dQw4w9WgXcQ', playing: true, time: -5 },
      { t: 'watch', video: 'dQw4w9WgXcQ', playing: true },
    ]) {
      expect(parseClientMessage(JSON.stringify(message))).toBeNull();
    }
  });
});

describe('SignalingSession: watch', () => {
  it('opening a video reaches the room, the sender included', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'watch', video: 'dQw4w9WgXcQ', playing: true, time: 0 });

    for (const peer of [ana, bia]) {
      const watch = lastWatch(peer.inbox);
      expect(watch?.video).toBe('dQw4w9WgXcQ');
      expect(watch?.playing).toBe(true);
    }
    expect(bia.last()).toMatchObject({ t: 'watch-state', by: ana.session.peerId });
  });

  it('anyone controls the player: the last word wins', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'watch', video: 'dQw4w9WgXcQ', playing: true, time: 0 });
    bia.session.handleMessage({ t: 'watch', video: 'dQw4w9WgXcQ', playing: false, time: 42 });

    expect(lastWatch(ana.inbox)).toEqual({ video: 'dQw4w9WgXcQ', playing: false, time: 42 });
  });

  it('whoever joins late is told what is on and where it is', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    ana.session.handleMessage({ t: 'watch', video: 'dQw4w9WgXcQ', playing: false, time: 42 });

    const bia = connect(registry, slug, 'Bia');
    const welcome = bia.inbox[0]!;
    expect(welcome.t).toBe('welcome');
    if (welcome.t === 'welcome') {
      expect(welcome.watch).toEqual({ video: 'dQw4w9WgXcQ', playing: false, time: 42 });
    }
  });

  it('a room with nothing on welcomes with nothing on', () => {
    const { registry, slug } = setup();
    const welcome = connect(registry, slug, 'Ana').inbox[0]!;
    if (welcome.t === 'welcome') {
      expect(welcome.watch).toBeNull();
    }
  });

  it('closing it closes it for everyone', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'watch', video: 'dQw4w9WgXcQ', playing: true, time: 0 });
    bia.session.handleMessage({ t: 'watch', video: null, playing: false, time: 0 });

    expect(lastWatch(ana.inbox)).toBeNull();
    const carla = connect(registry, slug, 'Carla');
    const welcome = carla.inbox[0]!;
    if (welcome.t === 'welcome') {
      expect(welcome.watch).toBeNull();
    }
  });
});
