import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { CloseIcon, SearchIcon } from './icons';

/**
 * The search row, under the chat's own header.
 *
 * It filters the list rather than jumping between hits: on a panel this narrow
 * a "next match" walk is more scrolling than reading, while the messages that
 * answer the query, in order, with their times, IS the answer most of the
 * time — "what did we decide about the deploy" is three lines, not one.
 *
 * The field is an `input`, never a textarea: the composer below is the only
 * textarea in the panel and half the test suite finds it that way.
 */
export default function ChatSearch({
  value,
  hits,
  onChange,
  onClose,
}: {
  value: string;
  /** How many messages are left after filtering; only shown once something was typed. */
  hits: number;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening the search is asking to type in it.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="chat-search">
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        className="chat-search-field"
        value={value}
        placeholder={t('chat.searchPlaceholder')}
        aria-label={t('chat.search')}
        // The panel's Escape closes the whole chat; here it closes the search
        // first, which is what a person with a search box open means by it.
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      {value.trim().length > 0 && (
        // Only the count here — a zero is announced in one word, and the line
        // that says nothing was found belongs where the messages would be.
        <span className="chat-search-count" role="status">
          {t('chat.searchHits', { count: hits })}
        </span>
      )}
      <button
        type="button"
        className="chat-tool"
        aria-label={t('chat.searchClose')}
        title={t('chat.searchClose')}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
