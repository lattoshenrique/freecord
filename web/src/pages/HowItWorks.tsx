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

const FACTS: { value: MessageKey; label: MessageKey }[] = [
  { value: 'how.fact.account.value', label: 'how.fact.account.label' },
  { value: 'how.fact.people.value', label: 'how.fact.people.label' },
  { value: 'how.fact.screens.value', label: 'how.fact.screens.label' },
];

const DETAILS: { eyebrow: MessageKey; title: MessageKey; body: MessageKey; kind: string }[] = [
  {
    eyebrow: 'how.chat.eyebrow',
    title: 'how.chat.title',
    body: 'how.chat.body',
    kind: 'chat',
  },
  {
    eyebrow: 'how.screen.eyebrow',
    title: 'how.screen.title',
    body: 'how.screen.body',
    kind: 'screen',
  },
  {
    eyebrow: 'how.limits.eyebrow',
    title: 'how.limits.title',
    body: 'how.limits.body',
    kind: 'limits',
  },
];

/** The same four people sit in both diagrams: one room, two very different jobs. */
const PEERS = [
  { x: 58, y: 58, label: 'how.diagram.person.you' },
  { x: 222, y: 58, label: 'how.diagram.person.lia' },
  { x: 58, y: 168, label: 'how.diagram.person.rui' },
  { x: 222, y: 168, label: 'how.diagram.person.maya' },
];

const DIRECT_PACKETS = [
  { path: 'M58 58 L222 58', delay: '0s', kind: 'voice', x: 140, y: 58 },
  { path: 'M58 58 L222 168', delay: '-0.9s', kind: 'video', x: 140, y: 113 },
  { path: 'M222 168 L58 168', delay: '-1.7s', kind: 'screen', x: 140, y: 168 },
];

const SIGNAL_PACKETS = [
  { path: 'M58 58 L140 112', delay: '0s', x: 99, y: 85 },
  { path: 'M222 58 L140 112', delay: '-0.7s', x: 181, y: 85 },
  { path: 'M140 112 L58 168', delay: '-1.4s', x: 99, y: 140 },
  { path: 'M140 112 L222 168', delay: '-2.1s', x: 181, y: 140 },
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
function MeshDiagram({ signaling, paused }: { signaling?: boolean; paused: boolean }) {
  const { t } = useI18n();

  return (
    <svg className="dia" viewBox="0 0 280 225" aria-hidden="true">
      {signaling
        ? PEERS.map((peer) => (
            <line
              key={peer.label}
              className="dia-signal"
              x1={peer.x}
              y1={peer.y}
              x2={140}
              y2={112}
            />
          ))
        : PAIRS.map(({ from, to, key }) => (
            <line key={key} className="dia-media" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
          ))}

      {(signaling ? SIGNAL_PACKETS : DIRECT_PACKETS).map(({ path, delay, x, y, ...packet }) =>
        paused ? (
          <circle
            key={`${path}-still`}
            className={`dia-packet${'kind' in packet ? ` dia-packet-${packet.kind}` : ' dia-packet-signal'}`}
            cx={x}
            cy={y}
            r={signaling ? 3 : 4}
          />
        ) : (
          <circle
            key={`${path}-${delay}`}
            className={`dia-packet${'kind' in packet ? ` dia-packet-${packet.kind}` : ' dia-packet-signal'}`}
            r={signaling ? 3 : 4}
          >
            <animateMotion dur={signaling ? '2.8s' : '2.25s'} begin={delay} repeatCount="indefinite" path={path} />
          </circle>
        ),
      )}

      {signaling && (
        <g className="dia-server-group">
          <rect className="dia-server" x="103" y="89" width="74" height="46" rx="12" />
          <line className="dia-server-line" x1="117" y1="104" x2="163" y2="104" />
          <line className="dia-server-line" x1="117" y1="118" x2="150" y2="118" />
          <text className="dia-server-label" x="140" y="148">
            {t('how.diagram.server')}
          </text>
        </g>
      )}

      {PEERS.map((peer) => (
        <g key={peer.label} className="dia-person">
          <circle className="dia-peer" cx={peer.x} cy={peer.y} r="21" />
          <circle className="dia-person-head" cx={peer.x} cy={peer.y - 5} r="5" />
          <path
            className="dia-person-body"
            d={`M${peer.x - 10} ${peer.y + 10}c2-7 6-10 10-10s8 3 10 10`}
          />
          <text className="dia-person-label" x={peer.x} y={peer.y + 33}>
            {t(peer.label as MessageKey)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function HowItWorksPage() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [diagramPaused, setDiagramPaused] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

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
        <nav className="how-nav" aria-label={t('how.nav.label')}>
          <Link to="/" className="how-brand" aria-label={t('prejoin.backHome')}>
            <Brand size={26} />
          </Link>
          <Link to="/community" className="how-nav-link">
            {t('home.community')}
          </Link>
        </nav>

        <header className="how-hero">
          <p className="how-eyebrow">{t('how.eyebrow')}</p>
          <h1>{t('how.title')}</h1>
          <p className="how-lead">{t('how.lead')}</p>
          <div className="how-hero-actions">
            <Link to="/" className="how-button how-button-primary">
              {t('how.more.start')}
              <span aria-hidden="true">→</span>
            </Link>
            <a
              className="how-button how-button-secondary"
              href={`${REPO}/blob/main/docs/architecture.md`}
              target="_blank"
              rel="noreferrer"
            >
              {t('community.source.architecture')}
            </a>
          </div>
          <dl className="how-facts">
            {FACTS.map(({ value, label }) => (
              <div key={value}>
                <dt>{t(value)}</dt>
                <dd>{t(label)}</dd>
              </div>
            ))}
          </dl>
        </header>

        <section className="how-section how-journey">
          <p className="how-section-label">01</p>
          <h2>{t('how.steps.title')}</h2>
          <ol className="how-steps">
            {STEPS.map(({ title, body }, index) => (
              <li key={title}>
                <span className="how-step-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="how-section how-architecture">
          <div className="how-section-copy">
            <p className="how-section-label">02 · WebRTC</p>
            <h2>{t('how.mesh.title')}</h2>
            <p>{t('how.mesh.body')}</p>
          </div>
          <div className="how-diagram-toolbar">
            <p>{t('how.diagram.prompt')}</p>
            <button type="button" aria-pressed={diagramPaused} onClick={() => setDiagramPaused((value) => !value)}>
              <span aria-hidden="true">{diagramPaused ? '▶' : 'Ⅱ'}</span>
              {t(diagramPaused ? 'how.diagram.play' : 'how.diagram.pause')}
            </button>
          </div>
          <div className="how-diagrams">
            <figure>
              <span className="how-diagram-badge">{t('how.diagram.media.badge')}</span>
              <MeshDiagram paused={diagramPaused} />
              <figcaption>{t('how.diagram.media')}</figcaption>
              <ul className="how-diagram-legend" aria-label={t('how.diagram.media.legend')}>
                <li className="is-voice">{t('how.diagram.media.voice')}</li>
                <li className="is-video">{t('how.diagram.media.video')}</li>
                <li className="is-screen">{t('how.diagram.media.screen')}</li>
              </ul>
            </figure>
            <figure>
              <span className="how-diagram-badge how-diagram-badge-muted">
                {t('how.diagram.signaling.badge')}
              </span>
              <MeshDiagram signaling paused={diagramPaused} />
              <figcaption>{t('how.diagram.signaling')}</figcaption>
              <ul className="how-diagram-legend" aria-label={t('how.diagram.signaling.legend')}>
                <li className="is-signal">{t('how.diagram.signaling.presence')}</li>
                <li className="is-signal">{t('how.diagram.signaling.connection')}</li>
              </ul>
            </figure>
          </div>
          <div className="how-story">
            <div className="how-story-intro">
              <p className="how-section-label">{t('how.diagram.story.kicker')}</p>
              <h3>{t('how.diagram.story.title')}</h3>
            </div>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <h4>{t('how.diagram.story.ask.title')}</h4>
                  <p>{t('how.diagram.story.ask.body')}</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <h4>{t('how.diagram.story.meet.title')}</h4>
                  <p>{t('how.diagram.story.meet.body')}</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <h4>{t('how.diagram.story.talk.title')}</h4>
                  <p>{t('how.diagram.story.talk.body')}</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="how-section how-details">
          <div className="how-section-copy">
            <p className="how-section-label">03</p>
            <h2>{t('how.details.title')}</h2>
            <p>{t('how.details.body')}</p>
          </div>
          <div className="how-detail-grid">
            {DETAILS.map(({ eyebrow, title, body, kind }) => (
              <article className={`how-detail how-detail-${kind}`} key={title}>
                <span className="how-detail-mark" aria-hidden="true" />
                <p className="how-detail-eyebrow">{t(eyebrow)}</p>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="how-section how-run">
          <div className="how-run-copy">
            <p className="how-section-label">04 · MIT</p>
            <h2>{t('how.run.title')}</h2>
            <p>{t('how.run.body')}</p>
            <p className="how-links">
              <a href={REPO} target="_blank" rel="noreferrer">
                {t('community.source.repo')}
              </a>
              <Link to="/community">{t('home.community')}</Link>
            </p>
          </div>
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
        </section>

        <aside className="how-cta">
          <div>
            <p className="how-section-label">{t('how.cta.eyebrow')}</p>
            <h2>{t('how.cta.title')}</h2>
            <p>{t('how.cta.body')}</p>
          </div>
          <Link to="/" className="how-button how-button-primary">
            {t('how.more.start')}
            <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </article>
    </main>
  );
}
