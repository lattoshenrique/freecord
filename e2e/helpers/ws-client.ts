/**
 * A raw protocol client for the signaling WebSocket — the shapes mirror
 * server/src/domain/room.ts (the closed protocol under test).
 */
import WebSocket from 'ws';
import { joinUrl, resumeUrl } from './env';

export interface Msg {
  t: string;
  // The protocol's fields, loosely typed on purpose: the tests assert the
  // exact shapes, and a mismatch should fail an expect, not a compile.
  [key: string]: any;
}

export interface Welcome extends Msg {
  t: 'welcome';
  selfId: string;
  resumeToken: string;
  room: { slug: string; displayName: string };
  peers: Array<{ id: string; name: string }>;
  screen: { id: string; streamId: string } | null;
  cameras: string[];
}

const DEFAULT_TIMEOUT_MS = 8_000;

export class ProtoClient {
  readonly log: Msg[] = [];
  readonly name: string;
  welcome: Welcome | null = null;
  closed = false;
  private readonly socket: WebSocket;
  private cursor = 0;
  private wakeups: Array<() => void> = [];
  private readonly closedPromise: Promise<void>;

  private constructor(socket: WebSocket, name: string) {
    this.socket = socket;
    this.name = name;
    socket.on('message', (raw: Buffer | string) => {
      try {
        this.log.push(JSON.parse(raw.toString()) as Msg);
      } catch {
        this.log.push({ t: '__unparseable__', raw: raw.toString() });
      }
      this.wake();
    });
    this.closedPromise = new Promise((resolve) => {
      socket.on('close', () => {
        this.closed = true;
        this.wake();
        resolve();
      });
    });
    socket.on('error', () => {
      // close follows; the tests observe `closed`
    });
  }

  private wake(): void {
    const waiters = this.wakeups;
    this.wakeups = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  static connect(url: string, name = ''): Promise<ProtoClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new ProtoClient(socket, name);
      socket.once('open', () => resolve(client));
      socket.once('error', reject);
    });
  }

  /** Joins and waits for the welcome; throws if the server refuses. */
  static async join(slug: string, name: string): Promise<ProtoClient> {
    const client = await ProtoClient.connect(joinUrl(slug, name), name);
    const first = await client.expect('welcome');
    client.welcome = first as Welcome;
    return client;
  }

  /** Joins expecting a refusal; resolves with the error message. */
  static async joinExpectingError(slug: string, name: string): Promise<Msg> {
    const client = await ProtoClient.connect(joinUrl(slug, name), name);
    const error = await client.expect('error');
    await client.whenClosed();
    return error;
  }

  static async resume(slug: string, token: string, name = ''): Promise<ProtoClient> {
    const client = await ProtoClient.connect(resumeUrl(slug, token), name);
    const first = await client.next();
    if (first.t === 'welcome') {
      client.welcome = first as Welcome;
    } else {
      client.cursor -= 1; // rewind: hand the refusal back to the caller's expect()
    }
    return client;
  }

  get selfId(): string {
    if (!this.welcome) {
      throw new Error('no welcome received yet');
    }
    return this.welcome.selfId;
  }

  send(message: Msg): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Next unconsumed message, in arrival order. */
  async next(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Msg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.cursor < this.log.length) {
        return this.log[this.cursor++];
      }
      if (this.closed) {
        throw new Error(`[${this.name}] socket closed while waiting for a message`);
      }
      await this.waitForWakeup(deadline, 'a message');
    }
  }

  /**
   * Consumes messages until one of type `t` arrives; returns it. Skipped
   * messages stay in `log` for debugging.
   */
  async expect(t: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Msg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.log.length) {
        const message = this.log[this.cursor++];
        if (message.t === t) {
          return message;
        }
      }
      if (this.closed) {
        throw new Error(
          `[${this.name}] socket closed while waiting for "${t}" (saw: ${this.log.map((m) => m.t).join(', ')})`,
        );
      }
      await this.waitForWakeup(deadline, `"${t}"`);
    }
  }

  /** Like expect, but matches on a predicate — for ordering among same-type broadcasts. */
  async expectWhere(pred: (m: Msg) => boolean, what: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Msg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.log.length) {
        const message = this.log[this.cursor++];
        if (pred(message)) {
          return message;
        }
      }
      if (this.closed) {
        throw new Error(`[${this.name}] socket closed while waiting for ${what}`);
      }
      await this.waitForWakeup(deadline, what);
    }
  }

  /** Asserts that no message matching `pred` arrives within the window. */
  async expectSilence(pred: (m: Msg) => boolean, windowMs = 700): Promise<void> {
    const startCursor = this.cursor;
    await new Promise((resolve) => setTimeout(resolve, windowMs));
    const seen = this.log.slice(startCursor).find(pred);
    if (seen) {
      throw new Error(`[${this.name}] expected silence but saw: ${JSON.stringify(seen)}`);
    }
  }

  private waitForWakeup(deadline: number, what: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reject(
          new Error(
            `[${this.name}] timed out waiting for ${what} (saw: ${this.log.map((m) => m.t).join(', ') || 'nothing'})`,
          ),
        );
        return;
      }
      const timer = setTimeout(() => {
        reject(
          new Error(
            `[${this.name}] timed out waiting for ${what} (saw: ${this.log.map((m) => m.t).join(', ') || 'nothing'})`,
          ),
        );
      }, remaining);
      this.wakeups.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  whenClosed(): Promise<void> {
    return this.closedPromise;
  }

  /** Polite goodbye: vacates the seat immediately (protocol `leave`). */
  leave(): void {
    try {
      this.send({ t: 'leave' });
    } catch {
      // already gone
    }
    this.socket.close();
  }

  /** Graceful transport close WITHOUT a goodbye — enters the resume grace. */
  close(): void {
    this.socket.close();
  }

  /** Abrupt transport death (no close frame from our side finishing cleanly). */
  terminate(): void {
    this.socket.terminate();
  }
}

/** Leaves every client politely; tolerant of already-dead sockets. */
export async function cleanup(clients: Iterable<ProtoClient>): Promise<void> {
  for (const client of clients) {
    client.leave();
  }
}
