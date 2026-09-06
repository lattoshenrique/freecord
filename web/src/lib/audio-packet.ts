/** Closed, bounded audio datagram. Identity is the source key in a route generation. */
export const AUDIO_HEADER_BYTES = 32;
export const AUDIO_SIGNATURE_BYTES = 64;
export const AUDIO_MAX_PACKET_BYTES = 1500;
export interface AudioPacket {
  generation: number; source: number; sequence: number; timestamp: number;
  signed: Uint8Array<ArrayBuffer>; signature: Uint8Array<ArrayBuffer>; payload: Uint8Array<ArrayBuffer>;
}
export function parseAudioPacket(value: unknown): AudioPacket | null {
  if (!(value instanceof ArrayBuffer) || value.byteLength <= AUDIO_HEADER_BYTES + AUDIO_SIGNATURE_BYTES ||
    value.byteLength > AUDIO_MAX_PACKET_BYTES) return null;
  const view = new DataView(value);
  const generation = view.getUint32(4), timestamp = view.getFloat64(16);
  if (view.getUint32(0) !== 0x46434131 || generation === 0 || view.getUint16(10) !== 0 ||
    view.getUint16(26) !== 0 || view.getUint32(28) !== 0 ||
    view.getUint16(24) !== value.byteLength - AUDIO_HEADER_BYTES - AUDIO_SIGNATURE_BYTES ||
    !Number.isSafeInteger(timestamp) || timestamp < 0) return null;
  const end = value.byteLength - AUDIO_SIGNATURE_BYTES;
  return { generation, source: view.getUint16(8), sequence: view.getUint32(12),
    timestamp, signed: new Uint8Array(value, 0, end), signature: new Uint8Array(value, end),
    payload: new Uint8Array(value, AUDIO_HEADER_BYTES, end - AUDIO_HEADER_BYTES) };
}

export function audioPacketBody(generation: number, source: number, sequence: number, timestamp: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  if (payload.length === 0 || payload.length + AUDIO_HEADER_BYTES + AUDIO_SIGNATURE_BYTES > AUDIO_MAX_PACKET_BYTES ||
    !Number.isInteger(generation) || generation < 1 || generation > 0xffffffff ||
    !Number.isInteger(source) || source < 0 || source > 19 ||
    !Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff ||
    !Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid audio packet');
  const packet = new Uint8Array(AUDIO_HEADER_BYTES + payload.length), view = new DataView(packet.buffer);
  view.setUint32(0, 0x46434131); view.setUint32(4, generation); view.setUint16(8, source);
  view.setUint32(12, sequence); view.setFloat64(16, timestamp); view.setUint16(24, payload.length);
  packet.set(payload, AUDIO_HEADER_BYTES);
  return packet;
}

/** Accept reordering in a 64-packet window; duplicates and older replays never play. */
export class AudioReplayWindow {
  private highest = -1;
  private first = -1;
  private bits = 0n;
  received = 0;
  /** Observed sequence span, excluding the unknown prefix before first receipt. */
  get expected(): number { return this.first < 0 ? 0 : this.highest - this.first + 1; }
  get lossRate(): number | null { return this.expected > 1 ? (this.expected - this.received) / this.expected : null; }
  accepts(sequence: number): boolean {
    if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) return false;
    if (sequence > this.highest) return true;
    const distance = this.highest - sequence;
    return distance < 64 && (this.bits & (1n << BigInt(distance))) === 0n;
  }
  add(sequence: number): boolean {
    if (!this.accepts(sequence)) return false;
    this.first = this.first < 0 ? sequence : Math.min(this.first, sequence);
    this.received++;
    if (sequence > this.highest) {
      const shift = sequence - this.highest;
      this.bits = shift >= 64 ? 1n : ((this.bits << BigInt(shift)) | 1n) & ((1n << 64n) - 1n);
      this.highest = sequence;
    } else this.bits |= 1n << BigInt(this.highest - sequence);
    return true;
  }
}
