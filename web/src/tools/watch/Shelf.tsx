/**
 * This tool's panel in the shelf: paste a link, play it for the room, and
 * line up what comes after.
 *
 * One field takes everything, and what happens next depends on what the
 * link turns out to be — which is the whole reason this used to be two
 * tools and is now one. A YouTube link, or a link that is already a video
 * (an `.m3u8`, an mp4, a Twitch channel), is recognised here and never
 * leaves the browser: paste, press Enter, done. Anything else is a PAGE,
 * and a page is not a video — it may hold three qualities of the same
 * episode, a trailer next to the feature, a player from somewhere else,
 * or nothing at all. Guessing on somebody's behalf gets it wrong in front
 * of everybody, so that guessing is done out loud: the page is read once,
 * every candidate is shown with what it is and what the room gets, and a
 * person chooses.
 *
 * The three things worth saying about a candidate before anyone commits
 * the room to it:
 *
 *   what it is        YouTube, a file, a stream, Twitch, or the page
 *   what it costs     a shared clock, or everybody driving their own
 *   what may go wrong a link signed for one viewer plays for one viewer
 *
 * It is built from the shelf's own kit (tools-menu.css) wherever the kit
 * has a control for it. The candidate list and the queue are the two
 * things the kit has no opinion about, so they ship here, prefixed, in
 * shelf.css.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, lookupSources } from '../../api';
import { videoPicker } from '../../lib/desktop';
import type { ToolShelfProps } from '../contract';
import { isWatchController, watchControllerName } from './control';
import { ClockGlyph, CloseGlyph, HandGlyph, ListGlyph, PlayGlyph, SourceGlyph } from './icons';
import { directCandidate, fromLookup, hostOf, type WatchCandidate } from './link';
import { parsePicked } from './picked';
import { advance, carried, enqueue, hasRoomFor, playAt, removeAt, startWith } from './queue';
import { isLive, roomDrives, type WatchItem, type WatchState } from './state';
import './shelf.css';

/** What a link turned out to hold, and whether reading a page was needed. */
interface Found {
  url: string;
  candidates: WatchCandidate[];
  /** The link said it itself: no page was read and nothing left the browser. */
  direct: boolean;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'picking' }
  | { kind: 'chose'; found: Found }
  | {
      kind: 'failed';
      message: 'invalidUrl' | 'unreachable' | 'refused' | 'nothingFound' | 'pickNothing';
    };

export default function Shelf({
  state,
  at,
  setState,
  dismiss,
  draft,
  t,
  by,
  self,
  peers,
}: ToolShelfProps<WatchState>) {
  // A link the chat could not place on its own arrives here already
  // typed (`/play <a page>`): the field starts on it, and the person
  // presses the key that reads the page.
  const [link, setLink] = useState(draft ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [selected, setSelected] = useState(0);
  const fieldId = useId();
  const errorId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const picker = videoPicker();
  /** A lookup whose answer arrived after somebody moved on is dropped. */
  const attemptRef = useRef(0);

  useEffect(() => {
    // The field is the only thing here to type into; landing on it saves
    // the paste a tab press.
    fieldRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      attemptRef.current += 1;
    };
  }, []);

  const canControl = !state || isWatchController(by, self);
  const controllerName = watchControllerName(by, self, peers);

  if (state && !canControl) {
    return (
      <p className="tool-note watch-controller-note" role="status">
        {controllerName ? t('controlledBy', { name: controllerName }) : t('controlledByUnknown')}
      </p>
    );
  }

  /**
   * What was typed, read the moment it becomes something we recognise. A
   * YouTube or media link needs nobody's help, so the panel goes straight
   * to offering to play it — and the round trip below is kept for the
   * links that actually need one.
   */
  function onLink(value: string): void {
    setLink(value);
    // Whatever was in flight was an answer about the old text.
    attemptRef.current += 1;
    const direct = directCandidate(value);
    setSelected(0);
    setPhase(
      direct
        ? { kind: 'chose', found: { url: value.trim(), candidates: [direct], direct: true } }
        : { kind: 'idle' },
    );
  }

  function show(found: Found, attempt: number): void {
    if (attempt !== attemptRef.current) {
      return;
    }
    setSelected(0);
    setPhase(
      found.candidates.length > 0
        ? { kind: 'chose', found }
        : { kind: 'failed', message: 'nothingFound' },
    );
  }

  async function look(): Promise<void> {
    const attempt = (attemptRef.current += 1);
    // A link that is already a video is answered here, and never leaves
    // this browser (link.ts).
    const direct = directCandidate(link);
    if (direct) {
      show({ url: link.trim(), candidates: [direct], direct: true }, attempt);
      return;
    }
    setPhase({ kind: 'looking' });
    try {
      const lookup = await lookupSources(link.trim());
      show(
        {
          url: lookup.url,
          candidates: lookup.candidates.map((candidate) => fromLookup(candidate, lookup.url)),
          direct: false,
        },
        attempt,
      );
    } catch (error) {
      if (attempt !== attemptRef.current) {
        return;
      }
      const code = error instanceof ApiError ? error.code : 'unreachable';
      // "It refused us" and "it did not answer" are different problems
      // with different ways out, and the person is the one who has to
      // take them.
      setPhase({
        kind: 'failed',
        message:
          code === 'invalid_url' ? 'invalidUrl' : code === 'refused' ? 'refused' : 'unreachable',
      });
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
    const page = link.trim();
    setPhase({ kind: 'picking' });
    try {
      const found = parsePicked(await picker.pick(page));
      if (attempt !== attemptRef.current) {
        return;
      }
      if (found.length === 0) {
        setPhase({ kind: 'failed', message: 'pickNothing' });
        return;
      }
      show(
        {
          url: page,
          candidates: found.map((candidate) => fromLookup(candidate, page)),
          direct: false,
        },
        attempt,
      );
    } catch {
      if (attempt === attemptRef.current) {
        setPhase({ kind: 'failed', message: 'pickNothing' });
      }
    }
  }

  function clear(): void {
    setLink('');
    setSelected(0);
    setPhase({ kind: 'idle' });
    attemptRef.current += 1;
  }

  /**
   * `now` puts it on the stage and pushes what was playing aside; the
   * other way lines it up behind what the room is already watching, which
   * is the polite thing to do to people mid-video.
   */
  function play(candidate: WatchCandidate, now: boolean): void {
    if (!state || now) {
      setState(startWith(candidate.item));
      clear();
      dismiss();
      return;
    }
    // The button below is disabled when this is false, but Enter reaches
    // this function from the field too. Keep the link and the visible
    // refusal in place instead of clearing a queue entry that never fit.
    if (!hasRoomFor(state, candidate.item)) {
      return;
    }
    setState(enqueue(carried(state, at), candidate.item));
    clear();
    // The shelf stays open: lining several things up is one visit.
  }

  const chosen = phase.kind === 'chose' ? phase.found.candidates[selected] : undefined;
  const single = phase.kind === 'chose' && phase.found.candidates.length === 1;
  const busy = phase.kind === 'looking' || phase.kind === 'picking';
  const noRoom = Boolean(state && chosen && !hasRoomFor(state, chosen.item));

  return (
    <>
      <label className="tool-label" htmlFor={fieldId}>
        {state ? t('addLabel') : t('linkLabel')}
      </label>
      {/* A line of its own: a link is long, and sharing the row with a
          button left it a keyhole to read one through. */}
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
        onChange={(event) => onLink(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') {
            return;
          }
          event.preventDefault();
          if (chosen) {
            // Nothing on: it goes on. Something on: it waits its turn.
            play(chosen, !state);
          } else {
            void look();
          }
        }}
      />

      {phase.kind === 'idle' && !link.trim() && <p className="tool-note">{t('lookupNote')}</p>}

      {busy && (
        <p className="tool-note watch-busy" role="status">
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
          {/* One candidate is not a choice: it is shown, so nobody has to
              commit the room to something to find out what it is. */}
          <p className="tool-label">{t('chooseLabel')}</p>
          <ul className="watch-options">
            {phase.found.candidates.map((candidate, index) => (
              <li key={`${index}-${keyOf(candidate.item)}`}>
                <Option
                  candidate={candidate}
                  checked={index === selected}
                  single={single}
                  name={fieldId}
                  onSelect={() => setSelected(index)}
                  t={t}
                />
              </li>
            ))}
          </ul>
          {chosen?.personal && <p className="watch-warn">{t('personal')}</p>}
        </>
      )}

      {noRoom && (
        <p className="tool-error" role="status">
          {t('queueFull')}
        </p>
      )}

      <div className="tool-actions">
        {chosen ? (
          <>
            <button type="button" className="tool-open" onClick={() => play(chosen, true)}>
              {t(state ? 'playNow' : 'open')}
            </button>
            {state && (
              <button
                type="button"
                className="tool-stop"
                disabled={noRoom}
                onClick={() => play(chosen, false)}
              >
                {t('addToQueue')}
              </button>
            )}
          </>
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
          <button
            type="button"
            className="tool-stop"
            disabled={busy}
            onClick={() => void pickOnPage()}
          >
            {t('pickOnPage')}
          </button>
        )}
      </div>
      {picker && phase.kind !== 'chose' && <p className="tool-note">{t('pickHint')}</p>}

      {state && (
        <>
          <p className="tool-label watch-queue-label">
            {state.queue.length > 0
              ? t('queueTitle', { count: state.queue.length })
              : t('queueEmpty')}
          </p>
          {state.queue.length > 0 && (
            <ol className="watch-queue">
              {state.queue.map((item, index) => (
                <li className="watch-queue-item" key={`${keyOf(item)}-${index}`}>
                  <Thumb item={item} alt={t('thumbAlt')} />
                  <span className="watch-queue-text">
                    <span className="watch-queue-name">{nameOf(item, t)}</span>
                    {/* For YouTube, the id: no title without their data
                        API, and we are not asking anybody for a key. For
                        anything else, where it comes from. */}
                    <span className="watch-queue-where">{whereOf(item)}</span>
                  </span>
                  <button
                    type="button"
                    className="watch-queue-key"
                    aria-label={t('playThis')}
                    title={t('playThis')}
                    onClick={() => setState(playAt(state, index))}
                  >
                    <PlayGlyph />
                  </button>
                  <button
                    type="button"
                    className="watch-queue-key"
                    aria-label={t('removeThis')}
                    title={t('removeThis')}
                    onClick={() => setState(removeAt(carried(state, at), index))}
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

/** One thing the room could watch, with everything needed to choose it. */
function Option({
  candidate,
  checked,
  single,
  name,
  onSelect,
  t,
}: {
  candidate: WatchCandidate;
  checked: boolean;
  /** The only one there is: shown for what it is, not offered as a choice. */
  single: boolean;
  name: string;
  onSelect: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const { item } = candidate;
  // Three states, not two. A clip and a framed page promise nothing; a
  // live channel has no position to share but is still driven by the
  // room; a video has both.
  const sync = !roomDrives(item) ? 'ownClock' : isLive(item) ? 'liveTogether' : 'sharedClock';
  const where = item.kind === 'source' ? hostOf(item.url) : 'youtube.com';
  return (
    <label className={`watch-option${checked && !single ? ' is-chosen' : ''}`}>
      {!single && (
        <input
          type="radio"
          name={`${name}-source`}
          checked={checked}
          onChange={onSelect}
          className="watch-radio"
        />
      )}
      <span className="watch-option-body">
        <span className="watch-option-head">
          <span className="watch-kind">{t(kindOf(candidate))}</span>
          {candidate.label && <span className="watch-quality">{candidate.label}</span>}
          {isLive(item) && <span className="watch-live">{t('live')}</span>}
        </span>
        <span className="watch-option-meta">
          <span className="watch-host">
            {t(candidate.via ? 'via' : 'source', { host: candidate.via ?? where })}
          </span>
          {/* What the room actually gets. The one thing somebody would
              otherwise only learn after committing everybody to it. */}
          <span className="watch-sync">
            {roomDrives(item) ? <ClockGlyph /> : <HandGlyph />}
            {t(sync)}
          </span>
        </span>
      </span>
    </label>
  );
}

/** What an item is, in one phrase, for a row in either list. */
function kindOfItem(item: WatchItem): string {
  if (item.kind === 'video') {
    return 'kindYouTube';
  }
  if (item.kind === 'list') {
    return 'kindList';
  }
  return {
    file: 'kindFile',
    hls: 'kindHls',
    dash: 'kindDash',
    twitch: 'kindTwitch',
    frame: 'kindFrame',
  }[item.play];
}

function kindOf(candidate: WatchCandidate): string {
  // A frame is two different things wearing one word: the page somebody
  // pasted, and a player embedded inside it. Three rows all reading "the
  // page itself" is a choice nobody can make.
  const { item } = candidate;
  return item.kind === 'source' && item.play === 'frame' && candidate.found === 'embed'
    ? 'kindEmbed'
    : kindOfItem(item);
}

/** What the state files an item under: enough to tell two rows apart. */
function keyOf(item: WatchItem): string {
  if (item.kind === 'video') {
    return item.video;
  }
  return item.kind === 'list' ? item.list : item.url;
}

function nameOf(item: WatchItem, t: (key: string) => string): string {
  return (item.kind === 'source' && item.title) || t(kindOfItem(item));
}

function whereOf(item: WatchItem): string {
  return item.kind === 'source' ? hostOf(item.page ?? item.url) : keyOf(item);
}

/**
 * YouTube's own thumbnail for a video. No API and no key: it is a plain
 * image URL from the same vendor whose player is already embedded a few
 * lines away. Nothing else has one to offer, so it gets a glyph.
 */
function Thumb({ item, alt }: { item: WatchItem; alt: string }) {
  if (item.kind === 'video') {
    return (
      <img
        className="watch-queue-thumb"
        src={`https://i.ytimg.com/vi/${item.video}/default.jpg`}
        alt={alt}
        loading="lazy"
        width={64}
        height={36}
      />
    );
  }
  return (
    <span className="watch-queue-thumb watch-queue-thumb-glyph" aria-hidden>
      {item.kind === 'list' ? <ListGlyph /> : <SourceGlyph />}
    </span>
  );
}
