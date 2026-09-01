import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom } from '../api';

export default function HomePage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom(displayName.trim() || undefined);
      navigate(`/r/${room.slug}`);
    } catch {
      setError('Não foi possível criar a sala. Tente novamente.');
      setCreating(false);
    }
  }

  return (
    <main className="home">
      <section className="home-card">
        <h1>Guest Rooms</h1>
        <p className="tagline">
          Crie uma sala, mande o link para os amigos. Voz, vídeo, chat e
          compartilhamento de tela — sem cadastro.
        </p>
        <form onSubmit={handleCreate}>
          <input
            type="text"
            value={displayName}
            maxLength={60}
            placeholder="Nome da sala (opcional)"
            onChange={(event) => setDisplayName(event.target.value)}
            aria-label="Nome da sala"
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Criando…' : 'Criar sala'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
