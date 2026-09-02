import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoom, renameRoom, type RoomSummary } from '../api';
import { roomKeyFromHash } from '../lib/chat-crypto';
import { randomNickname } from '../lib/identity';
import { useI18n } from '../i18n';
import Avatar from '../components/Avatar';
import Brand from '../components/Brand';
import RoomView from '../components/RoomView';
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon, ShuffleIcon } from '../components/icons';
import type { JoinOptions } from '../lib/use-room';
import './prejoin.css';

type Phase =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'prejoin'; room: RoomSummary }
  | { kind: 'joined'; room: RoomSummary; options: JoinOptions };

export default function RoomPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  // A guest arrives already named: typing is a correction, not a toll gate.
  const [name, setName] = useState(randomNickname);
  // Both off. Joining a call already talking, or already on camera, is how
  // people walk into a room mid-sentence and half-dressed.
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // The room's own name is the title, and the title is an input: null while
  // nobody is typing in it, the draft while someone is.
  const [roomDraft, setRoomDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState(false);
  const roomNameRef = useRef<HTMLInputElement>(null);
  // Escape reverts: the blur that follows must not save the draft.
  const discardRef = useRef(false);

  useEffect(() => {
    if (!slug) {
      return;
    }
    let cancelled = false;
    getRoom(slug)
      .then((room) => {
        if (!cancelled) {
          setPhase({ kind: 'prejoin', room });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setPhase(
          error instanceof ApiError && error.status === 404
            ? { kind: 'not_found' }
            : { kind: 'error' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug) {
    return null;
  }

  if (phase.kind === 'loading') {
    return (
      <main className="centered">
        <div className="spinner" />
        <p>{t('room.loading')}</p>
      </main>
    );
  }

  if (phase.kind === 'not_found') {
    return (
      <main className="centered">
        <section className="home-card state-card">
          <Brand className="home-logo" size={44} name={false} />
          <h1>{t('prejoin.notFoundTitle')}</h1>
          <p className="tagline">{t('prejoin.notFoundBody')}</p>
          <Link to="/" className="button-link">
            {t('prejoin.createNew')}
          </Link>
        </section>
      </main>
    );
  }

  if (phase.kind === 'error') {
    return (
      <main className="centered">
        <section className="home-card state-card">
          <Brand className="home-logo" size={44} name={false} />
          <h1>{t('prejoin.errorTitle')}</h1>
          <p className="tagline">{t('prejoin.errorBody')}</p>
        </section>
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
            });
          }}
        >
          <Link to="/" className="join-brand" aria-label={t('prejoin.backHome')}>
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
            <Avatar name={name} className="join-avatar" />
            <div className="join-name">
              <input
                ref={nameRef}
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
                onClick={() => {
                  setName(randomNickname());
                  nameRef.current?.focus();
                }}
              >
                <ShuffleIcon />
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
      onLeft={() => navigate('/')}
    />
  );
}
