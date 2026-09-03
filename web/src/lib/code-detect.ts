/**
 * "Is this pasted thing code, and which language?"
 *
 * A wall of text on the clipboard is usually one of two things: prose, or a
 * chunk of code someone wants to show. Prose belongs in the message; code
 * belongs in a code viewer — fenced, coloured, with the language named.
 * Nobody types the fence and nobody picks the language out of a menu: a
 * paste is a gesture, not a form.
 *
 * The reading itself is highlight.js's, which parses the text as every
 * language it knows and scores each attempt — a far better judge than any
 * regex of ours. That parser lives in highlight.ts and arrives by dynamic
 * import, so a room where nobody pastes code never downloads it. This file
 * is the part that stays: cheap tests that can say "this is prose" without
 * loading anything, and the small table of what a language is called and
 * what its files are named.
 *
 * Two guards sit on top of hljs's score, because hljs is built to highlight
 * rather than to refuse:
 *
 * - JSON is asked first, and asked properly (JSON.parse). A config blob is
 *   the most pasted thing in a room, and hljs reads `{ "a": 1 }` as several
 *   other languages just as happily.
 * - Prose must fail a mechanical test before the score is even consulted.
 *   English scores surprisingly well as PHP or Ruby, and a paragraph of
 *   Lorem Ipsum is not code because it contains the word `for`.
 */

/**
 * The languages a room's clipboard actually carries, with the two things a
 * paste needs of them: the word that goes after the opening fence, and the
 * extension the file gets when the paste is too long to be a message. The
 * ids match the grammars registered in highlight.ts.
 */
const LANGUAGES: ReadonlyArray<{ id: string; label: string; extension: string }> = [
  { id: 'json', label: 'JSON', extension: 'json' },
  { id: 'typescript', label: 'TypeScript', extension: 'ts' },
  { id: 'javascript', label: 'JavaScript', extension: 'js' },
  { id: 'python', label: 'Python', extension: 'py' },
  { id: 'bash', label: 'Shell', extension: 'sh' },
  { id: 'xml', label: 'HTML', extension: 'html' },
  { id: 'css', label: 'CSS', extension: 'css' },
  { id: 'sql', label: 'SQL', extension: 'sql' },
  { id: 'yaml', label: 'YAML', extension: 'yml' },
  { id: 'go', label: 'Go', extension: 'go' },
  { id: 'rust', label: 'Rust', extension: 'rs' },
  { id: 'java', label: 'Java', extension: 'java' },
  { id: 'kotlin', label: 'Kotlin', extension: 'kt' },
  { id: 'swift', label: 'Swift', extension: 'swift' },
  { id: 'csharp', label: 'C#', extension: 'cs' },
  { id: 'cpp', label: 'C++', extension: 'cpp' },
  { id: 'c', label: 'C', extension: 'c' },
  { id: 'php', label: 'PHP', extension: 'php' },
  { id: 'ruby', label: 'Ruby', extension: 'rb' },
  { id: 'ini', label: 'INI', extension: 'ini' },
  { id: 'diff', label: 'Diff', extension: 'diff' },
  { id: 'dockerfile', label: 'Dockerfile', extension: 'dockerfile' },
];

export interface DetectedCode {
  /** highlight.js id, and the word written after the opening fence. */
  language: string;
  /** How the language is named to a person — "TypeScript", not "typescript". */
  label: string;
  /** Extension for the file a too-long paste becomes. */
  extension: string;
}

function describe(id: string): DetectedCode | null {
  const found = LANGUAGES.find((language) => language.id === id);
  return found ? { language: found.id, label: found.label, extension: found.extension } : null;
}

/** Below this there is not enough text to tell code from a sentence. */
const MIN_LENGTH = 24;

/**
 * How mechanical the text looks. Code closes its brackets, ends its
 * statements, assigns, indents, pipes; a paragraph does none of that, however
 * many keywords it happens to contain. Cheap, and it runs before the parser
 * is even downloaded.
 */
function mechanicalScore(text: string): number {
  const lines = text.split('\n');
  let score = 0;
  if (/[{}[\]]/.test(text)) score += 1;
  if (/;\s*$/m.test(text)) score += 1;
  if (/^[ \t]+\S/m.test(text)) score += 1; // an indented line
  if (/[=<>!+\-*/%]=|=>|->|::|\|\||&&/.test(text)) score += 1;
  if (/\w+\s*\([^)]*\)/.test(text)) score += 1; // a call or a signature
  if (/^\s*(?:#|\/\/|--|\/\*)/m.test(text)) score += 1; // a comment line
  if (/^\s*(?:[$>]\s|\w[\w.-]*\s+-{1,2}\w)/m.test(text)) score += 1; // a shell line
  if (/<\/?[a-z][\w-]*(?:\s[^<>]*)?>/i.test(text)) score += 1; // a tag
  // Long lines of running words are the shape of prose, whatever else is here.
  const wordy = lines.filter((line) => line.trim().split(/\s+/).length > 12).length;
  if (wordy > lines.length / 2) score -= 2;
  return score;
}

let parser: Promise<typeof import('./highlight')> | null = null;

/**
 * Pulls the parser in. Called on its own when the chat opens, so the chunk
 * is already there by the time somebody pastes — and awaited by the paste
 * itself, so a paste that beats the download still behaves the same, only
 * a moment later.
 */
export function loadHighlighter(): Promise<typeof import('./highlight')> {
  parser ??= import('./highlight');
  return parser;
}

/**
 * The verdict, or null for "this is text". Deliberately conservative: a
 * paragraph wrongly fenced is worse than a snippet left as plain text, since
 * the person can see the fence in the field and the snippet reads fine
 * either way.
 */
export async function detectCode(raw: string): Promise<DetectedCode | null> {
  const text = raw.trim();
  if (text.length < MIN_LENGTH) {
    return null;
  }

  // JSON, asked properly: the parser is the only honest judge of it.
  if (/^[[{]/.test(text) && /[\]}]$/.test(text)) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== null && typeof parsed === 'object') {
        return describe('json');
      }
    } catch {
      // Not JSON after all — maybe a block of some other language.
    }
  }

  const mechanical = mechanicalScore(text);
  if (mechanical < 2) {
    return null;
  }

  const read = (await loadHighlighter()).classify(text);
  if (!read) {
    return null;
  }
  // hljs relevance grows with the text: a longer paste has more chances to
  // score, so ask more of it. The mechanical score above already bought the
  // paste some of what it needs.
  const needed = Math.max(6, Math.min(20, Math.floor(text.length / 60))) - mechanical;
  return read.relevance < needed ? null : describe(read.language);
}

/** The human name for a fence's word, when we know it. */
export function languageLabel(language: string): string | null {
  return LANGUAGES.find((item) => item.id === language)?.label ?? null;
}

/** The fence word for a file name's extension, when we know it. */
export function languageOfFileName(name: string): string | null {
  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  return LANGUAGES.find((language) => language.extension === extension)?.id ?? null;
}
