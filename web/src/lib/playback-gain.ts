/**
 * Playback above the media element's 100% ceiling.
 *
 * The audible sink remains an ordinary `<audio>` or `<video>` element so
 * its `setSinkId` choice still decides which speaker receives the sound.
 * Only the stream handed to that element changes: above 100%, its audio
 * track passes through a Web Audio gain node and returns as a fresh
 * MediaStream track. At or below 100%, the original stream takes the
 * shortest path and the element's own volume does the work.
 */
import { useEffect, useState } from 'react';
import { clampLevel } from './audio-mix';

export interface PlaybackPlan {
  /** Safe to assign to HTMLMediaElement.volume. */
  elementVolume: number;
  /** Gain applied before the element; 1 means no graph is needed. */
  streamGain: number;
  amplify: boolean;
}

export function playbackPlan(level: number): PlaybackPlan {
  const safe = clampLevel(level);
  return safe > 1
    ? { elementVolume: 1, streamGain: safe, amplify: true }
    : { elementVolume: safe, streamGain: 1, amplify: false };
}

interface AmplifiedRoute {
  input: MediaStream;
  output: MediaStream;
  gain: GainNode;
  close(): void;
}

type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let sharedContext: AudioContext | null = null;
let routeCount = 0;

function audioContext(): AudioContext | null {
  if (sharedContext) {
    return sharedContext;
  }
  const Ctor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  sharedContext = new Ctor();
  return sharedContext;
}

function openRoute(input: MediaStream, level: number): AmplifiedRoute | null {
  if (input.getAudioTracks().length === 0) {
    return null;
  }
  let context: AudioContext | null = null;
  try {
    context = audioContext();
    if (!context) {
      return null;
    }
    const routeContext = context;
    const source = routeContext.createMediaStreamSource(input);
    const gain = routeContext.createGain();
    const destination = routeContext.createMediaStreamDestination();
    gain.gain.value = playbackPlan(level).streamGain;
    source.connect(gain).connect(destination);
    const output = new MediaStream([
      ...input.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    routeCount += 1;
    void routeContext.resume().catch(() => {});

    let closed = false;
    return {
      input,
      output,
      gain,
      close() {
        if (closed) {
          return;
        }
        closed = true;
        source.disconnect();
        gain.disconnect();
        for (const track of destination.stream.getAudioTracks()) {
          track.stop();
        }
        routeCount -= 1;
        if (routeCount === 0 && sharedContext === routeContext) {
          sharedContext = null;
          void routeContext.close().catch(() => {});
        }
      },
    };
  } catch {
    if (context && routeCount === 0 && sharedContext === context) {
      sharedContext = null;
      void context.close().catch(() => {});
    }
    return null;
  }
}

export interface AmplifiedPlayback {
  stream: MediaStream;
  /** Safe to assign to HTMLMediaElement.volume. */
  elementVolume: number;
}

/**
 * Returns the stream and element volume that together produce `level`.
 * Graph creation can fail on an older browser; the fallback is the raw
 * stream at 100%, which stays audible and never throws.
 */
export function useAmplifiedPlayback(stream: MediaStream, level = 1): AmplifiedPlayback {
  const plan = playbackPlan(level);
  const [route, setRoute] = useState<AmplifiedRoute | null>(null);

  useEffect(() => {
    if (!plan.amplify) {
      setRoute(null);
      return;
    }
    const next = openRoute(stream, level);
    setRoute(next);
    return () => next?.close();
    // Crossing the 100% boundary builds or removes the graph. Changes
    // within the amplified range only retune its gain below.
  }, [stream, plan.amplify]);

  useEffect(() => {
    if (route?.input === stream) {
      route.gain.gain.value = plan.streamGain;
    }
  }, [plan.streamGain, route, stream]);

  const active = plan.amplify && route?.input === stream ? route : null;
  return {
    stream: active?.output ?? stream,
    elementVolume: active ? plan.elementVolume : Math.min(1, plan.elementVolume),
  };
}
