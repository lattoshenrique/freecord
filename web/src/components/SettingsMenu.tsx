/**
 * The call settings dialog: a centred modal with a section rail on the
 * left (screen share, audio, video, general) and one section's controls
 * on the right. It replaced the dock popover that stacked every option
 * in a single scrolling column; the rail is what keeps the surface
 * legible now that it also carries the language choice and device
 * pickers.
 *
 * Props are deliberately narrow — values in, callbacks out — so this
 * component never depends on the room hook's shape; the wiring in
 * RoomView is owned by the media track. The device props are optional:
 * without them the device pickers stay hidden, so the dialog works before
 * the session hook learns to switch devices.
 *
 * It renders through a portal onto <body>: the dock lives inside a footer
 * whose stacking context the chat panel would otherwise draw over.
 */
import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LOCALES, useI18n, type MessageKey } from '../i18n';
import { APP_BUILD, APP_VERSION } from '../lib/build-info';
import { setSoundEffectsEnabled, soundEffectsEnabled } from '../lib/notification-sound';
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
import { CamIcon, CloseIcon, DownloadIcon, MicIcon, ScreenIcon, SlidersIcon } from './icons';
import { useDesktopDownload } from './DownloadCard';
import './settings-menu.css';

type SectionId = 'screen' | 'audio' | 'video' | 'general';

/** Product names, not translatable text. */
const OS_LABEL = { mac: 'macOS', windows: 'Windows', linux: 'Linux' } as const;

const SECTIONS: { id: SectionId; icon: ComponentType }[] = [
  { id: 'screen', icon: ScreenIcon },
  { id: 'audio', icon: MicIcon },
  { id: 'video', icon: CamIcon },
  { id: 'general', icon: SlidersIcon },
];

const FOCUSABLE =
  'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
      role="radio"
      aria-checked={selected}
      className={`settings-option ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className="settings-option-mark" aria-hidden />
      <span className="settings-option-text">
        <span className="settings-option-label">{label}</span>
        <span className="settings-option-hint">{hint}</span>
      </span>
    </button>
  );
}

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-options" role="radiogroup" aria-label={label}>
      {children}
    </div>
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

function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="settings-field">
      {(label || hint) && (
        <span className="settings-field-text">
          {label && <span className="settings-option-label">{label}</span>}
          {hint && <span className="settings-option-hint">{hint}</span>}
        </span>
      )}
      {children}
    </label>
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
    <Field label={label}>
      <select
        className="settings-select"
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
    </Field>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">{title}</h3>
      {children}
    </section>
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
  const { t, locale, setLocale } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SectionId>('screen');
  // Mirrors the persisted switch so the row re-renders; the module is the
  // source of truth the chimes read from.
  const [sounds, setSounds] = useState(soundEffectsEnabled);
  // Null inside the desktop app or with nothing published: the group hides.
  const desktop = useDesktopDownload();
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

  // Modal manners: focus moves in on open and back to the opener on close,
  // Escape closes, Tab cycles inside the dialog instead of into the stage.
  // The room passes a fresh onClose per render; the ref keeps this effect
  // to one run, so focus is captured once on open and restored once.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, []);

  const setMicProfile = (profile: MicProfileId) =>
    onSettings({ ...settings, mic: micDefaults(profile) });
  const toggleMicFlag = (
    flag: 'echoCancellation' | 'noiseSuppression' | 'autoGainControl',
  ) => onSettings({ ...settings, mic: { ...settings.mic, [flag]: !settings.mic[flag] } });
  const setCamera = (camera: CameraQualityId) => onSettings({ ...settings, camera });

  const panel = (() => {
    switch (section) {
      case 'screen':
        return (
          <>
            <Group title={t('quality.title')}>
              <OptionGroup label={t('quality.title')}>
                {SCREEN_QUALITY_PRESETS.map((preset) => (
                  <OptionRow
                    key={preset.id}
                    selected={preset.id === screenQuality}
                    label={t(`quality.${preset.id}.label` as MessageKey)}
                    hint={t(`quality.${preset.id}.hint` as MessageKey)}
                    onSelect={() => onScreenQuality(preset.id)}
                  />
                ))}
              </OptionGroup>
            </Group>
            {screenAudioSupported && (
              <Group title={t('settings.screenAudio.title')}>
                <SwitchRow
                  checked={settings.screenAudio}
                  label={t('settings.screenAudio.label')}
                  hint={t('settings.screenAudio.hint')}
                  onToggle={() => onSettings({ ...settings, screenAudio: !settings.screenAudio })}
                />
              </Group>
            )}
          </>
        );
      case 'audio':
        return (
          <>
            <Group title={t('settings.mic.title')}>
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
              <OptionGroup label={t('settings.mic.profile')}>
                {(['voice', 'music'] as const).map((profile) => (
                  <OptionRow
                    key={profile}
                    selected={settings.mic.profile === profile}
                    label={t(`settings.mic.${profile}.label` as MessageKey)}
                    hint={t(`settings.mic.${profile}.hint` as MessageKey)}
                    onSelect={() => setMicProfile(profile)}
                  />
                ))}
              </OptionGroup>
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
            </Group>
            {audioDevices && onAudioDevices && supportsSpeakerSelection() && (
              <Group title={t('settings.device.speaker')}>
                <DeviceSelect
                  label={t('settings.device.speaker')}
                  value={audioDevices.speakerId}
                  devices={deviceLists.speakers}
                  defaultLabel={t('settings.device.default')}
                  fallbackLabel={(number) => t('settings.device.speaker.fallback', { number })}
                  onChange={(speakerId) => onAudioDevices({ ...audioDevices, speakerId })}
                />
              </Group>
            )}
          </>
        );
      case 'video':
        return (
          <Group title={t('settings.camera.title')}>
            <OptionGroup label={t('settings.camera.title')}>
              {CAMERA_PRESETS.map((preset) => (
                <OptionRow
                  key={preset.id}
                  selected={preset.id === settings.camera}
                  label={t(`settings.camera.${preset.id}.label` as MessageKey)}
                  hint={t(`settings.camera.${preset.id}.hint` as MessageKey)}
                  onSelect={() => setCamera(preset.id)}
                />
              ))}
            </OptionGroup>
          </Group>
        );
      case 'general':
        return (
          <>
            <Group title={t('language.picker')}>
              {/* The group title already says "Language"; the select carries
                  it for screen readers and the hint sits above the box. */}
              <Field hint={t('settings.language.hint')}>
                <select
                  className="settings-select"
                  aria-label={t('language.picker')}
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as typeof locale)}
                >
                  {LOCALES.map(({ id, label }) => (
                    <option key={id} value={id} lang={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </Group>
            <Group title={t('settings.sounds.title')}>
              <SwitchRow
                checked={sounds}
                label={t('settings.sounds.label')}
                hint={t('settings.sounds.hint')}
                onToggle={() => {
                  setSoundEffectsEnabled(!sounds);
                  setSounds(!sounds);
                }}
              />
            </Group>
            {desktop && (
              <Group title={t('settings.desktop.title')}>
                <Field hint={t('settings.desktop.hint')}>
                  {desktop.pick ? (
                    <a className="settings-action" href={desktop.pick.url}>
                      <DownloadIcon />
                      <span>{t('download.cta', { os: OS_LABEL[desktop.pick.os] })}</span>
                    </a>
                  ) : (
                    // A phone or a guess: the list, in a tab of its own so
                    // the call stays where it is.
                    <a
                      className="settings-action"
                      href="/community"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <DownloadIcon />
                      <span>{t('home.footer.downloads')}</span>
                    </a>
                  )}
                </Field>
              </Group>
            )}
            <Group title={t('settings.about.title')}>
              <p className="settings-build">
                {t('app.buildInfo', { version: APP_VERSION, build: APP_BUILD })}
              </p>
            </Group>
          </>
        );
    }
  })();

  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <h2 id={titleId} className="settings-title">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            className="settings-close"
            aria-label={t('settings.close')}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <nav className="settings-rail" aria-label={t('settings.title')}>
          <div role="tablist" aria-orientation="vertical" className="settings-tabs">
            {SECTIONS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${titleId}-tab-${id}`}
                aria-selected={section === id}
                aria-controls={`${titleId}-panel-${id}`}
                className={`settings-tab ${section === id ? 'selected' : ''}`}
                onClick={() => setSection(id)}
              >
                <Icon />
                <span>{t(`settings.tab.${id}` as MessageKey)}</span>
              </button>
            ))}
          </div>
        </nav>

        <div
          key={section}
          id={`${titleId}-panel-${section}`}
          role="tabpanel"
          aria-labelledby={`${titleId}-tab-${section}`}
          className="settings-panel"
        >
          {panel}
        </div>
      </div>
    </div>,
    document.body,
  );
}
