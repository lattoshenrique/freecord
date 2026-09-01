/**
 * The WebRTC Encoded Transform surface this package touches, typed
 * structurally instead of via lib.dom: TypeScript's coverage of these APIs
 * varies by compiler version, and the constructible RTCEncodedVideoFrame is
 * Chromium-only — depending on ambient declarations would tie the package to
 * one toolchain. Everything here is cast at the edges and feature-detected
 * at runtime (see support.ts).
 */

export interface EncodedVideoFrameMetadata {
  frameId?: number;
  dependencies?: number[];
  rtpTimestamp?: number;
  width?: number;
  height?: number;
  spatialIndex?: number;
  temporalIndex?: number;
  [key: string]: unknown;
}

export interface EncodedVideoFrame {
  readonly type: 'key' | 'delta' | 'empty';
  data: ArrayBuffer;
  getMetadata(): EncodedVideoFrameMetadata;
}

/**
 * Chromium's constructor clones `original` and lets `options.metadata`
 * rewrite the RTP-facing fields; the payload itself is swapped afterwards
 * through the writable `data` attribute.
 */
export type EncodedVideoFrameConstructor = new (
  original: EncodedVideoFrame,
  options?: { metadata?: EncodedVideoFrameMetadata },
) => EncodedVideoFrame;

export interface ScriptTransformer {
  readonly readable: ReadableStream<EncodedVideoFrame>;
  readonly writable: WritableStream<EncodedVideoFrame>;
  readonly options: unknown;
  /** Receiver side: asks the remote sender for a fresh keyframe via RTCP. */
  sendKeyFrameRequest?(): Promise<void>;
  /** Sender side: asks the local encoder for a keyframe. */
  generateKeyFrame?(rid?: string): Promise<number>;
}

export interface RtcTransformEvent {
  readonly transformer: ScriptTransformer;
}

export type ScriptTransformConstructor = new (worker: Worker, options?: unknown) => unknown;

/** RTCRtpSender/RTCRtpReceiver, seen only through their transform slot. */
export interface Transformable {
  transform: unknown;
}
