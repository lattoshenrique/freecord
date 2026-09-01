/**
 * Peer-to-peer file transfer over RTCDataChannel.
 *
 * Files ride the same RTCPeerConnection as the media: one `files` data
 * channel per peer, negotiated symmetrically (both sides create it with the
 * same stream id, so neither has to wait for `ondatachannel`). Bytes go
 * straight to the other browser under DTLS — the signaling server sees
 * nothing, and a TURN relay (when NAT forces one) only forwards ciphertext.
 *
 * Wire format on the channel:
 *   - control frames are JSON strings (`offer`, `accept`, `reject`,
 *     `cancel`, `done`);
 *   - data frames are binary: a 4-byte big-endian transfer id, then up to
 *     CHUNK_BYTES of file content. The channel is ordered and reliable,
 *     so no sequence number is needed.
 *
 * A transfer is identified by the sender's random id, scoped by peer and
 * direction — two peers may pick the same id without colliding.
 */

/** Safe cross-browser message size for a data channel (16 KiB). */
export const CHUNK_BYTES = 16 * 1024;
/** Stop feeding the channel above this; resume at the low threshold. */
const HIGH_WATER_BYTES = 1024 * 1024;
const LOW_WATER_BYTES = 256 * 1024;
/** Receiver memory is the limit: the whole file is held until saved. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
/**
 * Images up to this size are taken without asking: they are what people
 * paste into a chat, and a picture that waits for a click is not a chat.
 * Anything else — or a huge image — still needs the receiver's yes.
 */
export const AUTO_ACCEPT_IMAGE_BYTES = 32 * 1024 * 1024;
/** Progress notifications are throttled to this many chunks (~1 MiB). */
const NOTIFY_EVERY_CHUNKS = 64;
const ID_HEADER_BYTES = 4;

export type TransferDirection = 'out' | 'in';

export type TransferStatus =
  /** Offered, waiting for the other side to accept. */
  | 'pending'
  | 'active'
  | 'done'
  | 'declined'
  | 'cancelled'
  | 'failed';

export interface FileTransfer {
  /** Unique across the room: `${peerId}:${direction}:${id}`. */
  key: string;
  /**
   * One file offered to several people is one batch: the sender's chat
   * shows it once, with every recipient's state folded in. Incoming
   * transfers are their own batch.
   */
  batch: string;
  id: number;
  peerId: string;
  direction: TransferDirection;
  name: string;
  size: number;
  mime: string;
  status: TransferStatus;
  /** Bytes sent or received so far. */
  bytes: number;
  /** When the offer was made or received. */
  ts: number;
  /**
   * The file's bytes: on the receiver once every chunk has arrived, on the
   * sender from the start for images (so both sides can preview them).
   */
  blob: Blob | null;
}

/** A transfer the chat can show inline — decided by the declared MIME type. */
export function isImageTransfer(transfer: Pick<FileTransfer, 'mime'>): boolean {
  return /^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/.test(transfer.mime);
}

type ControlFrame =
  | { k: 'offer'; id: number; name: string; size: number; mime: string }
  | { k: 'accept'; id: number }
  | { k: 'reject'; id: number }
  | { k: 'cancel'; id: number }
  | { k: 'done'; id: number };

/** The slice of RTCDataChannel this module uses — also what the tests fake. */
export interface TransferChannel {
  readyState: RTCDataChannelState;
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: BinaryType;
  send(data: string | ArrayBuffer): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  addEventListener(type: 'open' | 'close' | 'error' | 'bufferedamountlow', listener: () => void): void;
  removeEventListener(type: 'bufferedamountlow', listener: () => void): void;
}

export function transferKey(peerId: string, direction: TransferDirection, id: number): string {
  return `${peerId}:${direction}:${id}`;
}

export function encodeChunk(id: number, payload: ArrayBuffer): ArrayBuffer {
  const frame = new ArrayBuffer(ID_HEADER_BYTES + payload.byteLength);
  new DataView(frame).setUint32(0, id);
  new Uint8Array(frame, ID_HEADER_BYTES).set(new Uint8Array(payload));
  return frame;
}

export function decodeChunk(frame: ArrayBuffer): { id: number; payload: ArrayBuffer } | null {
  if (frame.byteLength < ID_HEADER_BYTES) {
    return null;
  }
  return { id: new DataView(frame).getUint32(0), payload: frame.slice(ID_HEADER_BYTES) };
}

function parseControl(text: string): ControlFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const frame = parsed as Partial<ControlFrame>;
  if (typeof frame.id !== 'number' || !Number.isInteger(frame.id) || frame.id < 0) {
    return null;
  }
  switch (frame.k) {
    case 'offer': {
      const { name, size, mime } = frame as { name?: unknown; size?: unknown; mime?: unknown };
      if (
        typeof name !== 'string' ||
        name.length === 0 ||
        typeof size !== 'number' ||
        !Number.isInteger(size) ||
        size < 0 ||
        size > MAX_FILE_BYTES
      ) {
        return null;
      }
      return { k: 'offer', id: frame.id, name, size, mime: typeof mime === 'string' ? mime : '' };
    }
    case 'accept':
    case 'reject':
    case 'cancel':
    case 'done':
      return { k: frame.k, id: frame.id };
    default:
      return null;
  }
}

/** Filenames come from a stranger: keep them a plain basename. */
function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const trimmed = base.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 255);
  return trimmed.length > 0 ? trimmed : 'file';
}

function randomId(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}

interface PeerLink {
  channel: TransferChannel;
  /** Outbound sends to one peer run one at a time — one backpressure loop. */
  sendQueue: Promise<void>;
  /** Files by transfer id, kept until the offer is accepted and streamed. */
  outgoing: Map<number, File>;
  /** Received chunks by transfer id. */
  incoming: Map<number, Blob[]>;
}

/**
 * Every transfer in the room, over every peer's channel. One instance per
 * mesh; a fresh mesh (a new seat) gets a fresh instance.
 */
export class FileTransfers {
  private readonly links = new Map<string, PeerLink>();
  private readonly transfers = new Map<string, FileTransfer>();
  private readonly listeners = new Set<() => void>();
  private closed = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Newest first, as the chat panel shows them. */
  list(): FileTransfer[] {
    return [...this.transfers.values()];
  }

  get(key: string): FileTransfer | undefined {
    return this.transfers.get(key);
  }

  /** Wires a peer's channel. Replaces a previous one for the same peer. */
  attach(peerId: string, channel: TransferChannel): void {
    if (this.closed) {
      return;
    }
    this.detach(peerId);
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = LOW_WATER_BYTES;
    const link: PeerLink = {
      channel,
      sendQueue: Promise.resolve(),
      outgoing: new Map(),
      incoming: new Map(),
    };
    this.links.set(peerId, link);
    channel.addEventListener('message', (event) => this.onMessage(peerId, link, event.data));
    channel.addEventListener('close', () => {
      if (this.links.get(peerId) === link) {
        this.detach(peerId);
      }
    });
    channel.addEventListener('error', () => {
      if (this.links.get(peerId) === link) {
        this.detach(peerId);
      }
    });
  }

  /** The peer is gone: whatever was in flight with them has failed. */
  detach(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link) {
      return;
    }
    this.links.delete(peerId);
    link.outgoing.clear();
    link.incoming.clear();
    let changed = false;
    for (const transfer of this.transfers.values()) {
      if (
        transfer.peerId === peerId &&
        (transfer.status === 'pending' || transfer.status === 'active')
      ) {
        transfer.status = 'failed';
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  /**
   * Offers a file to one peer. Returns the transfer key, or null if refused
   * locally. `batch` groups the offers of one file to many peers.
   */
  offer(peerId: string, file: File, batch?: string): string | null {
    const link = this.links.get(peerId);
    if (this.closed || !link || file.size > MAX_FILE_BYTES) {
      return null;
    }
    const id = randomId();
    const key = transferKey(peerId, 'out', id);
    const name = sanitizeName(file.name);
    this.transfers.set(key, {
      key,
      batch: batch ?? key,
      id,
      peerId,
      direction: 'out',
      name,
      size: file.size,
      mime: file.type,
      status: 'pending',
      bytes: 0,
      ts: Date.now(),
      // The sender already holds the bytes; an image previews right away.
      blob: isImageTransfer({ mime: file.type }) ? file : null,
    });
    link.outgoing.set(id, file);
    if (!this.sendControl(link, { k: 'offer', id, name, size: file.size, mime: file.type })) {
      link.outgoing.delete(id);
      this.transfers.get(key)!.status = 'failed';
    }
    this.notify();
    return key;
  }

  accept(key: string): void {
    const transfer = this.transfers.get(key);
    const link = transfer && this.links.get(transfer.peerId);
    if (!transfer || !link || transfer.direction !== 'in' || transfer.status !== 'pending') {
      return;
    }
    link.incoming.set(transfer.id, []);
    transfer.status = 'active';
    if (!this.sendControl(link, { k: 'accept', id: transfer.id })) {
      transfer.status = 'failed';
    }
    this.notify();
  }

  decline(key: string): void {
    const transfer = this.transfers.get(key);
    const link = transfer && this.links.get(transfer.peerId);
    if (!transfer || transfer.direction !== 'in' || transfer.status !== 'pending') {
      return;
    }
    transfer.status = 'declined';
    if (link) {
      this.sendControl(link, { k: 'reject', id: transfer.id });
    }
    this.notify();
  }

  /** Either side may cancel a pending or active transfer. */
  cancel(key: string): void {
    const transfer = this.transfers.get(key);
    if (!transfer || (transfer.status !== 'pending' && transfer.status !== 'active')) {
      return;
    }
    const link = this.links.get(transfer.peerId);
    transfer.status = 'cancelled';
    if (link) {
      if (transfer.direction === 'out') {
        link.outgoing.delete(transfer.id);
      } else {
        link.incoming.delete(transfer.id);
      }
      this.sendControl(link, { k: 'cancel', id: transfer.id });
    }
    this.notify();
  }

  /** Drops a finished entry from the list (and its blob from memory). */
  dismiss(key: string): void {
    const transfer = this.transfers.get(key);
    if (!transfer || transfer.status === 'pending' || transfer.status === 'active') {
      return;
    }
    this.transfers.delete(key);
    this.notify();
  }

  close(): void {
    this.closed = true;
    for (const peerId of [...this.links.keys()]) {
      this.detach(peerId);
    }
    this.transfers.clear();
    this.notify();
  }

  private sendControl(link: PeerLink, frame: ControlFrame): boolean {
    if (link.channel.readyState !== 'open') {
      return false;
    }
    try {
      link.channel.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  private onMessage(peerId: string, link: PeerLink, data: unknown): void {
    if (this.links.get(peerId) !== link) {
      return;
    }
    if (typeof data === 'string') {
      const frame = parseControl(data);
      if (frame) {
        this.onControl(peerId, link, frame);
      }
      return;
    }
    if (data instanceof ArrayBuffer) {
      const chunk = decodeChunk(data);
      if (chunk) {
        this.onChunk(peerId, link, chunk.id, chunk.payload);
      }
    }
  }

  private onControl(peerId: string, link: PeerLink, frame: ControlFrame): void {
    switch (frame.k) {
      case 'offer': {
        const key = transferKey(peerId, 'in', frame.id);
        if (this.transfers.has(key)) {
          return;
        }
        this.transfers.set(key, {
          key,
          batch: key,
          id: frame.id,
          peerId,
          direction: 'in',
          name: sanitizeName(frame.name),
          size: frame.size,
          mime: frame.mime,
          status: 'pending',
          bytes: 0,
          ts: Date.now(),
          blob: null,
        });
        if (isImageTransfer(frame) && frame.size <= AUTO_ACCEPT_IMAGE_BYTES) {
          // accept() notifies; the pending state is never observed.
          this.accept(key);
          return;
        }
        this.notify();
        return;
      }
      case 'accept': {
        const transfer = this.transfers.get(transferKey(peerId, 'out', frame.id));
        const file = link.outgoing.get(frame.id);
        if (!transfer || !file || transfer.status !== 'pending') {
          return;
        }
        transfer.status = 'active';
        this.notify();
        link.sendQueue = link.sendQueue.then(() => this.stream(link, transfer, file));
        return;
      }
      case 'reject': {
        const transfer = this.transfers.get(transferKey(peerId, 'out', frame.id));
        if (transfer && transfer.status === 'pending') {
          transfer.status = 'declined';
          link.outgoing.delete(frame.id);
          this.notify();
        }
        return;
      }
      case 'cancel': {
        const out = this.transfers.get(transferKey(peerId, 'out', frame.id));
        const inc = this.transfers.get(transferKey(peerId, 'in', frame.id));
        let changed = false;
        if (out && (out.status === 'pending' || out.status === 'active')) {
          out.status = 'cancelled';
          link.outgoing.delete(frame.id);
          changed = true;
        }
        if (inc && (inc.status === 'pending' || inc.status === 'active')) {
          inc.status = 'cancelled';
          link.incoming.delete(frame.id);
          changed = true;
        }
        if (changed) {
          this.notify();
        }
        return;
      }
      case 'done': {
        const transfer = this.transfers.get(transferKey(peerId, 'in', frame.id));
        const parts = link.incoming.get(frame.id);
        if (!transfer || !parts || transfer.status !== 'active') {
          return;
        }
        link.incoming.delete(frame.id);
        if (transfer.bytes !== transfer.size) {
          transfer.status = 'failed';
        } else {
          transfer.blob = new Blob(parts, { type: transfer.mime || 'application/octet-stream' });
          transfer.status = 'done';
        }
        this.notify();
        return;
      }
    }
  }

  private onChunk(peerId: string, link: PeerLink, id: number, payload: ArrayBuffer): void {
    const transfer = this.transfers.get(transferKey(peerId, 'in', id));
    const parts = link.incoming.get(id);
    if (!transfer || !parts || transfer.status !== 'active') {
      return;
    }
    if (transfer.bytes + payload.byteLength > transfer.size) {
      // More than was offered: not the file we agreed to.
      link.incoming.delete(id);
      transfer.status = 'failed';
      this.sendControl(link, { k: 'cancel', id });
      this.notify();
      return;
    }
    parts.push(new Blob([payload]));
    transfer.bytes += payload.byteLength;
    if (parts.length % NOTIFY_EVERY_CHUNKS === 0) {
      this.notify();
    }
  }

  /** Feeds the file through the channel, pausing on backpressure. */
  private async stream(link: PeerLink, transfer: FileTransfer, file: File): Promise<void> {
    const { channel } = link;
    let chunks = 0;
    try {
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        if (transfer.status !== 'active' || channel.readyState !== 'open') {
          return;
        }
        if (channel.bufferedAmount > HIGH_WATER_BYTES) {
          await this.drained(channel);
        }
        const payload = await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer();
        // The wait above may have outlived the transfer.
        if (transfer.status !== 'active' || channel.readyState !== 'open') {
          return;
        }
        channel.send(encodeChunk(transfer.id, payload));
        transfer.bytes = Math.min(file.size, offset + payload.byteLength);
        chunks++;
        if (chunks % NOTIFY_EVERY_CHUNKS === 0) {
          this.notify();
        }
      }
      if (transfer.status === 'active') {
        transfer.status = this.sendControl(link, { k: 'done', id: transfer.id }) ? 'done' : 'failed';
      }
    } catch {
      if (transfer.status === 'active') {
        transfer.status = 'failed';
      }
    } finally {
      link.outgoing.delete(transfer.id);
      this.notify();
    }
  }

  private drained(channel: TransferChannel): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearInterval(poll);
        channel.removeEventListener('bufferedamountlow', done);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', done);
      // A closing channel never fires the event; poll as a safety net.
      const poll: ReturnType<typeof setInterval> = setInterval(() => {
        if (channel.readyState !== 'open' || channel.bufferedAmount <= LOW_WATER_BYTES) {
          done();
        }
      }, 250);
    });
  }
}

/** "2.3 MB" — for the transfer bubbles. */
export function formatBytes(bytes: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
