import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { createRoom } from '../api';
import DownloadCard from '../components/DownloadCard';
import LanguagePicker from '../components/LanguagePicker';
import Logo from '../components/Logo';
import { useI18n, type MessageKey } from '../i18n';
import './home.css';

const REPO = 'https://github.com/lattoshenrique/freecord';

/** Shown and copied as-is: commands are code, not prose to translate. */
const SETUP: { cmd: string; note?: string }[] = [
  { cmd: `git clone ${REPO}` },
  { cmd: 'cd freecord && npm install' },
  { cmd: 'npm run dev:server', note: '# API + WS :3001' },
  { cmd: 'npm run dev:web', note: '# web :5173' },
];

const PILLARS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'home.dev.p2p.title', body: 'home.dev.p2p.body' },
  { title: 'home.dev.selfhost.title', body: 'home.dev.selfhost.body' },
  { title: 'home.dev.protocol.title', body: 'home.dev.protocol.body' },
  { title: 'home.dev.light.title', body: 'home.dev.light.body' },
];

export default function HomePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(SETUP.map(({ cmd }) => cmd).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (permissions): the commands remain selectable
    }
  }

  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-brand">
          <Logo className="home-logo" size={64} />
          <h1>{t('app.name')}</h1>
        </div>
        <p className="tagline">{t('app.tagline')}</p>
        <ul className="home-chips">
          <li>{t('home.chip.opensource')}</li>
          <li>{t('home.chip.p2p')}</li>
          <li>{t('home.chip.nosignup')}</li>
        </ul>
      </section>

      <section className="home-card">
        <h2 className="home-create-title">{t('home.card.title')}</h2>
        <p className="home-create-hint">{t('home.card.hint')}</p>
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
      </section>

      <DownloadCard />

      <section className="home-dev">
        <h2>
          <span className="home-dev-prompt">$ </span>
          {t('home.dev.title')}
        </h2>
        <p className="home-dev-lead">{t('home.dev.lead')}</p>

        <div className="home-terminal">
          <div className="home-terminal-bar">
            <span />
            <span />
            <span />
            <button type="button" className="home-terminal-copy" onClick={handleCopy}>
              {copied ? t('home.dev.copied') : t('home.dev.copy')}
            </button>
          </div>
          <pre className="home-terminal-code">
            {SETUP.map(({ cmd, note }) => (
              <div key={cmd} className="home-terminal-line">
                <span className="home-terminal-prompt">$ </span>
                {cmd}
                {note && <span className="home-terminal-note">{'   '}{note}</span>}
              </div>
            ))}
          </pre>
        </div>

        <div className="home-dev-grid">
          {PILLARS.map(({ title, body }) => (
            <div key={title} className="home-dev-pillar">
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </div>
          ))}
        </div>

        <div className="home-dev-links">
          <a className="home-link home-link-primary" href={REPO} target="_blank" rel="noreferrer">
            {t('home.dev.github')}
          </a>
          <a
            className="home-link"
            href={`${REPO}/blob/main/docs/architecture.md`}
            target="_blank"
            rel="noreferrer"
          >
            {t('home.dev.architecture')}
          </a>
          <a
            className="home-link"
            href={`${REPO}/blob/main/CONTRIBUTING.md`}
            target="_blank"
            rel="noreferrer"
          >
            {t('home.dev.contribute')}
          </a>
          <Link className="home-link" to="/community">
            {t('home.community')}
          </Link>
        </div>
      </section>

      <p className="home-footer">{t('community.footer')}</p>
      <LanguagePicker />
    </main>
  );
}
