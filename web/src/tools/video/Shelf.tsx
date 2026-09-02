/**
 * This tool's panel in the shelf: paste a page, choose what is in it,
 * play it for the room.
 *
 * The middle step is the whole point and the reason this tool is not the
 * YouTube one. A page is not a video: it may hold three qualities of the
 * same episode, a trailer next to the feature, a player from somewhere
 * else, or nothing at all. Guessing on somebody's behalf gets it wrong
 * in front of everybody, so the guessing is done out loud — every
 * candidate is shown with what it is, where it comes from, and what the
 * room gets if it is picked — and a person chooses.
 *
 * The three things worth saying about a candidate before anyone commits
 * the room to it:
 *
 *   what it is        a file, a stream, Twitch, or the page itself
 *   what it costs     a shared clock, or everybody driving their own
 *   what may go wrong a link signed for one viewer plays for one viewer
 *
 * It is built from the shelf's own kit (tools-menu.css) wherever the kit
 * has a control for it. The candidate list is the exception — a shelf
 * with one tool had no list — so it ships its own, prefixed, in
 * shelf.css.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, lookupSources, type SourceLookup, type VideoCandidate } from '../../api';
import { videoPicker } from '../../lib/desktop';
import type { ToolShelfProps } from '../contract';
import { hostOf, isYouTube, localCandidate } from './local';
import { ClockGlyph, HandGlyph } from './icons';
import { parsePicked } from './picked';
import type { VideoState } from './state';
import './shelf.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'picking' }
  | { kind: 'chose'; lookup: SourceLookup }
  | { kind: 'failed'; message: 'invalidUrl' | 'unreachable' | 'nothingFound' | 'pickNothing' };

export default function Shelf({ state, setState, dismiss, t }: ToolShelfProps<VideoState>) {
  const [link, setLink] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [selected, setSelected] = useState(0);
  const fieldId = useId();
  const errorId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const picker = videoPicker();
  /** A lookup whose answer arrived after somebody moved on is dropped. */
  const attemptRef = useRef(0);

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      attemptRef.current += 1;
    };
  }, []);

  function show(lookup: SourceLookup, attempt: number): void {
    if (attempt !== attemptRef.current) {
      return;
    }
    setSelected(0);
    setPhase(
      lookup.candidates.length > 0 ? { kind: 'chose', lookup } : { kind: 'failed', message: 'nothingFound' },
    );
  }

  async function look(): Promise<void> {
    const attempt = (attemptRef.current += 1);
    // A link that is already a video is answered here, and never leaves
    // this browser (local.ts).
    const mine = localCandidate(link);
    if (mine) {
      show({ url: mine.url, candidates: [mine], empty: false }, attempt);
      return;
    }
    setPhase({ kind: 'looking' });
    try {
      show(await lookupSources(link.trim()), attempt);
    } catch (error) {
      if (attempt !== attemptRef.current) {
        return;
      }
      const code = error instanceof ApiError ? error.code : 'unreachable';
      setPhase({ kind: 'failed', message: code === 'invalid_url' ? 'invalidUrl' : 'unreachable' });
      fieldRef.current?.focus();
    }
  }

  /**
   * The desktop app's way out of a page that only builds its player
   * after a click: open it in a window of its own, let the person press
   * play, and take whatever the page then loads.
   */
  async function pickOnPage(): Promise<void> {
    if (!picker) {
      return;
    }
    const attempt = (attemptRef.current += 1);
    setPhase({ kind: 'picking' });
    try {
      const found = parsePicked(await picker.pick(link.trim()));
      if (attempt !== attemptRef.current) {
        return;
      }
      if (found.length === 0) {
        setPhase({ kind: 'failed', message: 'pickNothing' });
        return;
      }
      show({ url: link.trim(), candidates: found, empty: false }, attempt);
    } catch {
      if (attempt === attemptRef.current) {
        setPhase({ kind: 'failed', message: 'pickNothing' });
      }
    }
  }

  function play(candidate: VideoCandidate, page: string): void {
    const next: VideoState = {
      play: candidate.play,
      url: candidate.url,
      live: candidate.live === true || candidate.play === 'frame',
      playing: true,
      time: 0,
    };
    if (candidate.twitch) {
      next.twitch = candidate.twitch;
    }
    if (candidate.title) {
      next.title = candidate.title;
    }
    // Where it came from, so the stage can offer a way back to it — but
    // never the media URL twice over.
    if (page && page !== candidate.url) {
      next.page = page;
    }
    setState(next);
    setLink('');
    setPhase({ kind: 'idle' });
    dismiss();
  }

  const chosen = phase.kind === 'chose' ? phase.lookup.candidates[selected] : undefined;
  const busy = phase.kind === 'looking' || phase.kind === 'picking';

  return (
    <>
      <label className="tool-label" htmlFor={fieldId}>
        {state ? t('replaceLabel') : t('linkLabel')}
      </label>
      <input
        id={fieldId}
        ref={fieldRef}
        type="url"
        inputMode="url"
        className="tool-field"
        placeholder={t('linkPlaceholder')}
        value={link}
        aria-invalid={phase.kind === 'failed' || undefined}
        aria-describedby={phase.kind === 'failed' ? errorId : undefined}
        onChange={(event) => {
          setLink(event.target.value);
          if (phase.kind !== 'idle') {
            setPhase({ kind: 'idle' });
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void look();
          }
        }}
      />

      {phase.kind === 'idle' && !link.trim() && <p className="tool-note">{t('lookupNote')}</p>}

      {busy && (
        <p className="tool-note video-busy" role="status">
          {t(phase.kind === 'looking' ? 'looking' : 'picking')}
        </p>
      )}

      {phase.kind === 'failed' && (
        <p className="tool-error" id={errorId} role="alert">
          {t(phase.message)}
        </p>
      )}

      {phase.kind === 'chose' && (
        <>
          <p className="tool-label">{t('chooseLabel')}</p>
          <ul className="video-options">
            {phase.lookup.candidates.map((candidate, index) => (
              <li key={`${candidate.play}:${candidate.url}`}>
                <Option
                  candidate={candidate}
                  checked={index === selected}
                  name={fieldId}
                  onSelect={() => setSelected(index)}
                  t={t}
                />
              </li>
            ))}
          </ul>
          {chosen?.personal && <p className="video-warn">{t('personal')}</p>}
          {chosen && isYouTube(chosen.url) && <p className="tool-note">{t('youtubeHint')}</p>}
        </>
      )}

      <div className="tool-actions">
        {phase.kind === 'chose' && chosen ? (
          <button
            type="button"
            className="tool-open"
            onClick={() => play(chosen, phase.lookup.url)}
          >
            {t('open')}
          </button>
        ) : (
          <button
            type="button"
            className="tool-open"
            disabled={!link.trim() || busy}
            onClick={() => void look()}
          >
            {t('find')}
          </button>
        )}
        {/* Only where there is a shell to open a window: in a browser
            this button would be a promise nobody can keep. */}
        {picker && link.trim() && phase.kind !== 'chose' && (
          <button type="button" className="tool-stop" disabled={busy} onClick={() => void pickOnPage()}>
            {t('pickOnPage')}
          </button>
        )}
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
      {picker && phase.kind !== 'chose' && <p className="tool-note">{t('pickHint')}</p>}
    </>
  );
}

/** One thing the room could watch, with everything needed to choose it. */
function Option({
  candidate,
  checked,
  name,
  onSelect,
  t,
}: {
  candidate: VideoCandidate;
  checked: boolean;
  name: string;
  onSelect: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  // A frame is two different things wearing one word: the page somebody
  // pasted, and a player embedded inside it. Three rows all reading "the
  // page itself" is a choice nobody can make.
  const kind =
    candidate.play === 'frame' && candidate.found === 'embed'
      ? 'kindEmbed'
      : {
          file: 'kindFile',
          hls: 'kindHls',
          dash: 'kindDash',
          twitch: 'kindTwitch',
          frame: 'kindFrame',
        }[candidate.play];
  const shared = candidate.play !== 'frame' && !candidate.live;
  return (
    <label className={`video-option${checked ? ' is-chosen' : ''}`}>
      <input
        type="radio"
        name={`${name}-source`}
        checked={checked}
        onChange={onSelect}
        className="video-radio"
      />
      <span className="video-option-body">
        <span className="video-option-head">
          <span className="video-kind">{t(kind)}</span>
          {candidate.label && <span className="video-quality">{candidate.label}</span>}
          {candidate.live && <span className="video-live">{t('live')}</span>}
        </span>
        <span className="video-option-meta">
          <span className="video-host">
            {t(candidate.via ? 'via' : 'source', { host: candidate.via ?? hostOf(candidate.url) })}
          </span>
          {/* What the room actually gets. The one thing somebody would
              otherwise only learn after committing everybody to it. */}
          <span className="video-sync">
            {shared ? <ClockGlyph /> : <HandGlyph />}
            {t(shared ? 'sharedClock' : 'ownClock')}
          </span>
        </span>
      </span>
    </label>
  );
}
