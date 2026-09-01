/**
 * The chat body on the wire.
 *
 * A message is a string end to end: the server relays it, and the room key
 * seals it. A reply rides inside that string as a small JSON object, so the
 * quote is sealed with the message and never touches the server in the clear.
 * A client that predates replies shows the object as text — readable, if
 * not pretty — and every other message stays the plain markdown it always was.
 */

export interface ChatQuote {
  /** Who wrote the quoted message. */
  name: string;
  /** A short excerpt: the first line, markdown stripped, clamped. */
  text: string;
}

/** The excerpt cap: enough to recognise the message, not to re-read it. */
export const QUOTE_EXCERPT_MAX = 140;

/** Mirrors ROOM_LIMITS.chatMessageMaxLength: a plaintext body past this is cut. */
export const CHAT_BODY_MAX = 500;

interface WireBody {
  q: { n: string; t: string };
  m: string;
}

/** Turns a message into the excerpt a reply carries. */
export function excerptOf(text: string): string {
  const firstLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^```/.test(line)) ?? '';
  const stripped = firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^(?:[-*]|\d+\.)\s+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2');
  return clamp(stripped, QUOTE_EXCERPT_MAX);
}

function clamp(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Encodes a message, with its quote when there is one, within `budget`
 * characters. The quote gives way first: its excerpt shrinks until the whole
 * body fits, so the reply text itself is never the part that gets cut.
 */
export function encodeChatBody(
  text: string,
  quote: ChatQuote | null,
  budget = CHAT_BODY_MAX,
): string {
  if (!quote) {
    return text;
  }
  let excerpt = quote.text;
  for (;;) {
    const wire = JSON.stringify({ q: { n: quote.name, t: excerpt }, m: text } satisfies WireBody);
    if (wire.length <= budget || excerpt.length === 0) {
      return wire;
    }
    excerpt = clamp(excerpt, Math.max(0, excerpt.length - Math.max(8, wire.length - budget)));
    if (excerpt === '…') {
      excerpt = '';
    }
  }
}

/** The room left for the message itself once a quote takes its share. */
export function bodyBudget(quote: ChatQuote | null, budget = CHAT_BODY_MAX): number {
  return quote ? Math.max(0, budget - (encodeChatBody('', quote, budget).length - 2)) : budget;
}

/** Splits a received body back into message and quote. */
export function decodeChatBody(wire: string): { text: string; quote: ChatQuote | null } {
  if (!wire.startsWith('{"q":{')) {
    return { text: wire, quote: null };
  }
  try {
    const parsed: unknown = JSON.parse(wire);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as WireBody).m === 'string' &&
      typeof (parsed as WireBody).q?.n === 'string' &&
      typeof (parsed as WireBody).q?.t === 'string'
    ) {
      const { q, m } = parsed as WireBody;
      return { text: m, quote: { name: q.n, text: q.t } };
    }
  } catch {
    // Someone typed something that looks like the envelope: show it as typed.
  }
  return { text: wire, quote: null };
}
