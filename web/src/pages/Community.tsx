import { Link } from 'react-router-dom';
import DownloadCard from '../components/DownloadCard';
import { InstallPanel } from '../components/InstallPrompt';
import Brand from '../components/Brand';
import { useI18n, type MessageKey } from '../i18n';
import './community.css';

const REPO = 'https://github.com/lattoshenrique/freecord';

/**
 * A page that is read, not operated: one column, headings, paragraphs and
 * links. Everything it used to say it still says — the glass cards, the bento
 * grid and the sticky nav are what left, because none of them was the content.
 */
const PROMISES: { title: MessageKey; body: MessageKey }[] = [
  { title: 'community.promise.guest.title', body: 'community.promise.guest.body' },
  { title: 'community.promise.p2p.title', body: 'community.promise.p2p.body' },
  { title: 'community.promise.chat.title', body: 'community.promise.chat.body' },
  { title: 'community.promise.vendor.title', body: 'community.promise.vendor.body' },
];

interface SectionLink {
  label: MessageKey;
  href: string;
  /** Stays inside the SPA: rendered as a route link, not an outbound anchor. */
  internal?: boolean;
}

const SECTIONS: { title: MessageKey; body: MessageKey; links: SectionLink[] }[] = [
  {
    title: 'community.source.title',
    body: 'community.source.body',
    links: [
      { label: 'community.source.repo', href: REPO },
      { label: 'community.source.architecture', href: `${REPO}/blob/main/docs/architecture.md` },
      { label: 'community.source.license', href: `${REPO}/blob/main/LICENSE` },
    ],
  },
  {
    title: 'community.contribute.title',
    body: 'community.contribute.body',
    links: [
      { label: 'community.contribute.guide', href: `${REPO}/blob/main/CONTRIBUTING.md` },
      { label: 'community.contribute.conduct', href: `${REPO}/blob/main/CODE_OF_CONDUCT.md` },
    ],
  },
  {
    title: 'community.issues.title',
    body: 'community.issues.body',
    links: [
      { label: 'community.issues.report', href: `${REPO}/issues/new` },
      { label: 'community.issues.browse', href: `${REPO}/issues` },
    ],
  },
];

/** Sits under the lead: the mechanics have a page of their own. */
const HOW_IT_WORKS = '/how-it-works';

export default function CommunityPage() {
  const { t } = useI18n();

  return (
    <main className="community">
      <article className="community-inner">
        <nav className="community-nav" aria-label={t('community.nav.label')}>
          <Link to="/" className="community-brand" aria-label={t('community.back')}>
            <Brand size={26} />
          </Link>
          <Link to={HOW_IT_WORKS} className="community-nav-link">
            {t('how.link')}
          </Link>
        </nav>

        <header className="community-hero">
          <p className="community-eyebrow">{t('community.eyebrow')}</p>
          <h1>{t('community.title')}</h1>
          <p className="community-lead">{t('community.lead')}</p>
          <div className="community-hero-actions">
            <a className="community-button community-button-primary" href={REPO} target="_blank" rel="noreferrer">
              {t('community.source.repo')}
              <span aria-hidden="true">↗</span>
            </a>
            <Link className="community-button community-button-secondary" to={HOW_IT_WORKS}>
              {t('how.link')}
            </Link>
          </div>
          <dl className="community-facts">
            <div>
              <dt>{t('community.fact.license.value')}</dt>
              <dd>{t('community.fact.license.label')}</dd>
            </div>
            <div>
              <dt>{t('community.fact.stack.value')}</dt>
              <dd>{t('community.fact.stack.label')}</dd>
            </div>
            <div>
              <dt>{t('community.fact.cost.value')}</dt>
              <dd>{t('community.fact.cost.label')}</dd>
            </div>
          </dl>
        </header>

        <section className="community-section community-principles">
          <p className="community-section-label">01 · {t('community.promise.kicker')}</p>
          <h2>{t('community.promise.title')}</h2>
          <div className="community-promises">
            {PROMISES.map(({ title, body }, index) => (
              <article key={title}>
                <span className="community-promise-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="community-section community-participate">
          <div className="community-section-copy">
            <p className="community-section-label">02 · {t('community.participate.kicker')}</p>
            <h2>{t('community.participate.title')}</h2>
            <p>{t('community.participate.body')}</p>
          </div>
          <div className="community-paths">
            {SECTIONS.map(({ title, body, links }, index) => (
              <article key={title}>
                <span className="community-path-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
                <div className="community-links">
                  {links.map(({ label, href, internal }) =>
                    internal ? (
                      <Link key={label} to={href}>
                        {t(label)} <span aria-hidden="true">→</span>
                      </Link>
                    ) : (
                      <a key={label} href={href} target="_blank" rel="noreferrer">
                        {t(label)} <span aria-hidden="true">↗</span>
                      </a>
                    ),
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* On a phone, the build that applies is this page: it installs.
            Its own section, beside the desktop one rather than inside it —
            reading the page by its headings, "install this" is not a
            footnote to "there is a desktop app". Renders nothing on a
            computer, or once installed. */}
        <InstallPanel />

        {/* The desktop builds live here, with the rest of the reading matter:
            the home is the app's first screen and pitches nothing. */}
        <section className="community-section community-desktop">
          <div className="community-section-copy">
            <p className="community-section-label">03 · {t('community.desktop.kicker')}</p>
            <h2>{t('community.desktop.title')}</h2>
            <p>{t('community.desktop.body')}</p>
          </div>
          <DownloadCard />
        </section>

        <p className="community-footer">{t('community.footer')}</p>
      </article>
    </main>
  );
}
