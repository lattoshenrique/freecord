/**
 * Message catalog contract.
 *
 * A message is either a plain string or a set of plural forms keyed by the
 * categories `Intl.PluralRules` returns for the locale. Chinese and Japanese
 * only ever produce `other`; English, Spanish and Portuguese add `one`.
 */
export interface PluralMessage {
  one?: string;
  other: string;
}

export type Message = string | PluralMessage;

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
  const template = typeof message === 'string' ? message : plural(message, locale, vars?.count);
  return interpolate(template, vars);
}
