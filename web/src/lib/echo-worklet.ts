/**
 * The audio thread's end of the echo guard.
 *
 * Everything of substance is in echo-guard.ts; this is the shell that
 * lets it run where audio actually happens. It exists as its own module
 * for one reason: an AudioWorklet is loaded from a URL, not imported, so
 * the DSP needs an entry point that can be built into a file of its own
 * (`?worker&url`) while the tests go on importing the class directly.
 *
 * Two inputs, deliberately. Input 0 is the screen capture on its way out
 * to the room; input 1 is everything we are playing locally, mixed. The
 * node is built with `numberOfInputs: 2` and, if nothing is connected to
 * the second one, this is a wire — which is also what happens on the
 * first render quantum, before the room has anybody in it to reference.
 */
import { EchoGuard } from './echo-guard';

/* The worklet global scope, which lib.dom does not describe. */
declare const sampleRate: number;
declare const currentTime: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor & {
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  },
): void;

/** How often the guard's readings are posted back to the page. */
const REPORT_SECONDS = 1;

class EchoGuardProcessor extends AudioWorkletProcessor {
  private readonly guard = new EchoGuard(sampleRate);
  private reportedAt = 0;

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const capture = inputs[0] ?? [];
    const reference = inputs[1] ?? [];
    const output = outputs[0] ?? [];
    if (capture.length === 0 || output.length === 0) {
      // The capture ended. Returning true keeps the node alive: a screen
      // share that is stopping still has a graph to tear down in order.
      return true;
    }
    if (reference.length === 0) {
      // Nothing playing to be subtracted — copy rather than run a filter
      // over silence, which would only teach it that there is no echo.
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel]!.set(capture[Math.min(channel, capture.length - 1)]!);
      }
    } else {
      this.guard.process(capture, reference, output);
    }
    if (currentTime - this.reportedAt >= REPORT_SECONDS) {
      this.reportedAt = currentTime;
      this.port.postMessage(this.guard.stats());
    }
    return true;
  }
}

registerProcessor('echo-guard', EchoGuardProcessor);
