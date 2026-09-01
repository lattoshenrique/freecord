/**
 * Catalog of the Freecord desktop app (Electron).
 *
 * The installers do not fit on the edge: Cloudflare Workers assets cap a file
 * at 25 MiB and an Electron build is over 90 MB. They live in a GitHub Release
 * and the server only answers *which one* to download.
 *
 * Asset filenames are **fixed** (no version in them) on purpose: that is what
 * makes `/releases/latest/download/<file>` always point at the newest build,
 * so a link stays valid even when a cached catalog is stale.
 *
 * Pure domain: both edges (Fastify and Worker) build the same catalog.
 */

/** Repository that owns the Releases holding the binaries. */
export const DESKTOP_REPO = 'lattoshenrique/freecord';

export type DesktopOs = 'mac' | 'windows' | 'linux';

export type DesktopTarget =
  | 'mac-arm64'
  | 'mac-x64'
  | 'windows-x64'
  | 'linux-appimage'
  | 'linux-deb';

export interface DesktopBuild {
  target: DesktopTarget;
  os: DesktopOs;
  /** Asset name in the Release — stable across versions (see header). */
  file: string;
  /** Button label. */
  label: string;
  /** One line saying who it is for. */
  hint: string;
}

export const DESKTOP_BUILDS: readonly DesktopBuild[] = [
  {
    target: 'mac-arm64',
    os: 'mac',
    file: 'freecord-mac-arm64.dmg',
    label: 'macOS · Apple Silicon',
    hint: 'Macs com chip M1 ou mais novo',
  },
  {
    target: 'mac-x64',
    os: 'mac',
    file: 'freecord-mac-x64.dmg',
    label: 'macOS · Intel',
    hint: 'Macs até 2020, com processador Intel',
  },
  {
    target: 'windows-x64',
    os: 'windows',
    file: 'freecord-win-x64.exe',
    label: 'Windows',
    hint: 'Instalador para Windows 10 ou 11 (64 bits)',
  },
  {
    target: 'linux-appimage',
    os: 'linux',
    file: 'freecord-linux-x86_64.AppImage',
    label: 'Linux · AppImage',
    hint: 'Roda em qualquer distribuição, sem instalar',
  },
  {
    target: 'linux-deb',
    os: 'linux',
    file: 'freecord-linux-amd64.deb',
    label: 'Linux · .deb',
    hint: 'Debian, Ubuntu e derivados',
  },
];

/** Stable link: GitHub resolves `latest` on its side, with no API call. */
export function desktopDownloadUrl(file: string): string {
  return `https://github.com/${DESKTOP_REPO}/releases/latest/download/${file}`;
}

export interface DesktopAsset extends DesktopBuild {
  url: string;
  /** Bytes, when the Release could be read. */
  size: number | null;
}

export interface DesktopCatalog {
  version: string | null;
  publishedAt: string | null;
  /** Empty = no release published yet (the UI shows no download). */
  builds: DesktopAsset[];
  /** Page listing every version and its notes. */
  releasesUrl: string;
}

/** The slice we read from `GET /repos/:repo/releases/latest`. */
export interface GitHubRelease {
  tag_name?: string;
  published_at?: string;
  assets?: Array<{ name?: string; size?: number }>;
}

export const EMPTY_DESKTOP_CATALOG: DesktopCatalog = {
  version: null,
  publishedAt: null,
  builds: [],
  releasesUrl: `https://github.com/${DESKTOP_REPO}/releases`,
};

/**
 * Builds the catalog from a Release. A build is only listed when its asset
 * actually exists — promising a download that 404s is worse than no button.
 */
export function buildDesktopCatalog(release: GitHubRelease | null): DesktopCatalog {
  if (!release) {
    return EMPTY_DESKTOP_CATALOG;
  }
  const assets = new Map(
    (release.assets ?? [])
      .filter((asset): asset is { name: string; size?: number } => Boolean(asset.name))
      .map((asset) => [asset.name, asset.size ?? null] as const),
  );
  const builds = DESKTOP_BUILDS.filter((build) => assets.has(build.file)).map((build) => ({
    ...build,
    url: desktopDownloadUrl(build.file),
    size: assets.get(build.file) ?? null,
  }));
  return {
    version: (release.tag_name ?? '').replace(/^(desktop-)?v/, '') || null,
    publishedAt: release.published_at ?? null,
    builds,
    releasesUrl: EMPTY_DESKTOP_CATALOG.releasesUrl,
  };
}

/** Build for one target, used by the short `/download/:target` redirect. */
export function findDesktopBuild(target: string): DesktopBuild | undefined {
  return DESKTOP_BUILDS.find((build) => build.target === target);
}
