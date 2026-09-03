import { describe, expect, it } from 'vitest';
import {
  candidatePairPath,
  inboundAudioCodec,
  inboundAudioJitterMs,
  jitterBufferMs,
  packetLossRate,
} from '../src/lib/stats';

describe('packetLossRate', () => {
  it('measures the interval, not the whole call', () => {
    // 5 lost out of 105 sent in this window, after a clean first minute.
    expect(packetLossRate({ lost: 0, received: 3000 }, { lost: 5, received: 3100 })).toBeCloseTo(
      5 / 105,
    );
  });

  it('reads a window that lost nothing as zero, not as no reading', () => {
    expect(packetLossRate({ lost: 4, received: 100 }, { lost: 4, received: 200 })).toBe(0);
  });

  it('has nothing to report when nothing was expected', () => {
    // An idle link and a clean one would otherwise read the same.
    expect(packetLossRate({ lost: 4, received: 100 }, { lost: 4, received: 100 })).toBeNull();
  });

  it('treats a packet that arrived late as no loss at all', () => {
    // packetsLost is allowed to go back down; a negative rate is not a thing.
    expect(packetLossRate({ lost: 6, received: 100 }, { lost: 4, received: 150 })).toBe(0);
  });
});

/** A getStats() report is a Map of id → stat; that is all these readers need. */
function reportOf(stats: Record<string, Record<string, unknown>>): RTCStatsReport {
  return new Map(Object.entries(stats)) as unknown as RTCStatsReport;
}

describe('candidatePairPath', () => {
  const pair = (local: string, remote: string) =>
    reportOf({
      p: {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        localCandidateId: 'l',
        remoteCandidateId: 'r',
      },
      l: { type: 'local-candidate', candidateType: local },
      r: { type: 'remote-candidate', candidateType: remote },
    });

  it('reads two ends on the same network as a direct path', () => {
    expect(candidatePairPath(pair('host', 'host'))).toBe('host');
  });

  it('reads a NAT traversal as stun', () => {
    expect(candidatePairPath(pair('host', 'srflx'))).toBe('stun');
  });

  it('calls the whole path relayed when either end is', () => {
    // One relayed end is a hop and somebody's bandwidth, whatever the other does.
    expect(candidatePairPath(pair('host', 'relay'))).toBe('turn');
    expect(candidatePairPath(pair('relay', 'srflx'))).toBe('turn');
  });

  it('has nothing to say before a pair succeeds', () => {
    expect(
      candidatePairPath(reportOf({ p: { type: 'candidate-pair', state: 'in-progress' } })),
    ).toBeNull();
  });

  it('ignores a pair whose candidates the report does not carry', () => {
    expect(
      candidatePairPath(
        reportOf({ p: { type: 'candidate-pair', state: 'succeeded', nominated: true } }),
      ),
    ).toBeNull();
  });
});

describe('inboundAudioJitterMs', () => {
  it('reports the worst voice stream, in ms', () => {
    expect(
      inboundAudioJitterMs(
        reportOf({
          a: { type: 'inbound-rtp', kind: 'audio', jitter: 0.004 },
          b: { type: 'inbound-rtp', kind: 'audio', jitter: 0.021 },
          v: { type: 'inbound-rtp', kind: 'video', jitter: 0.5 },
        }),
      ),
    ).toBe(21);
  });

  it('has no reading with no inbound audio', () => {
    expect(
      inboundAudioJitterMs(reportOf({ v: { type: 'inbound-rtp', kind: 'video', jitter: 0.01 } })),
    ).toBeNull();
  });
});

describe('jitterBufferMs', () => {
  it('averages the delay over the packets it let through', () => {
    // 12 seconds of buffered delay across 200 packets is 60 ms a packet.
    expect(
      jitterBufferMs(
        reportOf({
          a: {
            type: 'inbound-rtp',
            kind: 'audio',
            jitterBufferDelay: 12,
            jitterBufferEmittedCount: 200,
          },
        }),
      ),
    ).toBe(60);
  });

  it('has no reading before anything came out of the buffer', () => {
    expect(
      jitterBufferMs(
        reportOf({
          a: {
            type: 'inbound-rtp',
            kind: 'audio',
            jitterBufferDelay: 0,
            jitterBufferEmittedCount: 0,
          },
        }),
      ),
    ).toBeNull();
  });
});

describe('inboundAudioCodec', () => {
  it('says the short name, not the mime type', () => {
    expect(
      inboundAudioCodec(
        reportOf({
          a: { type: 'inbound-rtp', kind: 'audio', codecId: 'c' },
          c: { type: 'codec', mimeType: 'audio/opus' },
        }),
      ),
    ).toBe('opus');
  });

  it('has nothing to say when the report names no codec', () => {
    expect(
      inboundAudioCodec(reportOf({ a: { type: 'inbound-rtp', kind: 'audio' } })),
    ).toBeNull();
  });
});
