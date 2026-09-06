import { describe, expect, it } from 'vitest';
import { audioPacketBody, AudioReplayWindow, parseAudioPacket } from '../src/lib/audio-packet';
import { AudioPlayoutClock } from '../src/lib/audio-playout';
describe('authenticated audio envelope and playout bounds', () => {
  it('preserves independent source, route, sequence and capture time', () => {
    const body = audioPacketBody(6, 19, 1234567, 987654321, new Uint8Array([1, 2, 3]));
    const packet = new Uint8Array(body.length + 64); packet.set(body);
    const parsed = parseAudioPacket(packet.buffer)!;
    expect([parsed.generation, parsed.source, parsed.sequence, parsed.timestamp]).toEqual([6, 19, 1234567, 987654321]);
    expect([...parsed.payload]).toEqual([1, 2, 3]);
    new DataView(packet.buffer).setUint16(24, 99); expect(parseAudioPacket(packet.buffer)).toBeNull();
    expect(parseAudioPacket(new ArrayBuffer(2000))).toBeNull();
  });
  it('accepts reordered packets once, without accepting old or duplicate replays', () => {
    const window = new AudioReplayWindow();
    expect(window.add(100)).toBe(true); expect(window.add(98)).toBe(true); expect(window.add(99)).toBe(true);
    expect(window.lossRate).toBe(0);
    expect(window.add(98)).toBe(false); expect(window.add(36)).toBe(false);
    expect(window.received).toBe(3);
    expect(window.add(164)).toBe(true); expect(window.add(100)).toBe(false);
    expect(window.add(Infinity)).toBe(false);
  });
  it('bounds playout after a burst gap and discards already played capture times', () => {
    const clock = new AudioPlayoutClock(); clock.observe(1000000, 5);
    expect(clock.schedule(1000000, 5)).toBeCloseTo(5.06);
    expect(clock.schedule(1000000, 5.01)).toBeNull();
    clock.observe(1020000, 5.4);
    const repaired = clock.schedule(1020000, 5.4)!;
    expect(repaired).toBeGreaterThan(5.4); expect(repaired).toBeLessThanOrEqual(5.56);
    expect(clock.underruns).toBe(1);
  });
});
