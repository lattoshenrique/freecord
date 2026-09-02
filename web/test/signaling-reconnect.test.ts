/**
 * The transport outliving the server: a room whose signaling went away
 * keeps knocking instead of hanging up, and a seat that was swept in the
 * meantime is re-taken as a newcomer's — the browsers already know each
 * other, and the call they are holding is not the server's to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The backoff's ceiling: advancing this always fires the pending retry. */
const CEILING_MS = 5_000;

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

function welcome(selfId: string, resumeToken = 'tok') {
  return {
    t: 'welcome',
    selfId,
    resumeToken,
    ice: [],
    room: { slug: 's', displayName: '' },
    peers: [],
    screens: [],
    cameras: [],
  };
}

/** The socket the client is knocking on right now. */
function latest(): FakeSocket {
  return FakeSocket.instances[FakeSocket.instances.length - 1]!;
}

describe('Signaling reconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function boot() {
    const { Signaling } = await import('../src/lib/signaling');
    const messages: unknown[] = [];
    const state = { closed: 0, reconnecting: 0 };
    const signaling = new Signaling('room', 'Ana', {
      onMessage: (m) => messages.push(m),
      onClose: () => (state.closed += 1),
      onReconnecting: () => (state.reconnecting += 1),
    });
    const first = FakeSocket.instances[0]!;
    first.open();
    first.receive(welcome('A'));
    signaling.setResumeToken('tok');
    return { signaling, first, messages, state };
  }

  it('keeps knocking long past the handful of tries it used to give up on', async () => {
    const { first, state } = await boot();
    first.drop();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      vi.advanceTimersByTime(CEILING_MS);
      expect(FakeSocket.instances).toHaveLength(attempt + 2);
      latest().drop();
    }
    expect(state.closed).toBe(0);
    expect(state.reconnecting).toBeGreaterThan(0);
  });

  it('gives up only after minutes of silence, not seconds', async () => {
    const { first, state } = await boot();
    const startedAt = Date.now();
    first.drop();
    for (let attempt = 0; attempt < 500 && state.closed === 0; attempt += 1) {
      vi.advanceTimersByTime(CEILING_MS);
      latest().drop();
    }
    expect(state.closed).toBe(1);
    expect(Date.now() - startedAt).toBeGreaterThan(5 * 60 * 1000);
  });

  it('comes back as a newcomer when the seat is gone, without ending the room', async () => {
    const { first, messages, state } = await boot();
    first.drop();
    vi.advanceTimersByTime(CEILING_MS);
    const resumed = latest();
    expect(resumed.url).toContain('resume=tok');
    resumed.open();
    resumed.receive({ t: 'error', code: 'resume_invalid' });

    // A refused resume is not news for the room: it hears the fresh
    // welcome that follows, and nothing before it.
    expect(messages).toEqual([welcome('A')]);
    vi.advanceTimersByTime(CEILING_MS);
    const rejoin = latest();
    expect(rejoin.url).toContain('name=Ana');
    expect(rejoin.url).not.toContain('resume=');
    expect(state.closed).toBe(0);

    rejoin.open();
    rejoin.receive(welcome('B', 'tok2'));
    expect(messages).toHaveLength(2);
  });

  it('stops knocking when the room itself refuses us', async () => {
    const { first, messages, state } = await boot();
    first.drop();
    vi.advanceTimersByTime(CEILING_MS);
    const refused = latest();
    refused.open();
    refused.receive({ t: 'error', code: 'room_full' });
    refused.drop();

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(FakeSocket.instances).toHaveLength(2);
    // The room was told by the error itself; onClose would say it twice.
    expect(messages).toEqual([welcome('A'), { t: 'error', code: 'room_full' }]);
    expect(state.closed).toBe(0);
  });

  it('does not hold on to a door that never opened', async () => {
    const { Signaling } = await import('../src/lib/signaling');
    let closed = 0;
    const signaling = new Signaling('room', 'Ana', {
      onMessage: () => {},
      onClose: () => (closed += 1),
    });
    FakeSocket.instances[0]!.drop();
    expect(closed).toBe(1);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(FakeSocket.instances).toHaveLength(1);
    signaling.close();
  });
});
