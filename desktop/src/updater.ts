/**
 * Self-update for the shell.
 *
 * The page updates itself on every deploy (see main.ts); this file only keeps
 * the *shell* fresh — Electron, the picker, permission handling. That gap is
 * measured in months, so the machinery stays deliberately small: ask the same
 * `/api/downloads` catalog the website uses, compare versions, and apply per
 * platform only as far as an unsigned binary honestly can:
 *
 * - **windows-x64**: NSIS reinstalls silently over itself and relaunches.
 * - **linux-appimage**: an AppImage is one file — swap it and restart.
 * - **mac / linux-deb**: no self-apply. Replacing an unsigned .app fights
 *   Gatekeeper (which is also why Squirrel/electron-updater is off the table),
 *   and a .deb belongs to the package manager. The browser download is the
 *   same flow as the first install.
 *
 * Security posture: downloads go over HTTPS to the same fixed GitHub Release
 * URL the website hands out, so an update carries exactly the trust level of
 * the original install — no more, no less. Byte size is verified whenever the
 * catalog states one, and nothing ever applies without an explicit user click.
 *
 * Every failure is silent (console.warn at most): the updater must never
 * degrade the app it updates.
 */
import { BrowserWindow, app, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { StringKey } from './i18n';

/**
 * The slice of `GET /api/downloads` this file reads. A local mirror on
 * purpose: the shell has no build-time dependency on the server — the full
 * shape lives in server/src/domain/downloads.ts and this must stay a subset.
 */
interface CatalogBuild {
  target: string;
  file: string;
  url: string;
  size: number | null;
}

interface Catalog {
  version: string | null;
  builds: CatalogBuild[];
}

interface UpdaterContext {
  appUrl: string;
  translate: (key: StringKey) => string;
  getWindow: () => BrowserWindow | null;
}

// First check waits out startup (window creation, first page load); after
// that a 6 h cadence is plenty for a shell that changes rarely.
const FIRST_CHECK_MS = 10_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const WIN_INSTALLER = 'freecord-update.exe';

/* ------------------------------------------------------------------ *
 * Version compare
 * ------------------------------------------------------------------ */

/** Strict numeric major.minor.patch; anything else means "no update". */
function parseTriple(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isNewer(candidate: string, current: string): boolean {
  const a = parseTriple(candidate);
  const b = parseTriple(current);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return (a[i] ?? 0) > (b[i] ?? 0);
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * "Once per version" memory
 * ------------------------------------------------------------------ */

function stateFile(): string {
  return path.join(app.getPath('userData'), 'updater.json');
}

/** Corrupt or missing file reads as "nothing dismissed". */
async function readDismissedVersion(): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(stateFile(), 'utf8')) as {
      dismissedVersion?: unknown;
    };
    return typeof raw.dismissedVersion === 'string' ? raw.dismissedVersion : null;
  } catch {
    return null;
  }
}

async function writeDismissedVersion(version: string): Promise<void> {
  try {
    await writeFile(stateFile(), JSON.stringify({ dismissedVersion: version }));
  } catch (error) {
    console.warn('[updater] could not persist dismissal:', error);
  }
}

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

/**
 * darwin/win32 are decided by the process; on Linux only an AppImage can tell
 * us where it lives ($APPIMAGE), everything else is treated as the .deb.
 */
function currentTarget(): string | null {
  switch (process.platform) {
    case 'darwin':
      return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    case 'win32':
      return 'windows-x64';
    case 'linux':
      return process.env.APPIMAGE ? 'linux-appimage' : 'linux-deb';
    default:
      return null;
  }
}

async function fetchCatalog(appUrl: string): Promise<Catalog | null> {
  try {
    const response = await fetch(`${appUrl}/api/downloads`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const catalog = (await response.json()) as Catalog;
    return Array.isArray(catalog.builds) ? catalog : null;
  } catch (error) {
    console.warn('[updater] catalog fetch failed:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

/**
 * Streams to disk — an installer is ~90 MB and must never sit in memory.
 * A size mismatch (truncated download, stale catalog) deletes the file:
 * a wrong-sized installer is worse than no installer.
 */
async function download(url: string, dest: string, size: number | null): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream),
      createWriteStream(dest),
    );
    if (size !== null && (await stat(dest)).size !== size) {
      throw new Error('size mismatch');
    }
    return true;
  } catch (error) {
    console.warn('[updater] download failed:', error);
    await rm(dest, { force: true }).catch(() => {});
    return false;
  }
}

/** An interrupted run may leave a 90 MB file behind; sweep it on startup. */
async function cleanupStale(): Promise<void> {
  const stale = [path.join(app.getPath('temp'), WIN_INSTALLER)];
  if (process.env.APPIMAGE) {
    stale.push(`${process.env.APPIMAGE}.next`);
  }
  await Promise.all(stale.map((file) => rm(file, { force: true }).catch(() => {})));
}

/* ------------------------------------------------------------------ *
 * Dialog and per-platform apply
 * ------------------------------------------------------------------ */

/** True = the user clicked the action; false = "not now". */
async function ask(
  ctx: UpdaterContext,
  version: string,
  detailKey: StringKey,
  actionKey: StringKey,
): Promise<boolean> {
  const options = {
    type: 'info' as const,
    title: ctx.translate('updateTitle'),
    message: ctx.translate('updateMessage').replace('{version}', version),
    detail: ctx.translate(detailKey),
    buttons: [ctx.translate(actionKey), ctx.translate('updateLater')],
    defaultId: 0,
    cancelId: 1,
  };
  const win = ctx.getWindow();
  const { response } =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
  return response === 0;
}

/**
 * Download first, prompt after: the "install" click must be instant, and a
 * failed download means no prompt at all this cycle (retry in 6 h).
 */
async function applyWindows(ctx: UpdaterContext, build: CatalogBuild, version: string) {
  const installer = path.join(app.getPath('temp'), WIN_INSTALLER);
  if (!(await download(build.url, installer, build.size))) {
    return;
  }
  if (!(await ask(ctx, version, 'updateInstallDetail', 'updateInstall'))) {
    await writeDismissedVersion(version);
    return;
  }
  // /S = silent; electron-builder's NSIS relaunches the app when it finishes.
  // Detached so quitting us does not kill the installer.
  spawn(installer, ['/S'], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

async function applyAppImage(ctx: UpdaterContext, build: CatalogBuild, version: string) {
  const current = process.env.APPIMAGE;
  if (!current) {
    return;
  }
  // Same directory as the running image: rename() across filesystems fails.
  const next = `${current}.next`;
  if (!(await download(build.url, next, build.size))) {
    return;
  }
  try {
    await chmod(next, 0o755);
  } catch (error) {
    console.warn('[updater] chmod failed:', error);
    await rm(next, { force: true }).catch(() => {});
    return;
  }
  if (!(await ask(ctx, version, 'updateRestartDetail', 'updateRestart'))) {
    await writeDismissedVersion(version);
    await rm(next, { force: true }).catch(() => {});
    return;
  }
  try {
    await rename(next, current);
  } catch (error) {
    console.warn('[updater] rename failed:', error);
    return;
  }
  // Not app.relaunch(): execPath points inside the squashfs mount of the OLD
  // image, which vanishes on quit. Spawn the (replaced) AppImage path itself.
  spawn(current, [], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

/**
 * mac and .deb: hand the fixed Release URL to the browser — the same flow as
 * the first install. Accept or decline, the version is recorded either way:
 * once it is in the browser's hands there is nothing left to nag about.
 */
async function applyViaBrowser(
  ctx: UpdaterContext,
  build: CatalogBuild,
  version: string,
  detailKey: StringKey,
) {
  if (await ask(ctx, version, detailKey, 'updateDownload')) {
    void shell.openExternal(build.url);
  }
  await writeDismissedVersion(version);
}

/* ------------------------------------------------------------------ *
 * The check cycle
 * ------------------------------------------------------------------ */

async function runCheck(ctx: UpdaterContext): Promise<void> {
  const target = currentTarget();
  if (!target) {
    return;
  }
  const catalog = await fetchCatalog(ctx.appUrl);
  const version = catalog?.version;
  if (!catalog || !version || !isNewer(version, app.getVersion())) {
    return;
  }
  if (version === (await readDismissedVersion())) {
    return;
  }
  // The release exists but this platform's asset is missing (upload still in
  // flight, or a partial release): no build, no prompt.
  const build = catalog.builds.find((candidate) => candidate.target === target);
  if (!build) {
    return;
  }
  switch (target) {
    case 'windows-x64':
      return applyWindows(ctx, build, version);
    case 'linux-appimage':
      return applyAppImage(ctx, build, version);
    case 'mac-arm64':
    case 'mac-x64':
      return applyViaBrowser(ctx, build, version, 'updateMacDetail');
    default:
      return applyViaBrowser(ctx, build, version, 'updateDebDetail');
  }
}

/** Call once after `app.whenReady()`. */
export function startUpdater(
  appUrl: string,
  translate: (key: StringKey) => string,
  getWindow: () => BrowserWindow | null,
): void {
  // `electron .` reports the package.json version but nothing is installed to
  // update; the updater is meaningless (and noisy) outside a packaged build.
  if (!app.isPackaged) {
    return;
  }
  const ctx: UpdaterContext = { appUrl, translate, getWindow };
  let busy = false;
  const check = () => {
    if (busy) {
      return;
    }
    busy = true;
    runCheck(ctx)
      .catch((error) => console.warn('[updater] check failed:', error))
      .finally(() => {
        busy = false;
      });
  };
  void cleanupStale();
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
}
