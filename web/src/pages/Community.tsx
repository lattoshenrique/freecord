import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
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
  {
    title: 'community.desktop.title',
    body: 'community.desktop.body',
    links: [{ label: 'home.footer.downloads', href: '/#download', internal: true }],
  },
];

export default function CommunityPage() {
  const { t } = useI18n();

  return (
    <main className="community">
      <article className="community-inner">
        {/* The mark is the way back: one affordance, top left, like the home. */}
        <Link to="/" className="community-brand" aria-label={t('community.back')}>
          <Logo size={26} />
          <span>{t('app.name')}</span>
        </Link>

        <header>
          <h1>{t('community.title')}</h1>
          <p className="community-lead">{t('community.lead')}</p>
        </header>

        <section>
          <h2>{t('community.promise.title')}</h2>
          <div className="community-promises">
            {PROMISES.map(({ title, body }) => (
              <div key={title}>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            ))}
          </div>
        </section>

        {SECTIONS.map(({ title, body, links }) => (
          <section key={title}>
            <h2>{t(title)}</h2>
            <p>{t(body)}</p>
            <p className="community-links">
              {links.map(({ label, href, internal }) =>
                internal ? (
                  <Link key={label} to={href}>
                    {t(label)}
                  </Link>
                ) : (
                  <a key={label} href={href} target="_blank" rel="noreferrer">
                    {t(label)}
                  </a>
                ),
              )}
            </p>
          </section>
        ))}

        <p className="community-footer">{t('community.footer')}</p>
      </article>
    </main>
  );
}
