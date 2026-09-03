import { useState } from 'react';
import { useI18n } from '../i18n';
import { appLink } from '../lib/deep-link';
import { isDesktopApp } from '../lib/platform';
import { isStandalone } from '../lib/pwa';
import { usePlatformGuess } from './DownloadCard';

/**
 * The doorstep's offer to open this room in the desktop app instead.
 *
 * It sits on the prejoin and nowhere else, because that is the one screen
 * where the answer still costs nothing: the room has not been joined, no
 * device is on, and the app can pick the link up from the beginning.
 *
 * The browser cannot be asked whether an app is installed — every honest way
 * to find out is a fingerprint. The handoff is therefore a real
 * `freecord://` anchor activated by this click: the app comes forward after
 * the browser's confirmation, or nothing happens, and this tab stays where it
 * is. It cannot be replayed from an effect on the next visit; browsers block
 * external protocols without a fresh user activation.
 */
export default function OpenInApp() {
  const { t } = useI18n();
  const guess = usePlatformGuess();
  const [sent, setSent] = useState(false);
  const link = appLink(window.location.pathname, window.location.hash);

  /*
   * Three silences, and the same reason under all of them: there has to be
   * another window for the offer to point at. A phone cannot run the desktop
   * app; inside the app it would point at itself; and the installed page is
   * handed its own links by the platform without being asked. The platform
   * guess arrives a beat late, and until it does there is nothing to say.
   */
  const elsewhere =
    guess !== null &&
    guess.os !== 'mobile' &&
    guess.os !== 'unknown' &&
    !isDesktopApp() &&
    !isStandalone();
  if (!elsewhere || !link) {
    return null;
  }

  if (sent) {
    return (
      <p className="join-app" role="status">
        <span>{t('deepLink.opening')}</span>
        <button
          type="button"
          className="join-app-link"
          onClick={() => setSent(false)}
        >
          {t('deepLink.stay')}
        </button>
      </p>
    );
  }

  return (
    <p className="join-app">
      <a
        className="join-app-link"
        href={link}
        onClick={() => setSent(true)}
      >
        {t('deepLink.open')}
      </a>
    </p>
  );
}
