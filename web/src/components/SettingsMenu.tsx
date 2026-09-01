/**
 * The dock's settings popover: screen-share preset, computer audio,
 * microphone profile and camera ceiling in one surface (it replaces the
 * old screen-only QualityMenu).
 *
 * Props are deliberately narrow — values in, callbacks out — so this
 * component never depends on the room hook's shape; the wiring in
 * RoomView is owned by the media track.
 */
import { useI18n, type MessageKey } from '../i18n';
import { SCREEN_QUALITY_PRESETS, type ScreenQualityId } from '../lib/screen-quality';
import {
  CAMERA_PRESETS,
  micDefaults,
  type CameraQualityId,
  type MediaSettings,
  type MicProfileId,
} from '../lib/media-settings';
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

export default function SettingsMenu({
  screenQuality,
  onScreenQuality,
  settings,
  onSettings,
  screenAudioSupported,
  onClose,
}: {
  screenQuality: ScreenQualityId;
  onScreenQuality: (id: ScreenQualityId) => void;
  settings: MediaSettings;
  onSettings: (next: MediaSettings) => void;
  /** False where the platform can never deliver it (desktop shell outside Windows). */
  screenAudioSupported: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();

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
      </div>
    </>
  );
}
