/**
 * highlight.js, its grammars, and nothing else — the whole point of this
 * module being its own file is that it is the whole of a chunk.
 *
 * Nothing imports it directly: code-detect.ts pulls it in with a dynamic
 * `import()` the first time a paste needs reading, so a room that never sees
 * a line of code never downloads a parser. The app already splits this way
 * (RoomPage, Community, HowItWorks), and the initial bundle is already at
 * the size Vite warns about.
 *
 * Only the languages a chat's clipboard actually carries are registered.
 * Auto-detection considers exactly what is registered, so a short list is
 * smaller AND more accurate than the full set of nearly two hundred.
 */

import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const GRAMMARS = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  php,
  python,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
} as const;

for (const [id, grammar] of Object.entries(GRAMMARS)) {
  hljs.registerLanguage(id, grammar);
}

const IDS = Object.keys(GRAMMARS);

/** hljs's own reading: which language, and how sure it is (its relevance). */
export function classify(text: string): { language: string; relevance: number } | null {
  const result = hljs.highlightAuto(text, IDS);
  return result.language ? { language: result.language, relevance: result.relevance } : null;
}

/**
 * Highlighted markup for a block of code.
 *
 * The return value is HTML and the caller sets it AS HTML — the one place in
 * this app that does. It is safe for one reason, and the reason has to hold
 * every time: highlight.js escapes every character of the code it is given
 * (`&`, `<`, `>` become entities) and adds only its own `<span class="hljs-…">`
 * wrappers. So the only thing that may ever be handed to a caller's
 * `dangerouslySetInnerHTML` is this return value, alone, never concatenated
 * with a file name, a language, or anything else that arrived from a peer.
 * Chat is end-to-end and peer-to-peer: every byte of `code` was written by
 * somebody else on the internet. `code-highlight.test.ts` pastes a `<script>`
 * and asserts it comes back inert.
 */
export function markup(code: string, language?: string): string {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
  return hljs.highlightAuto(code, IDS).value;
}
