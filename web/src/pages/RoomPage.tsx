import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoom, renameRoom, type RoomSummary } from '../api';
import { roomKeyFromHash } from '../lib/chat-crypto';
import { heroTransition } from '../lib/hero-transition';
import { randomNickname } from '../lib/identity';
import { useI18n } from '../i18n';
import Avatar from '../components/Avatar';
import Brand from '../components/Brand';
import MeshBackground from '../components/MeshBackground';
import RoomView from '../components/RoomView';
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon, ShuffleIcon } from '../components/icons';
import type { JoinOptions } from '../lib/use-room';
import './prejoin.css';
import './state.css';

type Phase =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'prejoin'; room: RoomSummary }
  | { kind: 'joined'; room: RoomSummary; options: JoinOptions };

/**
 * A room the home just created and handed over in the history entry. The
 * doorstep opens on it directly: asking the server about a room this tab has
 * known for one millisecond costs a round trip and a spinner, and the spinner
 * is the one thing the way in must not have — the mark, the name and the
 * button are mid-flight, and they need the doorstep to land on.
 *
 * Anything else — a pasted invite, a reload, a link from outside — has no
 * such entry and takes the ordinary path.
 */
function handedOver(state: unknown, slug: string | undefined): RoomSummary | null {
  const room = (state as { room?: RoomSummary } | null)?.room;
  return room && room.slug === slug ? room : null;
}

export default function RoomPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const handed = handedOver(useLocation().state, slug);
  const [phase, setPhase] = useState<Phase>(
    handed ? { kind: 'prejoin', room: handed } : { kind: 'loading' },
  );
  // A guest arrives already named: typing is a correction, not a toll gate.
  const [name, setName] = useState(randomNickname);
  // Both off. Joining a call already talking, or already on camera, is how
  // people walk into a room mid-sentence and half-dressed.
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // A new name should read as a change of name, not as a field that blinked:
  // the old one leaves, the new one arrives, and the icon turns once. The
  // counter drives the turn; the phase drives the swap.
  const [shuffles, setShuffles] = useState(0);
  const [swap, setSwap] = useState<'out' | 'in' | null>(null);
  const swapTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
  }, []);

  function shuffleName() {
    setShuffles((n) => n + 1);
    nameRef.current?.focus();
    if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
    const still =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setName(randomNickname());
      return;
    }
    // The name is replaced at the turn of the animation, while the old one is
    // out of sight — so the letters never cross-fade into each other.
    setSwap('out');
    swapTimer.current = window.setTimeout(() => {
      setName(randomNickname());
      setSwap('in');
      // Long enough for the last of the avatar's tiles to land.
      swapTimer.current = window.setTimeout(() => setSwap(null), 700);
    }, 150);
  }
  // The room's own name is the title, and the title is an input: null while
  // nobody is typing in it, the draft while someone is.
  const [roomDraft, setRoomDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState(false);
  const roomNameRef = useRef<HTMLInputElement>(null);
  // Escape reverts: the blur that follows must not save the draft.
  const discardRef = useRef(false);

  useEffect(() => {
    if (!slug || handed) {
      return;
    }
    let cancelled = false;
    getRoom(slug)
      .then((room) => {
        if (!cancelled) {
          // The mark is on the loading screen and on the doorstep both: one
          // move carries it from the middle of the first to the top of the
          // second, and the rest of the doorstep arrives under it.
          heroTransition(() => setPhase({ kind: 'prejoin', room }));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        heroTransition(() =>
          setPhase(
            error instanceof ApiError && error.status === 404
              ? { kind: 'not_found' }
              : { kind: 'error' },
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug, handed]);

  if (!slug) {
    return null;
  }

  if (phase.kind === 'loading') {
    return (
      <main className="centered">
        {/* The one thing carried over from the screen you came from: the
            spinner is the only news here, so the mark holds the middle. */}
        <Brand className="home-logo" size={44} name={false} />
        <div className="spinner" />
        <p>{t('room.loading')}</p>
      </main>
    );
  }

  if (phase.kind === 'not_found') {
    return (
      <main className="state">
        {/* The topology the home draws behind its own field: the way out of
            a dead end is the way in, and it should already look like it. */}
        <MeshBackground />
        <div className="state-center">
          {/* The mark the loading screen was holding, in the same place. */}
          <Brand className="home-logo" size={44} name={false} />
          <h1>{t('prejoin.notFoundTitle')}</h1>
          <p>{t('prejoin.notFoundBody')}</p>
          {/* A link, so it opens in a new tab like any other; a plain left
              click takes the hero path instead, and the mark and the button
              fly to the home rather than cutting to it. */}
          <Link
            to="/"
            className="state-cta"
            onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              heroTransition(() => navigate('/'));
            }}
          >
            {t('prejoin.createNew')}
          </Link>
        </div>
      </main>
    );
  }

  if (phase.kind === 'error') {
    return (
      <main className="state">
        <MeshBackground />
        <div className="state-center">
          <Brand className="home-logo" size={44} name={false} />
          <h1>{t('prejoin.errorTitle')}</h1>
          <p>{t('prejoin.errorBody')}</p>
          {/* Reloading may well work, so the loud button would be pointing
              the wrong way: the way home is a line of text under it. */}
          <Link to="/" className="state-back">
            {t('prejoin.backHome')}
          </Link>
        </div>
      </main>
    );
  }

  if (phase.kind === 'prejoin') {
    const { room } = phase;
    const commitRename = async () => {
      if (roomDraft === null || renaming) {
        return;
      }
      const next = roomDraft.trim();
      if (next === room.displayName) {
        setRoomDraft(null);
        return;
      }
      setRenaming(true);
      setRenameError(false);
      try {
        const renamed = await renameRoom(slug, next);
        setPhase({ kind: 'prejoin', room: renamed });
        setRoomDraft(null);
      } catch {
        // Keep the draft so nothing typed is lost; the title shows it still.
        setRenameError(true);
      } finally {
        setRenaming(false);
      }
    };

    const shownName = roomDraft ?? room.displayName;

    return (
      <main className="join">
        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              return;
            }
            // The same move once more: the mark and the room's name fly to
            // the title panel they will sit in for the rest of the call, and
            // the doorstep dissolves behind them.
            heroTransition(() =>
              setPhase({
                kind: 'joined',
                room,
                options: {
                  slug,
                  name: trimmed,
                  micEnabled,
                  camEnabled,
                  // The chat key rides the fragment, which never reaches the server.
                  roomKey: roomKeyFromHash(window.location.hash),
                },
              }),
            );
          }}
        >
          <Link
            to="/"
            className="join-brand"
            aria-label={t('prejoin.backHome')}
            onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
              /*
               * The way back is the way in, played backwards. Only for a
               * plain click: a middle click or a cmd-click is asking for a
               * new tab, where there is nothing to carry anything to.
               */
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              heroTransition(() => navigate('/'));
            }}
          >
            <Brand size={24} />
          </Link>

          {/* The heading is the field: click the name and type. */}
          <h1 className="join-room-name" data-value={shownName || t('room.unnamed')}>
            <input
              ref={roomNameRef}
              type="text"
              value={shownName}
              // No intrinsic width: the mirror in the heading sizes the field.
              size={1}
              maxLength={60}
              placeholder={t('room.unnamed')}
              aria-label={t('prejoin.renameRoom')}
              title={t('prejoin.renameRoom')}
              aria-invalid={renameError || undefined}
              disabled={renaming}
              onFocus={() => {
                discardRef.current = false;
                setRoomDraft((draft) => draft ?? room.displayName);
              }}
              onChange={(event) => {
                setRoomDraft(event.target.value);
                setRenameError(false);
              }}
              onBlur={() => {
                if (discardRef.current) {
                  discardRef.current = false;
                  setRoomDraft(null);
                  setRenameError(false);
                  return;
                }
                void commitRename();
              }}
              onKeyDown={(event) => {
                // The form's Enter is "join": here it just leaves the field,
                // and leaving the field saves.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  discardRef.current = true;
                  event.currentTarget.blur();
                }
              }}
            />
          </h1>
          {renameError ? (
            <p className="join-room-error" role="alert">
              {t('prejoin.renameFailed')}
            </p>
          ) : null}
          <p className="join-sub">
            {room.participantCount === 0
              ? t('prejoin.empty')
              : t('prejoin.inRoom', { count: room.participantCount })}
          </p>

          <div className="join-identity">
            <Avatar name={name} className={`join-avatar${swap === 'in' ? ' swap-in' : ''}`} />
            <div className="join-name">
              <input
                ref={nameRef}
                className={swap ? `swap-${swap}` : undefined}
                type="text"
                value={name}
                maxLength={40}
                placeholder={t('prejoin.yourNamePlaceholder')}
                aria-label={t('prejoin.yourName')}
                // The generated name is a suggestion: the first keystroke replaces it.
                autoFocus
                onFocus={(event) => event.target.select()}
                onChange={(event) => setName(event.target.value)}
              />
              <button
                type="button"
                className="join-shuffle"
                title={t('prejoin.shuffle')}
                aria-label={t('prejoin.shuffle')}
                onClick={shuffleName}
              >
                <span
                  className="join-shuffle-spin"
                  style={{ transform: `rotate(${shuffles * 360}deg)` }}
                >
                  <ShuffleIcon />
                </span>
              </button>
            </div>
          </div>

          <div className="join-devices">
            <label className={`join-device ${micEnabled ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={micEnabled}
                onChange={(event) => setMicEnabled(event.target.checked)}
              />
              {micEnabled ? <MicIcon /> : <MicOffIcon />}
              <span>{t('prejoin.mic')}</span>
            </label>
            <label className={`join-device ${camEnabled ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={camEnabled}
                onChange={(event) => setCamEnabled(event.target.checked)}
              />
              {camEnabled ? <CamIcon /> : <CamOffIcon />}
              <span>{t('prejoin.cam')}</span>
            </label>
          </div>

          <button type="submit" className="join-cta" disabled={!name.trim()}>
            {t('prejoin.joinRoom')}
          </button>
        </form>
      </main>
    );
  }

  return (
    <RoomView
      room={phase.room}
      options={phase.options}
      /*
       * Plainly, with no hero: the way in is one move because the same three
       * things are on every screen of it, and leaving is not that. Flying
       * the room back into the field it was opened from would replay the
       * arrival backwards, which is not what walking out feels like.
       */
      onLeft={() => navigate('/')}
    />
  );
}
