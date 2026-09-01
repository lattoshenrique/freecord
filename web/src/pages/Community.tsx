import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { useI18n, type MessageKey } from '../i18n';
import './community.css';

const REPO = 'https://github.com/lattoshenrique/freecord';

const LINKS = {
  repo: REPO,
  architecture: `${REPO}/blob/main/docs/architecture.md`,
  license: `${REPO}/blob/main/LICENSE`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
  conduct: `${REPO}/blob/main/CODE_OF_CONDUCT.md`,
  issues: `${REPO}/issues`,
  newIssue: `${REPO}/issues/new`,
} as const;

const PROMISES: { title: MessageKey; body: MessageKey; mesh?: boolean }[] = [
  { title: 'community.promise.guest.title', body: 'community.promise.guest.body' },
  { title: 'community.promise.p2p.title', body: 'community.promise.p2p.body', mesh: true },
  { title: 'community.promise.chat.title', body: 'community.promise.chat.body' },
  { title: 'community.promise.vendor.title', body: 'community.promise.vendor.body' },
];

/** External links leave the SPA, so they all carry the same safety attributes. */
function ExternalLink({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: string;
}) {
  return (
    <a
      className={`community-link ${primary ? 'community-link-primary' : ''}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

export default function CommunityPage() {
  const { t } = useI18n();

  return (
    <main className="community">
      <nav className="community-nav">
        <Link to="/" className="community-brand">
          <Logo size={26} />
          <span>{t('app.name')}</span>
        </Link>
        <div className="community-nav-links">
          <Link to="/">{t('community.back')}</Link>
          <a className="community-nav-github" href={LINKS.repo} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </nav>

      <div className="community-inner">
        <header className="community-hero">
          <h1>{t('community.title')}</h1>
          <p className="community-lead">{t('community.lead')}</p>
        </header>

        <section>
          <h2 className="community-heading">{t('community.promise.title')}</h2>
          <div className="community-bento">
            {PROMISES.map(({ title, body, mesh }) => (
              <div key={title} className="community-tile">
                {mesh && <Logo size={36} className="community-mesh" />}
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="community-cards">
          <section className="community-card">
            <h2>{t('community.source.title')}</h2>
            <p>{t('community.source.body')}</p>
            <div className="community-links">
              <ExternalLink href={LINKS.repo} primary>
                {t('community.source.repo')}
              </ExternalLink>
              <ExternalLink href={LINKS.architecture}>
                {t('community.source.architecture')}
              </ExternalLink>
              <ExternalLink href={LINKS.license}>{t('community.source.license')}</ExternalLink>
            </div>
          </section>

          <section className="community-card">
            <h2>{t('community.contribute.title')}</h2>
            <p>{t('community.contribute.body')}</p>
            <div className="community-links">
              <ExternalLink href={LINKS.contributing} primary>
                {t('community.contribute.guide')}
              </ExternalLink>
              <ExternalLink href={LINKS.conduct}>{t('community.contribute.conduct')}</ExternalLink>
            </div>
          </section>

          <section className="community-card">
            <h2>{t('community.issues.title')}</h2>
            <p>{t('community.issues.body')}</p>
            <div className="community-links">
              <ExternalLink href={LINKS.newIssue} primary>
                {t('community.issues.report')}
              </ExternalLink>
              <ExternalLink href={LINKS.issues}>{t('community.issues.browse')}</ExternalLink>
            </div>
          </section>

          <section className="community-card">
            <h2>{t('community.desktop.title')}</h2>
            <p>{t('community.desktop.body')}</p>
            <div className="community-links">
              <Link className="community-link community-link-primary" to="/#download">
                {t('home.footer.downloads')}
              </Link>
            </div>
          </section>
        </div>

        <p className="community-footer">{t('community.footer')}</p>
      </div>
    </main>
  );
}
