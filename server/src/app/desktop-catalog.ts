/**
 * Reads the latest Release holding the desktop app binaries.
 *
 * A single place knows how to talk to the GitHub API; the two edges only
 * decide *how to cache it* (Cache API on the Worker, memory on Node). The
 * unauthenticated limit of 60 requests/hour per IP is why the cache exists —
 * and why `null` (failure) is a first-class value: callers serve the stale
 * catalog instead of hiding downloads because GitHub blinked.
 */
import {
  DESKTOP_REPO,
  buildDesktopCatalog,
  type DesktopCatalog,
  type GitHubRelease,
} from '../domain/downloads.js';

const LATEST_RELEASE_URL = `https://api.github.com/repos/${DESKTOP_REPO}/releases/latest`;

/** How long a fetched catalog is trusted before asking again. */
export const DESKTOP_CATALOG_TTL_MS = 30 * 60 * 1000;

/** Catalog from GitHub, or `null` when the read failed (network, quota, 5xx). */
export async function fetchDesktopCatalog(fetchImpl: typeof fetch = fetch): Promise<DesktopCatalog | null> {
  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        // The GitHub API rejects requests without a User-Agent.
        'User-Agent': 'freecord-downloads',
      },
    });
    // 404 is a legitimate answer: no release has been published yet.
    if (response.status === 404) {
      return buildDesktopCatalog(null);
    }
    if (!response.ok) {
      return null;
    }
    return buildDesktopCatalog((await response.json()) as GitHubRelease);
  } catch {
    return null;
  }
}
