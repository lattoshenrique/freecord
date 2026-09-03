/**
 * Turns noisy per-peer WebRTC stats into rare routing decisions.
 *
 * The server only needs to know whether one directed media path should be
 * avoided in a screen tree. Two bad samples are required to reroute; thirty
 * seconds of clearly healthy readings are required to return. The wider,
 * slower recovery keeps a link from bouncing the tree around after removing
 * the screen traffic itself made that path look healthy again.
 */
import type { PeerLatency } from './stats';

const BAD_SAMPLES = 2;
const RECOVERY_SAMPLES = 15;
const BAD_RTT_MS = 500;
const RECOVERY_RTT_MS = 300;
const BAD_LOSS_RATE = 0.05;
const RECOVERY_LOSS_RATE = 0.02;

type Reading = 'bad' | 'healthy' | 'uncertain';

interface LinkState {
  poor: boolean;
  badSamples: number;
  healthySamples: number;
}

export interface LinkHealthUpdate {
  peerId: string;
  poor: boolean;
}

function classify(reading: PeerLatency): Reading {
  if (
    reading.state === 'failed' ||
    reading.state === 'disconnected' ||
    reading.state === 'closed' ||
    (reading.rttMs !== null && reading.rttMs >= BAD_RTT_MS) ||
    (reading.lossRate !== null && reading.lossRate >= BAD_LOSS_RATE)
  ) {
    return 'bad';
  }
  if (
    reading.state === 'connected' &&
    (reading.rttMs === null || reading.rttMs <= RECOVERY_RTT_MS) &&
    (reading.lossRate === null || reading.lossRate <= RECOVERY_LOSS_RATE)
  ) {
    return 'healthy';
  }
  return 'uncertain';
}

export class LinkHealthTracker {
  private readonly links = new Map<string, LinkState>();

  /** Reasserted after signaling resumes; a transition may have happened offline. */
  snapshot(): LinkHealthUpdate[] {
    return [...this.links].map(([peerId, state]) => ({ peerId, poor: state.poor }));
  }

  sample(latencies: ReadonlyMap<string, PeerLatency>): LinkHealthUpdate[] {
    for (const peerId of [...this.links.keys()]) {
      if (!latencies.has(peerId)) {
        this.links.delete(peerId);
      }
    }

    const updates: LinkHealthUpdate[] = [];
    for (const [peerId, latency] of latencies) {
      const state = this.links.get(peerId) ?? {
        poor: false,
        badSamples: 0,
        healthySamples: 0,
      };
      const reading = classify(latency);
      if (reading === 'bad') {
        state.badSamples += 1;
        state.healthySamples = 0;
        if (!state.poor && state.badSamples >= BAD_SAMPLES) {
          state.poor = true;
          updates.push({ peerId, poor: true });
        }
      } else if (reading === 'healthy') {
        state.badSamples = 0;
        state.healthySamples += 1;
        if (state.poor && state.healthySamples >= RECOVERY_SAMPLES) {
          state.poor = false;
          updates.push({ peerId, poor: false });
        }
      } else {
        // A borderline sample proves neither a fault nor a recovery.
        state.badSamples = 0;
        state.healthySamples = 0;
      }
      this.links.set(peerId, state);
    }
    return updates;
  }
}
