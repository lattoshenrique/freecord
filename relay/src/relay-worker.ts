/**
 * The transform worker: hosts BOTH sides of every pipe.
 *
 * The upstream (receiver) transform copies each encoded frame's bytes into
 * the substituting downstreams' queues and passes the frame through, so the
 * relay's own decode/display never stops. Each downstream (sender)
 * transform reads the local encoder's frames and, in substitute mode,
 * emits a queued upstream frame in their place — the encoder is reduced to
 * a cadence donor whose bytes are discarded.
 *
 * Frames never leave this worker: routing between pipes is by the ids
 * carried in the transform options. The one unavoidable copy is
 * upstream-frame data (writing a frame onward detaches its buffer), shared
 * across all downstream queues; each emission slices it again because a
 * written frame's buffer is dead to the next child.
 */

import { decideSubstitution } from './policy';
import { RelayRegistry, type DownstreamState, type PendingFrame, type PipeState } from './registry';
import type { ControlMessage, TransformOptions, WorkerEvent } from './messages';
import type {
  EncodedVideoFrame,
  EncodedVideoFrameConstructor,
  RtcTransformEvent,
  ScriptTransformer,
} from './types';

const HEALTH_INTERVAL_MS = 2_000;
/** RTCP requests are cheap but not free: collapse bursts of them. */
const UPSTREAM_KEY_THROTTLE_MS = 300;
const LOCAL_KEY_THROTTLE_MS = 500;

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  onrtctransform: ((event: RtcTransformEvent) => void) | null;
  postMessage(message: WorkerEvent): void;
  RTCEncodedVideoFrame?: EncodedVideoFrameConstructor;
}

const scope = self as unknown as WorkerScope;
const registry = new RelayRegistry<ScriptTransformer>();

function requestUpstreamKeyFrame(pipe: PipeState<ScriptTransformer>): void {
  const now = Date.now();
  if (now - pipe.lastUpstreamKeyRequestAt < UPSTREAM_KEY_THROTTLE_MS) {
    return;
  }
  pipe.lastUpstreamKeyRequestAt = now;
  try {
    void pipe.upstream?.sendKeyFrameRequest?.()?.catch(() => undefined);
  } catch {
    // no upstream attached yet: the reset already parked the queue on a keyframe
  }
}

function requestLocalKeyFrame(down: DownstreamState<ScriptTransformer>): void {
  const now = Date.now();
  if (now - down.lastLocalKeyRequestAt < LOCAL_KEY_THROTTLE_MS) {
    return;
  }
  down.lastLocalKeyRequestAt = now;
  try {
    void down.transformer.generateKeyFrame?.()?.catch(() => undefined);
  } catch {
    // encoder not running yet: the next donor frame retries
  }
}

/** The worker demotes a downstream itself when substitution breaks mid-frame. */
function fallbackToIdentity(
  pipe: PipeState<ScriptTransformer>,
  down: DownstreamState<ScriptTransformer>,
  reason: string,
): void {
  registry.setMode(pipe.pipeId, down.downId, 'identity');
  requestLocalKeyFrame(down);
  scope.postMessage({ type: 'fallback', pipeId: pipe.pipeId, downId: down.downId, reason });
}

/**
 * Builds the outgoing frame: donor envelope, upstream bytes, rewritten
 * RTP-facing metadata. frameId stays monotonic and near the donor's own
 * counter (so a later fallback to identity frames is the smallest possible
 * discontinuity); dependencies chain each delta to the previous emission —
 * the bitstream carries the real references, this metadata only has to be
 * self-consistent for the packetizer; rtpTimestamp follows the upstream
 * clock so inter-frame spacing survives the hop.
 */
function substituteFrame(
  donor: EncodedVideoFrame,
  pending: PendingFrame,
  down: DownstreamState<ScriptTransformer>,
): { frame: EncodedVideoFrame; frameId: number } | null {
  const ctor = scope.RTCEncodedVideoFrame;
  if (!ctor) {
    return null;
  }
  let donorMeta;
  try {
    donorMeta = donor.getMetadata();
  } catch {
    donorMeta = {};
  }
  const floor = down.lastEmittedFrameId !== null ? down.lastEmittedFrameId + 1 : 0;
  const frameId = Math.max(floor, typeof donorMeta.frameId === 'number' ? donorMeta.frameId : 0);
  const metadata = {
    ...donorMeta,
    frameId,
    dependencies:
      pending.type === 'key' || down.lastEmittedFrameId === null
        ? []
        : [down.lastEmittedFrameId],
    rtpTimestamp: pending.metadata.rtpTimestamp ?? donorMeta.rtpTimestamp,
    width: pending.metadata.width ?? donorMeta.width,
    height: pending.metadata.height ?? donorMeta.height,
    temporalIndex: pending.metadata.temporalIndex ?? donorMeta.temporalIndex,
  };
  try {
    const frame = new ctor(donor, { metadata });
    frame.data = pending.data.slice(0);
    return { frame, frameId };
  } catch {
    return null;
  }
}

async function pumpUpstream(
  pipe: PipeState<ScriptTransformer>,
  transformer: ScriptTransformer,
): Promise<void> {
  const reader = transformer.readable.getReader();
  const writer = transformer.writable.getWriter();
  for (;;) {
    let result;
    try {
      result = await reader.read();
    } catch {
      break;
    }
    const frame = result.value;
    if (result.done || !frame) {
      break;
    }
    pipe.upstreamFrames += 1;
    const type = frame.type === 'key' ? 'key' : 'delta';
    let shared: ArrayBuffer | null = null;
    let metadata = {};
    for (const down of pipe.downstreams.values()) {
      if (down.closed || down.mode !== 'substitute') {
        continue;
      }
      if (shared === null) {
        shared = frame.data.slice(0);
        try {
          metadata = frame.getMetadata();
        } catch {
          metadata = {};
        }
      }
      if (down.queue.push({ type, data: shared, metadata }) === 'reset') {
        requestUpstreamKeyFrame(pipe);
      }
    }
    try {
      await writer.write(frame);
    } catch {
      break;
    }
  }
}

async function pumpDownstream(
  pipe: PipeState<ScriptTransformer>,
  down: DownstreamState<ScriptTransformer>,
): Promise<void> {
  const reader = down.transformer.readable.getReader();
  const writer = down.transformer.writable.getWriter();
  for (;;) {
    let result;
    try {
      result = await reader.read();
    } catch {
      break;
    }
    const donor = result.value;
    if (result.done || !donor) {
      break;
    }
    // A removed downstream whose transform could not be detached must keep
    // forwarding — swallowing frames here would be worse than no relay at all.
    if (down.closed || down.mode === 'identity') {
      try {
        await writer.write(donor);
        down.emitted += 1;
      } catch {
        break;
      }
      continue;
    }
    const donorType = donor.type === 'key' ? 'key' : 'delta';
    switch (decideSubstitution(donorType, down.queue.peek() ?? null)) {
      case 'drop':
        break;
      case 'refresh-upstream':
        down.queue.clear({ awaitKey: true });
        requestUpstreamKeyFrame(pipe);
        break;
      case 'need-local-key':
        requestLocalKeyFrame(down);
        break;
      case 'emit': {
        const pending = down.queue.shift()!;
        const substituted = substituteFrame(donor, pending, down);
        if (!substituted) {
          fallbackToIdentity(pipe, down, 'construct-failed');
          try {
            await writer.write(donor);
          } catch {
            // stream gone; the loop ends on the next read
          }
          break;
        }
        try {
          await writer.write(substituted.frame);
          down.lastEmittedFrameId = substituted.frameId;
          down.emitted += 1;
        } catch {
          fallbackToIdentity(pipe, down, 'write-rejected');
        }
        break;
      }
    }
  }
}

scope.onrtctransform = (event) => {
  const transformer = event.transformer;
  const options = transformer.options as TransformOptions;
  if (options.role === 'upstream') {
    const pipe = registry.attachUpstream(options.pipeId, transformer);
    void pumpUpstream(pipe, transformer);
  } else {
    const pipe = registry.ensurePipe(options.pipeId);
    const down = registry.attachDownstream(
      options.pipeId,
      options.downId,
      transformer,
      options.mode,
    );
    void pumpDownstream(pipe, down);
  }
};

scope.onmessage = (event) => {
  const message = event.data as ControlMessage;
  switch (message.type) {
    case 'set-mode': {
      const down = registry.setMode(message.pipeId, message.downId, message.mode);
      // Leaving substitution mid-stream: the child needs a decodable start
      // in the donor bitstream it is about to receive.
      if (down && message.mode === 'identity') {
        requestLocalKeyFrame(down);
      }
      return;
    }
    case 'remove-downstream':
      registry.removeDownstream(message.pipeId, message.downId);
      return;
    case 'close-pipe':
      registry.closePipe(message.pipeId);
      return;
    case 'request-keyframe': {
      const pipe = registry.getPipe(message.pipeId);
      if (pipe) {
        pipe.lastUpstreamKeyRequestAt = 0;
        requestUpstreamKeyFrame(pipe);
      }
      return;
    }
  }
};

setInterval(() => {
  for (const pipe of registry.allPipes()) {
    scope.postMessage({
      type: 'health',
      pipeId: pipe.pipeId,
      upstreamFrames: pipe.upstreamFrames,
      downstreams: [...pipe.downstreams.values()]
        .filter((down) => !down.closed)
        .map((down) => ({ downId: down.downId, mode: down.mode, emitted: down.emitted })),
    });
  }
}, HEALTH_INTERVAL_MS);

scope.postMessage({ type: 'ready' });
