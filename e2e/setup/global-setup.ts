/**
 * Boots one signaling edge (serving the built SPA) for the whole run.
 * The child's pid + port land in .server.json for the teardown, and the
 * port rides process.env into every worker.
 */
// @ts-expect-error plain-JS helper shared with the load drivers
import { bootServer, ensureBuilds, WEB_DIST, E2E_ROOT } from '../helpers/server-boot.mjs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function globalSetup(): Promise<void> {
  await ensureBuilds({ withWeb: true });
  const server = await bootServer({ webDist: WEB_DIST });
  writeFileSync(
    resolve(E2E_ROOT, '.server.json'),
    JSON.stringify({ port: server.port, pid: server.child.pid }),
  );
  process.env.E2E_PORT = String(server.port);
  // The child must outlive this process (workers connect to it): detach
  // by dropping our reference; the teardown kills it by pid.
  server.child.unref();
  server.child.stdout?.destroy();
}
