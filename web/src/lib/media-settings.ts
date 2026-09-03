/**
 * User-tunable media quality: microphone profile, camera preset and the
 * screen share's system-audio switch.
 *
 * The screen presets live in screen-quality.ts (their ids are wire
 * protocol); everything here is local to the client — persisted in
 * localStorage and applied live through track constraints, content hints
 * and per-sender encodings.
 *
 * User-facing names and hints live in the i18n catalog, keyed by id —
 * never hardcoded here.
 */

export type MicProfileId = 'voice' | 'music';
export type CameraQualityId = 'eco' | 'standard' | 'high';

export interface MicSettings {
  profile: MicProfileId;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface MediaSettings {
  mic: MicSettings;
  camera: CameraQualityId;
  /** Send system/tab audio along with the screen share. Off by default. */
  screenAudio: boolean;
  /**
   * Take the room back out of that audio before it goes (echo-guard.ts).
   * On by default, and only ever consulted when screenAudio is on: a
   * capture of the whole machine contains the call itself, so without it
   * everybody hears everybody a beat late. Off is for the person who has
   * measured that they do not need it — a capture that never contained us
   * costs nothing to leave guarded, because the guard measures that and
   * stands aside.
   */
  screenAudioGuard: boolean;
}

/**
 * Voice keeps the browser's processing chain (echo, noise, gain) and its
 * conservative Opus target. Music turns the chain off — every filter in it
 * eats fidelity — and raises the Opus cap; useful for instruments or
 * playing audio into the mic, at the price of needing headphones.
 */
export function micDefaults(profile: MicProfileId): MicSettings {
  const processed = profile === 'voice';
  return {
    profile,
    echoCancellation: processed,
    noiseSuppression: processed,
    autoGainControl: processed,
  };
}

/**
 * Opus send caps. The encoder only spends what the signal needs (VBR), so
 * the voice cap is headroom over Chrome's ~32 kbps default rather than a
 * forced rate; the hi-fi cap is where stereo music stops improving.
 */
export const OPUS_VOICE_MAX_BITRATE = 64_000;
export const OPUS_HIFI_MAX_BITRATE = 192_000;

export function micConstraints(mic: MicSettings): MediaTrackConstraints {
  return {
    echoCancellation: mic.echoCancellation,
    noiseSuppression: mic.noiseSuppression,
    autoGainControl: mic.autoGainControl,
    // Stereo only matters when the chain is off — the processors are mono.
    ...(mic.profile === 'music' ? { channelCount: { ideal: 2 } } : {}),
  };
}

/** Tells the encoder what it is carrying: speech survives compression, music does not. */
export function micContentHint(mic: MicSettings): 'speech' | 'music' {
  return mic.profile === 'music' ? 'music' : 'speech';
}

/**
 * Structurally compatible with the mesh's TrackEncoding once its
 * video-only fields are optional; kept as a local type so this module
 * never depends on the mesh (the integration there is owned separately).
 */
export interface SenderCaps {
  maxBitrate: number;
  maxFramerate?: number;
  degradationPreference?: RTCDegradationPreference;
}

export function micEncoding(mic: MicSettings): SenderCaps {
  return {
    maxBitrate: mic.profile === 'music' ? OPUS_HIFI_MAX_BITRATE : OPUS_VOICE_MAX_BITRATE,
  };
}

export interface CameraPreset {
  id: CameraQualityId;
  width: number;
  height: number;
  frameRate: number;
  /** Per-peer cap (bps) — a camera goes to every peer, so this times N−1 is the uplink. */
  maxBitrate: number;
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'eco', width: 640, height: 360, frameRate: 20, maxBitrate: 350_000 },
  { id: 'standard', width: 1280, height: 720, frameRate: 30, maxBitrate: 1_200_000 },
  { id: 'high', width: 1920, height: 1080, frameRate: 30, maxBitrate: 2_800_000 },
];

export const DEFAULT_CAMERA_QUALITY: CameraQualityId = 'standard';

export function cameraPresetById(id: CameraQualityId): CameraPreset {
  return CAMERA_PRESETS.find((preset) => preset.id === id) ?? CAMERA_PRESETS[1]!;
}

export function cameraConstraints(preset: CameraPreset): MediaTrackConstraints {
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
  };
}

export function cameraEncoding(preset: CameraPreset): SenderCaps {
  return {
    maxBitrate: preset.maxBitrate,
    maxFramerate: preset.frameRate,
    // A face is neither text nor sport: let the encoder trade both ways.
    degradationPreference: 'balanced',
  };
}

/**
 * System audio rides the screen share raw: the processing chain exists to
 * clean up a microphone in a room, and against program audio it only
 * removes what the viewer came to hear.
 */
export function screenAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
}

const STORAGE_KEY = 'freecord:media-settings';

export const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  mic: micDefaults('voice'),
  camera: DEFAULT_CAMERA_QUALITY,
  screenAudio: false,
  screenAudioGuard: true,
};

export function loadMediaSettings(): MediaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_MEDIA_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<MediaSettings>;
    const profile: MicProfileId = parsed.mic?.profile === 'music' ? 'music' : 'voice';
    const defaults = micDefaults(profile);
    return {
      mic: {
        profile,
        echoCancellation:
          typeof parsed.mic?.echoCancellation === 'boolean'
            ? parsed.mic.echoCancellation
            : defaults.echoCancellation,
        noiseSuppression:
          typeof parsed.mic?.noiseSuppression === 'boolean'
            ? parsed.mic.noiseSuppression
            : defaults.noiseSuppression,
        autoGainControl:
          typeof parsed.mic?.autoGainControl === 'boolean'
            ? parsed.mic.autoGainControl
            : defaults.autoGainControl,
      },
      camera: CAMERA_PRESETS.some((preset) => preset.id === parsed.camera)
        ? (parsed.camera as CameraQualityId)
        : DEFAULT_CAMERA_QUALITY,
      screenAudio: parsed.screenAudio === true,
      // Absent means an older build wrote this: default it ON, like a
      // fresh install, rather than leaving an upgrade quietly unguarded.
      screenAudioGuard: parsed.screenAudioGuard !== false,
    };
  } catch {
    return DEFAULT_MEDIA_SETTINGS;
  }
}

export function saveMediaSettings(settings: MediaSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // private browsing: the choice lasts only this session
  }
}

const OPUS_RTPMAP = /^a=rtpmap:(\d+)\s+opus\/48000/i;
const FMTP_LINE = /^a=fmtp:(\d+)\s+(.*)$/;

function withFmtpParam(params: string, key: string, value: string): string {
  const pattern = new RegExp(`(^|;)\\s*${key}=[^;]*`);
  return pattern.test(params)
    ? params.replace(pattern, `$1${key}=${value}`)
    : `${params};${key}=${value}`;
}

/**
 * Lifts the Opus ceiling in a REMOTE session description before it is
 * applied: `stereo` and `maxaveragebitrate` in the SDP a peer sent us
 * declare what that peer is willing to RECEIVE, so editing our local copy
 * raises what WE may send — the classic hi-fi Opus trick, invisible on the
 * wire. Every peer applies it symmetrically; against an older client the
 * upgrade simply stays one-directional. What is actually spent is still
 * decided per sender (content hint + encoding caps): voice stays cheap.
 */
export function allowHiFiOpus(sdp: string): string {
  const lines = sdp.split('\r\n');
  const opusPayloadTypes = new Set<string>();
  for (const line of lines) {
    const match = OPUS_RTPMAP.exec(line);
    if (match) {
      opusPayloadTypes.add(match[1]!);
    }
  }
  if (opusPayloadTypes.size === 0) {
    return sdp;
  }
  return lines
    .map((line) => {
      const match = FMTP_LINE.exec(line);
      if (!match || !opusPayloadTypes.has(match[1]!)) {
        return line;
      }
      let params = withFmtpParam(match[2]!, 'stereo', '1');
      params = withFmtpParam(params, 'maxaveragebitrate', String(OPUS_HIFI_MAX_BITRATE));
      return `a=fmtp:${match[1]} ${params}`;
    })
    .join('\r\n');
}
