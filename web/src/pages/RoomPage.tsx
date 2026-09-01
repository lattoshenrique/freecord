import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoom, type RoomSummary } from '../api';
import RoomView from '../components/RoomView';
import type { JoinOptions } from '../lib/use-room';

type Phase =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'prejoin'; room: RoomSummary }
  | { kind: 'joined'; room: RoomSummary; options: JoinOptions };

export default function RoomPage() {
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
    return <main className="centered">Carregando sala…</main>;
  }

  if (phase.kind === 'not_found') {
    return (
      <main className="centered">
        <h1>Sala não encontrada</h1>
        <p>O link pode ter expirado — salas vazias fecham sozinhas.</p>
        <Link to="/" className="button-link">
          Criar uma nova sala
        </Link>
      </main>
    );
  }

  if (phase.kind === 'error') {
    return (
      <main className="centered">
        <h1>Algo deu errado</h1>
        <p>Não foi possível carregar a sala. Tente recarregar a página.</p>
      </main>
    );
  }

  if (phase.kind === 'prejoin') {
    const { room } = phase;
    return (
      <main className="prejoin">
        <section className="home-card">
          <h1>{room.displayName}</h1>
          <p className="tagline">
            {room.participantCount === 0
              ? 'Ninguém aqui ainda — seja a primeira pessoa a entrar.'
              : `${room.participantCount} pessoa(s) na sala.`}
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
                options: { slug, name: trimmed, micEnabled, camEnabled },
              });
            }}
          >
            <input
              type="text"
              value={name}
              maxLength={40}
              placeholder="Seu nome"
              aria-label="Seu nome"
              onChange={(event) => setName(event.target.value)}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={micEnabled}
                onChange={(event) => setMicEnabled(event.target.checked)}
              />
              Entrar com microfone ligado
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={camEnabled}
                onChange={(event) => setCamEnabled(event.target.checked)}
              />
              Entrar com câmera ligada
            </label>
            <button type="submit" disabled={!name.trim()}>
              Entrar na sala
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
