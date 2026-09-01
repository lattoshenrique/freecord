import { useEffect, useState } from 'react';
import { getDownloads, type DesktopAsset, type DesktopCatalog } from '../api';
import { useI18n, type MessageKey, type Translate } from '../i18n';
import { detectPlatform, isDesktopApp, type PlatformGuess } from '../lib/platform';
import './download.css';

/**
 * Invitation to the desktop app, with **one** button: the visitor's own OS.
 *
 * It hides itself in three honest cases — inside the app already, no release
 * published, and when the catalog has no build for that system.
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

export default function DownloadCard() {
  const { t, locale } = useI18n();
  const [catalog, setCatalog] = useState<DesktopCatalog | null>(null);
  const [guess, setGuess] = useState<PlatformGuess | null>(null);
  const [showAll, setShowAll] = useState(false);

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
  const version = catalog.version ? `v${catalog.version}` : null;

  // Mobile, unknown OS, or no build for it: offer the list, not a button
  // that would download the wrong binary.
  if (!pick) {
    return (
      <section className="download">
        <p className="download-note">{t('download.also')}</p>
        <DownloadList builds={catalog.builds} />
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
      <a className="button-link download-cta" href={pick.url}>
        {t('download.cta', { os: OS_LABEL[pick.os] })}
      </a>
      <p className="download-meta">
        {[targetHint(t, pick.target), size, version].filter(Boolean).join(' · ')}
      </p>

      {macAlternative && (
        <p className="download-note">
          {guess.confident ? t('download.macOtherConfident') : t('download.macOtherUnsure')}{' '}
          <a href={macAlternative.url}>
            {macAlternative.target === 'mac-arm64'
              ? t('download.macOtherArm')
              : t('download.macOtherIntel')}
          </a>
        </p>
      )}

      <p className="download-note">{t(`download.firstRun.${pick.os}` as MessageKey)}</p>

      {others.length > 0 && (
        <>
          <button type="button" className="link-button" onClick={() => setShowAll((open) => !open)}>
            {showAll ? t('download.hideOthers') : t('download.showOthers')}
          </button>
          {showAll && <DownloadList builds={others} />}
        </>
      )}
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
            <a href={build.url}>{targetLabel(t, build.target)}</a>
            {size && <span className="download-size"> · {size}</span>}
          </li>
        );
      })}
    </ul>
  );
}
