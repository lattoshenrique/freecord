/**
 * This tool's panel in the shelf: paste a Spotify link, put it on for the
 * room, and line up what comes after.
 *
 * Everything it knows about the room arrives in props (the tool
 * contract); it imports nothing from the app but the contract's types and
 * its own files. It builds its controls out of the shelf's own kit —
 * label, field, actions — and only the queue, which nothing else in the
 * app has, brings styles of its own (shelf.css) under class names of its
 * own.
 *
 * The two lines under the field are not decoration. This tool does not
 * drive anybody's player and cannot promise what Spotify will give each
 * person (index.ts), so it says both things where somebody deciding to
 * use it will read them.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { ToolShelfProps } from '../contract';
import { CloseGlyph, PlayGlyph } from './icons';
import { KindGlyph, kindLabel } from './kinds';
import { parseLink } from './link';
import { enqueue, playAt, removeAt, startWith } from './queue';
import { QUEUE_MAX, type ListenState } from './state';
import './shelf.css';

export default function Shelf({ state, setState, dismiss, t }: ToolShelfProps<ListenState>) {
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

  /**
   * `now` puts it on the room's stage; the default lines it up behind
   * what is already playing, which is the polite thing to do to people
   * halfway through a song.
   */
  function submit(now: boolean): void {
    const item = parseLink(link);
    if (!item) {
      setRejected(true);
      fieldRef.current?.focus();
      return;
    }
    setLink('');
    setRejected(false);
    if (!state || now) {
      setState(startWith(item));
      dismiss();
      return;
    }
    setState(enqueue(state, item));
    // The shelf stays open: lining several things up is one visit.
  }

  const full = (state?.queue.length ?? 0) >= QUEUE_MAX;

  return (
    <>
      <label className="tool-label" htmlFor={fieldId}>
        {state ? t('addLabel') : t('linkLabel')}
      </label>
      {/* A line of its own: a Spotify link is long, and sharing the row
          with a button left it a keyhole to read a link through. */}
      <input
        id={fieldId}
        ref={fieldRef}
        type="url"
        inputMode="url"
        className="tool-field"
        placeholder={t('linkPlaceholder')}
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
            submit(!state);
          }
        }}
      />
      {rejected && (
        <p className="tool-error" id={errorId} role="alert">
          {t('invalid')}
        </p>
      )}
      {full && (
        <p className="tool-error" role="status">
          {t('queueFull', { max: QUEUE_MAX })}
        </p>
      )}
      <div className="tool-actions">
        {state ? (
          <>
            <button
              type="button"
              className="tool-open"
              disabled={!link.trim() || full}
              onClick={() => submit(false)}
            >
              {t('addToQueue')}
            </button>
            <button
              type="button"
              className="tool-stop"
              disabled={!link.trim()}
              onClick={() => submit(true)}
            >
              {t('playNow')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="tool-open"
            disabled={!link.trim()}
            onClick={() => submit(true)}
          >
            {t('open')}
          </button>
        )}
      </div>

      <p className="spotify-note">{t('ownPlay')}</p>
      <p className="spotify-note">{t('account')}</p>

      {state && (
        <>
          <p className="tool-label spotify-queue-label">
            {state.queue.length > 0 ? t('queueTitle', { count: state.queue.length }) : t('queueEmpty')}
          </p>
          {state.queue.length > 0 && (
            <ol className="spotify-queue">
              {state.queue.map((item, index) => (
                <li className="spotify-queue-item" key={`${item.kind}:${item.id}-${index}`}>
                  <span className="spotify-queue-thumb" aria-hidden>
                    <KindGlyph kind={item.kind} />
                  </span>
                  <span className="spotify-queue-text">
                    <span className="spotify-queue-name">{kindLabel(item.kind, t)}</span>
                    {/* No title without Spotify's data API, and this tool
                        asks it nothing (index.ts): the id is what we
                        honestly have. */}
                    <span className="spotify-queue-id">{item.id}</span>
                  </span>
                  <button
                    type="button"
                    className="spotify-queue-key"
                    aria-label={t('playThis')}
                    title={t('playThis')}
                    onClick={() => setState(playAt(state, index))}
                  >
                    <PlayGlyph />
                  </button>
                  <button
                    type="button"
                    className="spotify-queue-key"
                    aria-label={t('removeThis')}
                    title={t('removeThis')}
                    onClick={() => setState(removeAt(state, index))}
                  >
                    <CloseGlyph />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="tool-actions">
            <button
              type="button"
              className="tool-stop"
              onClick={() => {
                setState(null);
                dismiss();
              }}
            >
              {t('closeForAll')}
            </button>
          </div>
        </>
      )}
    </>
  );
}
