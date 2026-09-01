import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUDIO_DEVICES,
  applySinkId,
  listAudioDevices,
  loadAudioDevicePrefs,
  micDeviceConstraint,
  onDeviceChange,
  saveAudioDevicePrefs,
  supportsSpeakerSelection,
} from '../src/lib/audio-devices';

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

function device(kind: MediaDeviceKind, deviceId: string): MediaDeviceInfo {
  return { kind, deviceId, label: '', groupId: '', toJSON: () => ({}) } as MediaDeviceInfo;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistence', () => {
  it('defaults without storage and sanitizes garbage', () => {
    expect(loadAudioDevicePrefs()).toEqual(DEFAULT_AUDIO_DEVICES);
    const storage = memoryStorage();
    storage.setItem('freecord:audio-devices', JSON.stringify({ micId: 42, speakerId: '' }));
    vi.stubGlobal('localStorage', storage);
    expect(loadAudioDevicePrefs()).toEqual(DEFAULT_AUDIO_DEVICES);
  });

  it('round-trips through storage', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    saveAudioDevicePrefs({ micId: 'mic-1', speakerId: null });
    expect(loadAudioDevicePrefs()).toEqual({ micId: 'mic-1', speakerId: null });
  });
});

describe('listAudioDevices', () => {
  it('splits inputs from outputs and drops video devices', async () => {
    const fake = {
      enumerateDevices: async () => [
        device('audioinput', 'mic-1'),
        device('videoinput', 'cam-1'),
        device('audiooutput', 'out-1'),
        device('audiooutput', 'out-2'),
      ],
    } as MediaDevices;
    const lists = await listAudioDevices(fake);
    expect(lists.mics.map((d) => d.deviceId)).toEqual(['mic-1']);
    expect(lists.speakers.map((d) => d.deviceId)).toEqual(['out-1', 'out-2']);
  });

  it('returns empty lists where enumeration is missing or throws', async () => {
    expect(await listAudioDevices(undefined)).toEqual({ mics: [], speakers: [] });
    const broken = {
      enumerateDevices: async () => {
        throw new Error('denied');
      },
    } as MediaDevices;
    expect(await listAudioDevices(broken)).toEqual({ mics: [], speakers: [] });
  });
});

describe('onDeviceChange', () => {
  it('subscribes and unsubscribes on the source', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const fake = {
      addEventListener: (type: string) => added.push(type),
      removeEventListener: (type: string) => removed.push(type),
    } as unknown as MediaDevices;
    const off = onDeviceChange(() => {}, fake);
    expect(added).toEqual(['devicechange']);
    off();
    expect(removed).toEqual(['devicechange']);
  });

  it('is a no-op without a source', () => {
    expect(() => onDeviceChange(() => {}, undefined)()).not.toThrow();
  });
});

describe('applySinkId', () => {
  it('routes to the device, and to the default with null', async () => {
    const calls: string[] = [];
    const element = {
      setSinkId: async (id: string) => void calls.push(id),
    } as unknown as HTMLMediaElement;
    expect(await applySinkId(element, 'out-1')).toBe(true);
    expect(await applySinkId(element, null)).toBe(true);
    expect(calls).toEqual(['out-1', '']);
  });

  it('without setSinkId only the default claim holds (Safari)', async () => {
    const element = {} as HTMLMediaElement;
    expect(await applySinkId(element, null)).toBe(true);
    expect(await applySinkId(element, 'out-1')).toBe(false);
  });

  it('reports failure when the sink rejects (device unplugged)', async () => {
    const element = {
      setSinkId: async () => {
        throw new Error('gone');
      },
    } as unknown as HTMLMediaElement;
    expect(await applySinkId(element, 'out-1')).toBe(false);
  });
});

describe('micDeviceConstraint', () => {
  it('is empty for the default device', () => {
    expect(micDeviceConstraint(null, false)).toEqual({});
  });

  it('joins loosely, switches strictly', () => {
    expect(micDeviceConstraint('mic-1', false)).toEqual({ deviceId: { ideal: 'mic-1' } });
    expect(micDeviceConstraint('mic-1', true)).toEqual({ deviceId: { exact: 'mic-1' } });
  });
});

describe('supportsSpeakerSelection', () => {
  it('is false without an HTMLMediaElement (node)', () => {
    expect(supportsSpeakerSelection()).toBe(false);
  });
});
