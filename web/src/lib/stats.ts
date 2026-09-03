/**
 * Reading the mesh's `getStats()`: real peer-to-peer latency and the effective
 * screen quality — what is actually arriving, not what was requested.
 */
import type { Mesh } from './mesh';

export interface PeerLatency {
  /** Round trip over the P2P path, in ms. Null until ICE settles. */
  rttMs: number | null;
  state: RTCPeerConnectionState;
  /**
   * Cumulative audio packets received from this peer — flat readings
   * mean the voice path went quiet (stall-watch.ts, advanceAudioStall).
   * Null when the connection reports no inbound audio.
   */
  audioPackets: number | null;
  /**
   * Share of what this peer sent us that never arrived, over the last
   * sampling interval (0–1). Null until two readings, and null again
   * whenever the interval carried nothing to judge.
   */
  lossRate: number | null;
}

/** Cumulative inbound packet counters, as one report leaves them. */
export interface PacketCounters {
  lost: number;
  received: number;
}

export interface ScreenStats {
  direction: 'sending' | 'receiving';
  fps: number | null;
  width: number | null;
  height: number | null;
  kbps: number | null;
  rttMs: number | null;
  /** Receiving side only: cumulative decoded frames — flat readings mean a stall. */
  framesDecoded: number | null;
  /**
   * Set when this peer relays the screen onward: which forwarding path its
   * children ride — encoded passthrough, the re-encode fallback, or both.
   */
  relayMode: 'passthrough' | 'reencode' | 'mixed' | null;
}

interface SenderSample {
  fps: number | null;
  width: number | null;
  height: number | null;
  kbps: number | null;
  rttMs: number | null;
}

function toMs(seconds: unknown): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function defined(values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

/** RTT of the candidate pair in use — the network latency between the people. */
function candidatePairRtt(report: RTCStatsReport): number | null {
  let rtt: number | null = null;
  let bestBytes = -1;
  for (const stat of report.values() as Iterable<Record<string, unknown>>) {
    if (stat.type !== 'candidate-pair' || stat.state !== 'succeeded') {
      continue;
    }
    // The nominated pair is the one in use; failing that, the one that received the most bytes.
    const weight = stat.nominated === true ? Number.MAX_SAFE_INTEGER : (num(stat.bytesReceived) ?? 0);
    if (weight > bestBytes) {
      bestBytes = weight;
      rtt = toMs(stat.currentRoundTripTime);
    }
  }
  return rtt;
}

/**
 * Every inbound stream in the report, audio and video together: what the
 * network delivered to us and what it dropped on the way. Both kinds count
 * because both ride the same link — a downlink under water loses voice
 * packets and screen packets alike.
 */
function inboundPackets(report: RTCStatsReport): PacketCounters | null {
  let lost = 0;
  let received = 0;
  let any = false;
  for (const stat of report.values() as Iterable<Record<string, unknown>>) {
    if (stat.type !== 'inbound-rtp') {
      continue;
    }
    const arrived = num(stat.packetsReceived);
    if (arrived === null) {
      continue;
    }
    any = true;
    received += arrived;
    lost += num(stat.packetsLost) ?? 0;
  }
  return any ? { lost, received } : null;
}

/**
 * Loss over one interval, from two cumulative readings. `packetsLost` may
 * go DOWN — a packet counted lost and then delivered late is subtracted
 * back — so a negative delta is no loss at all, not a negative rate.
 *
 * A window where nothing was expected has no rate to report: an idle link
 * and a clean one would otherwise read the same.
 */
export function packetLossRate(
  previous: PacketCounters,
  current: PacketCounters,
): number | null {
  const lost = Math.max(0, current.lost - previous.lost);
  const received = Math.max(0, current.received - previous.received);
  const expected = lost + received;
  return expected > 0 ? lost / expected : null;
}

/** Sum of packets received over every inbound audio stream in the report. */
function inboundAudioPackets(report: RTCStatsReport): number | null {
  let total: number | null = null;
  for (const stat of report.values() as Iterable<Record<string, unknown>>) {
    if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio') {
      continue;
    }
    const packets = num(stat.packetsReceived);
    if (packets !== null) {
      total = (total ?? 0) + packets;
    }
  }
  return total;
}

/**
 * Raw per-peer reports for a track's senders — the input the adaptive
 * policy aggregates (adaptive-policy.ts, congestionFromReports). Scoped
 * per sender on purpose: a full pc.getStats() on a sharer's connection
 * carries TWO outbound videos, and the camera's ladder must never read
 * the screen's congestion story as its own.
 */
export async function senderReports(
  mesh: Mesh,
  track: MediaStreamTrack,
): Promise<Iterable<Record<string, unknown>>[]> {
  const reports = await Promise.all(
    mesh.peerIds().map(async (peerId) => {
      const sender = mesh
        .getPeerConnection(peerId)
        ?.getSenders()
        .find((candidate) => candidate.track === track);
      if (!sender) {
        return null;
      }
      try {
        const report = await sender.getStats();
        return [...report.values()] as Record<string, unknown>[];
      } catch {
        return null;
      }
    }),
  );
  return reports.filter((report): report is Record<string, unknown>[] => report !== null);
}

/**
 * Sampler with memory: bitrate only exists as a delta between two readings,
 * so the previous sample is kept per key.
 */
export class StatsSampler {
  private readonly previous = new Map<string, { bytes: number; at: number }>();
  private readonly previousPackets = new Map<string, PacketCounters>();

  /** Loss since this key's last reading; remembers the counters for the next one. */
  private lossRate(key: string, counters: PacketCounters | null): number | null {
    if (counters === null) {
      this.previousPackets.delete(key);
      return null;
    }
    const last = this.previousPackets.get(key);
    this.previousPackets.set(key, counters);
    return last ? packetLossRate(last, counters) : null;
  }

  private kbps(key: string, bytes: number | null, at: number): number | null {
    if (bytes === null) {
      return null;
    }
    const last = this.previous.get(key);
    this.previous.set(key, { bytes, at });
    if (!last || at <= last.at) {
      return null;
    }
    return Math.round(((bytes - last.bytes) * 8) / (at - last.at));
  }

  async peerLatencies(mesh: Mesh): Promise<Map<string, PeerLatency>> {
    const entries = await Promise.all(
      mesh.peerIds().map(async (peerId): Promise<[string, PeerLatency] | null> => {
        const pc = mesh.getPeerConnection(peerId);
        if (!pc) {
          return null;
        }
        try {
          const report = await pc.getStats();
          return [
            peerId,
            {
              rttMs: candidatePairRtt(report),
              state: pc.connectionState,
              audioPackets: inboundAudioPackets(report),
              lossRate: this.lossRate(`loss:${peerId}`, inboundPackets(report)),
            },
          ];
        } catch {
          return [
            peerId,
            { rttMs: null, state: pc.connectionState, audioPackets: null, lossRate: null },
          ];
        }
      }),
    );
    return new Map(entries.filter((entry): entry is [string, PeerLatency] => entry !== null));
  }

  /** Quality on the receiving end of `peerId`'s screen. */
  async receivingScreen(
    mesh: Mesh,
    peerId: string,
    track: MediaStreamTrack,
  ): Promise<ScreenStats | null> {
    const receiver = mesh
      .getPeerConnection(peerId)
      ?.getReceivers()
      .find((candidate) => candidate.track === track);
    if (!receiver) {
      return null;
    }
    const report = await receiver.getStats();
    const at = performance.now();
    for (const stat of report.values() as Iterable<Record<string, unknown>>) {
      if (stat.type !== 'inbound-rtp' || stat.kind !== 'video') {
        continue;
      }
      return {
        direction: 'receiving',
        fps: num(stat.framesPerSecond),
        width: num(stat.frameWidth),
        height: num(stat.frameHeight),
        kbps: this.kbps(`recv:${peerId}`, num(stat.bytesReceived), at),
        rttMs: candidatePairRtt(report),
        framesDecoded: num(stat.framesDecoded),
        relayMode: null,
      };
    }
    return null;
  }

  /**
   * Quality on the sending end: sums what goes up to every peer —
   * that total is what blows the uplink in a mesh.
   */
  async sendingScreen(mesh: Mesh, track: MediaStreamTrack): Promise<ScreenStats | null> {
    const at = performance.now();
    const samples = await Promise.all(
      mesh.peerIds().map(async (peerId): Promise<SenderSample | null> => {
        const sender = mesh
          .getPeerConnection(peerId)
          ?.getSenders()
          .find((candidate) => candidate.track === track);
        if (!sender) {
          return null;
        }
        const report = await sender.getStats();
        let sample: SenderSample | null = null;
        let rttMs: number | null = null;
        for (const stat of report.values() as Iterable<Record<string, unknown>>) {
          if (stat.type === 'remote-inbound-rtp') {
            rttMs = toMs(stat.roundTripTime);
          } else if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
            sample = {
              fps: num(stat.framesPerSecond),
              width: num(stat.frameWidth),
              height: num(stat.frameHeight),
              kbps: this.kbps(`send:${peerId}`, num(stat.bytesSent), at),
              rttMs: null,
            };
          }
        }
        return sample ? { ...sample, rttMs } : null;
      }),
    );

    const live = samples.filter((sample): sample is SenderSample => sample !== null);
    if (live.length === 0) {
      return null;
    }
    const fps = defined(live.map((sample) => sample.fps));
    const kbps = defined(live.map((sample) => sample.kbps));
    const rtts = defined(live.map((sample) => sample.rttMs));
    const widths = defined(live.map((sample) => sample.width));
    const heights = defined(live.map((sample) => sample.height));
    return {
      direction: 'sending',
      // The worst peer dictates what the room is seeing; the bitrate is the total going up.
      fps: fps.length ? Math.min(...fps) : null,
      width: widths.length ? Math.min(...widths) : null,
      height: heights.length ? Math.min(...heights) : null,
      kbps: kbps.length ? kbps.reduce((total, value) => total + value, 0) : null,
      rttMs: rtts.length ? Math.max(...rtts) : null,
      framesDecoded: null,
      relayMode: null,
    };
  }
}
