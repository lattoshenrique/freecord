import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain-JS helper shared with the load drivers
import { E2E_ROOT } from '../helpers/server-boot.mjs';

export default async function globalTeardown(): Promise<void> {
  const stateFile = resolve(E2E_ROOT, '.server.json');
  if (!existsSync(stateFile)) {
    return;
  }
  const { pid } = JSON.parse(readFileSync(stateFile, 'utf8')) as { pid: number };
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
  unlinkSync(stateFile);
}
