import { describe, expect, it } from 'vitest';
import {
  CHAT_ENVELOPE_MAX_LENGTH,
  CHAT_TEXT_MAX_LENGTH,
  ChatChannels,
  encodeChatFrame,
  normalizeChatText,
  parseChatFrame,
  type ChatChannel,
  type IncomingChat,
} from '../src/lib/chat-channel';

/** Two of these wired back to back deliver on a microtask, like the real thing. */
class FakeChannel implements ChatChannel {
  readyState: RTCDataChannelState = 'open';
  peer: FakeChannel | null = null;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  send(data: string): void {
    if (this.readyState !== 'open') {
      throw new Error('closed');
    }
    this.sent.push(data);
    const peer = this.peer;
    if (peer) {
      queueMicrotask(() => peer.emit('message', { data } as MessageEvent));
    }
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  emit(type: string, event: MessageEvent = {} as MessageEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  close(): void {
    this.readyState = 'closed';
    this.emit('close');
  }
}

function pair(): [FakeChannel, FakeChannel] {
  const a = new FakeChannel();
  const b = new FakeChannel();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const SEALED = `e2e:${'a'.repeat(16)}.${'b'.repeat(40)}`;

describe('chat frames', () => {
  it('round-trips a frame, binding nothing but name and text', () => {
    expect(parseChatFrame(encodeChatFrame('alice', 'hi'))).toEqual({ name: 'alice', text: 'hi' });
  });

  it('normalizes plaintext like the server would: trimmed, capped, never empty', () => {
    expect(normalizeChatText('  hello  ')).toBe('hello');
    expect(normalizeChatText('x'.repeat(CHAT_TEXT_MAX_LENGTH + 50))).toHaveLength(CHAT_TEXT_MAX_LENGTH);
    expect(normalizeChatText('   ')).toBeNull();
    expect(parseChatFrame(encodeChatFrame('a', '   '))).toBeNull();
  });

  it('passes a sealed envelope through untouched and drops one over the wire cap', () => {
    expect(normalizeChatText(SEALED)).toBe(SEALED);
    const huge = `e2e:${'a'.repeat(16)}.${'b'.repeat(CHAT_ENVELOPE_MAX_LENGTH)}`;
    expect(normalizeChatText(huge)).toBeNull();
    expect(parseChatFrame(encodeChatFrame('a', huge))).toBeNull();
  });

  it('rejects anything that is not a chat frame', () => {
    expect(parseChatFrame(new ArrayBuffer(4))).toBeNull();
    expect(parseChatFrame('not json')).toBeNull();
    expect(parseChatFrame('null')).toBeNull();
    expect(parseChatFrame('"a string"')).toBeNull();
    expect(parseChatFrame(JSON.stringify({ k: 'offer', text: 'x' }))).toBeNull();
    expect(parseChatFrame(JSON.stringify({ k: 'chat' }))).toBeNull();
    expect(parseChatFrame(JSON.stringify({ k: 'chat', text: 42 }))).toBeNull();
  });

  it('tolerates a missing or absurd name — the roster has the real one', () => {
    expect(parseChatFrame(JSON.stringify({ k: 'chat', text: 'x' }))).toEqual({ name: '', text: 'x' });
    expect(parseChatFrame(JSON.stringify({ k: 'chat', name: 7, text: 'x' }))).toEqual({ name: '', text: 'x' });
    const long = parseChatFrame(JSON.stringify({ k: 'chat', name: ` ${'n'.repeat(200)} `, text: 'x' }));
    expect(long?.name).toHaveLength(64);
  });
});

describe('ChatChannels', () => {
  function room() {
    const alice = new ChatChannels();
    const bob = new ChatChannels();
    const carol = new ChatChannels();
    const inbox = { alice: [] as IncomingChat[], bob: [] as IncomingChat[], carol: [] as IncomingChat[] };
    alice.onMessage = (m) => inbox.alice.push(m);
    bob.onMessage = (m) => inbox.bob.push(m);
    carol.onMessage = (m) => inbox.carol.push(m);
    const [ab, ba] = pair();
    const [ac, ca] = pair();
    const [bc, cb] = pair();
    alice.attach('bob', ab);
    alice.attach('carol', ac);
    bob.attach('alice', ba);
    bob.attach('carol', bc);
    carol.attach('alice', ca);
    carol.attach('bob', cb);
    return { alice, bob, carol, inbox, ab, ac, ba, bc };
  }

  it('fans a line out to every seat, and the receiver knows the sender by the channel', async () => {
    const { alice, inbox } = room();
    expect(alice.sendToAll(['bob', 'carol'], 'Alice', 'hello')).toBe(true);
    await settle();
    expect(inbox.bob).toEqual([{ peerId: 'alice', name: 'Alice', text: 'hello' }]);
    expect(inbox.carol).toEqual([{ peerId: 'alice', name: 'Alice', text: 'hello' }]);
    expect(inbox.alice).toEqual([]);
  });

  it('is all or nothing: one seat without an open channel means nobody gets it here', async () => {
    const { alice, inbox, ab } = room();
    expect(alice.sendToAll(['bob', 'carol', 'dave'], 'Alice', 'hello')).toBe(false);
    expect(ab.sent).toEqual([]);
    await settle();
    expect(inbox.bob).toEqual([]);
    expect(inbox.carol).toEqual([]);
  });

  it('treats a channel that is not open yet as unreachable', () => {
    const { alice, ac } = room();
    ac.readyState = 'connecting';
    expect(alice.isOpen('carol')).toBe(false);
    expect(alice.sendToAll(['bob', 'carol'], 'Alice', 'hello')).toBe(false);
    expect(alice.sendToAll(['bob'], 'Alice', 'hello')).toBe(true);
  });

  it('alone in the room is trivially reachable', () => {
    expect(new ChatChannels().sendToAll([], 'Alone', 'echo')).toBe(true);
  });

  it('forgets a channel that closes, and a peer that is detached', () => {
    const { alice, ab } = room();
    ab.close();
    expect(alice.isOpen('bob')).toBe(false);
    expect(alice.sendToAll(['bob', 'carol'], 'Alice', 'x')).toBe(false);
    alice.detach('carol');
    expect(alice.isOpen('carol')).toBe(false);
    expect(alice.sendToAll(['carol'], 'Alice', 'x')).toBe(false);
  });

  it('ignores frames from a channel that was replaced, and garbage on a live one', async () => {
    const { bob, inbox } = room();
    const [old, oldPeer] = pair();
    const [fresh, freshPeer] = pair();
    bob.attach('alice', old);
    bob.attach('alice', fresh);
    oldPeer.send(encodeChatFrame('Alice', 'from the old channel'));
    freshPeer.send('{"k":"chat"}');
    freshPeer.send(encodeChatFrame('Alice', 'from the new channel'));
    await settle();
    expect(inbox.bob.map((m) => m.text)).toEqual(['from the new channel']);
  });

  it('is inert once closed', async () => {
    const { alice, inbox, ba } = room();
    alice.close();
    expect(alice.sendToAll(['bob'], 'Alice', 'x')).toBe(false);
    ba.send(encodeChatFrame('Bob', 'late'));
    await settle();
    expect(inbox.alice).toEqual([]);
  });
});
