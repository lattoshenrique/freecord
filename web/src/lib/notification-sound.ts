/**
 * New-message sound cue — synthesized on the fly, no audio file.
 *
 * Two short sine tones rising a perfect fourth (G5 → C6): a "heads-up" sound,
 * not an alarm. Low volume and exponential decay so it doesn't cut into the
 * conversation of whoever is talking in the room.
 */

const ATTACK_S = 0.008;
const NOTE_S = 0.11;
const GAP_S = 0.055;
const PEAK_GAIN = 0.055;
const NOTES = [784, 1046.5];

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) {
    return context;
  }
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  context = new Ctor();
  return context;
}

export function playMessageChime(): void {
  const ctx = audioContext();
  if (!ctx) {
    return;
  }
  // Autoplay: the context is born suspended until a user gesture — joining
  // the room already is one, but resuming can fail and must not take down the chat.
  void ctx.resume?.().catch(() => {});

  const start = ctx.currentTime;
  NOTES.forEach((frequency, index) => {
    const at = start + index * GAP_S;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);

    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + ATTACK_S);
    // Exponential never reaches zero: it lands at ~0 and gets cut off by stop.
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_S);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + NOTE_S + 0.02);
  });
}
