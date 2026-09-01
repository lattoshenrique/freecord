import { describe, expect, it } from 'vitest';
import {
  CHUNK_BYTES,
  FileTransfers,
  MAX_FILE_BYTES,
  decodeChunk,
  encodeChunk,
  formatBytes,
  isImageTransfer,
  transferKey,
  type TransferChannel,
} from '../src/lib/file-transfer';

type Listener = (event: MessageEvent) => void;

/**
 * Two fake channels wired back to back. Delivery is asynchronous (a
 * microtask), like the real thing, and `bufferedAmount` can be pinned high
 * to exercise the backpressure path.
 */
class FakeChannel implements TransferChannel {
  readyState: RTCDataChannelState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType: BinaryType = 'blob';
  peer: FakeChannel | null = null;
  sent: Array<string | ArrayBuffer> = [];
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  send(data: string | ArrayBuffer): void {
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

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: MessageEvent = {} as MessageEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      (listener as Listener)(event);
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

/** Lets queued microtasks and the transfer's own awaits run to completion. */
async function settle(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeFile(bytes: number, name = 'photo.png'): File {
  const content = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    content[i] = i % 251;
  }
  return new File([content], name, { type: 'image/png' });
}

describe('chunk framing', () => {
  it('round-trips the transfer id and the payload', () => {
    const payload = new Uint8Array([1, 2, 3, 250]).buffer;
    const decoded = decodeChunk(encodeChunk(0xfffffffe, payload))!;
    expect(decoded.id).toBe(0xfffffffe);
    expect([...new Uint8Array(decoded.payload)]).toEqual([1, 2, 3, 250]);
  });

  it('rejects a frame shorter than the header', () => {
    expect(decodeChunk(new ArrayBuffer(3))).toBeNull();
  });
});

describe('FileTransfers', () => {
  it('offers, accepts and delivers a file in order across many chunks', async () => {
    const [a, b] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);

    const size = CHUNK_BYTES * 3 + 123;
    const key = alice.offer('bob', makeFile(size))!;
    await settle(2);

    const incoming = bob.list();
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({
      direction: 'in',
      peerId: 'alice',
      name: 'photo.png',
      size,
      mime: 'image/png',
      status: 'pending',
    });
    expect(alice.get(key)?.status).toBe('pending');

    bob.accept(incoming[0].key);
    await settle();

    expect(alice.get(key)).toMatchObject({ status: 'done', bytes: size });
    const received = bob.get(incoming[0].key)!;
    expect(received).toMatchObject({ status: 'done', bytes: size });
    const bytes = new Uint8Array(await received.blob!.arrayBuffer());
    expect(bytes.length).toBe(size);
    expect(bytes[0]).toBe(0);
    expect(bytes[size - 1]).toBe((size - 1) % 251);
    // Data frames carry the id header; four chunks for this size.
    expect(a.sent.filter((frame) => frame instanceof ArrayBuffer)).toHaveLength(4);
  });

  it('a declined offer settles both sides without moving bytes', async () => {
    const [a, b] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);

    const key = alice.offer('bob', makeFile(10))!;
    await settle(2);
    bob.decline(bob.list()[0].key);
    await settle(2);

    expect(alice.get(key)?.status).toBe('declined');
    expect(bob.list()[0].status).toBe('declined');
    expect(a.sent.some((frame) => frame instanceof ArrayBuffer)).toBe(false);
  });

  it('the sender can cancel mid-stream and the receiver stops', async () => {
    const [a, b] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);

    const key = alice.offer('bob', makeFile(CHUNK_BYTES * 8))!;
    await settle(2);
    bob.accept(bob.list()[0].key);
    // Pin the channel full: the stream parks on backpressure after a chunk.
    a.bufferedAmount = 10 * 1024 * 1024;
    await settle(3);
    expect(alice.get(key)?.status).toBe('active');

    alice.cancel(key);
    await settle(3);
    expect(alice.get(key)?.status).toBe('cancelled');
    expect(bob.list()[0].status).toBe('cancelled');
  });

  it('resumes after backpressure clears', async () => {
    const [a, b] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);

    const size = CHUNK_BYTES * 4;
    const key = alice.offer('bob', makeFile(size))!;
    await settle(2);
    a.bufferedAmount = 10 * 1024 * 1024;
    bob.accept(bob.list()[0].key);
    await settle(3);
    const before = a.sent.filter((frame) => frame instanceof ArrayBuffer).length;
    expect(before).toBeLessThan(4);

    a.bufferedAmount = 0;
    a.emit('bufferedamountlow');
    await settle();
    expect(alice.get(key)?.status).toBe('done');
    expect(bob.list()[0]).toMatchObject({ status: 'done', bytes: size });
  });

  it('a peer leaving fails what was in flight with them, and only that', async () => {
    const [a, b] = pair();
    const [c, d] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    const carol = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);
    alice.attach('carol', c);
    carol.attach('alice', d);

    const toBob = alice.offer('bob', makeFile(10))!;
    const toCarol = alice.offer('carol', makeFile(10))!;
    await settle(2);
    b.close();
    a.close();
    await settle(2);

    expect(alice.get(toBob)?.status).toBe('failed');
    expect(alice.get(toCarol)?.status).toBe('pending');
    expect(alice.offer('bob', makeFile(1))).toBeNull();
  });

  it('refuses oversized files locally and malformed offers from the wire', async () => {
    const [a, b] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);

    const huge = { size: MAX_FILE_BYTES + 1, name: 'x', type: '', slice: () => new Blob() } as unknown as File;
    expect(alice.offer('bob', huge)).toBeNull();

    a.send(JSON.stringify({ k: 'offer', id: 1, name: '', size: 5, mime: '' }));
    a.send(JSON.stringify({ k: 'offer', id: 2, name: '../../etc/passwd', size: 5, mime: '' }));
    a.send('not json');
    await settle(2);
    const list = bob.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('passwd');
    expect(list[0].key).toBe(transferKey('alice', 'in', 2));
  });

  it('fails a receive that gets more bytes than offered', async () => {
    const [a, b] = pair();
    const bob = new FileTransfers();
    bob.attach('alice', b);
    a.send(JSON.stringify({ k: 'offer', id: 7, name: 'f.bin', size: 4, mime: '' }));
    await settle(2);
    bob.accept(bob.list()[0].key);
    a.send(encodeChunk(7, new ArrayBuffer(8)));
    await settle(2);
    expect(bob.list()[0].status).toBe('failed');
    expect(b.sent).toContainEqual(JSON.stringify({ k: 'cancel', id: 7 }));
  });
});

describe('image previews', () => {
  it('classifies by declared MIME type', () => {
    expect(isImageTransfer({ mime: 'image/png' })).toBe(true);
    expect(isImageTransfer({ mime: 'image/svg+xml' })).toBe(true);
    expect(isImageTransfer({ mime: 'application/pdf' })).toBe(false);
    expect(isImageTransfer({ mime: '' })).toBe(false);
  });

  it("the sender keeps an image's bytes from the offer, other files only on the receiver", async () => {
    const [a, b] = pair();
    const alice = new FileTransfers();
    const bob = new FileTransfers();
    alice.attach('bob', a);
    bob.attach('alice', b);

    const image = alice.offer('bob', makeFile(10, 'photo.png'))!;
    const other = alice.offer('bob', new File([new Uint8Array(10)], 'notes.txt', { type: 'text/plain' }))!;
    expect(alice.get(image)?.blob).not.toBeNull();
    expect(alice.get(other)?.blob).toBeNull();

    await settle(2);
    for (const incoming of bob.list()) {
      expect(incoming.blob).toBeNull();
      bob.accept(incoming.key);
    }
    await settle();
    expect(bob.list().every((incoming) => incoming.status === 'done' && incoming.blob !== null)).toBe(true);
  });
});

describe('formatBytes', () => {
  it('picks the unit and keeps one decimal only under ten', () => {
    expect(formatBytes(0, 'en-US')).toBe('0 B');
    expect(formatBytes(999, 'en-US')).toBe('999 B');
    expect(formatBytes(2_345_000, 'en-US')).toBe('2.3 MB');
    expect(formatBytes(23_450_000, 'en-US')).toBe('23 MB');
    expect(formatBytes(1_500_000_000, 'en-US')).toBe('1.5 GB');
  });
});
