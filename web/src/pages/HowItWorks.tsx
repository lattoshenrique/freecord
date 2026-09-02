import { useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { useI18n, type MessageKey } from '../i18n';
import './how.css';

const REPO = 'https://github.com/lattoshenrique/freecord';

/** Shown and copied as-is: commands are code, not prose to translate. */
const SETUP: { cmd: string; note?: string }[] = [
  { cmd: `git clone ${REPO}` },
  { cmd: 'cd freecord && npm install' },
  { cmd: 'npm run dev:server', note: '# API + WS :3001' },
  { cmd: 'npm run dev:web', note: '# web :5173' },
];

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'how.step.create.title', body: 'how.step.create.body' },
  { title: 'how.step.share.title', body: 'how.step.share.body' },
  { title: 'how.step.talk.title', body: 'how.step.talk.body' },
];

/** The four peers sit on the same square in both diagrams: one room, two jobs. */
const PEERS = [
  { x: 55, y: 45 },
  { x: 185, y: 45 },
  { x: 55, y: 135 },
  { x: 185, y: 135 },
];

/** Every pair of peers, once: the mesh's six connections. */
const PAIRS = PEERS.flatMap((from, index) =>
  PEERS.slice(index + 1).map((to) => ({ from, to, key: `${from.x}-${from.y}-${to.x}-${to.y}` })),
);

/**
 * Two pictures of the same room. On the left every browser is connected to
 * every other and the server is absent — that is where voice, video and screen
 * go. On the right the same four browsers only reach the server, which is all
 * it ever carries: who is here and how to find them.
 */
function MeshDiagram({ signaling }: { signaling?: boolean }) {
  return (
    <svg className="dia" viewBox="0 0 240 180" aria-hidden="true">
      {signaling
        ? PEERS.map((peer) => (
            <line
              key={`${peer.x}-${peer.y}`}
              className="dia-signal"
              x1={peer.x}
              y1={peer.y}
              x2={120}
              y2={90}
            />
          ))
        : PAIRS.map(({ from, to, key }) => (
            <line key={key} className="dia-media" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
          ))}

      {signaling && (
        <g>
          <rect className="dia-server" x="88" y="72" width="64" height="36" rx="11" />
          <line className="dia-server-line" x1="100" y1="84" x2="140" y2="84" />
          <line className="dia-server-line" x1="100" y1="96" x2="128" y2="96" />
        </g>
      )}

      {PEERS.map((peer) => (
        <circle key={`${peer.x}-${peer.y}`} className="dia-peer" cx={peer.x} cy={peer.y} r="15" />
      ))}
    </svg>
  );
}

export default function HowItWorksPage() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

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
    <main className="how">
      <article className="how-inner">
        <Link to="/" className="how-brand" aria-label={t('prejoin.backHome')}>
          <Brand size={26} />
        </Link>

        <header>
          <h1>{t('how.title')}</h1>
          <p className="how-lead">{t('how.lead')}</p>
        </header>

        <section>
          <h2>{t('how.steps.title')}</h2>
          <ol className="how-steps">
            {STEPS.map(({ title, body }) => (
              <li key={title}>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>{t('how.mesh.title')}</h2>
          <p>{t('how.mesh.body')}</p>
          <div className="how-diagrams">
            <figure>
              <MeshDiagram />
              <figcaption>{t('how.diagram.media')}</figcaption>
            </figure>
            <figure>
              <MeshDiagram signaling />
              <figcaption>{t('how.diagram.signaling')}</figcaption>
            </figure>
          </div>
        </section>

        <section>
          <h2>{t('how.chat.title')}</h2>
          <p>{t('how.chat.body')}</p>
        </section>

        <section>
          <h2>{t('how.screen.title')}</h2>
          <p>{t('how.screen.body')}</p>
        </section>

        <section>
          <h2>{t('how.limits.title')}</h2>
          <p>{t('how.limits.body')}</p>
        </section>

        <section>
          <h2>{t('how.run.title')}</h2>
          <p>{t('how.run.body')}</p>
          <div className="how-terminal">
            <div className="how-terminal-bar">
              <span />
              <span />
              <span />
              <button type="button" onClick={handleCopy}>
                {copied ? t('how.run.copied') : t('how.run.copy')}
              </button>
            </div>
            <pre>
              {SETUP.map(({ cmd, note }) => (
                <div key={cmd}>
                  <span className="how-terminal-prompt">$ </span>
                  {cmd}
                  {note && <span className="how-terminal-note">{`   ${note}`}</span>}
                </div>
              ))}
            </pre>
          </div>
          <p className="how-links">
            <a href={`${REPO}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer">
              {t('community.source.architecture')}
            </a>
            <Link to="/community">{t('home.community')}</Link>
          </p>
        </section>

        <Link to="/" className="how-cta">
          {t('how.more.start')}
        </Link>
      </article>
    </main>
  );
}
