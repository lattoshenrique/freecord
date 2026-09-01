/**
 * tsc (bundler resolution) emits extensionless relative specifiers and keeps
 * string URLs verbatim. Both would break the published output as raw ESM:
 * browsers and Node resolve './x' to nothing, and the worker URL still says
 * `.ts`. This pass makes dist self-sufficient — no bundler required.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist', import.meta.url).pathname;
const relative = /(from\s+|import\s*\(\s*|export\s+\*\s+from\s+)(['"])(\.\.?\/[^'"]+?)(\2)/g;

for (const file of readdirSync(dist)) {
  if (!file.endsWith('.js') && !file.endsWith('.d.ts')) {
    continue;
  }
  const path = join(dist, file);
  let text = readFileSync(path, 'utf8');
  text = text.replace(relative, (whole, lead, quote, spec) =>
    spec.endsWith('.js') ? whole : `${lead}${quote}${spec}.js${quote}`,
  );
  if (file === 'pipe.js') {
    text = text.replaceAll('relay-worker.ts', 'relay-worker.js');
  }
  writeFileSync(path, text);
}
