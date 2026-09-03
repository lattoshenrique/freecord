/**
 * Mentions: naming someone in the middle of a sentence.
 *
 * A mention is not a new kind of message and never touches the wire: what
 * goes out is the text as typed, `@Vega 42` and all, sealed with the room
 * key like anything else. Everything here is about the two ends of that
 * string — completing a name while it is being typed, and finding the
 * names again when the message is drawn.
 *
 * Which is why this module only ever matches names the ROOM has. A guest
 * picks their own nickname, so it can be two words, an emoji, or a
 * bracket; there is no syntax that fences one off from the sentence
 * around it. Matching against the list of people present settles it
 * without asking anyone to type quotes: `@Vega 42 é você?` mentions Vega
 * 42, and `@ninguém` is just text — nobody by that name is here.
 *
 * Case and accents are ignored throughout (lib/chat-search.ts folds them),
 * so a phone that autocapitalises still lands on the right person, and the
 * chip is always drawn with the name as its owner wrote it.
 */
import { foldValue } from './chat-search';

/**
 * How far back from the caret an unfinished mention may run. A name can
 * hold spaces, so the query cannot stop at the first one — but neither
 * can it swallow the rest of the paragraph after a stray `@`.
 */
export const MENTION_QUERY_MAX = 40;

/** How many people the completion list offers at once. */
export const MENTION_LIST_MAX = 8;

/** A mention being typed: where the `@` is, and what follows it so far. */
export interface MentionDraft {
  /** Index of the `@` in the text. */
  start: number;
  /** Everything between the `@` and the caret. */
  query: string;
}

/**
 * The `@` that the caret is currently inside, if any.
 *
 * An `@` only opens a mention at the start of a word — mid-word it is an
 * address, and `a@b.com` must not open a list of people.
 */
export function mentionQuery(text: string, caret: number): MentionDraft | null {
  const from = Math.max(0, Math.min(caret, text.length));
  const floor = Math.max(0, from - (MENTION_QUERY_MAX + 1));
  for (let index = from - 1; index >= floor; index -= 1) {
    const char = text[index]!;
    if (char === '\n') {
      return null;
    }
    if (char !== '@') {
      continue;
    }
    const before = index > 0 ? text[index - 1]! : '';
    if (before !== '' && !/[\s(\[{<"'“‘]/u.test(before)) {
      return null;
    }
    return { start: index, query: text.slice(index + 1, from) };
  }
  return null;
}

/**
 * The people that fit what has been typed so far, in the order the list
 * shows them: whoever the query names from the start first, then whoever
 * it names from the start of a later word ("42" finds "Vega 42").
 */
export function matchPeople(
  query: string,
  names: readonly string[],
  limit = MENTION_LIST_MAX,
): string[] {
  const wanted = foldValue(query.trim());
  if (wanted === '') {
    return names.slice(0, limit);
  }
  const head: string[] = [];
  const tail: string[] = [];
  for (const name of names) {
    const folded = foldValue(name);
    if (folded.startsWith(wanted)) {
      head.push(name);
    } else if (folded.split(/\s+/).some((word) => word.startsWith(wanted))) {
      tail.push(name);
    }
  }
  return [...head, ...tail].slice(0, limit);
}

/**
 * Puts a chosen name where the half-typed one was, and reports where the
 * caret goes: after the trailing space, ready for the rest of the
 * sentence. The space is not decoration — without it the next word would
 * run into the name and stop it being a mention at all.
 */
export function applyMention(
  text: string,
  draft: MentionDraft,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const end = Math.max(draft.start, Math.min(caret, text.length));
  const inserted = `@${name} `;
  return {
    text: text.slice(0, draft.start) + inserted + text.slice(end),
    caret: draft.start + inserted.length,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A name as a pattern that also answers to the same name typed without its
 * accents: "Ana Lucia" finds Ana Lúcia. The completion list already ignores
 * accents, and a message where the name was typed by hand should light up
 * the same way — a phone that dropped the accent is not a different person.
 */
function relaxed(name: string): string {
  let source = '';
  for (const char of name) {
    const folded = foldValue(char);
    source +=
      folded.length === 1 && folded !== char.toLowerCase()
        ? `[${escapeRegExp(char)}${escapeRegExp(folded)}]`
        : escapeRegExp(char);
  }
  return source;
}

/**
 * One regular expression that finds any of `names` after an `@`, longest
 * first so that "Vega 42" wins over a "Vega" who is also in the room.
 * Null when there is nobody to find — a transcript rendered outside a
 * room, or a room of one.
 */
export function mentionPattern(names: readonly string[]): RegExp | null {
  const alternatives = [...names]
    .filter((name) => name.trim() !== '')
    .sort((a, b) => b.length - a.length)
    .map(relaxed);
  if (alternatives.length === 0) {
    return null;
  }
  // Not mid-word on either side: `a@vega` is an address, and a "Vega" who
  // is here must not light up inside "@Vegas".
  return new RegExp(
    `(?<![\\p{L}\\p{N}_@])@(${alternatives.join('|')})(?![\\p{L}\\p{N}_])`,
    'iu',
  );
}

/** Maps a matched name back to the spelling its owner chose. */
export function canonicalName(match: string, names: readonly string[]): string {
  const folded = foldValue(match);
  return names.find((name) => foldValue(name) === folded) ?? match;
}

/** Whether this message names one of `names` — "was I mentioned?". */
export function mentionsAnyOf(text: string, names: readonly string[]): boolean {
  const pattern = mentionPattern(names);
  return pattern !== null && pattern.test(text);
}
