/**
 * The protocol between the main-thread RelayPipe and the transform worker.
 *
 * Transform options ride inside RTCRtpScriptTransform's second argument and
 * surface in the worker as `transformer.options` — that is how one worker
 * hosts many pipes and routes frames between them by id, with no frame data
 * ever crossing the thread boundary.
 */

export type DownstreamMode = 'identity' | 'substitute';

export interface UpstreamOptions {
  role: 'upstream';
  pipeId: string;
}

export interface DownstreamOptions {
  role: 'downstream';
  pipeId: string;
  downId: string;
  mode: DownstreamMode;
}

export type TransformOptions = UpstreamOptions | DownstreamOptions;

export type ControlMessage =
  | { type: 'set-mode'; pipeId: string; downId: string; mode: DownstreamMode }
  | { type: 'remove-downstream'; pipeId: string; downId: string }
  | { type: 'close-pipe'; pipeId: string }
  | { type: 'request-keyframe'; pipeId: string };

export interface DownstreamHealth {
  downId: string;
  mode: DownstreamMode;
  emitted: number;
}

export type WorkerEvent =
  /** Posted once the worker module evaluated: transforms attach only after this. */
  | { type: 'ready' }
  | {
      type: 'health';
      pipeId: string;
      upstreamFrames: number;
      downstreams: DownstreamHealth[];
    }
  /** The worker demoted a downstream on its own (construction/write failure). */
  | { type: 'fallback'; pipeId: string; downId: string; reason: string };
