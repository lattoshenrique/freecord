/**
 * The signaling client's outbox: what is written while the transport is
 * down must reach the SAME seat after a resume — and offers must not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    screen: null,
    cameras: [],
  };
}

describe('Signaling outbox', () => {
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
    const signaling = new Signaling('room', 'Ana', {
      onMessage: (m) => messages.push(m),
      onClose: () => {},
    });
    const first = FakeSocket.instances[0]!;
    first.open();
    first.receive(welcome('A'));
    signaling.setResumeToken('tok');
    return { signaling, first, messages };
  }

  it('holds answers and candidates through the outage and flushes them to the same seat', async () => {
    const { signaling, first } = await boot();
    first.drop();
    signaling.send({ t: 'signal', to: 'B', data: { candidate: { c: 1 } } });
    signaling.send({ t: 'signal', to: 'B', data: { description: { type: 'answer', sdp: 'a' } } });
    signaling.send({ t: 'chat', text: 'lost on purpose' });

    vi.advanceTimersByTime(1_000);
    const second = FakeSocket.instances[1]!;
    expect(second.url).toContain('resume=tok');
    second.open();
    second.receive(welcome('A'));

    expect(second.sent.map((raw) => JSON.parse(raw) as { t: string; data?: unknown })).toEqual([
      { t: 'signal', to: 'B', data: { candidate: { c: 1 } } },
      { t: 'signal', to: 'B', data: { description: { type: 'answer', sdp: 'a' } } },
    ]);
  });

  it('never holds an offer', async () => {
    const { signaling, first } = await boot();
    first.drop();
    signaling.send({ t: 'signal', to: 'B', data: { description: { type: 'offer', sdp: 'o' } } });
    vi.advanceTimersByTime(1_000);
    const second = FakeSocket.instances[1]!;
    second.open();
    second.receive(welcome('A'));
    expect(second.sent).toEqual([]);
  });

  it('drops the outbox when the welcome is a different seat', async () => {
    const { signaling, first } = await boot();
    first.drop();
    signaling.send({ t: 'signal', to: 'B', data: { candidate: { c: 1 } } });
    vi.advanceTimersByTime(1_000);
    const second = FakeSocket.instances[1]!;
    second.open();
    second.receive(welcome('Z'));
    expect(second.sent).toEqual([]);
  });

  it('flushes after the welcome reached the room, so the mesh reconciles first', async () => {
    const { signaling, first, messages } = await boot();
    first.drop();
    signaling.send({ t: 'signal', to: 'B', data: { candidate: { c: 1 } } });
    vi.advanceTimersByTime(1_000);
    const second = FakeSocket.instances[1]!;
    let sentAtWelcome = -1;
    const originalPush = messages.push.bind(messages);
    messages.push = (...items: unknown[]) => {
      sentAtWelcome = second.sent.length;
      return originalPush(...items);
    };
    second.open();
    second.receive(welcome('A'));
    expect(sentAtWelcome).toBe(0);
    expect(second.sent).toHaveLength(1);
  });
});
