/**
 * The tool's own catalog, checked the way the app's is.
 *
 * A tool ships its strings with itself (contract.ts), which means nothing
 * in `src/i18n` covers them: a key added to `en-US` and forgotten in the
 * other four falls back to English silently, and a reader in São Paulo
 * gets one English line in the middle of a Portuguese panel. That is the
 * one failure a fallback is designed to hide, so it is asserted here.
 */
import { describe, expect, it } from 'vitest';
import { TEXT } from './text';

const locales = Object.keys(TEXT);
const base = TEXT['en-US'];

/** Every `{name}` a message asks the caller for. */
function placeholders(message: unknown): string[] {
  const parts = typeof message === 'string' ? [message] : Object.values(message as object);
  const found = new Set<string>();
  for (const part of parts.flat()) {
    for (const match of String(part).matchAll(/\{(\w+)\}/g)) {
      found.add(match[1] ?? '');
    }
  }
  return [...found].sort();
}

describe('watch catalog', () => {
  it.each(locales)('%s says everything en-US says', (locale) => {
    expect(Object.keys(TEXT[locale]!).sort()).toEqual(Object.keys(base).sort());
  });

  it.each(locales)('%s leaves no message empty', (locale) => {
    for (const [key, message] of Object.entries(TEXT[locale]!)) {
      const parts = typeof message === 'string' ? [message] : Object.values(message);
      for (const part of parts.flat()) {
        expect(String(part).trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it.each(locales)('%s keeps every placeholder of the source', (locale) => {
    for (const [key, message] of Object.entries(TEXT[locale]!)) {
      expect(placeholders(message), `${locale}.${key}`).toEqual(placeholders(base[key]!));
    }
  });
});
