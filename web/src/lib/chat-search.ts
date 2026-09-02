/**
 * Finding a line again in the room's chat.
 *
 * The whole search runs in the browser, over the messages this client already
 * holds — there is nothing to ask a server, and asking one would be the only
 * way this app ever learned what was said. So: no index, no fetch, one pass
 * over at most MAX_CHAT_MESSAGES entries per keystroke, which is nothing.
 *
 * Two rules, both about not making people type carefully:
 *
 * 1. Case and accents are ignored. Someone looking for "voce" finds "você",
 *    and a phone that autocapitalises still finds the word.
 * 2. Words match in any order and anywhere: "ana link" finds a message from
 *    Ana with a link in it. Every term has to appear somewhere; none of them
 *    has to be a whole word.
 *
 * Highlighting needs the match back in the ORIGINAL text — folded and original
 * do not share indices ("İ" lowercases to two characters, a combining accent
 * disappears) — so folding carries a map from every folded position back to
 * the character it came from.
 */

export interface Fold {
  /** The text lowercased and stripped of accents. */
  value: string;
  /** `index[i]` is where `value[i]` started in the original string. */
  index: number[];
}

/** A slice of a message, marked when the search put it there. */
export interface Segment {
  text: string;
  hit: boolean;
}

/** Combining marks, the accent left behind by an NFD decomposition. */
const MARKS = /[\u0300-\u036f]/g;

/**
 * One character folded. ASCII takes the short path — it decomposes to itself
 * and carries no accent — which is most of every message and saves an
 * `Intl`-backed `normalize` call per character on a list that is folded again
 * on every keystroke.
 */
function foldChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code < 128) {
    return code >= 65 && code <= 90 ? char.toLowerCase() : char;
  }
  return char.normalize('NFD').replace(MARKS, '').toLowerCase();
}

/** The folded text alone, for the answer to "does this message match?". */
export function foldValue(text: string): string {
  let value = '';
  for (let i = 0; i < text.length; i += 1) {
    value += foldChar(text[i]!);
  }
  return value;
}

export function fold(text: string): Fold {
  let value = '';
  const index: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    for (const char of foldChar(text[i]!)) {
      value += char;
      index.push(i);
    }
  }
  // A sentinel, so the end of the last match maps to the end of the text.
  index.push(text.length);
  return { value, index };
}

/** The words of a query: whitespace-separated, folded, empties dropped. */
export function queryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => foldValue(term))
    .filter((term) => term.length > 0);
}

/**
 * Whether a message answers the query: every term found in at least one of
 * the haystacks (the body, the author's name, the quoted excerpt).
 */
export function matches(haystacks: readonly string[], terms: readonly string[]): boolean {
  if (terms.length === 0) {
    return true;
  }
  const folded = haystacks.map(foldValue);
  return terms.every((term) => folded.some((text) => text.includes(term)));
}

/**
 * Splits `text` into plain and matched runs. Overlapping hits — "an" and
 * "ana" over the same word — merge into one run rather than nesting.
 */
export function segments(text: string, terms: readonly string[]): Segment[] {
  if (terms.length === 0 || text.length === 0) {
    return [{ text, hit: false }];
  }
  const { value, index } = fold(text);
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let at = value.indexOf(term);
    while (at !== -1) {
      ranges.push([index[at]!, index[at + term.length]!]);
      at = value.indexOf(term, at + Math.max(1, term.length));
    }
  }
  if (ranges.length === 0) {
    return [{ text, hit: false }];
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  const out: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      out.push({ text: text.slice(cursor, start), hit: false });
    }
    out.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), hit: false });
  }
  return out;
}
