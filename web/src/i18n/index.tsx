/**
 * Minimal i18n: catalog lookup, plurals, interpolation and locale detection.
 *
 * Hand-rolled on purpose. A library like react-i18next costs ~40 kB for an app
 * whose entire room bundle is a fraction of that, and we need none of what it
 * adds. The win of owning it: keys are typed against the English catalog, so a
 * missing or misspelled string is a build error rather than a raw key on screen.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { enUS, type MessageKey } from './locales/en-US';
import { esES } from './locales/es';
import { jaJP } from './locales/ja';
import { ptBR } from './locales/pt-BR';
import { zhCN } from './locales/zh-CN';
import { resolve, type Message, type Vars } from './messages';

export const LOCALES = [
  { id: 'en-US', label: 'English' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'es', label: 'Español' },
  { id: 'zh-CN', label: '中文' },
  { id: 'ja', label: '日本語' },
] as const;

export type Locale = (typeof LOCALES)[number]['id'];

export const DEFAULT_LOCALE: Locale = 'en-US';

export type Catalog = Record<MessageKey, Message>;

const CATALOGS: Record<Locale, Catalog> = {
  'en-US': enUS,
  'pt-BR': ptBR,
  es: esES,
  'zh-CN': zhCN,
  ja: jaJP,
};

const STORAGE_KEY = 'freecord:locale';

function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale.id === value);
}

/**
 * Picks the best locale for a browser's language list: exact tag first, then
 * the base language (`pt-PT` still lands on `pt-BR`, `zh-TW` on `zh-CN`).
 */
export function detectLocale(candidates: readonly string[]): Locale {
  for (const candidate of candidates) {
    if (isLocale(candidate)) {
      return candidate;
    }
    const base = candidate.split('-')[0]?.toLowerCase();
    const match = LOCALES.find((locale) => locale.id.split('-')[0] === base);
    if (match) {
      return match.id;
    }
  }
  return DEFAULT_LOCALE;
}

function storedLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && isLocale(saved) ? saved : null;
  } catch {
    return null; // private browsing
  }
}

export type Translate = (key: MessageKey, vars?: Vars) => string;

interface I18nValue {
  t: Translate;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => storedLocale() ?? detectLocale(navigator.languages ?? [navigator.language]),
  );

  useEffect(() => {
    // Screen readers and CJK line breaking both depend on this being right.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private browsing: the choice lasts for this session only
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const catalog = CATALOGS[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => resolve(catalog, enUS, locale, key, vars),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return value;
}

export type { MessageKey };
