/**
 * Aviso sonoro de mensagem nova — sintetizado na hora, sem arquivo de áudio.
 *
 * Duas senoides curtas subindo uma quarta justa (Sol5 → Dó6): som de "aviso",
 * não de alarme. Volume baixo e decaimento exponencial para não cortar a
 * conversa de quem está falando na sala.
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
  // Autoplay: o contexto nasce suspenso até um gesto do usuário — entrar na
  // sala já é um, mas a retomada pode falhar e não pode derrubar o chat.
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
    // Exponencial nunca chega a zero: termina em ~0 e corta no stop.
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_S);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + NOTE_S + 0.02);
  });
}
