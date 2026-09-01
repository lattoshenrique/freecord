import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRoom } from '../api';
import { APP_BUILD, APP_VERSION } from '../lib/build-info';
import { generateRoomKey } from '../lib/chat-crypto';
import { looksLikeInvite, parseInvite } from '../lib/invite';
import DownloadCard from '../components/DownloadCard';
import LanguagePicker from '../components/LanguagePicker';
import Logo from '../components/Logo';
import MeshBackground from '../components/MeshBackground';
import { useI18n } from '../i18n';
import './home.css';

const REPO = 'https://github.com/lattoshenrique/freecord';

/**
 * The whole home page is one thing: a field and a button that open a room.
 *
 * The field opens rooms in both directions: type a name to create one, or
 * paste an invite link to join one — the button follows what the field holds.
 * In a browser an invite can go straight into the address bar, but the
 * desktop app has no address bar, and this same page is what the app loads:
 * without the paste path there would be no way to join a room from the app.
 *
 * Everything else — what the project is, how to self-host it, the desktop
 * builds — lives one link away in /community and in the README. A landing
 * page that explains before it lets you start makes the first click slower.
 */
export default function HomePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The caret belongs to the field: it is the only thing to do here. We take
   * it back when the window regains focus and when a click lands on the empty
   * page — never on a mouseless device, where forcing focus would force the
   * on-screen keyboard open every time someone taps the background.
   */
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener('focus', focus);

    const mouse = window.matchMedia('(pointer: fine)');
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!mouse.matches || target?.closest('a, button, input, select, textarea, label')) {
        return;
      }
      // After the browser has finished its own focus handling for this click.
      window.setTimeout(focus, 0);
    };
    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('focus', focus);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  // Recomputed on every keystroke: the button below reads what the field
  // holds and offers to join or to create accordingly.
  const invite = parseInvite(displayName);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (invite) {
      // The fragment carries the chat key — hand it over untouched.
      navigate(`/r/${invite.slug}${invite.hash}`);
      return;
    }
    if (looksLikeInvite(displayName)) {
      // Meant as an invite but broken (a truncated paste): naming a room
      // after it would send the link's author a very confused guest.
      setError(t('home.invalidInvite'));
      inputRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // The field is long enough for a pasted link; a *name* still has to
      // fit the server's limit (ROOM_LIMITS.displayNameMaxLength).
      const room = await createRoom(displayName.trim().slice(0, 60) || undefined);
      // The chat key lives in the fragment: shared by copying the link,
      // never sent to the server.
      const roomKey = generateRoomKey();
      navigate(roomKey ? `/r/${room.slug}#k=${roomKey}` : `/r/${room.slug}`);
    } catch {
      setError(t('home.createFailed'));
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  return (
    <main className="home">
      <section className="start">
        {/* The topology the product is, drawn live behind the field. */}
        <MeshBackground />

        <div className="start-center">
          <Link to="/" className="start-brand">
            <Logo size={30} />
            <span>{t('app.name')}</span>
          </Link>

          <h1>
            {t('home.hero.titleA')} <span className="start-grad">{t('home.hero.titleB')}</span>
          </h1>

          <p className="start-sub">{t('app.tagline')}</p>

          <form className="start-form" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={displayName}
              // Room for a full invite URL; names are capped on submit.
              maxLength={300}
              placeholder={t('home.roomNamePlaceholder')}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setError(null);
              }}
              aria-label={t('home.roomName')}
            />
            <button type="submit" disabled={creating}>
              {creating ? t('home.creating') : invite ? t('home.join') : t('home.create')}
            </button>
          </form>

          {error ? (
            <p className="start-error">{error}</p>
          ) : (
            <p className="start-hint">{invite ? t('home.joinHint') : t('home.card.hint')}</p>
          )}
        </div>

        <footer className="start-foot">
          <Link to="/how-it-works">{t('how.link')}</Link>
          <Link to="/community">{t('home.community')}</Link>
          <a href="#download">{t('home.footer.downloads')}</a>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <LanguagePicker />
          <span className="start-build" title={t('app.buildInfo', { version: APP_VERSION, build: APP_BUILD })}>
            v{APP_VERSION} · {APP_BUILD}
          </span>
        </footer>
      </section>

      {/* Below the fold on purpose: reached from the footer link and from
          /community, never in the way of creating a room. */}
      <div id="download" className="home-download">
        <DownloadCard />
      </div>
    </main>
  );
}
