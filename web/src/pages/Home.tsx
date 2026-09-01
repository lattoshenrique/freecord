import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { createRoom } from '../api';
import DownloadCard from '../components/DownloadCard';
import LanguagePicker from '../components/LanguagePicker';
import { useI18n } from '../i18n';

export default function HomePage() {
  const { t } = useI18n();
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
      setError(t('home.createFailed'));
      setCreating(false);
    }
  }

  return (
    <main className="home">
      <section className="home-card">
        <h1>Freecord</h1>
        <p className="tagline">
          Crie uma sala, mande o link para os amigos. Voz, vídeo, chat e
          compartilhamento de tela — sem cadastro.
        </p>
        <form onSubmit={handleCreate}>
          <input
            type="text"
            value={displayName}
            maxLength={60}
            placeholder={t('home.roomNamePlaceholder')}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-label={t('home.roomName')}
          />
          <button type="submit" disabled={creating}>
            {creating ? t('home.creating') : t('home.create')}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="home-links">
          <Link to="/community">{t('home.community')}</Link>
        </p>
      </section>
      <DownloadCard />
      <LanguagePicker />
    </main>
  );
}
