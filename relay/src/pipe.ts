/**
 * Main-thread handle for one forwarding pipe: one upstream receiver, N
 * downstream senders, all transformed inside a single worker.
 *
 * Nothing touches a sender or receiver until the worker says `ready`: an
 * RTCRtpScriptTransform whose worker never came up swallows frames instead
 * of bypassing them, which would make merely TRYING passthrough worse than
 * not having it. Until ready, attach calls are queued; if the worker never
 * answers, they are discarded and the media path stays exactly as it was.
 *
 * Downstreams start in `identity` mode (frames pass through untouched — the
 * ordinary re-encode path with one worker hop) and are promoted to
 * `substitute` only by the caller, after it verified codec match and saw
 * upstream frames actually flowing.
 */

import type { DownstreamHealth, DownstreamMode, WorkerEvent } from './messages';
import type { ScriptTransformConstructor, Transformable } from './types';

const READY_TIMEOUT_MS = 3_000;
/**
 * Stall verdicts: a substituting downstream that emitted nothing across two
 * consecutive health reports (~4 s) while the upstream advanced at least
 * this many frames is declared stalled.
 */
const STALL_MIN_UPSTREAM_FRAMES = 4;
const STALL_STRIKES = 2;

let nextPipeSerial = 0;
let nextDownSerial = 0;

export function createRelayWorker(): Worker {
  return new Worker(new URL('./relay-worker.ts', import.meta.url), { type: 'module' });
}

export interface RelayPipeOptions {
  /** Share a worker across pipes; the pipe then never terminates it. */
  worker?: Worker;
  readyTimeoutMs?: number;
}

interface DownstreamEntry {
  downId: string;
  mode: DownstreamMode;
  emitted: number;
  strikes: number;
}

export class RelayPipe {
  private readonly worker: Worker;
  private readonly ownsWorker: boolean;
  private readonly pipeId: string;
  private readonly downstreams = new Map<RTCRtpSender, DownstreamEntry>();
  private readonly senderByDownId = new Map<string, RTCRtpSender>();
  private upstreamReceiver: RTCRtpReceiver | null = null;
  private ready = false;
  private failed = false;
  private closed = false;
  private pendingOps: (() => void)[] = [];
  private readonly readyTimer: ReturnType<typeof setTimeout>;
  private lastUpstreamFrames = 0;
  private upstreamAdvancing = false;

  /** Fired when a downstream stalls or the worker demoted it on its own. */
  onstall: ((sender: RTCRtpSender, reason: string) => void) | null = null;

  constructor(options: RelayPipeOptions = {}) {
    this.pipeId = `pipe-${++nextPipeSerial}`;
    this.ownsWorker = !options.worker;
    this.worker = options.worker ?? createRelayWorker();
    this.worker.addEventListener('message', this.onWorkerMessage);
    this.worker.addEventListener('error', this.onWorkerError);
    this.readyTimer = setTimeout(() => {
      if (!this.ready) {
        this.failed = true;
        this.pendingOps = [];
      }
    }, options.readyTimeoutMs ?? READY_TIMEOUT_MS);
  }

  private run(op: () => void): void {
    if (this.closed || this.failed) {
      return;
    }
    if (this.ready) {
      op();
    } else {
      this.pendingOps.push(op);
    }
  }

  private transformCtor(): ScriptTransformConstructor | null {
    return (
      (globalThis as { RTCRtpScriptTransform?: ScriptTransformConstructor })
        .RTCRtpScriptTransform ?? null
    );
  }

  attachUpstream(receiver: RTCRtpReceiver): boolean {
    const ctor = this.transformCtor();
    if (this.closed || !ctor) {
      return false;
    }
    this.upstreamReceiver = receiver;
    this.run(() => {
      try {
        (receiver as unknown as Transformable).transform = new ctor(this.worker, {
          role: 'upstream',
          pipeId: this.pipeId,
        });
      } catch {
        // transform slot refused (already taken, stream state): no frames
        // will reach the worker, so no downstream is ever promoted
      }
    });
    return true;
  }

  /** Installed in identity mode; returns null when the pipe cannot host it. */
  addDownstream(sender: RTCRtpSender): string | null {
    const ctor = this.transformCtor();
    if (this.closed || this.failed || !ctor || this.downstreams.has(sender)) {
      return this.downstreams.get(sender)?.downId ?? null;
    }
    const downId = `down-${++nextDownSerial}`;
    this.downstreams.set(sender, { downId, mode: 'identity', emitted: 0, strikes: 0 });
    this.senderByDownId.set(downId, sender);
    this.run(() => {
      try {
        (sender as unknown as Transformable).transform = new ctor(this.worker, {
          role: 'downstream',
          pipeId: this.pipeId,
          downId,
          mode: 'identity',
        });
      } catch {
        this.downstreams.delete(sender);
        this.senderByDownId.delete(downId);
      }
    });
    return downId;
  }

  setDownstreamMode(sender: RTCRtpSender, mode: DownstreamMode): void {
    const entry = this.downstreams.get(sender);
    if (!entry || this.closed) {
      return;
    }
    entry.mode = mode;
    entry.strikes = 0;
    this.run(() =>
      this.worker.postMessage({ type: 'set-mode', pipeId: this.pipeId, downId: entry.downId, mode }),
    );
  }

  removeDownstream(sender: RTCRtpSender): void {
    const entry = this.downstreams.get(sender);
    if (!entry) {
      return;
    }
    this.downstreams.delete(sender);
    this.senderByDownId.delete(entry.downId);
    try {
      (sender as unknown as Transformable).transform = null;
    } catch {
      // detach refused: the worker keeps identity-forwarding for this id
    }
    this.run(() =>
      this.worker.postMessage({
        type: 'remove-downstream',
        pipeId: this.pipeId,
        downId: entry.downId,
      }),
    );
  }

  requestKeyFrame(): void {
    this.run(() => this.worker.postMessage({ type: 'request-keyframe', pipeId: this.pipeId }));
  }

  /** True while health reports show upstream frames reaching the worker. */
  get upstreamFlowing(): boolean {
    return this.upstreamAdvancing;
  }

  downstreamMode(sender: RTCRtpSender): DownstreamMode | null {
    return this.downstreams.get(sender)?.mode ?? null;
  }

  private readonly onWorkerError = (): void => {
    this.failed = true;
    this.pendingOps = [];
  };

  private readonly onWorkerMessage = (event: MessageEvent): void => {
    const message = event.data as WorkerEvent;
    if (message.type === 'ready') {
      this.ready = true;
      clearTimeout(this.readyTimer);
      const ops = this.pendingOps;
      this.pendingOps = [];
      for (const op of ops) {
        op();
      }
      return;
    }
    if (message.pipeId !== this.pipeId || this.closed) {
      return;
    }
    if (message.type === 'fallback') {
      const sender = this.senderByDownId.get(message.downId);
      const entry = sender ? this.downstreams.get(sender) : undefined;
      if (sender && entry) {
        entry.mode = 'identity';
        this.onstall?.(sender, message.reason);
      }
      return;
    }
    if (message.type === 'health') {
      const advanced = message.upstreamFrames - this.lastUpstreamFrames;
      this.lastUpstreamFrames = message.upstreamFrames;
      this.upstreamAdvancing = advanced > 0;
      for (const report of message.downstreams) {
        this.applyDownstreamHealth(report, advanced);
      }
    }
  };

  private applyDownstreamHealth(report: DownstreamHealth, upstreamAdvanced: number): void {
    const sender = this.senderByDownId.get(report.downId);
    const entry = sender ? this.downstreams.get(sender) : undefined;
    if (!sender || !entry) {
      return;
    }
    const stalledNow =
      report.mode === 'substitute' &&
      upstreamAdvanced >= STALL_MIN_UPSTREAM_FRAMES &&
      report.emitted === entry.emitted;
    entry.emitted = report.emitted;
    if (!stalledNow) {
      entry.strikes = 0;
      return;
    }
    entry.strikes += 1;
    if (entry.strikes >= STALL_STRIKES) {
      entry.strikes = 0;
      this.onstall?.(sender, 'no-progress');
    }
  }

  /**
   * Detaches every transform BEFORE the worker goes away: a live transform
   * whose worker died swallows the stream — including the relay's own view
   * of the screen through the upstream receiver.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearTimeout(this.readyTimer);
    this.pendingOps = [];
    if (this.upstreamReceiver) {
      try {
        (this.upstreamReceiver as unknown as Transformable).transform = null;
      } catch {
        // detach refused: frames keep flowing through the identity-safe worker
      }
      this.upstreamReceiver = null;
    }
    for (const sender of [...this.downstreams.keys()]) {
      this.removeDownstream(sender);
    }
    try {
      this.worker.postMessage({ type: 'close-pipe', pipeId: this.pipeId });
    } catch {
      // worker already gone
    }
    this.worker.removeEventListener('message', this.onWorkerMessage);
    this.worker.removeEventListener('error', this.onWorkerError);
    if (this.ownsWorker) {
      this.worker.terminate();
    }
  }
}
