/**
 * This tool's panel in the shelf: paste a link, play it for the room.
 *
 * Everything it knows about the room arrives in props (the tool
 * contract); it imports nothing from the app but the contract's types and
 * its own files, which is what makes it a worked example of a tool that
 * could live outside this repository.
 *
 * It also builds itself out of the shelf's own kit — label, field,
 * actions — rather than styling anything of its own, which is the other
 * half of that example: a tool decides what its controls are, and the
 * shelf decides what they look like.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { ToolShelfProps } from '../contract';
import { parseVideo } from './player';
import type { WatchState } from './state';

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

  function submit(): void {
    const parsed = parseVideo(link);
    if (!parsed) {
      setRejected(true);
      fieldRef.current?.focus();
      return;
    }
    setState({ video: parsed.video, playing: true, time: parsed.start });
    setLink('');
    setRejected(false);
    dismiss();
  }

  return (
    <>
      <label className="tool-label" htmlFor={fieldId}>
        {state ? t('replaceLabel') : t('linkLabel')}
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
            submit();
          }
        }}
      />
      {rejected && (
        <p className="tool-error" id={errorId} role="alert">
          {t('invalid')}
        </p>
      )}
      <div className="tool-actions">
        <button type="button" className="tool-open" disabled={!link.trim()} onClick={submit}>
          {t('open')}
        </button>
        {state && (
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
        )}
      </div>
    </>
  );
}
