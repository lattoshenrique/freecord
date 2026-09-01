/**
 * The dock's settings popover: screen-share preset, computer audio,
 * microphone profile, camera ceiling and audio devices in one surface
 * (it replaces the old screen-only QualityMenu).
 *
 * Props are deliberately narrow — values in, callbacks out — so this
 * component never depends on the room hook's shape; the wiring in
 * RoomView is owned by the media track. The device props are optional:
 * without them the device pickers stay hidden, so the menu works before
 * the session hook learns to switch devices.
 */
import { useEffect, useState } from 'react';
import { useI18n, type MessageKey } from '../i18n';
import { APP_BUILD, APP_VERSION } from '../lib/build-info';
import { SCREEN_QUALITY_PRESETS, type ScreenQualityId } from '../lib/screen-quality';
import {
  CAMERA_PRESETS,
  micDefaults,
  type CameraQualityId,
  type MediaSettings,
  type MicProfileId,
} from '../lib/media-settings';
import {
  listAudioDevices,
  onDeviceChange,
  supportsSpeakerSelection,
  type AudioDeviceLists,
  type AudioDevicePrefs,
} from '../lib/audio-devices';
import './settings-menu.css';

function OptionRow({
  selected,
  label,
  hint,
  onSelect,
}: {
  selected: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={`settings-option ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className="settings-option-label">{label}</span>
      <span className="settings-option-hint">{hint}</span>
    </button>
  );
}

function SwitchRow({
  checked,
  label,
  hint,
  onToggle,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="settings-switch"
      onClick={onToggle}
    >
      <span className="settings-switch-text">
        <span className="settings-option-label">{label}</span>
        {hint && <span className="settings-option-hint">{hint}</span>}
      </span>
      <span className="settings-switch-track" aria-hidden>
        <span className="settings-switch-knob" />
      </span>
    </button>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  defaultLabel,
  fallbackLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  devices: MediaDeviceInfo[];
  defaultLabel: string;
  fallbackLabel: (number: number) => string;
  onChange: (id: string | null) => void;
}) {
  // A saved device that is gone reads as the default instead of a blank box.
  const known = value !== null && devices.some((device) => device.deviceId === value);
  return (
    <label className="settings-device">
      <span className="settings-option-hint">{label}</span>
      <select
        className="settings-device-select"
        value={known ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{defaultLabel}</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || fallbackLabel(index + 1)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SettingsMenu({
  screenQuality,
  onScreenQuality,
  settings,
  onSettings,
  screenAudioSupported,
  audioDevices,
  onAudioDevices,
  onClose,
}: {
  screenQuality: ScreenQualityId;
  onScreenQuality: (id: ScreenQualityId) => void;
  settings: MediaSettings;
  onSettings: (next: MediaSettings) => void;
  /** False where the platform can never deliver it (desktop shell outside Windows). */
  screenAudioSupported: boolean;
  /** Device prefs + callback; omit both to hide the device pickers. */
  audioDevices?: AudioDevicePrefs;
  onAudioDevices?: (next: AudioDevicePrefs) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const deviceControls = audioDevices !== undefined && onAudioDevices !== undefined;
  const [deviceLists, setDeviceLists] = useState<AudioDeviceLists>({ mics: [], speakers: [] });

  // Live list: a headset plugged in mid-call shows up without reopening.
  useEffect(() => {
    if (!deviceControls) {
      return;
    }
    let cancelled = false;
    const refresh = () =>
      void listAudioDevices().then((lists) => {
        if (!cancelled) {
          setDeviceLists(lists);
        }
      });
    refresh();
    const off = onDeviceChange(refresh);
    return () => {
      cancelled = true;
      off();
    };
  }, [deviceControls]);

  const setMicProfile = (profile: MicProfileId) =>
    onSettings({ ...settings, mic: micDefaults(profile) });
  const toggleMicFlag = (
    flag: 'echoCancellation' | 'noiseSuppression' | 'autoGainControl',
  ) => onSettings({ ...settings, mic: { ...settings.mic, [flag]: !settings.mic[flag] } });
  const setCamera = (camera: CameraQualityId) => onSettings({ ...settings, camera });

  return (
    <>
      <button
        type="button"
        className="menu-backdrop"
        aria-label={t('controls.closeMenu')}
        onClick={onClose}
      />
      <div className="settings-menu" role="menu" aria-label={t('settings.title')}>
        <p className="settings-menu-title">{t('settings.title')}</p>

        <section className="settings-section">
          <p className="settings-section-title">{t('quality.title')}</p>
          {SCREEN_QUALITY_PRESETS.map((preset) => (
            <OptionRow
              key={preset.id}
              selected={preset.id === screenQuality}
              label={t(`quality.${preset.id}.label` as MessageKey)}
              hint={t(`quality.${preset.id}.hint` as MessageKey)}
              onSelect={() => onScreenQuality(preset.id)}
            />
          ))}
          {screenAudioSupported && (
            <SwitchRow
              checked={settings.screenAudio}
              label={t('settings.screenAudio.label')}
              hint={t('settings.screenAudio.hint')}
              onToggle={() => onSettings({ ...settings, screenAudio: !settings.screenAudio })}
            />
          )}
        </section>

        <section className="settings-section">
          <p className="settings-section-title">{t('settings.mic.title')}</p>
          {audioDevices && onAudioDevices && (
            <DeviceSelect
              label={t('settings.device.mic')}
              value={audioDevices.micId}
              devices={deviceLists.mics}
              defaultLabel={t('settings.device.default')}
              fallbackLabel={(number) => t('settings.device.mic.fallback', { number })}
              onChange={(micId) => onAudioDevices({ ...audioDevices, micId })}
            />
          )}
          {(['voice', 'music'] as const).map((profile) => (
            <OptionRow
              key={profile}
              selected={settings.mic.profile === profile}
              label={t(`settings.mic.${profile}.label` as MessageKey)}
              hint={t(`settings.mic.${profile}.hint` as MessageKey)}
              onSelect={() => setMicProfile(profile)}
            />
          ))}
          <SwitchRow
            checked={settings.mic.echoCancellation}
            label={t('settings.mic.echoCancellation')}
            onToggle={() => toggleMicFlag('echoCancellation')}
          />
          <SwitchRow
            checked={settings.mic.noiseSuppression}
            label={t('settings.mic.noiseSuppression')}
            onToggle={() => toggleMicFlag('noiseSuppression')}
          />
          <SwitchRow
            checked={settings.mic.autoGainControl}
            label={t('settings.mic.autoGainControl')}
            onToggle={() => toggleMicFlag('autoGainControl')}
          />
        </section>

        <section className="settings-section">
          <p className="settings-section-title">{t('settings.camera.title')}</p>
          {CAMERA_PRESETS.map((preset) => (
            <OptionRow
              key={preset.id}
              selected={preset.id === settings.camera}
              label={t(`settings.camera.${preset.id}.label` as MessageKey)}
              hint={t(`settings.camera.${preset.id}.hint` as MessageKey)}
              onSelect={() => setCamera(preset.id)}
            />
          ))}
        </section>

        {audioDevices && onAudioDevices && supportsSpeakerSelection() && (
          <section className="settings-section">
            <p className="settings-section-title">{t('settings.device.speaker')}</p>
            <DeviceSelect
              label={t('settings.device.speaker')}
              value={audioDevices.speakerId}
              devices={deviceLists.speakers}
              defaultLabel={t('settings.device.default')}
              fallbackLabel={(number) => t('settings.device.speaker.fallback', { number })}
              onChange={(speakerId) => onAudioDevices({ ...audioDevices, speakerId })}
            />
          </section>
        )}

        <p className="settings-build">
          {t('app.buildInfo', { version: APP_VERSION, build: APP_BUILD })}
        </p>
      </div>
    </>
  );
}
