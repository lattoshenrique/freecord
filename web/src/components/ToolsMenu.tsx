/**
 * The tool shelf: what a room can bring in besides the people in it.
 *
 * One tool today — watching a YouTube video together — and the shelf is
 * built as a list rather than a single button so the second one costs a
 * row, not a redesign. A tool is room state, never a private window: what
 * this menu does, it does for everybody.
 *
 * It hangs off the footer instead of the glass dock (which clips its own
 * children) and closes on Escape, on the backdrop, and on opening.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { WatchRoom } from '../lib/use-room';
import { parseVideo } from '../lib/youtube';
import { CloseIcon, YouTubeIcon } from './icons';
import './tools-menu.css';

export default function ToolsMenu({
  watch,
  onOpenVideo,
  onCloseVideo,
  onDismiss,
}: {
  /** What the room is watching, if anything — the shelf shows the tool in use. */
  watch: WatchRoom | null;
  onOpenVideo: (video: string, start: number) => void;
  onCloseVideo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState('');
  const [rejected, setRejected] = useState(false);
  const fieldId = useId();
  const errorId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The field is the only thing here to type into; landing on it saves
    // the paste a tab press.
    fieldRef.current?.focus();
  }, []);

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

  function submit(): void {
    const parsed = parseVideo(link);
    if (!parsed) {
      setRejected(true);
      fieldRef.current?.focus();
      return;
    }
    onOpenVideo(parsed.video, parsed.start);
    setLink('');
    setRejected(false);
    onDismiss();
  }

  return (
    <>
      {/*
        Anywhere else on the page closes the shelf. A click catcher, not a
        control: the keyboard closes it with Escape or the key beside the
        title, and a second "close menu" in the tree only makes those two
        harder to tell apart.
      */}
      <div className="menu-backdrop" aria-hidden onClick={onDismiss} />
      <div className="tools-menu" role="dialog" aria-label={t('tools.title')}>
        <header className="tools-header">
          <h2 className="tools-title">{t('tools.title')}</h2>
          <button
            type="button"
            className="tools-close"
            aria-label={t('controls.closeMenu')}
            onClick={onDismiss}
          >
            <CloseIcon />
          </button>
        </header>

        <section className="tool-card">
          <div className="tool-head">
            <span className="tool-icon" aria-hidden>
              <YouTubeIcon />
            </span>
            <span className="tool-text">
              <span className="tool-name">{t('tools.youtube')}</span>
              <span className="tool-hint">{t('tools.youtubeHint')}</span>
            </span>
          </div>

          <label className="tool-label" htmlFor={fieldId}>
            {watch ? t('watch.replaceLabel') : t('watch.linkLabel')}
          </label>
          <div className="tool-row">
            <input
              id={fieldId}
              ref={fieldRef}
              type="url"
              inputMode="url"
              className="tool-field"
              placeholder={t('watch.linkPlaceholder')}
              value={link}
              aria-invalid={rejected || undefined}
              aria-describedby={rejected ? errorId : undefined}
              onChange={(event) => {
                setLink(event.target.value);
                setRejected(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button type="button" className="tool-open" disabled={!link.trim()} onClick={submit}>
              {t('watch.open')}
            </button>
          </div>
          {rejected && (
            <p className="tool-error" id={errorId} role="alert">
              {t('watch.invalid')}
            </p>
          )}

          {watch && (
            <button
              type="button"
              className="tool-stop"
              onClick={() => {
                onCloseVideo();
                onDismiss();
              }}
            >
              {t('watch.closeForAll')}
            </button>
          )}
        </section>
      </div>
    </>
  );
}
