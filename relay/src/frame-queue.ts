/**
 * Pending-frame queue for one downstream.
 *
 * Encoded frames cannot be thinned individually — every delta depends on the
 * frame before it — so the only safe drop points are keyframes. Two rules
 * follow:
 *
 * - A keyframe supersedes the whole backlog: decode restarts there, and
 *   emitting stale frames first only adds latency.
 * - When deltas overflow the cap, the entire run is dropped and the queue
 *   waits for the next keyframe (`reset` tells the caller to request one
 *   upstream). Deltas that arrive while waiting are undecodable and dropped.
 *
 * The cap is small on purpose: at screen-share frame rates 8 frames is
 * roughly a quarter second — beyond that the child's encoder cadence has
 * fallen behind and jumping ahead beats buffering.
 */

export type PushVerdict = 'queued' | 'dropped' | 'reset';

export const DEFAULT_QUEUE_CAP = 8;

export class FrameQueue<T extends { type: 'key' | 'delta' }> {
  private frames: T[] = [];
  private awaitingKey = false;

  constructor(private readonly cap: number = DEFAULT_QUEUE_CAP) {}

  get length(): number {
    return this.frames.length;
  }

  get isAwaitingKey(): boolean {
    return this.awaitingKey;
  }

  push(frame: T): PushVerdict {
    if (frame.type === 'key') {
      this.frames = [frame];
      this.awaitingKey = false;
      return 'queued';
    }
    if (this.awaitingKey) {
      return 'dropped';
    }
    if (this.frames.length >= this.cap) {
      this.frames = [];
      this.awaitingKey = true;
      return 'reset';
    }
    this.frames.push(frame);
    return 'queued';
  }

  peek(): T | undefined {
    return this.frames[0];
  }

  shift(): T | undefined {
    return this.frames.shift();
  }

  clear(options?: { awaitKey?: boolean }): void {
    this.frames = [];
    this.awaitingKey = options?.awaitKey ?? false;
  }
}
