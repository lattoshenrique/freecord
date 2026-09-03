import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { createRoom, getRoom, getStats } from '../api';
import { APP_BUILD, APP_VERSION } from '../lib/build-info';
import { generateRoomKey } from '../lib/chat-crypto';
import { heroTransition } from '../lib/hero-transition';
import {
  compactInviteHash,
  looksLikeInvite,
  parseInvite,
  type ParsedInvite,
} from '../lib/invite';
import { DownloadButton } from '../components/DownloadCard';
import LanguagePicker from '../components/LanguagePicker';
import Brand from '../components/Brand';
import MeshBackground from '../components/MeshBackground';
import { CheckIcon } from '../components/icons';
import { preloadRoomPage } from './room-route';
import { useI18n } from '../i18n';
import './home.css';

const REPO = 'https://github.com/lattoshenrique/freecord';

/**
 * The home is an app's first screen, not a landing page: the mark, the field
 * and button that open a room, and a quiet link to the desktop build.
 *
 * The field opens rooms in both directions: type a name to create one, or
 * paste an invite link to join one — the button follows what the field holds.
 * In a browser an invite can go straight into the address bar, but the
 * desktop app has no address bar, and this same page is what the app loads:
 * without the paste path there would be no way to join a room from the app.
 *
 * Everything else — what the project is, how to self-host it, the desktop
 * builds — lives one link away in /community and in the README. Nothing here
 * sells: a page that pitches before it lets you start makes the first click
 * slower, and this same page is what the desktop app opens on.
 */
export default function HomePage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [displayName, setDisplayName] = useState('');
  // A named invite turns into its room name in the field. Keep the parsed
  // destination separately so replacing the visible URL does not turn the
  // button back into "create".
  const [detectedInvite, setDetectedInvite] = useState<ParsedInvite | null>(null);
  const [inviteReveal, setInviteReveal] = useState(0);
  // Where the block caret sits, in px from the start of the text, and whether
  // it is the caret on duty at all.
  const [caretX, setCaretX] = useState(0);
  const [atEnd, setAtEnd] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rooms that have happened here: null until the number arrives.
  const [rooms, setRooms] = useState<number | null>(null);

  /**
   * The block caret only tells the truth at the end of the line: anywhere
   * else the browser's own caret is the one that knows where typing lands,
   * so we stand down and let it show.
   */
  function syncCaret() {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    const end = input.selectionStart === input.value.length && input.selectionStart === input.selectionEnd;
    setAtEnd(end);
  }

  // The mirror is laid out with the text, so measure after every keystroke.
  useEffect(() => {
    setCaretX(mirrorRef.current?.offsetWidth ?? 0);
    syncCaret();
  }, [displayName]);

  /**
   * The caret belongs to the field: it is the only thing to do here. We take
   * it back when the window regains focus and when a click lands on the empty
   * page — never on a mouseless device, where forcing focus would force the
   * on-screen keyboard open every time someone taps the background.
   */
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener('focus', focus);

    const mouse = window.matchMedia('(pointer: fine)');
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!mouse.matches || target?.closest('a, button, input, select, textarea, label')) {
        return;
      }
      // After the browser has finished its own focus handling for this click.
      window.setTimeout(focus, 0);
    };
    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('focus', focus);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  /*
   * Current invitations carry an encoded room name and resolve on paste with
   * no round trip. This lookup keeps compact links made by the previous
   * release useful. Cancelling matters when somebody pastes one and keeps
   * typing: that older room must not overwrite what the field has become.
   */
  useEffect(() => {
    const visibleInvite = parseInvite(displayName);
    if (!visibleInvite || visibleInvite.roomName) {
      return;
    }
    let cancelled = false;
    void getRoom(visibleInvite.slug)
      .then((room) => {
        if (cancelled) {
          return;
        }
        const roomName = room.displayName.trim();
        setDetectedInvite({ ...visibleInvite, roomName: roomName || null });
        if (roomName) {
          setDisplayName(roomName);
          setInviteReveal((reveal) => reveal + 1);
        }
      })
      .catch(() => {
        // Joining remains the source of truth for missing or expired rooms.
      });
    return () => {
      cancelled = true;
    };
  }, [displayName]);

  /*
   * The room's code, fetched while the page sits still. It is the biggest
   * chunk in the app and the one thing this screen is for, so by the time
   * the button is pressed it is already here — and the way in can be one
   * move instead of a blank frame with the mark flying into it.
   */
  useEffect(() => {
    const warm = window.setTimeout(() => void preloadRoomPage(), 600);
    return () => window.clearTimeout(warm);
  }, []);

  /*
   * The one thing this page says about anyone else: how many rooms have
   * held company past the twenty-minute mark. It queues behind the room's
   * code — a number under the button is worth nothing next to the button
   * working — and a request that fails simply leaves the line unsaid.
   */
  useEffect(() => {
    let live = true;
    const ask = window.setTimeout(() => {
      void getStats()
        .then((stats) => {
          if (live) {
            setRooms(stats.rooms);
          }
        })
        .catch(() => {
          // No number is a missing line, not an error to show anyone.
        });
    }, 900);
    return () => {
      live = false;
      window.clearTimeout(ask);
    };
  }, []);

  // The button reads either a visible link or the destination retained while
  // a named link is shown as its human-readable room name.
  const invite = detectedInvite ?? parseInvite(displayName);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (invite) {
      // The fragment carries the chat key — preserve it while shedding any
      // syntax or legacy name metadata the room does not need.
      await preloadRoomPage();
      heroTransition(() => navigate(`/r/${invite.slug}${compactInviteHash(invite.hash)}`));
      return;
    }
    if (looksLikeInvite(displayName)) {
      // Meant as an invite but broken (a truncated paste): naming a room
      // after it would send the link's author a very confused guest.
      setError(t('home.invalidInvite'));
      inputRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // The field is long enough for a pasted link; a *name* still has to
      // fit the server's limit (ROOM_LIMITS.displayNameMaxLength).
      const room = await createRoom(displayName.trim().slice(0, 60) || undefined);
      // The chat key lives in the fragment: shared by copying the link,
      // never sent to the server.
      const roomKey = generateRoomKey();
      await preloadRoomPage();
      /*
       * Out of the waiting state before the button is photographed. It is
       * about to fly, and a button dressed as unavailable — dimmed, its
       * shadow off, saying it is still working — is a poor thing to watch
       * take off, when the work it was waiting on is done. Nothing of this
       * reaches the screen: the transition captures on the same frame, so
       * what is seen is the button that was pressed, going where it goes.
       */
      flushSync(() => setCreating(false));
      /*
       * The room rides along in the history entry: the doorstep opens on it
       * instead of asking the server for a room it has known for one
       * millisecond, which is also what leaves the mark, the name and the
       * button somewhere to fly to rather than a spinner.
       */
      const hash = compactInviteHash(roomKey ? `#${roomKey}` : '', room.displayName);
      heroTransition(() =>
        navigate(`/r/${room.slug}${hash}`, {
          state: { room },
        }),
      );
    } catch {
      setError(t('home.createFailed'));
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  return (
    <main className="home">
      <section className="start">
        {/* The topology the product is, drawn live behind the field. */}
        <MeshBackground />

        <div className="start-center">
          {/* Mark and name together: the title of the screen, and all of it. */}
          <h1 className="start-brand">
            <Brand size={64} march />
          </h1>

          <form className="start-form" onSubmit={handleSubmit}>
            {/* The field reads as a terminal line: a prompt sign, mono text,
                and a block caret. The caret is ours, not the browser's, so it
                can be a solid block — it rides a hidden mirror of the typed
                text, and hands the job back to the native caret whenever the
                insertion point is not at the end (see `atEnd`). */}
            <div
              className="start-prompt"
              data-empty={displayName === '' ? 'true' : 'false'}
              data-block-caret={atEnd ? 'true' : 'false'}
              data-named-invite={invite?.roomName ? 'true' : 'false'}
            >
              <span className="start-prompt-sign" aria-hidden="true">
                {invite?.roomName ? <CheckIcon /> : '>'}
              </span>
              {/* The typed line, and the two things measured against it. */}
              <span className="start-line">
                <input
                  ref={inputRef}
                  type="text"
                  // Belt and braces with the effect above: the browser focuses
                  // it on first paint, the effect takes it back afterwards.
                  autoFocus
                  value={displayName}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  // Room for a full invite URL; names are capped on submit.
                  maxLength={300}
                  placeholder={t('home.roomNamePlaceholder')}
                  onChange={(event) => {
                    const value = event.target.value;
                    const pastedInvite = parseInvite(value);
                    if (pastedInvite?.roomName) {
                      setDetectedInvite(pastedInvite);
                      setDisplayName(pastedInvite.roomName);
                      setInviteReveal((reveal) => reveal + 1);
                    } else {
                      setDetectedInvite(null);
                      setDisplayName(value);
                    }
                    setError(null);
                  }}
                  aria-label={t('home.roomName')}
                  onSelect={syncCaret}
                  onKeyUp={syncCaret}
                  onClick={syncCaret}
                  onFocus={syncCaret}
                />
                {/* Same font, same size, never seen: its width is where the
                    typed text ends, and so where the block belongs. */}
                <span className="start-mirror" aria-hidden="true" ref={mirrorRef}>
                  {displayName}
                </span>
                {invite?.roomName ? (
                  <span
                    key={inviteReveal}
                    className="start-room-reveal"
                    aria-hidden="true"
                  >
                    {invite.roomName}
                  </span>
                ) : null}
                <span className="start-caret" aria-hidden="true" style={{ left: `${caretX}px` }} />
              </span>
            </div>
            <button type="submit" disabled={creating}>
              {creating ? t('home.creating') : invite ? t('home.join') : t('home.create')}
            </button>
          </form>

          {/* One line under the button, only when there is something to say:
              an error, or that the pasted text is an invite. */}
          {error ? (
            <p className="start-error">{error}</p>
          ) : invite ? (
            <p
              key={invite.roomName ? `named-${inviteReveal}` : 'plain-invite'}
              className={`start-hint${invite.roomName ? ' start-invite-name' : ''}`}
              role="status"
              aria-live="polite"
            >
              {invite.roomName
                ? t('home.joinNamedHint', { room: invite.roomName })
                : t('home.joinHint')}
            </p>
          ) : null}

          {/* The second thing to do here, drawn as text: the room comes first. */}
          <DownloadButton />
        </div>

        {/* Proof of life, and the only number on the page: rooms that
            happened. It sits with the footer, not with the button — the
            middle of this screen is for opening a room, and a statistic
            there would be the page talking about itself while someone is
            trying to type. Absent until it has one to show: a counter
            reading zero is worse than no counter. */}
        {rooms !== null && rooms > 0 ? (
          <p className="start-count">
            {t('home.rooms', { count: rooms, total: new Intl.NumberFormat(locale).format(rooms) })}
          </p>
        ) : null}

        <footer className="start-foot">
          <Link to="/how-it-works">{t('how.link')}</Link>
          <Link to="/community">{t('home.community')}</Link>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <LanguagePicker />
          <span className="start-build" title={t('app.buildInfo', { version: APP_VERSION, build: APP_BUILD })}>
            v{APP_VERSION} · {APP_BUILD}
          </span>
        </footer>
      </section>
    </main>
  );
}
