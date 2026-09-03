/**
 * Everything this page is playing, kept in one place so it can be
 * subtracted from a screen capture on its way out.
 *
 * The room plays its audio through ordinary `<audio>` and `<video>`
 * elements, and it stays that way — that is what keeps `setSinkId`, the
 * speaker key and the per-source levels working on the one path where a
 * regression means a call nobody can hear. This module runs BESIDE that,
 * not in front of it: the same streams are tapped a second time into a
 * Web Audio graph that goes nowhere audible, purely so the guard has a
 * copy of what the machine's speakers are being given.
 *
 * Which means the tap has to be told the same volumes the elements were,
 * or it models something the machine never played and the canceller has
 * nothing to match. `setPlayback` is that instruction, and RoomView —
 * which owns the elements — is the one place that gives it.
 *
 * Nothing here exists until somebody shares their screen WITH sound. An
 * AudioContext is a real cost (it wakes an audio thread and holds it
 * awake), and the overwhelming majority of rooms never need one, so the
 * list is remembered and the graph is not built until there is a capture
 * to clean.
 */
import type { EchoGuardStats } from './echo-guard';
import workletUrl from './echo-worklet.ts?worker&url';

export interface PlayingSource {
  /** Stable while this source is playing; the peer or screen it belongs to. */
  key: string;
  stream: MediaStream;
  /** What the element is playing it at, 0 … 1, speaker key included. */
  volume: number;
}

export interface GuardedCapture {
  /** What to send. The original track when the guard could not be built. */
  track: MediaStreamTrack;
  /** Whether this is actually the guarded track or the raw one. */
  guarded: boolean;
  /** The guard's latest readings, or null before the first arrives. */
  stats(): EchoGuardStats | null;
  stop(): void;
}

interface Tap {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

let wanted: readonly PlayingSource[] = [];
let context: AudioContext | null = null;
let bus: GainNode | null = null;
/**
 * Whether THIS context has the worklet. Adding the module twice runs its
 * `registerProcessor` twice, which throws inside the worklet and rejects
 * the second `addModule` — so a second capture on a live context would
 * quietly fall back to the raw track. One share at a time is the rule
 * today; this is what keeps that from being load-bearing.
 */
let moduleLoaded = false;
const taps = new Map<string, Tap>();
/** How many captures are being cleaned; the graph lives while any is. */
let users = 0;

/**
 * Says what the page is playing and how loudly. Cheap and idempotent:
 * with no capture being cleaned it only remembers, and with one running
 * it adds, retunes and drops taps to match.
 */
export function setPlayback(sources: readonly PlayingSource[]): void {
  wanted = sources;
  if (!context || !bus) {
    return;
  }
  const live = new Set<string>();
  for (const source of sources) {
    live.add(source.key);
    const existing = taps.get(source.key);
    if (existing && existing.stream === source.stream) {
      existing.gain.gain.value = source.volume;
      continue;
    }
    if (existing) {
      drop(source.key);
    }
    const tap = tapOf(context, bus, source);
    if (tap) {
      taps.set(source.key, tap);
    }
  }
  for (const key of [...taps.keys()]) {
    if (!live.has(key)) {
      drop(key);
    }
  }
}

function tapOf(ctx: AudioContext, into: GainNode, source: PlayingSource): Tap | null {
  if (source.stream.getAudioTracks().length === 0) {
    return null;
  }
  try {
    const node = ctx.createMediaStreamSource(source.stream);
    const gain = ctx.createGain();
    gain.gain.value = source.volume;
    node.connect(gain).connect(into);
    return { stream: source.stream, source: node, gain };
  } catch {
    // A stream with nothing playable in it yet: it will be offered again
    // on the next change, which in a room is never far away.
    return null;
  }
}

function drop(key: string): void {
  const tap = taps.get(key);
  if (!tap) {
    return;
  }
  tap.source.disconnect();
  tap.gain.disconnect();
  taps.delete(key);
}

/**
 * Puts a display capture's audio through the guard.
 *
 * Failure is never fatal here: a browser with no AudioWorklet, a module
 * that will not load, a capture the graph refuses — all hand back the
 * track that came in. The worst outcome of this feature must be the
 * behaviour we had before it.
 */
export async function guardCapture(track: MediaStreamTrack): Promise<GuardedCapture> {
  const raw: GuardedCapture = {
    track,
    guarded: false,
    stats: () => null,
    stop: () => {},
  };
  if (typeof AudioContext === 'undefined') {
    return raw;
  }
  let ctx: AudioContext;
  try {
    ctx = ensureContext();
    if (!moduleLoaded) {
      await ctx.audioWorklet.addModule(workletUrl);
      moduleLoaded = true;
    }
  } catch {
    releaseContext();
    return raw;
  }

  try {
    const input = new MediaStream([track]);
    const source = ctx.createMediaStreamSource(input);
    // Out at the width it came in: a mono capture that left here in
    // stereo would cost the room twice the bitrate for one signal.
    const channels = Math.min(2, Math.max(1, track.getSettings().channelCount ?? 2));
    const node = new AudioWorkletNode(ctx, 'echo-guard', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [channels],
    });
    let latest: EchoGuardStats | null = null;
    node.port.onmessage = (event: MessageEvent<EchoGuardStats>) => {
      latest = event.data;
    };
    const destination = ctx.createMediaStreamDestination();
    source.connect(node, 0, 0);
    bus!.connect(node, 0, 1);
    node.connect(destination);

    const cleaned = destination.stream.getAudioTracks()[0];
    if (!cleaned) {
      throw new Error('no track');
    }
    // The taps could not be built before the context existed.
    users += 1;
    setPlayback(wanted);
    // An AudioContext built outside a gesture starts suspended; picking a
    // screen IS one, so this normally resolves at once.
    void ctx.resume().catch(() => {});

    let stopped = false;
    return {
      track: cleaned,
      guarded: true,
      stats: () => latest,
      stop() {
        if (stopped) {
          return;
        }
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        try {
          bus?.disconnect(node);
        } catch {
          // already torn down with the context
        }
        node.disconnect();
        destination.disconnect();
        cleaned.stop();
        users -= 1;
        if (users <= 0) {
          releaseContext();
        }
      },
    };
  } catch {
    releaseContext();
    return raw;
  }
}

function ensureContext(): AudioContext {
  if (!context) {
    context = new AudioContext();
    bus = context.createGain();
  }
  return context;
}

/** Tears the graph down once nothing is being cleaned. */
function releaseContext(): void {
  if (users > 0) {
    return;
  }
  for (const key of [...taps.keys()]) {
    drop(key);
  }
  bus?.disconnect();
  bus = null;
  moduleLoaded = false;
  void context?.close().catch(() => {});
  context = null;
}
