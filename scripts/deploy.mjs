import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A real-call pitch report and the Brave jitter probe closed the sparse
// audio quality gate. Every public build must retain native P2P RTP until
// that gate is explicitly reopened; local research builds remain available.
const env = { ...process.env, VITE_SPARSE_AUDIO: '0' };
const cwd = fileURLToPath(new URL('../', import.meta.url));
for (const args of [['run', 'build'], ['run', 'deploy', '--workspace', 'worker']]) {
  const result = spawnSync('npm', args, {
    cwd, env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
