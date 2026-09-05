/** 20 ms mono PCM packets from the same synthetic Web Audio source as RTP. */
export {};
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class Capture extends AudioWorkletProcessor {
  private samples = new Float32Array(960);
  private offset = 0;
  private timestamp = 0;
  private emptyInputBlocks = 0;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    // An input with no channels represents silence, not a stopped clock.
    // Firefox exposes this during silent blocks; skipping it leaves the Opus
    // encoder holding old audio until the next phrase starts.
    if (!input) this.emptyInputBlocks++;
    const frames = input?.length ?? outputs[0]?.[0]?.length ?? 128;
    for (let i = 0; i < frames; i++) {
      if (this.offset === 0) this.timestamp = Math.round((currentTime + i / sampleRate) * 1e6);
      this.samples[this.offset++] = input?.[i] ?? 0;
      if (this.offset === this.samples.length) {
        this.port.postMessage({ samples: this.samples, timestamp: this.timestamp,
          emptyInputBlocks: this.emptyInputBlocks }, [this.samples.buffer]);
        this.samples = new Float32Array(960);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('research-capture', Capture);
