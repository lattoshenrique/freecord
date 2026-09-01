import { useEffect, useState } from 'react';
import { getDownloads, type DesktopAsset, type DesktopCatalog } from '../api';
import { detectPlatform, isDesktopApp, type PlatformGuess } from '../lib/platform';
import './download.css';

/**
 * Invitation to the desktop app, with **one** button: the visitor's own OS.
 *
 * It hides itself in three honest cases — inside the app already, no release
 * published, and when the catalog has no build for that system.
 */

const OS_LABEL: Record<DesktopAsset['os'], string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

/** Unsigned-app warning — the real obstacle on first launch. */
const FIRST_RUN: Record<DesktopAsset['os'], string> = {
  mac: 'O app não é assinado por um certificado da Apple: na primeira abertura o macOS bloqueia. Vá em Ajustes do Sistema → Privacidade e Segurança e clique em “Abrir mesmo assim”.',
  windows:
    'O Windows vai avisar que o editor é desconhecido (o app não é assinado): clique em Mais informações → Executar assim mesmo.',
  linux: 'No AppImage, dê permissão de execução antes de abrir: chmod +x freecord-linux-x86_64.AppImage',
};

function formatSize(bytes: number | null): string | null {
  return bytes ? `${Math.round(bytes / 1024 / 1024)} MB` : null;
}

export default function DownloadCard() {
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
        <p className="download-note">
          O Freecord também tem app para computador — com seletor de tela nativo.
        </p>
        <DownloadList builds={catalog.builds} />
      </section>
    );
  }

  const size = formatSize(pick.size);
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
        Baixar o app para {OS_LABEL[pick.os]}
      </a>
      <p className="download-meta">
        {[pick.hint, size, version].filter(Boolean).join(' · ')}
      </p>

      {macAlternative && (
        <p className="download-note">
          {guess.confident ? 'Seu Mac é o outro tipo?' : 'Não conseguimos identificar seu Mac.'}{' '}
          <a href={macAlternative.url}>Baixar a versão {macAlternative.label.split(' · ')[1]}</a>
        </p>
      )}

      <p className="download-note">{FIRST_RUN[pick.os]}</p>

      {others.length > 0 && (
        <>
          <button type="button" className="link-button" onClick={() => setShowAll((open) => !open)}>
            {showAll ? 'Ocultar outras plataformas' : 'Outras plataformas'}
          </button>
          {showAll && <DownloadList builds={others} />}
        </>
      )}
    </section>
  );
}

function DownloadList({ builds }: { builds: DesktopAsset[] }) {
  return (
    <ul className="download-list">
      {builds.map((build) => {
        const size = formatSize(build.size);
        return (
          <li key={build.target}>
            <a href={build.url}>{build.label}</a>
            {size && <span className="download-size"> · {size}</span>}
          </li>
        );
      })}
    </ul>
  );
}
