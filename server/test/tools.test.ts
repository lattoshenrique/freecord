import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import { SignalingSession, parseClientMessage, sweepStalePeers } from '../src/app/signaling.js';
import { ROOM_LIMITS, type ServerMessage } from '../src/domain/room.js';
import {
  TOOL_LIMITS,
  canControlTool,
  clearToolState,
  clearToolsOwnedBy,
  isStorableState,
  isToolId,
  projectTool,
  projectTools,
  setToolState,
} from '../src/domain/tools.js';

function connect(registry: RoomRegistry, slug: string, name: string) {
  const inbox: ServerMessage[] = [];
  const channel = { send: (m: ServerMessage) => inbox.push(m), close() {} };
  const session = SignalingSession.join(registry, slug, name, channel);
  return { session, inbox, last: () => inbox[inbox.length - 1] };
}

function setup(now?: () => number) {
  const registry = new RoomRegistry(now);
  const { slug } = registry.createRoom('Room');
  return { registry, slug };
}

/** The last `tool-state` an inbox saw for a given tool. */
function lastState(inbox: ServerMessage[], tool: string) {
  return [...inbox].reverse().find((m) => m.t === 'tool-state' && m.tool === tool);
}

const entry = (state: unknown, at = 1_000) => ({ state, by: 'ana', at });

describe('tool ids', () => {
  it('are lowercase, dashed and short — a wire key and a storage key', () => {
    expect(isToolId('youtube')).toBe(true);
    expect(isToolId('acme-whiteboard')).toBe(true);
    expect(isToolId('YouTube')).toBe(false);
    expect(isToolId('a')).toBe(false);
    expect(isToolId('-leading-dash')).toBe(false);
    expect(isToolId('with space')).toBe(false);
    expect(isToolId('x'.repeat(33))).toBe(false);
    expect(isToolId(42)).toBe(false);
  });
});

describe('storable state', () => {
  it('takes anything JSON-shaped inside the cap', () => {
    expect(isStorableState({ video: 'dQw4w9WgXcQ', playing: true })).toBe(true);
    expect(isStorableState(null)).toBe(true);
    expect(isStorableState('a string')).toBe(true);
    expect(isStorableState(undefined)).toBe(false);
  });

  it('refuses a state too big to echo to a whole room', () => {
    const big = { blob: 'x'.repeat(TOOL_LIMITS.maxStateBytes) };
    expect(isStorableState(big)).toBe(false);
  });
});

describe('the shelf', () => {
  it('holds one state per tool, last word winning', () => {
    let states = setToolState({}, 'youtube', entry({ playing: true }))!;
    states = setToolState(states, 'youtube', entry({ playing: false }))!;
    expect(states.youtube?.state).toEqual({ playing: false });
    expect(Object.keys(states)).toEqual(['youtube']);
  });

  it('refuses a new tool past the cap, but never an existing one', () => {
    let states = {};
    for (let i = 0; i < TOOL_LIMITS.maxTools; i++) {
      states = setToolState(states, `tool-${i}`, entry(i))!;
    }
    expect(setToolState(states, 'one-too-many', entry(0))).toBeNull();
    expect(setToolState(states, 'tool-0', entry('changed'))).not.toBeNull();
  });

  it('clearing frees the slot; clearing what is not there changes nothing', () => {
    const states = setToolState({}, 'youtube', entry(1))!;
    expect(clearToolState(states, 'youtube')).toEqual({});
    expect(clearToolState(states, 'absent')).toBe(states);
  });

  it('keeps the first watch setter as its controller until it is cleared', () => {
    const states = setToolState({}, 'watch', entry({ playing: true }))!;
    expect(canControlTool(states, 'watch', 'ana')).toBe(true);
    expect(canControlTool(states, 'watch', 'bia')).toBe(false);
    expect(canControlTool({}, 'watch', 'bia')).toBe(true);
    expect(canControlTool(states, 'acme-timer', 'bia')).toBe(true);
  });

  it('clears a departed participant’s watch without clearing ordinary room tools', () => {
    let states = setToolState({}, 'watch', entry({ playing: true }))!;
    states = setToolState(states, 'acme-timer', entry({ left: 90 }))!;

    expect(clearToolsOwnedBy(states, 'ana')).toEqual({
      states: { 'acme-timer': states['acme-timer'] },
      cleared: ['watch'],
    });
    expect(clearToolsOwnedBy(states, 'bia')).toEqual({ states, cleared: [] });
  });
});

describe('projection', () => {
  it('reports the age of a state, never a timestamp', () => {
    expect(projectTool('youtube', entry({ t: 1 }, 1_000), 4_000)).toEqual({
      tool: 'youtube',
      state: { t: 1 },
      by: 'ana',
      age: 3_000,
    });
  });

  it('a clock that went backwards never hands out a negative age', () => {
    expect(projectTool('youtube', entry(1, 10_000), 9_000)?.age).toBe(0);
  });

  it('nothing on projects to nothing', () => {
    expect(projectTool('youtube', undefined, 1)).toBeNull();
    expect(projectTools({}, 1)).toEqual([]);
  });
});

describe('parseClientMessage: tool-state', () => {
  it('takes an id it can key by and a state it can store', () => {
    expect(
      parseClientMessage(JSON.stringify({ t: 'tool-state', tool: 'youtube', state: { a: 1 } })),
    ).toEqual({ t: 'tool-state', tool: 'youtube', state: { a: 1 } });
    expect(parseClientMessage(JSON.stringify({ t: 'tool-state', tool: 'youtube', state: null }))).toEqual(
      { t: 'tool-state', tool: 'youtube', state: null },
    );
  });

  it('drops an id it could not key by, or a state it could not hold', () => {
    for (const message of [
      { t: 'tool-state', tool: 'Not An Id', state: {} },
      { t: 'tool-state', state: {} },
      { t: 'tool-state', tool: 'youtube', state: { blob: 'x'.repeat(TOOL_LIMITS.maxStateBytes) } },
    ]) {
      expect(parseClientMessage(JSON.stringify(message))).toBeNull();
    }
  });

  it('does not look inside a state it accepted — that is the tool’s job', () => {
    const nonsense = { anything: ['at', 'all'], nested: { deeply: true } };
    expect(
      parseClientMessage(JSON.stringify({ t: 'tool-state', tool: 'acme-thing', state: nonsense })),
    ).toEqual({ t: 'tool-state', tool: 'acme-thing', state: nonsense });
  });
});

describe('SignalingSession: tool-state', () => {
  it('reaches the whole room, the sender included, with an age', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'tool-state', tool: 'youtube', state: { video: 'x' } });

    for (const peer of [ana, bia]) {
      expect(lastState(peer.inbox, 'youtube')).toMatchObject({
        tool: 'youtube',
        state: { video: 'x' },
        by: ana.session.peerId,
        age: 0,
      });
    }
  });

  it('keeps last-word-wins behavior for ordinary tools', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'tool-state', tool: 'acme-timer', state: { playing: true } });
    bia.session.handleMessage({ t: 'tool-state', tool: 'acme-timer', state: { playing: false } });

    expect(lastState(ana.inbox, 'acme-timer')).toMatchObject({
      state: { playing: false },
      by: bia.session.peerId,
    });
  });

  it('lets only the participant who started watch update or close it', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const initial = { video: 'one', playing: true };

    ana.session.handleMessage({ t: 'tool-state', tool: 'watch', state: initial });
    const anaMessages = ana.inbox.length;

    bia.session.handleMessage({
      t: 'tool-state',
      tool: 'watch',
      state: { video: 'two', playing: false },
    });
    expect(ana.inbox).toHaveLength(anaMessages);
    expect(lastState(bia.inbox, 'watch')).toMatchObject({
      state: initial,
      by: ana.session.peerId,
    });

    bia.session.handleMessage({ t: 'tool-state', tool: 'watch', state: null });
    expect(lastState(bia.inbox, 'watch')).toMatchObject({
      state: initial,
      by: ana.session.peerId,
    });

    ana.session.handleMessage({ t: 'tool-state', tool: 'watch', state: null });
    expect(lastState(bia.inbox, 'watch')).toMatchObject({ state: null, by: ana.session.peerId });
  });

  it('ends watch when its starter deliberately leaves, freeing it for someone else', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'tool-state', tool: 'watch', state: { video: 'one' } });
    ana.session.handleMessage({ t: 'leave' });

    expect(lastState(bia.inbox, 'watch')).toEqual({
      t: 'tool-state',
      tool: 'watch',
      state: null,
      by: ana.session.peerId,
      age: 0,
    });
    bia.session.handleMessage({ t: 'tool-state', tool: 'watch', state: { video: 'two' } });
    expect(lastState(bia.inbox, 'watch')).toMatchObject({
      state: { video: 'two' },
      by: bia.session.peerId,
    });
  });

  it('keeps watch during a resumable drop, then ends it if the starter is swept', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const initial = { video: 'one' };

    ana.session.handleMessage({ t: 'tool-state', tool: 'watch', state: initial });
    ana.session.close();
    expect(lastState(bia.inbox, 'watch')).toMatchObject({ state: initial });

    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    bia.session.handleMessage({ t: 'ping', ts: 1 });
    sweepStalePeers(registry);
    expect(lastState(bia.inbox, 'watch')).toEqual({
      t: 'tool-state',
      tool: 'watch',
      state: null,
      by: ana.session.peerId,
      age: 0,
    });
  });

  it('whoever joins late is told everything that is on', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    ana.session.handleMessage({ t: 'tool-state', tool: 'youtube', state: { video: 'x' } });
    ana.session.handleMessage({ t: 'tool-state', tool: 'acme-timer', state: { left: 90 } });

    const welcome = connect(registry, slug, 'Bia').inbox[0]!;
    expect(welcome.t).toBe('welcome');
    if (welcome.t === 'welcome') {
      expect(welcome.tools.map((entry) => entry.tool).sort()).toEqual(['acme-timer', 'youtube']);
      expect(welcome.tools.every((entry) => entry.by === ana.session.peerId)).toBe(true);
    }
  });

  it('turning one off turns it off for everyone, and it stops arriving', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'tool-state', tool: 'youtube', state: { video: 'x' } });
    bia.session.handleMessage({ t: 'tool-state', tool: 'youtube', state: null });

    expect(lastState(ana.inbox, 'youtube')).toMatchObject({ state: null });
    const welcome = connect(registry, slug, 'Carla').inbox[0]!;
    if (welcome.t === 'welcome') {
      expect(welcome.tools).toEqual([]);
    }
  });

  it('past the cap the room is unchanged and only the asker is told', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    for (let i = 0; i < TOOL_LIMITS.maxTools; i++) {
      ana.session.handleMessage({ t: 'tool-state', tool: `tool-${i}`, state: { i } });
    }
    const seenByBia = bia.inbox.length;

    ana.session.handleMessage({ t: 'tool-state', tool: 'one-too-many', state: {} });

    expect(ana.last()).toEqual({ t: 'tool-denied', tool: 'one-too-many' });
    expect(bia.inbox.length).toBe(seenByBia);
  });
});
