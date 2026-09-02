import { describe, expect, it } from 'vitest';
import { detectLocale } from '../src/i18n';
import { enUS } from '../src/i18n/locales/en-US';
import { esES } from '../src/i18n/locales/es';
import { jaJP } from '../src/i18n/locales/ja';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { zhCN } from '../src/i18n/locales/zh-CN';
import { resolve } from '../src/i18n/messages';

const CATALOGS = { 'pt-BR': ptBR, es: esES, 'zh-CN': zhCN, ja: jaJP };

describe('detectLocale', () => {
  it('prefers an exact tag, then the base language', () => {
    expect(detectLocale(['pt-BR'])).toBe('pt-BR');
    expect(detectLocale(['pt-PT'])).toBe('pt-BR');
    expect(detectLocale(['zh-TW'])).toBe('zh-CN');
    expect(detectLocale(['ja-JP'])).toBe('ja');
  });

  it('walks the list in order and falls back to English', () => {
    expect(detectLocale(['ko', 'de', 'es-AR'])).toBe('es');
    expect(detectLocale(['ko', 'de'])).toBe('en-US');
    expect(detectLocale([])).toBe('en-US');
  });
});

describe('resolve', () => {
  it('interpolates named placeholders', () => {
    expect(resolve(enUS, enUS, 'en-US', 'chat.replyingTo', { name: 'Ana' })).toBe(
      'Replying to Ana',
    );
  });

  it('leaves an unknown placeholder untouched instead of printing undefined', () => {
    expect(resolve(enUS, enUS, 'en-US', 'chat.replyingTo', {})).toBe('Replying to {name}');
  });

  it('picks the plural form the locale actually uses', () => {
    expect(resolve(enUS, enUS, 'en-US', 'room.participants', { count: 1 })).toBe('1 participant');
    expect(resolve(enUS, enUS, 'en-US', 'room.participants', { count: 3 })).toBe('3 participants');
    // Chinese has a single form: one and many must read the same.
    expect(resolve(zhCN, enUS, 'zh-CN', 'room.participants', { count: 1 })).toBe('1 人');
    expect(resolve(zhCN, enUS, 'zh-CN', 'room.participants', { count: 3 })).toBe('3 人');
  });

  it('draws one of the variants, and holds it for the rest of the page', () => {
    const catalog = { 'empty.room': ['first line', 'second line', 'third line'] };
    const drawn = resolve(catalog, catalog, 'en-US', 'empty.room');
    expect(catalog['empty.room']).toContain(drawn);
    // Stability matters more than the draw: React re-renders the empty room
    // many times while it connects, and the line must not flicker.
    expect(resolve(catalog, catalog, 'en-US', 'empty.room')).toBe(drawn);
  });

  it('interpolates inside a variant like it does inside a plain string', () => {
    const catalog = { 'greet': ['hey {name}'] };
    expect(resolve(catalog, catalog, 'en-US', 'greet', { name: 'Ana' })).toBe('hey Ana');
  });

  it('falls back to English when a translation is missing', () => {
    expect(resolve({}, enUS, 'pt-BR', 'chat.title')).toBe('Room chat');
  });

  it('returns the key rather than blank when nothing has it', () => {
    expect(resolve({}, {}, 'en-US', 'does.not.exist')).toBe('does.not.exist');
  });
});

describe('catalogs', () => {
  const keys = Object.keys(enUS);

  /**
   * Every phrasing a message can put on screen: one for a plain string, one
   * per plural form, one per variant. Checking the whole set is the point —
   * a single broken variant is a line the app really does show, one page load
   * in three.
   */
  const texts = (message: unknown): string[] => {
    if (typeof message === 'string') {
      return [message];
    }
    if (Array.isArray(message)) {
      return message as string[];
    }
    const forms = message as { one?: string; other: string };
    return [forms.one, forms.other].filter((form): form is string => form !== undefined);
  };

  it.each(Object.entries(CATALOGS))('%s translates every key', (_locale, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(keys.sort());
  });

  it.each(Object.entries(CATALOGS))('%s leaves no message empty', (_locale, catalog) => {
    for (const [key, message] of Object.entries(catalog)) {
      for (const text of texts(message)) {
        expect(text.trim(), key).not.toBe('');
      }
    }
  });

  it.each(Object.entries(CATALOGS))('%s offers a variant wherever English does', (_l, catalog) => {
    for (const key of keys) {
      const source = enUS[key as keyof typeof enUS];
      if (!Array.isArray(source)) {
        continue;
      }
      // A locale that answered a list with one string would show that one
      // line forever while English rotates.
      const translated = catalog[key as keyof typeof catalog];
      expect(Array.isArray(translated), key).toBe(true);
      expect((translated as string[]).length, key).toBeGreaterThan(1);
    }
  });

  it.each(Object.entries(CATALOGS))('%s keeps every placeholder of the source', (_l, catalog) => {
    // Distinct names, not occurrences: English carries two plural forms where
    // Chinese carries one, so counting would flag a correct translation.
    const placeholders = (message: unknown): string[] => {
      const text = typeof message === 'string' ? message : JSON.stringify(message);
      const names = [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
      return [...new Set(names)].sort();
    };
    for (const key of keys) {
      // A dropped {name} or {count} silently prints a broken sentence.
      const wanted = placeholders(enUS[key as keyof typeof enUS]);
      expect(placeholders(catalog[key as keyof typeof catalog]), key).toEqual(wanted);
      // Per phrasing too: a union would let one variant lose {name} while a
      // sibling still carries it.
      for (const text of texts(catalog[key as keyof typeof catalog])) {
        expect(placeholders(text), `${key}: ${text}`).toEqual(wanted);
      }
    }
  });
});
