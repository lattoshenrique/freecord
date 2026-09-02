import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Who is audibly speaking, as a set of participant ids (self included), and
 * how loud each of them is right now, for the face that mouths along.
 *
 * One shared AudioContext with an AnalyserNode per participant, polled on
 * a coarse interval — no per-frame work, no extra decoding: the analyser
 * taps audio the browser is already playing. A muted mic (track.enabled
 * = false) produces silence, so mute falls out of the detector for free.
 *
 * The inputs are read through a ref on every tick instead of effect deps:
 * remote streams appear via mesh notifications (a re-render with no state
 * change), so an effect keyed on them would never see the stream arrive.
 */

/** Structural subset of useRoomSession's return — keeps this file free of
 * imports from the media layer, which moves under other hands. */
interface SpeakingInputs {
  selfId: string | null;
  localMedia: MediaStream | null;
  peers: { id: string }[];
  mesh: { getPeerStreams(peerId: string): MediaStream[] } | null;
  /** Announced display stream: carries system audio, never a voice. */
  screen: { id: string; streamId: string } | null;
  /** Relay forward stream: excluded for the same reason as `screen`. */
  screenSource: { id: string; streamId: string } | null;
}

const POLL_MS = 150;
/** RMS above this opens the "speaking" state… */
const SPEAK_RMS = 0.03;
/** …and it stays open until this much silence: gaps between words are
 * not the end of a sentence, and a ring that flickers per syllable is
 * worse than none. */
const HOLD_MS = 600;
/** ~21 ms of signal per reading — enough to not sit inside a plosive. */
const FFT_SIZE = 1024;

interface Probe {
  trackId: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  lastLoudAt: number;
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function micStreamFor(id: string, inputs: SpeakingInputs): MediaStream | null {
  if (id === inputs.selfId) {
    return inputs.localMedia;
  }
  const streams = inputs.mesh?.getPeerStreams(id) ?? [];
  return (
    streams.find(
      (stream) =>
        stream.id !== inputs.screen?.streamId &&
        stream.id !== inputs.screenSource?.streamId &&
        stream.getAudioTracks().length > 0,
    ) ?? null
  );
}

function rms(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = ((buffer[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

export interface Speaking {
  speaking: ReadonlySet<string>;
  /**
   * This person's loudness at this instant, 0 (quiet) to 1 (shouting),
   * read straight from the analyser: no state, no render. Meant for a
   * per-frame loop that runs only while `speaking` has them.
   */
  levelOf: (id: string) => number;
}

/** RMS at which the level reads 0, and at which it reads 1. */
const LEVEL_FLOOR = 0.015;
const LEVEL_CEILING = 0.14;

export function useSpeaking(inputs: SpeakingInputs): Speaking {
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set());
  const probesRef = useRef(new Map<string, Probe>());
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const levelOf = useCallback((id: string) => {
    const probe = probesRef.current.get(id);
    const buffer = bufferRef.current;
    if (!probe || !buffer) return 0;
    const value = (rms(probe.analyser, buffer) - LEVEL_FLOOR) / (LEVEL_CEILING - LEVEL_FLOOR);
    return Math.min(1, Math.max(0, value));
  }, []);

  useEffect(() => {
    let ctx: AudioContext | null = null;
    let buffer: Uint8Array<ArrayBuffer> | null = null;
    const probes = probesRef.current;

    const dropProbe = (id: string) => {
      probes.get(id)?.source.disconnect();
      probes.delete(id);
    };

    const tick = () => {
      const current = inputsRef.current;
      const ids = current.selfId
        ? [current.selfId, ...current.peers.map((peer) => peer.id)]
        : current.peers.map((peer) => peer.id);

      for (const id of probes.keys()) {
        if (!ids.includes(id)) {
          dropProbe(id);
        }
      }

      const now = Date.now();
      const loud = new Set<string>();
      for (const id of ids) {
        const track = micStreamFor(id, current)
          ?.getAudioTracks()
          .find((candidate) => candidate.readyState === 'live');
        if (!track) {
          dropProbe(id);
          continue;
        }
        let probe = probes.get(id);
        if (probe && probe.trackId !== track.id) {
          // Same seat, new microphone (cam upgrade rebuilt the stream): the
          // old source node is wired to a dead track.
          dropProbe(id);
          probe = undefined;
        }
        if (!probe) {
          if (!ctx) {
            const Ctor =
              window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
            if (!Ctor) {
              return; // no Web Audio: the room works, just without the ring
            }
            ctx = new Ctor();
            buffer = new Uint8Array(FFT_SIZE);
            bufferRef.current = buffer;
          }
          const analyser = ctx.createAnalyser();
          analyser.fftSize = FFT_SIZE;
          const stream = micStreamFor(id, current)!;
          const source = ctx.createMediaStreamSource(stream);
          // Analysis only — never to destination: routing the local mic to
          // the speakers would be an echo, and remote audio already plays
          // through its own element.
          source.connect(analyser);
          probe = { trackId: track.id, source, analyser, lastLoudAt: 0 };
          probes.set(id, probe);
        }
        if (ctx && ctx.state === 'suspended') {
          // Autoplay policy: joining the room was a gesture, so this sticks.
          void ctx.resume().catch(() => undefined);
        }
        if (buffer && rms(probe.analyser, buffer) >= SPEAK_RMS) {
          probe.lastLoudAt = now;
        }
        if (now - probe.lastLoudAt < HOLD_MS) {
          loud.add(id);
        }
      }

      setSpeaking((previous) => {
        if (previous.size === loud.size && [...loud].every((id) => previous.has(id))) {
          return previous; // same membership: keep the reference, skip the render
        }
        return loud;
      });
    };

    const timer = setInterval(tick, POLL_MS);
    return () => {
      clearInterval(timer);
      for (const probe of probes.values()) {
        probe.source.disconnect();
      }
      probes.clear();
      bufferRef.current = null;
      void ctx?.close().catch(() => undefined);
    };
  }, []);

  return { speaking, levelOf };
}
