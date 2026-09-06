export {};
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
/** Mono capture stays continuous through missing/silent input blocks. */
class Capture extends AudioWorkletProcessor {
  private samples = new Float32Array(960);
  private offset = 0;
  private timestamp = 0;
  private credits = 8;
  private dropped = 0;
  constructor() {
    super();
    // A frozen main thread must not accumulate minutes of captured PCM on
    // MessagePort. Credits bound in-flight buffers while capture stays live.
    this.port.onmessage = event => { if (event.data === 'ack') this.credits = Math.min(8, this.credits + 1); };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const frames = input?.length ?? outputs[0]?.[0]?.length ?? 128;
    for (let i = 0; i < frames; i++) {
      if (this.offset === 0) this.timestamp = Math.round((currentTime + i / sampleRate) * 1e6);
      this.samples[this.offset++] = input?.[i] ?? 0;
      if (this.offset === this.samples.length) {
        if (this.credits > 0) {
          this.credits--;
          this.port.postMessage({ samples: this.samples, timestamp: this.timestamp, dropped: this.dropped }, [this.samples.buffer]);
          this.dropped = 0; this.samples = new Float32Array(960);
        } else this.dropped++;
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('freecord-audio-capture', Capture);
