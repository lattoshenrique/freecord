import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import { useI18n, type MessageKey } from '../i18n';
import type { ChatQuote } from '../lib/chat-body';
import { applyMarkdown, type MarkdownAction, type Placeholders } from '../lib/markdown-edit';
import EmojiPicker from './EmojiPicker';
import {
  AttachIcon,
  BoldIcon,
  CloseIcon,
  CodeIcon,
  EmojiIcon,
  FormatIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  QuoteIcon,
  ReplyIcon,
  SendIcon,
  StrikeIcon,
} from './icons';

/** Ceiling for the auto-grow: past this the field scrolls. */
const MAX_HEIGHT_PX = 148;

/** Text styles, then inline snippets, then blocks — separated in the toolbar. */
const TOOL_GROUPS: Array<
  Array<{
    action: MarkdownAction;
    labelKey: MessageKey;
    shortcut?: string;
    Icon: ComponentType;
  }>
> = [
  [
    { action: 'bold', labelKey: 'chat.bold', shortcut: '⌘B', Icon: BoldIcon },
    { action: 'italic', labelKey: 'chat.italic', shortcut: '⌘I', Icon: ItalicIcon },
    { action: 'strike', labelKey: 'chat.strike', Icon: StrikeIcon },
  ],
  [
    { action: 'code', labelKey: 'chat.code', shortcut: '⌘E', Icon: CodeIcon },
    { action: 'link', labelKey: 'chat.link', shortcut: '⌘K', Icon: LinkIcon },
  ],
  [
    { action: 'bullet', labelKey: 'chat.list', Icon: ListIcon },
    { action: 'quote', labelKey: 'chat.quote', Icon: QuoteIcon },
  ],
];

/**
 * Tooltip syntax samples, so the toolbar still teaches that markdown can be
 * TYPED — the placeholder used to carry this and no longer does. The sample
 * word is the button's own translated label, same trick as `Placeholders`.
 */
const SYNTAX: Record<MarkdownAction, (word: string) => string> = {
  bold: (word) => `**${word}**`,
  italic: (word) => `*${word}*`,
  code: (word) => `\`${word}\``,
  strike: (word) => `~~${word}~~`,
  link: (word) => `[${word}](url)`,
  bullet: (word) => `- ${word}`,
  number: (word) => `1. ${word}`,
  quote: (word) => `> ${word}`,
};

/**
 * Clipboard images arrive as "image.png" from every browser; a name with the
 * moment in it tells two screenshots apart on the receiving end.
 */
function nameClipboardFile(file: File): File {
  if (!/^image\.[a-z0-9]+$/i.test(file.name)) {
    return file;
  }
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  return new File([file], `pasted-${stamp}.${ext}`, { type: file.type, lastModified: file.lastModified });
}

const SHORTCUTS: Record<string, MarkdownAction> = {
  b: 'bold',
  i: 'italic',
  e: 'code',
  k: 'link',
};

/**
 * Chat composer: a textarea with markdown formatting.
 *
 * It has to be a textarea, not an input — an input has no line breaks, and
 * without them lists, quotes and code blocks are impossible to write, however
 * well the renderer knows how to show them.
 */
export default function ChatComposer({
  value,
  maxLength,
  locked = false,
  quote = null,
  onChange,
  onSend,
  onAttach,
  onPasteFiles,
  onCancelQuote,
}: {
  value: string;
  maxLength: number;
  /** No key for an encrypted room: sending would silently downgrade to plaintext. */
  locked?: boolean;
  /** The message being replied to; shown above the field until sent or cancelled. */
  quote?: ChatQuote | null;
  onChange: (text: string) => void;
  onSend: () => void;
  /** Opens the file picker for a peer-to-peer transfer; absent = no button. */
  onAttach?: () => void;
  /** Files pasted into the field (a screenshot on the clipboard) go out as transfers. */
  onPasteFiles?: (files: File[]) => void;
  onCancelQuote?: () => void;
}) {
  const { t } = useI18n();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // The selection has to be restored AFTER React applies the new value.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  // The formatting row is a mode, not furniture: off until asked for, so the
  // composer opens as one line — attach, message, emoji, send.
  const [formatOpen, setFormatOpen] = useState(false);

  // Opening the chat is opening the keyboard: the field takes focus at once,
  // and again when a reply is picked, so "Reply" lands the caret ready to type.
  useEffect(() => {
    areaRef.current?.focus();
  }, [quote]);

  useEffect(() => {
    if (!emojiOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      const wrap = emojiRef.current;
      if (wrap && !wrap.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        setEmojiOpen(false);
        areaRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emojiOpen]);

  const placeholders = useMemo<Placeholders>(
    () => ({
      bold: t('chat.bold').toLowerCase(),
      italic: t('chat.italic').toLowerCase(),
      code: t('chat.code').toLowerCase(),
      strike: t('chat.strike').toLowerCase(),
      linkLabel: t('chat.link').toLowerCase(),
    }),
    [t],
  );

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    area.style.height = 'auto';
    const wanted = area.scrollHeight;
    area.style.height = `${Math.min(wanted, MAX_HEIGHT_PX)}px`;
    // A scrollbar only once the text truly outgrows the ceiling: on Windows an
    // always-on one paints a track with arrow buttons inside the field.
    area.style.overflowY = wanted > MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, [value]);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const area = areaRef.current;
    if (selection && area) {
      pendingSelection.current = null;
      area.focus();
      area.setSelectionRange(selection.start, selection.end);
    }
  });

  function run(action: MarkdownAction): void {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    const result = applyMarkdown(
      { text: value, start: area.selectionStart, end: area.selectionEnd },
      action,
      placeholders,
    );
    if (result.text.length > maxLength) {
      return;
    }
    pendingSelection.current = { start: result.start, end: result.end };
    onChange(result.text);
  }

  function insertEmoji(emoji: string): void {
    const area = areaRef.current;
    const start = area ? area.selectionStart : value.length;
    const end = area ? area.selectionEnd : value.length;
    const text = value.slice(0, start) + emoji + value.slice(end);
    // The budget is UTF-16 units, same as the server's clamp — an emoji costs 2+.
    if (text.length > maxLength) {
      return;
    }
    const caret = start + emoji.length;
    pendingSelection.current = { start: caret, end: caret };
    setEmojiOpen(false);
    onChange(text);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    if (!onPasteFiles) {
      return;
    }
    // A screenshot or a copied image lands as a file item; plain text has
    // none and falls through to the browser's own paste.
    const files = [...event.clipboardData.items]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .map(nameClipboardFile);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    onPasteFiles(files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter sends; Shift+Enter breaks the line — every chat's convention.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
      return;
    }
    // Escape drops the reply first; only a second one reaches the sheet.
    if (event.key === 'Escape' && quote && onCancelQuote) {
      event.preventDefault();
      event.stopPropagation();
      onCancelQuote();
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const action = SHORTCUTS[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        run(action);
      }
    }
  }

  if (locked) {
    // Not a disabled field: a disabled input reads as a glitch, and the person
    // needs the remedy (ask for the original link), not just the refusal.
    return (
      <div className="chat-composer">
        <p className="chat-nokey">{t('chat.noKey')}</p>
      </div>
    );
  }

  return (
    <div className="chat-composer">
      {quote && (
        <div className="chat-reply-strip" role="status">
          <ReplyIcon />
          <div className="chat-reply-body">
            <span className="chat-reply-name">{t('chat.replyingTo', { name: quote.name })}</span>
            <span className="chat-reply-text">{quote.text}</span>
          </div>
          <button
            type="button"
            className="chat-tool"
            aria-label={t('chat.cancelReply')}
            title={t('chat.cancelReply')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCancelQuote}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {/* Every key lives on its own row: the field below keeps the full width. */}
      <div className="chat-toolbar" role="toolbar" aria-label={t('chat.toolbar')}>
        <button
          type="button"
          className={`chat-tool ${formatOpen ? 'chat-tool-on' : ''}`}
          title={t('chat.format')}
          aria-label={t('chat.format')}
          aria-pressed={formatOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFormatOpen((open) => !open)}
        >
          <FormatIcon />
        </button>
        {onAttach && (
          <button
            type="button"
            className="chat-tool"
            title={`${t('file.attach')} · ${t('file.direct')}`}
            aria-label={t('file.attach')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onAttach}
          >
            <AttachIcon />
          </button>
        )}
        <div className="chat-emoji-wrap" ref={emojiRef}>
          <button
            type="button"
            className="chat-tool"
            title={t('chat.emoji')}
            aria-label={t('chat.emoji')}
            aria-haspopup="true"
            aria-expanded={emojiOpen}
            // mousedown would steal focus from the textarea, and the selection with it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <EmojiIcon />
          </button>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} />}
        </div>
        {formatOpen &&
          TOOL_GROUPS.map((group, index) => (
            <Fragment key={index}>
              <span className="chat-toolbar-sep" role="separator" aria-orientation="vertical" />
              {group.map(({ action, labelKey, shortcut, Icon }) => {
                const label = t(labelKey);
                const sample = SYNTAX[action](label.toLowerCase());
                return (
                  <button
                    key={action}
                    type="button"
                    className="chat-tool"
                    title={shortcut ? `${label} (${shortcut}) · ${sample}` : `${label} · ${sample}`}
                    aria-label={label}
                    // mousedown would steal focus from the textarea, and the selection with it.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => run(action)}
                  >
                    <Icon />
                  </button>
                );
              })}
            </Fragment>
          ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          ref={areaRef}
          className="chat-input"
          value={value}
          rows={1}
          maxLength={maxLength}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.messageLabel')}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <button type="submit" className="chat-send" aria-label={t('chat.send')} disabled={!value.trim()}>
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
