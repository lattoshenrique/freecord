import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import { MOTION, usePresence } from '../lib/motion';
import { manualRoute, useInstall, type ManualRoute } from '../lib/pwa';
import './install.css';

/**
 * The install offer — the phone's answer to the desktop download.
 *
 * A phone cannot run the Electron build and has no reason to want it: the app
 * *is* this page, and the platform will keep it on the home screen. So where
 * a computer is offered an installer, a phone is offered the install.
 *
 * Two shapes, because browsers give us two. Chromium hands the page an event
 * and one tap does the whole thing. Everywhere else — every browser on iOS,
 * and the Android ones that never fire it — the item lives in a menu the page
 * is not allowed to open, so the honest thing is to say where it is. That is
 * what the sheet does, and it says it in two steps, never in a joke: the
 * point of those lines is that somebody follows them.
 */

/** iOS's Share glyph: the square with the arrow leaving through the top. */
function ShareIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}

/** The browser menu's three dots, which is where the item hides everywhere else. */
function MenuIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden={true}
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/** A phone-shaped mark for the offer itself. */
function InstallIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 8v7" />
      <path d="M9 12l3 3 3-3" />
    </svg>
  );
}

/** Which browser's menu we are describing — decided once, from this browser. */
function thisRoute(): ManualRoute {
  if (typeof navigator === 'undefined') {
    return 'menu';
  }
  return manualRoute({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
}

/**
 * The by-hand instructions, as a sheet.
 *
 * Modal manners on purpose: it is the only thing on screen that matters while
 * it is open, and somebody reading two steps should not be able to tab behind
 * them. Escape closes, focus comes in and goes back where it was.
 */
function HowToSheet({
  route,
  leaving,
  onClose,
}: {
  route: ManualRoute;
  leaving: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      // Captured, and stopped here. Opened from inside a call, this sheet
      // sits on top of the settings dialog — which listens for Escape on
      // the same window, and was listening first. Bubbling would close both
      // with one press; one press closes the thing on top.
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      opener?.focus();
    };
  }, []);

  const steps =
    route === 'ios'
      ? [
          { icon: <ShareIcon />, text: t('install.ios.step1') },
          { icon: <InstallIcon />, text: t('install.ios.step2') },
        ]
      : [
          { icon: <MenuIcon />, text: t('install.menu.step1') },
          { icon: <InstallIcon />, text: t('install.menu.step2') },
        ];

  return createPortal(
    <div
      className="install-backdrop"
      data-leaving={leaving ? 'true' : undefined}
      onClick={onClose}
    >
      <div
        className="install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheetRef}
        data-leaving={leaving ? 'true' : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="install-sheet-title" id={titleId}>
          {t('install.title')}
        </h2>
        <p className="install-sheet-lead">{t('install.lead')}</p>
        <ol className="install-steps">
          {steps.map((step) => (
            <li key={step.text}>
              <span className="install-step-icon">{step.icon}</span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="install-sheet-close" onClick={onClose}>
          {t('install.gotIt')}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Everything the two entry points share: the state, the sheet, and the one
 * decision — prompt the browser, or explain where its menu item is.
 *
 * `null` means there is nothing honest to offer (already installed, or a
 * platform that cannot), and both callers render nothing in that case.
 */
function useInstallOffer(): { label: string; act: () => void; sheet: ReactNode } | null {
  const { t } = useI18n();
  const { state, install } = useInstall(true);
  const [howTo, setHowTo] = useState(false);
  const { mounted, leaving } = usePresence(howTo, MOTION.panel);
  const route = thisRoute();

  if (state === 'installed' || state === 'unavailable') {
    return null;
  }
  return {
    label: t('install.cta'),
    act: () => {
      if (state === 'prompt') {
        // The browser's own dialog says the rest; a dismissal is an answer,
        // not an error, and Chromium offers the event again when it applies.
        void install();
        return;
      }
      setHowTo(true);
    },
    sheet: mounted ? (
      <HowToSheet route={route} leaving={leaving} onClose={() => setHowTo(false)} />
    ) : null,
  };
}

/**
 * The home's line, where a computer gets the download link.
 *
 * It borrows `.download-button` deliberately: the spacing under the create
 * button is written against that class in pages/home.css, and this is the
 * same slot with a different answer in it.
 */
export function InstallButton() {
  const offer = useInstallOffer();
  if (!offer) {
    return null;
  }
  return (
    <>
      <button type="button" className="download-button install-button" onClick={offer.act}>
        {offer.label}
      </button>
      {offer.sheet}
    </>
  );
}

/**
 * The row inside the call's settings, in the slot a computer uses for the
 * desktop download. It wears `.settings-action` so it sits in that dialog
 * like the link it replaces.
 */
export function InstallAction() {
  const offer = useInstallOffer();
  if (!offer) {
    return null;
  }
  return (
    <>
      <button type="button" className="settings-action" onClick={offer.act}>
        <InstallIcon />
        <span>{offer.label}</span>
      </button>
      {offer.sheet}
    </>
  );
}

/**
 * The block version, for a page with room for one: the same offer with the
 * reason next to it.
 *
 * A <section> because that is what it is on /community — the offer that
 * applies to the device reading it, standing beside the one about a
 * computer, not tucked inside it.
 */
export function InstallPanel() {
  const { t } = useI18n();
  const offer = useInstallOffer();
  if (!offer) {
    return null;
  }
  return (
    <section className="install-panel">
      <h2 className="install-panel-title">{t('install.title')}</h2>
      <p className="install-panel-lead">{t('install.also')}</p>
      <button type="button" className="install-cta" onClick={offer.act}>
        <InstallIcon />
        <span>{offer.label}</span>
      </button>
      {offer.sheet}
    </section>
  );
}
