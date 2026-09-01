/**
 * @freecord/encoded-relay — encoded-frame passthrough relaying for WebRTC
 * forwarding trees. See README.md for the design and its limits.
 */

export { encodedRelaySupported } from './support';
export { RelayPipe, createRelayWorker, type RelayPipeOptions } from './pipe';
export {
  codecsMatch,
  isAuxiliaryCodec,
  preferredCodecOrder,
  type CodecDescriptor,
} from './codec';
export { FrameQueue, DEFAULT_QUEUE_CAP, type PushVerdict } from './frame-queue';
export { decideSubstitution, type FrameType, type SubstitutionAction } from './policy';
export {
  RelayRegistry,
  type DownstreamState,
  type PendingFrame,
  type PipeState,
} from './registry';
export type { DownstreamMode, WorkerEvent, ControlMessage } from './messages';
export type {
  EncodedVideoFrame,
  EncodedVideoFrameMetadata,
  ScriptTransformer,
} from './types';
