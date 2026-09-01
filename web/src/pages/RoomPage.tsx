import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoom, type RoomSummary } from '../api';
import { roomKeyFromHash } from '../lib/chat-crypto';
import { useI18n } from '../i18n';
import Logo from '../components/Logo';
import RoomView from '../components/RoomView';
import type { JoinOptions } from '../lib/use-room';

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
  const [name, setName] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(false);

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
          <Logo className="home-logo" size={44} />
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
          <Logo className="home-logo" size={44} />
          <h1>{t('prejoin.errorTitle')}</h1>
          <p className="tagline">{t('prejoin.errorBody')}</p>
        </section>
      </main>
    );
  }

  if (phase.kind === 'prejoin') {
    const { room } = phase;
    return (
      <main className="prejoin">
        <section className="home-card">
          <Link to="/" className="prejoin-brand" aria-label={t('prejoin.backHome')}>
            <Logo size={40} />
          </Link>
          <h1>{room.displayName || t('room.unnamed')}</h1>
          <p className="tagline">
            {room.participantCount === 0
              ? t('prejoin.empty')
              : t('prejoin.inRoom', { count: room.participantCount })}
          </p>
          <form
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
            <input
              type="text"
              value={name}
              maxLength={40}
              placeholder={t('prejoin.yourNamePlaceholder')}
              aria-label={t('prejoin.yourName')}
              onChange={(event) => setName(event.target.value)}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={micEnabled}
                onChange={(event) => setMicEnabled(event.target.checked)}
              />
              {t('prejoin.micOn')}
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={camEnabled}
                onChange={(event) => setCamEnabled(event.target.checked)}
              />
              {t('prejoin.camOn')}
            </label>
            <button type="submit" disabled={!name.trim()}>
              {t('prejoin.joinRoom')}
            </button>
          </form>
        </section>
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
