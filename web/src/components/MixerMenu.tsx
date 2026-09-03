/**
 * The mixer: one knob for each thing in the room that makes a sound.
 *
 * The speaker key already answers "I do not want to hear any of this".
 * What it cannot answer is the far more common complaint — one person's
 * microphone is twice everyone else's, a shared game drowns the people
 * watching it, the video is louder than the conversation about it — and
 * turning the whole room down to fix one of them is how a call ends up
 * with nobody able to hear anybody.
 *
 * So: a list, in the order the room already reads in — people, then what
 * they are sharing, then what the shelf has playing. A row for a source
 * that is not making a sound is still worth drawing (somebody who is
 * silent now will not be later), but a row for a source that is not
 * THERE is noise, so screens without audio and tools that are off are
 * simply absent.
 *
 * Nothing here is sent anywhere. The levels are this viewer's own, held
 * in audio-mix.ts, and the panel is a view onto that store — which is
 * also why a tool's level does not go through the tool contract: that is
 * shared state, and one person dragging a slider must not move the video
 * for everybody.
 */
import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { maxMixLevelFor, mixKey, useAudioMix, type MixKey } from '../lib/audio-mix';
import { unlockPlaybackAmplifier } from '../lib/playback-gain';
import { toolText, type RegisteredTool } from '../tools/contract';
import { CloseIcon, ScreenIcon, SpeakerIcon, SpeakerOffIcon } from './icons';
import './mixer-menu.css';

/** A row, whatever kind of thing it stands for. */
interface Source {
  key: MixKey;
  name: string;
  icon: React.ReactNode;
}

function Row({ source, deafened }: { source: Source; deafened: boolean }) {
  const { t } = useI18n();
  const mix = useAudioMix();
  const level = mix.get(source.key);
  const percent = Math.round((level.muted ? 0 : level.level) * 100);
  const maxLevel = maxMixLevelFor(source.key);
  return (
    <div className="mixer-row">
      <span className="mixer-icon" aria-hidden>
        {source.icon}
      </span>
      <span className="mixer-name" title={source.name}>
        {source.name}
      </span>
      <button
        type="button"
        className={`mixer-mute ${level.muted ? 'muted' : ''}`}
        role="switch"
        aria-checked={level.muted}
        aria-label={
          level.muted
            ? t('mixer.unmuteOne', { name: source.name })
            : t('mixer.muteOne', { name: source.name })
        }
        title={level.muted ? t('mixer.unmute') : t('mixer.mute')}
        onClick={() => mix.toggleMuted(source.key)}
      >
        {level.muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
      </button>
      <input
        className="mixer-slider"
        type="range"
        min={0}
        max={maxLevel * 100}
        step={1}
        value={percent}
        aria-label={t('mixer.levelOf', { name: source.name })}
        // The room's own speakers being off does not erase this person's
        // level; it just means nothing is coming out right now, and the
        // control says so rather than pretending it was never set.
        disabled={deafened}
        onChange={(event) => {
          const next = Number(event.target.value) / 100;
          if (next > 1) {
            unlockPlaybackAmplifier();
          }
          mix.setLevel(source.key, next);
        }}
      />
      <span className="mixer-value">{percent}%</span>
    </div>
  );
}

export default function MixerMenu({
  peers,
  screens,
  tools,
  speakerOn,
  onDismiss,
  leaving,
}: {
  /** Everyone else in the room, in the order the room lists them. */
  peers: readonly { id: string; name: string }[];
  /** Screen shares that actually carry sound, by whose they are. */
  screens: readonly { id: string; name: string }[];
  /** Tools the room has playing right now. */
  tools: readonly RegisteredTool[];
  speakerOn: boolean;
  onDismiss: () => void;
  /** On its way out: drawn for the length of the animation, and inert. */
  leaving?: boolean;
}) {
  const { t, locale } = useI18n();
  useAudioMix();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const sources: Source[] = [
    ...peers.map((peer) => ({
      key: mixKey('person', peer.id),
      name: peer.name,
      icon: <SpeakerIcon />,
    })),
    ...screens.map((screen) => ({
      key: mixKey('screen', screen.id),
      name: t('mixer.screenOf', { name: screen.name }),
      icon: <ScreenIcon />,
    })),
    ...tools.map((tool) => ({
      key: mixKey('tool', tool.id),
      name: toolText(tool, locale)('name'),
      icon: <tool.Icon />,
    })),
  ];
  return (
    <>
      {/* Anywhere else on the page closes it — a catcher, not a control. */}
      <div
        className="menu-backdrop"
        data-leaving={leaving ? 'true' : undefined}
        aria-hidden
        onClick={onDismiss}
      />
      <div
        className="mixer-menu"
        role="dialog"
        aria-label={t('mixer.title')}
        data-leaving={leaving ? 'true' : undefined}
      >
        <header className="mixer-header">
          <h2 className="mixer-title">{t('mixer.title')}</h2>
          <button
            type="button"
            className="mixer-close"
            aria-label={t('controls.closeMenu')}
            onClick={onDismiss}
          >
            <CloseIcon />
          </button>
        </header>
        {sources.length === 0 ? (
          <p className="mixer-empty">{t('mixer.empty')}</p>
        ) : (
          <div className="mixer-list">
            {sources.map((source) => (
              <Row key={source.key} source={source} deafened={!speakerOn} />
            ))}
          </div>
        )}
        {!speakerOn && (
          <p className="mixer-note" role="status">
            {t('mixer.deafened')}
          </p>
        )}
        {speakerOn && sources.length > 0 && <p className="mixer-note">{t('mixer.private')}</p>}
      </div>
    </>
  );
}
