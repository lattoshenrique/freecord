import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MEDIA_SETTINGS,
  OPUS_HIFI_MAX_BITRATE,
  allowHiFiOpus,
  cameraPresetById,
  loadMediaSettings,
  micDefaults,
  micEncoding,
  saveMediaSettings,
} from '../src/lib/media-settings';

/** A trimmed but structurally honest Chrome offer: audio + video m-lines. */
const SDP = [
  'v=0',
  'o=- 46117317 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=rtpmap:96 VP8/90000',
  'a=fmtp:96 max-fr=30',
  '',
].join('\r\n');

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('allowHiFiOpus', () => {
  it('lifts stereo and the bitrate ceiling on the opus fmtp only', () => {
    const out = allowHiFiOpus(SDP);
    expect(out).toContain(
      `a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;maxaveragebitrate=${OPUS_HIFI_MAX_BITRATE}`,
    );
    // The video payload keeps its fmtp untouched.
    expect(out).toContain('a=fmtp:96 max-fr=30');
  });

  it('replaces existing values instead of stacking duplicates', () => {
    const conservative = SDP.replace(
      'a=fmtp:111 minptime=10;useinbandfec=1',
      'a=fmtp:111 minptime=10;stereo=0;maxaveragebitrate=24000',
    );
    const out = allowHiFiOpus(conservative);
    expect(out).toContain('stereo=1');
    expect(out).toContain(`maxaveragebitrate=${OPUS_HIFI_MAX_BITRATE}`);
    expect(out).not.toContain('stereo=0');
    expect(out).not.toContain('24000');
  });

  it('is a no-op without opus', () => {
    const videoOnly = SDP.split('\r\n')
      .filter((line) => !line.includes('opus') && !line.startsWith('a=fmtp:111'))
      .join('\r\n');
    expect(allowHiFiOpus(videoOnly)).toBe(videoOnly);
  });
});

describe('mic profiles', () => {
  it('voice keeps the processing chain, music drops it', () => {
    expect(micDefaults('voice')).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(micDefaults('music')).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it('music raises the opus cap', () => {
    expect(micEncoding(micDefaults('music')).maxBitrate).toBe(OPUS_HIFI_MAX_BITRATE);
    expect(micEncoding(micDefaults('voice')).maxBitrate).toBeLessThan(OPUS_HIFI_MAX_BITRATE);
  });
});

describe('persistence', () => {
  it('falls back to defaults without storage (SSR, private browsing)', () => {
    expect(loadMediaSettings()).toEqual(DEFAULT_MEDIA_SETTINGS);
  });

  it('round-trips through storage', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const custom = {
      mic: { ...micDefaults('music'), echoCancellation: true },
      camera: 'high' as const,
      screenAudio: true,
    };
    saveMediaSettings(custom);
    expect(loadMediaSettings()).toEqual(custom);
  });

  it('sanitizes garbage: unknown ids fall back, screen audio defaults off', () => {
    const storage = memoryStorage();
    storage.setItem(
      'freecord:media-settings',
      JSON.stringify({ mic: { profile: 'loud' }, camera: '8k', screenAudio: 'yes' }),
    );
    vi.stubGlobal('localStorage', storage);
    expect(loadMediaSettings()).toEqual(DEFAULT_MEDIA_SETTINGS);
  });
});

describe('camera presets', () => {
  it('resolves ids and falls back to standard', () => {
    expect(cameraPresetById('high').height).toBe(1080);
    expect(cameraPresetById('unknown' as never).id).toBe('standard');
  });
});
