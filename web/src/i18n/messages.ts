/**
 * Message catalog contract.
 *
 * A message is a plain string, a set of plural forms keyed by the categories
 * `Intl.PluralRules` returns for the locale, or a list of variants — several
 * ways of saying the same thing, one of them drawn at random. Chinese and
 * Japanese only ever produce `other`; English, Spanish and Portuguese add
 * `one`.
 */
export interface PluralMessage {
  one?: string;
  other: string;
}

/** Several phrasings of one message; the app shows whichever it draws. */
export type VariantMessage = readonly string[];

export type Message = string | PluralMessage | VariantMessage;

export type Vars = Record<string, string | number>;

/** Replaces `{name}` placeholders. Unknown placeholders are left untouched. */
function interpolate(template: string, vars: Vars | undefined): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * What each key drew, for as long as the page lives.
 *
 * Drawing on every call would reshuffle the joke on every React render: the
 * empty-room line would flicker while the room connects, and a name read out
 * by a screen reader would change under it. Drawn once per key and locale
 * instead — a reload deals a new hand, a re-render does not.
 */
const drawn = new Map<string, string>();

function isVariants(message: Message): message is VariantMessage {
  return Array.isArray(message);
}

function variant(list: VariantMessage, locale: string, key: string): string {
  const id = `${locale}:${key}`;
  const held = drawn.get(id);
  // The list is checked, not just the key: a locale that translates only some
  // of the variants falls back to English mid-session, and a held line from
  // the other catalog would leak across.
  if (held !== undefined && list.includes(held)) {
    return held;
  }
  const picked = list[Math.floor(Math.random() * list.length)] ?? list[0] ?? '';
  drawn.set(id, picked);
  return picked;
}

function plural(message: PluralMessage, locale: string, count: unknown): string {
  if (typeof count !== 'number') {
    return message.other;
  }
  const category = new Intl.PluralRules(locale).select(count);
  return (category === 'one' ? message.one : undefined) ?? message.other;
}

/**
 * Resolves one key against a catalog, falling back to the source catalog when
 * a translation is missing — a half-translated locale degrades to English
 * instead of showing a raw key.
 */
export function resolve(
  catalog: Partial<Record<string, Message>>,
  fallback: Partial<Record<string, Message>>,
  locale: string,
  key: string,
  vars?: Vars,
): string {
  const message = catalog[key] ?? fallback[key];
  if (message === undefined) {
    return key;
  }
  const template =
    typeof message === 'string'
      ? message
      : isVariants(message)
        ? variant(message, locale, key)
        : plural(message, locale, vars?.count);
  return interpolate(template, vars);
}
