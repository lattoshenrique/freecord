import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { createRoom } from '../api';
import DownloadCard from '../components/DownloadCard';
import LanguagePicker from '../components/LanguagePicker';
import Logo from '../components/Logo';
import {
  CamIcon,
  ChatIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  ScreenIcon,
} from '../components/icons';
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

const FEATURES: { title: MessageKey; body: MessageKey }[] = [
  { title: 'home.dev.p2p.title', body: 'home.dev.p2p.body' },
  { title: 'home.dev.selfhost.title', body: 'home.dev.selfhost.body' },
  { title: 'home.dev.protocol.title', body: 'home.dev.protocol.body' },
];

/**
 * Decorative sketch of a room mid-call: a shared screen, three peers,
 * the dock. Pure CSS/SVG so it weighs nothing; hidden from readers.
 */
function RoomMock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-bar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-url">freecord.app/r/x7k2m9</span>
      </div>
      <div className="mock-stage">
        <div className="mock-screen">
          <div className="mock-code">
            <i style={{ width: '46%' }} />
            <i style={{ width: '72%' }} className="hl" />
            <i style={{ width: '58%' }} />
            <i style={{ width: '80%' }} />
            <i style={{ width: '34%' }} className="hl2" />
            <i style={{ width: '64%' }} />
          </div>
          <span className="mock-badge">1080p · 30 fps · 12 ms</span>
        </div>
        <div className="mock-tiles">
          <div className="mock-tile speaking">
            <span className="mock-avatar av-a">H</span>
            <MicIcon />
          </div>
          <div className="mock-tile">
            <span className="mock-avatar av-b">L</span>
            <MicIcon />
          </div>
          <div className="mock-tile muted">
            <span className="mock-avatar av-c">N</span>
            <MicOffIcon />
          </div>
        </div>
      </div>
      <div className="mock-dock">
        <span className="mock-btn">
          <MicIcon />
        </span>
        <span className="mock-btn">
          <CamIcon />
        </span>
        <span className="mock-btn on">
          <ScreenIcon />
        </span>
        <span className="mock-btn">
          <ChatIcon />
        </span>
        <span className="mock-btn danger">
          <LeaveIcon />
        </span>
      </div>
    </div>
  );
}

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
      <nav className="home-nav">
        <Link to="/" className="home-nav-brand">
          <Logo size={26} />
          <span>{t('app.name')}</span>
        </Link>
        <div className="home-nav-links">
          <a href="#devs">{t('home.dev.title')}</a>
          <Link to="/community">{t('home.community')}</Link>
          <a className="home-nav-github" href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <h1>
            {t('home.hero.titleA')} <span className="hero-grad">{t('home.hero.titleB')}</span>
          </h1>
          <p className="hero-sub">{t('app.tagline')}</p>
          <form className="hero-form" onSubmit={handleCreate}>
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
          <p className="hero-hint">{t('home.card.hint')}</p>
          <ul className="home-chips">
            <li>{t('home.chip.opensource')}</li>
            <li>{t('home.chip.p2p')}</li>
            <li>{t('home.chip.nosignup')}</li>
          </ul>
        </div>
        <RoomMock />
      </header>

      <section id="devs" className="home-dev">
        <h2>
          <span className="home-dev-prompt">$ </span>
          {t('home.dev.title')}
        </h2>
        <p className="home-dev-lead">{t('home.dev.lead')}</p>

        <div className="bento">
          <div className="bento-tile bento-terminal">
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
                    {note && (
                      <span className="home-terminal-note">
                        {'   '}
                        {note}
                      </span>
                    )}
                  </div>
                ))}
              </pre>
            </div>
          </div>

          <div className="bento-tile bento-stat">
            <span className="bento-number">~14 kB</span>
            <h3>{t('home.dev.light.title')}</h3>
            <p>{t('home.dev.light.body')}</p>
          </div>

          {FEATURES.map(({ title, body }, index) => (
            <div key={title} className="bento-tile">
              {index === 0 && <Logo size={36} className="bento-mesh" />}
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
        </div>
      </section>

      <div id="download" className="home-download">
        <DownloadCard />
      </div>

      <footer className="home-footer">
        <div className="home-footer-grid">
          <div className="home-footer-brand">
            <div className="home-footer-mark">
              <Logo size={22} />
              <span>{t('app.name')}</span>
            </div>
            <p>{t('community.footer')}</p>
          </div>
          <div className="home-footer-col">
            <h3>{t('home.footer.product')}</h3>
            <Link to="/community">{t('home.community')}</Link>
            <a href="#download">{t('home.footer.downloads')}</a>
          </div>
          <div className="home-footer-col">
            <h3>{t('home.dev.title')}</h3>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={`${REPO}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer">
              {t('home.dev.architecture')}
            </a>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
              {t('home.dev.contribute')}
            </a>
          </div>
        </div>
        <div className="home-footer-bottom">
          <LanguagePicker />
        </div>
      </footer>
    </main>
  );
}
