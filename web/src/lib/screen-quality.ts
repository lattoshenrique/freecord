/**
 * Presets de compartilhamento de tela.
 *
 * Deixar o navegador escolher sozinho (`getDisplayMedia({ video: true })`)
 * entrega o pior dos mundos: ele degrada resolução E fps ao mesmo tempo e
 * mira um bitrate conservador. Aqui a escolha é explícita — e o que
 * sacrificar quando a banda aperta vira decisão de quem compartilha.
 */

export type ScreenQualityId = 'nitida' | 'equilibrada' | 'fluida';

export interface ScreenQualityPreset {
  id: ScreenQualityId;
  label: string;
  hint: string;
  width: number;
  height: number;
  frameRate: number;
  /** Teto por par (bps), antes do rateio do uplink. */
  maxBitrate: number;
  contentHint: 'text' | 'detail' | 'motion';
  degradationPreference: RTCDegradationPreference;
}

export const SCREEN_QUALITY_PRESETS: readonly ScreenQualityPreset[] = [
  {
    id: 'nitida',
    label: 'Nítida',
    hint: 'Código e texto — 1080p a 15 fps, nunca borra',
    width: 1920,
    height: 1080,
    frameRate: 15,
    maxBitrate: 3_000_000,
    contentHint: 'text',
    degradationPreference: 'maintain-resolution',
  },
  {
    id: 'equilibrada',
    label: 'Equilibrada',
    hint: 'Padrão — 1080p a 30 fps',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 6_000_000,
    contentHint: 'detail',
    degradationPreference: 'maintain-resolution',
  },
  {
    id: 'fluida',
    label: 'Fluida',
    hint: 'Vídeo e jogo — 720p a 60 fps, prioriza movimento',
    width: 1280,
    height: 720,
    frameRate: 60,
    maxBitrate: 8_000_000,
    contentHint: 'motion',
    degradationPreference: 'maintain-framerate',
  },
];

export const DEFAULT_SCREEN_QUALITY: ScreenQualityId = 'equilibrada';

/**
 * Orçamento de upload assumido para a tela (bps).
 *
 * Na malha P2P a tela sobe N−1 vezes: sem rateio, 6 pessoas assistindo
 * saturam o uplink de quem compartilha e a latência explode — o gargalo
 * descrito em docs/architecture.md.
 */
export const SCREEN_UPLINK_BUDGET = 10_000_000;

export function presetById(id: ScreenQualityId): ScreenQualityPreset {
  return SCREEN_QUALITY_PRESETS.find((preset) => preset.id === id) ?? SCREEN_QUALITY_PRESETS[1]!;
}

/** Teto por par: o menor entre o do preset e a fatia do uplink. */
export function bitrateFor(preset: ScreenQualityPreset, viewerCount: number): number {
  return Math.min(preset.maxBitrate, Math.floor(SCREEN_UPLINK_BUDGET / Math.max(1, viewerCount)));
}

export function screenConstraints(preset: ScreenQualityPreset): MediaTrackConstraints {
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
  };
}
