/**
 * This tool's panel in the shelf: paste a link, play it for the room, and
 * line up what comes after.
 *
 * Everything it knows about the room arrives in props (the tool
 * contract); it imports nothing from the app but the contract's types and
 * its own files, which is what makes it a worked example of a tool that
 * could live outside this repository.
 *
 * It builds its controls out of the shelf's own kit — label, field,
 * actions — and only its queue, which nothing else in the app has, brings
 * styles of its own (shelf.css), under class names of its own.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { ToolShelfProps } from '../contract';
import { CloseGlyph, ListGlyph, PlayGlyph } from './icons';
import { parseLink } from './player';
import { advance, enqueue, playAt, removeAt, startWith } from './queue';
import { QUEUE_MAX, type WatchItem, type WatchState } from './state';
import './shelf.css';

export default function Shelf({ state, setState, dismiss, t }: ToolShelfProps<WatchState>) {
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
   * `now` puts it on the stage and pushes what was playing aside; the
   * default lines it up behind what the room is already watching, which
   * is the polite thing to do to people mid-video.
   */
  function submit(now: boolean): void {
    const parsed = parseLink(link);
    if (!parsed) {
      setRejected(true);
      fieldRef.current?.focus();
      return;
    }
    setLink('');
    setRejected(false);
    // The moment a link points at travels with it, whether it goes on now
    // or waits its turn.
    const item =
      parsed.item.kind === 'video' && parsed.start > 0
        ? { ...parsed.item, start: parsed.start }
        : parsed.item;
    if (!state || now) {
      setState(startWith(item, parsed.start));
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
      {/* A line of its own: a YouTube URL is long, and sharing the row
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

      {state && (
        <>
          <p className="tool-label youtube-queue-label">
            {state.queue.length > 0 ? t('queueTitle', { count: state.queue.length }) : t('queueEmpty')}
          </p>
          {state.queue.length > 0 && (
            <ol className="youtube-queue">
              {state.queue.map((item, index) => (
                <li className="youtube-queue-item" key={`${keyOf(item)}-${index}`}>
                  <Thumb item={item} alt={t('thumbAlt')} />
                  <span className="youtube-queue-text">
                    <span className="youtube-queue-name">{labelOf(item, t)}</span>
                    {/* No title without YouTube's data API, and we are not
                        asking anyone for a key: the id is what we honestly
                        have, and the thumbnail is what makes it readable. */}
                    <span className="youtube-queue-id">{idOf(item)}</span>
                  </span>
                  <button
                    type="button"
                    className="youtube-queue-key"
                    aria-label={t('playThis')}
                    title={t('playThis')}
                    onClick={() => setState(playAt(state, index))}
                  >
                    <PlayGlyph />
                  </button>
                  <button
                    type="button"
                    className="youtube-queue-key"
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
            {state.queue.length > 0 && (
              <button type="button" className="tool-stop" onClick={() => setState(advance(state))}>
                {t('skip')}
              </button>
            )}
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

function keyOf(item: WatchItem): string {
  return item.kind === 'video' ? item.video : item.list;
}

function idOf(item: WatchItem): string {
  return keyOf(item);
}

function labelOf(item: WatchItem, t: (key: string) => string): string {
  return item.kind === 'video' ? t('itemVideo') : t('itemList');
}

/**
 * YouTube's own thumbnail for a video. No API and no key: it is a plain
 * image URL from the same vendor whose player is already embedded three
 * lines away. A playlist has no such image, so it gets a glyph.
 */
function Thumb({ item, alt }: { item: WatchItem; alt: string }) {
  if (item.kind === 'list') {
    return (
      <span className="youtube-queue-thumb youtube-queue-thumb-list" aria-hidden>
        <ListGlyph />
      </span>
    );
  }
  return (
    <img
      className="youtube-queue-thumb"
      src={`https://i.ytimg.com/vi/${item.video}/default.jpg`}
      alt={alt}
      loading="lazy"
      width={64}
      height={36}
    />
  );
}
