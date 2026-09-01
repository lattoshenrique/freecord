/** Minimal protocol client for the load drivers (plain `ws`, no framework). */
import WebSocket from 'ws';

export class LoadClient {
  /**
   * @param {string} url join/resume URL
   * @param {import('./metrics.mjs').ErrorTally} errors shared tally
   */
  constructor(url, errors, label) {
    this.errors = errors;
    this.label = label;
    this.log = [];
    this.cursor = 0;
    this.wakeups = [];
    this.closed = false;
    this.expectClose = false;
    this.welcome = null;
    this.socket = new WebSocket(url);
    this.socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        this.errors.bump('unparseable', raw.toString().slice(0, 80));
        return;
      }
      if (message.t === 'error') {
        this.errors.bump(`protocol:${message.code}`, this.label);
      }
      this.log.push(message);
      this.onMessage?.(message);
      const waiters = this.wakeups;
      this.wakeups = [];
      for (const w of waiters) w();
    });
    this.socket.on('error', (error) => {
      this.errors.bump('socket', `${this.label}: ${error.message}`);
    });
    this.socket.on('close', () => {
      this.closed = true;
      if (!this.expectClose) {
        this.errors.bump('unexpected-close', this.label);
      }
      const waiters = this.wakeups;
      this.wakeups = [];
      for (const w of waiters) w();
    });
  }

  send(message) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /** Waits for the next message satisfying pred (consuming up to it). */
  waitFor(pred, timeoutMs = 15_000, what = 'message') {
    return new Promise((resolve, reject) => {
      const scan = () => {
        while (this.cursor < this.log.length) {
          const message = this.log[this.cursor++];
          if (pred(message)) {
            clearTimeout(timer);
            resolve(message);
            return true;
          }
        }
        if (this.closed) {
          clearTimeout(timer);
          reject(new Error(`${this.label}: closed while waiting for ${what}`));
          return true;
        }
        return false;
      };
      const timer = setTimeout(
        () => reject(new Error(`${this.label}: timeout waiting for ${what}`)),
        timeoutMs,
      );
      const arm = () => {
        if (!scan()) {
          this.wakeups.push(arm);
        }
      };
      arm();
    });
  }

  waitForWelcome(timeoutMs = 15_000) {
    return this.waitFor((m) => m.t === 'welcome', timeoutMs, 'welcome').then((welcome) => {
      this.welcome = welcome;
      return welcome;
    });
  }

  leave() {
    this.expectClose = true;
    this.send({ t: 'leave' });
    this.socket.close();
  }
}

/** Bounded-concurrency runner for connection storms. */
export async function pooled(tasks, concurrency) {
  const results = new Array(tasks.length);
  let index = 0;
  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= tasks.length) {
        return;
      }
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}
