/**
 * Audio device choice: which microphone to capture and where to play the
 * room. Kept apart from media-settings.ts on purpose — device ids are
 * per-machine state (they mean nothing on another computer), while the
 * quality settings describe intent that travels with the user.
 *
 * Everything degrades to the system default: a saved device that was
 * unplugged, a browser without setSinkId (Safari), or no permission yet
 * all fall back instead of failing the call.
 */

export interface AudioDevicePrefs {
  /** getUserMedia deviceId for the microphone; null = system default. */
  micId: string | null;
  /** setSinkId target for playback; null = system default. */
  speakerId: string | null;
}

export const DEFAULT_AUDIO_DEVICES: AudioDevicePrefs = { micId: null, speakerId: null };

const STORAGE_KEY = 'freecord:audio-devices';

function sanitizeId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function loadAudioDevicePrefs(): AudioDevicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AUDIO_DEVICES;
    }
    const parsed = JSON.parse(raw) as Partial<AudioDevicePrefs>;
    return { micId: sanitizeId(parsed.micId), speakerId: sanitizeId(parsed.speakerId) };
  } catch {
    return DEFAULT_AUDIO_DEVICES;
  }
}

export function saveAudioDevicePrefs(prefs: AudioDevicePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // private browsing: the choice lasts only this session
  }
}

export interface AudioDeviceLists {
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

function deviceSource(mediaDevices?: MediaDevices): MediaDevices | undefined {
  return (
    mediaDevices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined)
  );
}

/**
 * Enumerates audio devices. Labels are empty until a getUserMedia
 * permission is granted — in the room that has already happened, so the
 * menu normally sees real names; the UI still needs a numbered fallback.
 */
export async function listAudioDevices(mediaDevices?: MediaDevices): Promise<AudioDeviceLists> {
  const source = deviceSource(mediaDevices);
  if (!source?.enumerateDevices) {
    return { mics: [], speakers: [] };
  }
  try {
    const devices = await source.enumerateDevices();
    return {
      mics: devices.filter((device) => device.kind === 'audioinput'),
      speakers: devices.filter((device) => device.kind === 'audiooutput'),
    };
  } catch {
    return { mics: [], speakers: [] };
  }
}

/** Fires when devices come and go (headset plugged in); returns the unsubscribe. */
export function onDeviceChange(listener: () => void, mediaDevices?: MediaDevices): () => void {
  const source = deviceSource(mediaDevices);
  if (!source?.addEventListener) {
    return () => {};
  }
  source.addEventListener('devicechange', listener);
  return () => source.removeEventListener('devicechange', listener);
}

/** True where the browser can route playback at all — Safari has no setSinkId. */
export function supportsSpeakerSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/**
 * Routes one media element's playback ('' = system default). Applies to
 * <audio> sinks AND the <video> tiles — remote cameras play their audio
 * through the video element. Returns whether the element now points at
 * the requested device. lib.dom types setSinkId as always present, but
 * Safari's runtime still lacks it — hence the lookup.
 */
export async function applySinkId(
  element: HTMLMediaElement,
  speakerId: string | null,
): Promise<boolean> {
  const setSink = (element as { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (typeof setSink !== 'function') {
    return speakerId === null;
  }
  try {
    await setSink.call(element, speakerId ?? '');
    return true;
  } catch {
    // device unplugged or permission refused: playback stays where it was
    return false;
  }
}

/**
 * Mic constraint for the chosen device. Joining prefers it loosely (a
 * missing device must never block entering the room); an explicit switch
 * in the menu asks strictly, so failure is visible and can revert.
 */
export function micDeviceConstraint(micId: string | null, strict: boolean): MediaTrackConstraints {
  if (!micId) {
    return {};
  }
  return { deviceId: strict ? { exact: micId } : { ideal: micId } };
}
