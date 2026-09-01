/**
 * Room sound cues — synthesized on the fly, no audio files.
 *
 * Three cues that have to be told apart without looking: a new message, a
 * peer arriving and a peer leaving. Pitch direction carries the meaning
 * (rising = something arrived, falling = something left) and timbre separates
 * chat from presence — chat is a sine, presence a softer triangle an octave
 * lower, so the two never sound like the same event twice. All of them are
 * quiet and decay fast, so they don't cut into whoever is talking.
 */

const ATTACK_S = 0.008;

interface Cue {
  /** Frequencies in Hz, played in order. */
  notes: number[];
  type: OscillatorType;
  /** How long each note rings. */
  noteS: number;
  /** Delay between note onsets — shorter than noteS, so they overlap. */
  gapS: number;
  peakGain: number;
}

const MESSAGE: Cue = { notes: [784, 1046.5], type: 'sine', noteS: 0.11, gapS: 0.055, peakGain: 0.055 };
const JOIN: Cue = { notes: [392, 587.33], type: 'triangle', noteS: 0.15, gapS: 0.085, peakGain: 0.05 };
const LEAVE: Cue = { notes: [587.33, 392], type: 'triangle', noteS: 0.15, gapS: 0.085, peakGain: 0.05 };

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

function play(cue: Cue): void {
  const ctx = audioContext();
  if (!ctx) {
    return;
  }
  // Autoplay: the context is born suspended until a user gesture — joining
  // the room already is one, but resuming can fail and must not take down the room.
  void ctx.resume?.().catch(() => {});

  const start = ctx.currentTime;
  cue.notes.forEach((frequency, index) => {
    const at = start + index * cue.gapS;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = cue.type;
    oscillator.frequency.setValueAtTime(frequency, at);

    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(cue.peakGain, at + ATTACK_S);
    // Exponential never reaches zero: it lands at ~0 and gets cut off by stop.
    gain.gain.exponentialRampToValueAtTime(0.0001, at + cue.noteS);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + cue.noteS + 0.02);
  });
}

/** Someone else said something in the chat. */
export function playMessageChime(): void {
  play(MESSAGE);
}

/** Someone took a seat in the room. */
export function playJoinChime(): void {
  play(JOIN);
}

/** Someone left the room. */
export function playLeaveChime(): void {
  play(LEAVE);
}
