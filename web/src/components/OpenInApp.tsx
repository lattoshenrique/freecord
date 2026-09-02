import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { handOffToApp, prefersApp, rememberApp } from '../lib/deep-link';
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
 * to find out is a fingerprint — so this is a choice, not a detection. Press
 * it once and the browser is told to open a `freecord://` link: the app comes
 * forward, or nothing at all happens, and either way this tab stays where it
 * is. The choice is remembered, so the *next* room link goes straight to the
 * app, and the way back out is on screen the whole time.
 */
export default function OpenInApp() {
  const { t } = useI18n();
  const guess = usePlatformGuess();
  /*
   * Remembered, and acted on once. Read at mount rather than watched: this
   * decides whether the screen is offering a handoff or reporting one, and a
   * value that changed underneath would swap the two while someone reads.
   */
  const [sent, setSent] = useState(() => prefersApp());

  // Once, at mount, and never again: pressing the button below hands off on
  // its own, and an effect that watched `sent` would do it a second time.
  useEffect(() => {
    if (!prefersApp()) {
      return;
    }
    // Someone already chose the app for links like this one. Nothing is
    // detected here and nothing is awaited: the tab carries on loading the
    // room, so a person whose app is gone is already where they need to be.
    if (!handOffToApp(window.location.pathname, window.location.hash)) {
      setSent(false);
    }
  }, []);

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
  if (!elsewhere) {
    return null;
  }

  if (sent) {
    return (
      <p className="join-app" role="status">
        <span>{t('deepLink.opening')}</span>
        <button
          type="button"
          className="join-app-link"
          onClick={() => {
            rememberApp(false);
            setSent(false);
          }}
        >
          {t('deepLink.stay')}
        </button>
      </p>
    );
  }

  return (
    <p className="join-app">
      <button
        type="button"
        className="join-app-link"
        onClick={() => {
          if (handOffToApp(window.location.pathname, window.location.hash)) {
            rememberApp(true);
            setSent(true);
          }
        }}
      >
        {t('deepLink.open')}
      </button>
    </p>
  );
}
