/**
 * Pipe/downstream bookkeeping, factored out of the worker so the id routing
 * and per-downstream frame state can be tested without RTC types — the
 * transformer is an opaque `T` here.
 */

import { FrameQueue } from './frame-queue';
import type { DownstreamMode } from './messages';
import type { EncodedVideoFrameMetadata } from './types';

export interface PendingFrame {
  type: 'key' | 'delta';
  data: ArrayBuffer;
  metadata: EncodedVideoFrameMetadata;
}

export interface DownstreamState<T> {
  readonly downId: string;
  readonly transformer: T;
  mode: DownstreamMode;
  readonly queue: FrameQueue<PendingFrame>;
  /** Ids of frames WE emitted; monotonic, chained through `dependencies`. */
  lastEmittedFrameId: number | null;
  emitted: number;
  lastLocalKeyRequestAt: number;
  closed: boolean;
}

export interface PipeState<T> {
  readonly pipeId: string;
  upstream: T | null;
  upstreamFrames: number;
  lastUpstreamKeyRequestAt: number;
  readonly downstreams: Map<string, DownstreamState<T>>;
}

export class RelayRegistry<T> {
  private readonly pipes = new Map<string, PipeState<T>>();

  ensurePipe(pipeId: string): PipeState<T> {
    let pipe = this.pipes.get(pipeId);
    if (!pipe) {
      pipe = {
        pipeId,
        upstream: null,
        upstreamFrames: 0,
        lastUpstreamKeyRequestAt: 0,
        downstreams: new Map(),
      };
      this.pipes.set(pipeId, pipe);
    }
    return pipe;
  }

  attachUpstream(pipeId: string, transformer: T): PipeState<T> {
    const pipe = this.ensurePipe(pipeId);
    pipe.upstream = transformer;
    return pipe;
  }

  attachDownstream(
    pipeId: string,
    downId: string,
    transformer: T,
    mode: DownstreamMode,
    queueCap?: number,
  ): DownstreamState<T> {
    const pipe = this.ensurePipe(pipeId);
    const down: DownstreamState<T> = {
      downId,
      transformer,
      mode,
      queue: new FrameQueue<PendingFrame>(queueCap),
      lastEmittedFrameId: null,
      emitted: 0,
      lastLocalKeyRequestAt: 0,
      closed: false,
    };
    pipe.downstreams.set(downId, down);
    return down;
  }

  /**
   * Switching INTO substitution restarts the stream cleanly: the queue only
   * accepts frames from the next upstream keyframe on, so the child never
   * sees a delta whose reference it lacks.
   */
  setMode(pipeId: string, downId: string, mode: DownstreamMode): DownstreamState<T> | null {
    const down = this.pipes.get(pipeId)?.downstreams.get(downId) ?? null;
    if (!down || down.closed || down.mode === mode) {
      return down;
    }
    down.mode = mode;
    down.queue.clear({ awaitKey: mode === 'substitute' });
    return down;
  }

  removeDownstream(pipeId: string, downId: string): DownstreamState<T> | null {
    const pipe = this.pipes.get(pipeId);
    const down = pipe?.downstreams.get(downId) ?? null;
    if (pipe && down) {
      down.closed = true;
      down.queue.clear();
      pipe.downstreams.delete(downId);
    }
    return down;
  }

  closePipe(pipeId: string): PipeState<T> | null {
    const pipe = this.pipes.get(pipeId) ?? null;
    if (pipe) {
      for (const down of pipe.downstreams.values()) {
        down.closed = true;
        down.queue.clear();
      }
      pipe.downstreams.clear();
      this.pipes.delete(pipeId);
    }
    return pipe;
  }

  getPipe(pipeId: string): PipeState<T> | null {
    return this.pipes.get(pipeId) ?? null;
  }

  allPipes(): Iterable<PipeState<T>> {
    return this.pipes.values();
  }
}
