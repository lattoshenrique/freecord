import { useI18n, LOCALES } from '../i18n';

/**
 * Language picker. The list is auto-detected on first visit; this only exists
 * for when the detection is wrong or the visitor wants another language.
 * Each option is written in its own language — a visitor who cannot read the
 * current one still recognises theirs.
 */
export default function LanguagePicker() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-picker">
      <span className="language-picker-label">{t('language.picker')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
      >
        {LOCALES.map(({ id, label }) => (
          <option key={id} value={id} lang={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
