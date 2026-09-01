import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
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

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="community-pillar">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default function CommunityPage() {
  const { t } = useI18n();

  return (
    <main className="community">
      <div className="community-inner">
        <header className="community-hero">
          <Link to="/" className="community-back">
            {t('community.back')}
          </Link>
          <h1>{t('community.title')}</h1>
          <p className="community-lead">{t('community.lead')}</p>
        </header>

        <section className="community-card">
          <h2>{t('community.promise.title')}</h2>
          <div className="community-grid">
            <Pillar
              title={t('community.promise.guest.title')}
              body={t('community.promise.guest.body')}
            />
            <Pillar
              title={t('community.promise.p2p.title')}
              body={t('community.promise.p2p.body')}
            />
            <Pillar
              title={t('community.promise.chat.title')}
              body={t('community.promise.chat.body')}
            />
            <Pillar
              title={t('community.promise.vendor.title')}
              body={t('community.promise.vendor.body')}
            />
          </div>
        </section>

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
        </section>

        <p className="community-footer">{t('community.footer')}</p>
      </div>
    </main>
  );
}
