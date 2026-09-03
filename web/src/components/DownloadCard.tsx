import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDownloads, type DesktopAsset, type DesktopCatalog } from '../api';
import { useI18n, type MessageKey, type Translate } from '../i18n';
import {
  detectPlatform,
  guessOs,
  isDesktopApp,
  type DetectedOs,
  type PlatformGuess,
} from '../lib/platform';
import { InstallButton } from './InstallPrompt';
import './download.css';

/**
 * Invitation to the desktop app, with **one** button: the visitor's own OS.
 *
 * It hides itself in three honest cases — inside the app already, no release
 * published, and when the catalog has no build for that system.
 *
 * On a phone it does not hide, it changes its answer: there is no desktop
 * build to run there, but the page itself installs (see InstallPrompt.tsx).
 */

/** Product names, not translatable text. */
const OS_LABEL: Record<DesktopAsset['os'], string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

/**
 * Labels come from the catalog, keyed by the target id the server sends.
 * The server deliberately ships no user text: locale never travels on the wire.
 */
const targetLabel = (t: Translate, target: string) =>
  t(`download.target.${target}` as MessageKey);
const targetHint = (t: Translate, target: string) => t(`download.hint.${target}` as MessageKey);

/**
 * Megabytes through Intl: the decimal separator and the unit's position differ by
 * locale, so formatting on the server would be one more locale leak.
 */
function formatSize(bytes: number | null, locale: string): string | null {
  if (!bytes) {
    return null;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 0,
  }).format(bytes / 1024 / 1024);
}

/**
 * The catalog and the visitor's OS, fetched once: the card below and the
 * home's button both need the same pair. `null` while loading, inside the
 * desktop app, or when there is nothing published — callers render nothing.
 */
export function useDesktopDownload(): {
  catalog: DesktopCatalog;
  guess: PlatformGuess;
  pick: DesktopAsset | null;
} | null {
  const [catalog, setCatalog] = useState<DesktopCatalog | null>(null);
  const [guess, setGuess] = useState<PlatformGuess | null>(null);

  useEffect(() => {
    if (isDesktopApp()) {
      return;
    }
    let alive = true;
    void Promise.all([getDownloads(), detectPlatform()])
      .then(([downloads, platform]) => {
        if (alive) {
          setCatalog(downloads);
          setGuess(platform);
        }
      })
      // With no catalog the block simply does not render: downloads are extra.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!catalog || !guess || catalog.builds.length === 0) {
    return null;
  }
  const pick = catalog.builds.find((build) => build.target === guess.target) ?? null;
  return { catalog, guess, pick };
}

/**
 * Which system this is, answered during the first render.
 *
 * No promise, no fetch: `guessOs` only reads the user agent, so a caller can
 * draw with it in the same frame as everything around it.
 */
export function useDetectedOs(): DetectedOs {
  const [os] = useState<DetectedOs>(guessOs);
  return os;
}

/**
 * The visitor's OS *and architecture*, without waiting for the download
 * catalog.
 *
 * The install offer must not depend on `/api/downloads`: a phone is being
 * offered the page it is already looking at, and a catalog that is slow, or
 * empty, or failed would be a strange reason to withhold that.
 */
export function usePlatformGuess(): PlatformGuess | null {
  const [guess, setGuess] = useState<PlatformGuess | null>(null);
  useEffect(() => {
    let alive = true;
    void detectPlatform()
      .then((platform) => {
        if (alive) {
          setGuess(platform);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return guess;
}

/**
 * One button for the home: the visitor's own build, or — on a phone — the
 * offer to install this page as an app.
 *
 * It draws on the **first paint**, like the field and the button above it: the
 * OS is a synchronous answer (`guessOs`), so there is nothing to wait for
 * before saying "Download for macOS". What the catalog adds later is only the
 * href — until it arrives the button points at /community, where every build
 * is listed, so a click in the first moments still lands somewhere true.
 *
 * The two honest exits stay: inside the desktop app there is nothing to
 * download, and a phone gets the install offer instead.
 */
export function DownloadButton() {
  const { t } = useI18n();
  const os = useDetectedOs();
  const download = useDesktopDownload();

  if (isDesktopApp()) {
    return null;
  }
  // A phone cannot run the Electron build, and pointing it at a list of
  // installers it has no use for was always the weakest line on this page.
  if (os === 'mobile') {
    return <InstallButton />;
  }
  const pick = download?.pick ?? null;
  if (pick) {
    return (
      <a className="download-button" href={pick.url}>
        {t('download.cta', { os: OS_LABEL[pick.os] })}
      </a>
    );
  }
  // No build for this system — or an OS we could not name. Once the catalog
  // has answered and holds nothing for them, the label stops promising one.
  const named = os === 'mac' || os === 'windows' || os === 'linux';
  return (
    <Link className="download-button" to="/community">
      {named && !download ? t('download.cta', { os: OS_LABEL[os] }) : t('home.footer.downloads')}
    </Link>
  );
}

export default function DownloadCard() {
  const { t, locale } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const download = useDesktopDownload();

  if (!download) {
    return null;
  }

  const { catalog, guess, pick } = download;
  const version = catalog.version ? `v${catalog.version}` : null;

  // Mobile, unknown OS, or no build for it: offer the list, not a button
  // that would download the wrong binary.
  if (!pick) {
    return (
      <section className="download">
        <div className="download-main">
          <h2 className="download-title">{t('community.desktop.title')}</h2>
          <p className="download-lead">{t('download.also')}</p>
        </div>
        <aside className="download-side">
          <DownloadList builds={catalog.builds} />
        </aside>
      </section>
    );
  }

  const size = formatSize(pick.size, locale);
  // On a Mac the other architecture stays one click away: Intel vs Apple
  // Silicon detection is a guess in Safari (see lib/platform.ts).
  const macAlternative =
    pick.os === 'mac'
      ? (catalog.builds.find((build) => build.os === 'mac' && build.target !== pick.target) ?? null)
      : null;
  const others = catalog.builds.filter((build) => build !== pick && build !== macAlternative);

  return (
    <section className="download">
      <div className="download-main">
        <h2 className="download-title">{t('community.desktop.title')}</h2>
        <p className="download-lead">{t('download.also')}</p>

        <a className="download-cta" href={pick.url}>
          {t('download.cta', { os: OS_LABEL[pick.os] })}
        </a>

        <ul className="download-chips">
          {[targetHint(t, pick.target), size, version].filter(Boolean).map((chip) => (
            <li key={chip as string}>{chip}</li>
          ))}
        </ul>

        {macAlternative && (
          <p className="download-alt">
            {guess.confident ? t('download.macOtherConfident') : t('download.macOtherUnsure')}{' '}
            <a href={macAlternative.url}>
              {macAlternative.target === 'mac-arm64'
                ? t('download.macOtherArm')
                : t('download.macOtherIntel')}
            </a>
          </p>
        )}
      </div>

      <aside className="download-side">
        <p className="download-callout">{t(`download.firstRun.${pick.os}` as MessageKey)}</p>

        {others.length > 0 && (
          <>
            <button
              type="button"
              className="download-toggle"
              onClick={() => setShowAll((open) => !open)}
            >
              {showAll ? t('download.hideOthers') : t('download.showOthers')}
            </button>
            {showAll && <DownloadList builds={others} />}
          </>
        )}
      </aside>
    </section>
  );
}

function DownloadList({ builds }: { builds: DesktopAsset[] }) {
  const { t, locale } = useI18n();
  return (
    <ul className="download-list">
      {builds.map((build) => {
        const size = formatSize(build.size, locale);
        return (
          <li key={build.target}>
            <a href={build.url}>
              <span>{targetLabel(t, build.target)}</span>
              {size && <span className="download-size">{size}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
