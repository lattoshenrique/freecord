/**
 * Leitura de `getStats()` da malha: latência real par a par e a qualidade
 * efetiva da tela — o que está chegando, não o que foi pedido.
 */
import type { Mesh } from './mesh';

export interface PeerLatency {
  /** Ida e volta pelo caminho P2P, em ms. Null antes do ICE fechar. */
  rttMs: number | null;
  state: RTCPeerConnectionState;
}

export interface ScreenStats {
  direction: 'sending' | 'receiving';
  fps: number | null;
  width: number | null;
  height: number | null;
  kbps: number | null;
  rttMs: number | null;
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

/** RTT do par de candidatos em uso — a latência de rede entre as pessoas. */
function candidatePairRtt(report: RTCStatsReport): number | null {
  let rtt: number | null = null;
  let bestBytes = -1;
  for (const stat of report.values() as Iterable<Record<string, unknown>>) {
    if (stat.type !== 'candidate-pair' || stat.state !== 'succeeded') {
      continue;
    }
    // O par nomeado é o que está em uso; sem ele, o que mais recebeu bytes.
    const weight = stat.nominated === true ? Number.MAX_SAFE_INTEGER : (num(stat.bytesReceived) ?? 0);
    if (weight > bestBytes) {
      bestBytes = weight;
      rtt = toMs(stat.currentRoundTripTime);
    }
  }
  return rtt;
}

/**
 * Amostrador com memória: bitrate só existe como delta entre duas leituras,
 * então a amostra anterior fica guardada por chave.
 */
export class StatsSampler {
  private readonly previous = new Map<string, { bytes: number; at: number }>();

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
          return [peerId, { rttMs: candidatePairRtt(report), state: pc.connectionState }];
        } catch {
          return [peerId, { rttMs: null, state: pc.connectionState }];
        }
      }),
    );
    return new Map(entries.filter((entry): entry is [string, PeerLatency] => entry !== null));
  }

  /** Qualidade de quem está recebendo a tela de `peerId`. */
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
      };
    }
    return null;
  }

  /**
   * Qualidade de quem está enviando: soma o que sobe para todos os pares —
   * é esse total que estoura o uplink numa malha.
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
      // O pior par manda no que a sala está vendo; o bitrate é a soma que sobe.
      fps: fps.length ? Math.min(...fps) : null,
      width: widths.length ? Math.min(...widths) : null,
      height: heights.length ? Math.min(...heights) : null,
      kbps: kbps.length ? kbps.reduce((total, value) => total + value, 0) : null,
      rttMs: rtts.length ? Math.max(...rtts) : null,
    };
  }
}
