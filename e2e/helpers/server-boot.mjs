/**
 * Boots the signaling edge (boot/serve.mjs) on an ephemeral port and waits
 * until /healthz answers. Shared by the Playwright global setup and the
 * load drivers.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const E2E_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(E2E_ROOT, '..');
export const WEB_DIST = resolve(REPO_ROOT, 'web', 'dist');
export const SERVER_DIST = resolve(REPO_ROOT, 'server', 'dist');

function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0
        ? resolvePromise(undefined)
        : rejectPromise(new Error(`${command} ${args.join(' ')} exited ${code}`)),
    );
    child.on('error', rejectPromise);
  });
}

/** Builds server/ (always — a stale dist tests yesterday's rules) and web/ (when missing or forced). */
export async function ensureBuilds({ withWeb }) {
  if (process.env.E2E_SKIP_SERVER_BUILD !== '1') {
    await run('npm', ['run', 'build', '--workspace', 'server'], REPO_ROOT);
  }
  if (withWeb && (!existsSync(resolve(WEB_DIST, 'index.html')) || process.env.E2E_BUILD_WEB === '1')) {
    await run('npm', ['run', 'build', '--workspace', 'web'], REPO_ROOT);
  }
}

/**
 * Spawns boot/serve.mjs and resolves with { port, child, stop() }.
 *
 * options.webDist    serve the SPA too (browser tests need it)
 * options.rateLimitMax  requests/min/IP (default: effectively off for tests)
 */
export async function bootServer(options = {}) {
  const env = {
    ...process.env,
    PORT: String(options.port ?? 0),
    RATE_LIMIT_MAX: String(options.rateLimitMax ?? 1_000_000),
  };
  if (options.webDist) {
    env.WEB_DIST = options.webDist;
  }
  const child = spawn('node', [resolve(E2E_ROOT, 'boot', 'serve.mjs')], {
    cwd: E2E_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const port = await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () => rejectPromise(new Error('server did not report a port within 30s')),
      30_000,
    );
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/E2E_SERVER_LISTENING (\{.*\})/);
      if (match) {
        clearTimeout(timer);
        resolvePromise(JSON.parse(match[1]).port);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error(`server exited early with code ${code}`));
    });
  });

  // Proof of readiness beyond the listen callback.
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        break;
      }
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error('server booted but /healthz never answered');
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    port,
    child,
    stop: () =>
      new Promise((resolvePromise) => {
        child.once('exit', () => resolvePromise(undefined));
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3_000).unref();
      }),
  };
}
