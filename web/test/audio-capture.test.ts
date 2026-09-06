import { expect, it, vi } from 'vitest';
it('bounds captured PCM when the main thread stops acknowledging worklet messages', async () => {
  class Processor {
    port = { onmessage: null as ((event: { data: string }) => void) | null, postMessage: vi.fn() };
  }
  let Capture: (new () => Processor & { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean }) | undefined;
  vi.stubGlobal('AudioWorkletProcessor', Processor);
  vi.stubGlobal('sampleRate', 48000); vi.stubGlobal('currentTime', 1);
  vi.stubGlobal('registerProcessor', (_name: string, processor: typeof Capture) => { Capture = processor; });
  try {
    await import('../src/lib/audio-capture-worklet');
    const capture = new Capture!();
    for (let i = 0; i < 100; i++) capture.process([], [[new Float32Array(128)]]);
    expect(capture.port.postMessage).toHaveBeenCalledTimes(8);
    capture.port.onmessage!({ data: 'ack' });
    for (let i = 0; i < 8; i++) capture.process([], [[new Float32Array(128)]]);
    expect(capture.port.postMessage).toHaveBeenCalledTimes(9);
    expect(capture.port.postMessage.mock.calls[8]![0].dropped).toBeGreaterThan(0);
  } finally { vi.unstubAllGlobals(); }
});
