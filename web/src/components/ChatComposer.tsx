import {
  Fragment,
  useEffect,
  useId,
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
import { commandMatches, type ChatCommand } from '../lib/chat-commands';
import { applyMention, matchPeople, mentionQuery } from '../lib/mentions';
import { MOTION, usePresence } from '../lib/motion';
import { applyMarkdown, type MarkdownAction, type Placeholders } from '../lib/markdown-edit';
import CommandMenu from './CommandMenu';
import EmojiPicker from './EmojiPicker';
import MentionMenu from './MentionMenu';
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
 * A finger on a glass keyboard. There, Enter is the line break every phone
 * app makes it, and the send key is the one that sends: a return that
 * fires the message off mid-sentence is the classic mobile chat mistake.
 * Decided once — a device does not change its pointer mid-call.
 */
const COARSE_POINTER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

/**
 * Chat composer: a textarea with markdown formatting, and the door to the
 * room's slash commands.
 *
 * It has to be a textarea, not an input — an input has no line breaks, and
 * without them lists, quotes and code blocks are impossible to write, however
 * well the renderer knows how to show them.
 *
 * The commands themselves are none of its business: it draws the list, moves
 * the highlight, completes the word, and hands whatever was typed to the
 * room the same way it hands over a message (lib/chat-commands.ts decides
 * what a line means, RoomView.tsx does what it says).
 */
export default function ChatComposer({
  value,
  maxLength,
  locked = false,
  quote = null,
  people = [],
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
  /**
   * Who is in the room, self included: the names an `@` completes. Empty
   * is a room of one, and then `@` is just a character.
   */
  people?: readonly string[];
  onChange: (text: string) => void;
  /**
   * Sends what is in the field — or, when a command was picked out of the
   * menu, that command instead: a line the field never got to hold, since
   * `/mic` picked from a half-typed `/mi` runs on the same key press.
   */
  onSend: (text?: string) => void;
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
  // Both of these close by being taken out of the page, so both are held
  // back for the length of their way out (lib/motion.ts). The strip is drawn
  // from the last quote there was: by the time it is leaving the reply has
  // already been cancelled, and a strip that empties as it goes is a flicker.
  const emojiPresence = usePresence(emojiOpen, MOTION.quick);
  const replyPresence = usePresence(quote !== null, MOTION.quick);
  const lastQuote = useRef<ChatQuote | null>(quote);
  if (quote) {
    lastQuote.current = quote;
  }

  // The command list: open while the field holds a slash and a word being
  // named, and shut by Escape until the next keystroke — one press to get
  // the list out of the way without losing what was typed.
  const [menuOff, setMenuOff] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = commandMatches(value);
  const menuOpen = !locked && !menuOff && matches !== null && matches.length > 0;
  const menuPresence = usePresence(menuOpen, MOTION.quick);
  // Drawn from the last list there was, for the same reason the reply strip
  // is: by the time it is leaving, the field has already moved on and a
  // list that empties as it goes is a flicker.
  const lastMatches = useRef<readonly ChatCommand[]>([]);
  if (menuOpen && matches) {
    lastMatches.current = matches;
  }
  const shown = lastMatches.current;
  const activeIndex = Math.min(active, Math.max(shown.length - 1, 0));
  const optionId = (index: number): string => `${listId}-${index}`;

  // The mention list: the same gesture as the slash list, on the other
  // character. It needs the CARET, not just the text — an `@` typed at the
  // end and an `@` gone back to mid-sentence are different lists — so the
  // field reports where the caret is on every move.
  const [caret, setCaret] = useState(0);
  const [mentionOff, setMentionOff] = useState(false);
  const mentionListId = useId();
  const mentionOptionId = (index: number): string => `${mentionListId}-${index}`;
  const draft = locked || mentionOff || people.length === 0 ? null : mentionQuery(value, caret);
  const hits = draft ? matchPeople(draft.query, people) : [];
  // The slash list wins a tie: a line can only start one of them, and a
  // command's argument may perfectly well name a person.
  const mentionOpen = !menuOpen && hits.length > 0;
  const mentionPresence = usePresence(mentionOpen, MOTION.quick);
  const lastPeople = useRef<readonly string[]>([]);
  if (mentionOpen) {
    lastPeople.current = hits;
  }
  const shownPeople = lastPeople.current;
  const [mentionActive, setMentionActive] = useState(0);
  const mentionIndex = Math.min(mentionActive, Math.max(shownPeople.length - 1, 0));

  /**
   * A name chosen from the list takes the place of the half-typed one, and
   * the caret lands after it with a space already there (lib/mentions.ts).
   * The list shuts until the next keystroke: what follows a finished
   * mention is the sentence, not more names.
   */
  function pickMention(name: string): void {
    if (!draft) {
      return;
    }
    const next = applyMention(value, draft, caret, name);
    if (next.text.length > maxLength) {
      return;
    }
    setMentionOff(true);
    pendingSelection.current = { start: next.caret, end: next.caret };
    setCaret(next.caret);
    onChange(next.text);
  }

  /** Where the caret is now, after anything that could have moved it. */
  function syncCaret(area: HTMLTextAreaElement | null): void {
    if (area) {
      setCaret(area.selectionStart);
    }
  }

  /**
   * A command chosen from the list. One that takes nothing runs on the
   * spot — a person who typed `/mi` and pressed Enter meant to mute the
   * microphone, not to fill the field in. One that takes something is
   * completed instead, with the caret waiting where the argument goes.
   */
  function pick(command: ChatCommand): void {
    setMenuOff(true);
    if (!command.arg) {
      onSend(`/${command.name}`);
      return;
    }
    const text = `/${command.name} `;
    pendingSelection.current = { start: text.length, end: text.length };
    onChange(text);
  }

  function edit(text: string, at: number): void {
    // Any keystroke brings the lists back: Escape shut them for that
    // moment, not for the rest of the line.
    setMenuOff(false);
    setMentionOff(false);
    setActive(0);
    setMentionActive(0);
    setCaret(at);
    onChange(text);
  }

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

  /**
   * Arrow keys walk the toolbar, as a toolbar is expected to: one Tab stop
   * for the row, then left and right between the keys. Tab itself still
   * moves through every key, so nothing is lost on whoever never learnt it.
   */
  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const keys = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = keys.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) {
      return;
    }
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    keys[(index + step + keys.length) % keys.length]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // While the command list is up it has first call on the keys that move
    // through it — and only on those. Everything else still types.
    if (menuOpen) {
      const chosen = shown[activeIndex];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current) => {
          const from = Math.min(current, shown.length - 1);
          return (from + step + shown.length) % shown.length;
        });
        return;
      }
      // Tab completes and stays — the way a shell does it, and the way out
      // for anyone who wants to read the arguments before running anything.
      if (event.key === 'Tab' && !event.shiftKey && chosen) {
        event.preventDefault();
        pick(chosen);
        return;
      }
      // Enter takes the highlighted one. On a phone the send key does it
      // instead, since there Enter is a line break (COARSE_POINTER).
      if (event.key === 'Enter' && !event.shiftKey && !COARSE_POINTER && chosen) {
        event.preventDefault();
        pick(chosen);
        return;
      }
      // Escape puts the list away and nothing else: not the reply, not the
      // panel. What was typed stays where it is.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenuOff(true);
        return;
      }
    }
    // The mention list takes the same keys, on the same terms: only the
    // ones that move through it, and Escape gives the line back untouched.
    if (mentionOpen) {
      const chosen = shownPeople[mentionIndex];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setMentionActive((current) => {
          const from = Math.min(current, shownPeople.length - 1);
          return (from + step + shownPeople.length) % shownPeople.length;
        });
        return;
      }
      if ((event.key === 'Tab' && !event.shiftKey) || (event.key === 'Enter' && !event.shiftKey && !COARSE_POINTER)) {
        if (chosen) {
          event.preventDefault();
          pickMention(chosen);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMentionOff(true);
        return;
      }
    }
    // Enter sends; Shift+Enter breaks the line — every chat's convention.
    // On a touch keyboard Enter is a line break and the send key sends.
    if (event.key === 'Enter' && !event.shiftKey && !COARSE_POINTER) {
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
      {mentionPresence.mounted && shownPeople.length > 0 && (
        <MentionMenu
          people={shownPeople}
          active={mentionIndex}
          listId={mentionListId}
          optionId={mentionOptionId}
          onPick={pickMention}
          onHover={setMentionActive}
          leaving={mentionPresence.leaving}
        />
      )}
      {menuPresence.mounted && shown.length > 0 && (
        <CommandMenu
          matches={shown}
          active={activeIndex}
          listId={listId}
          optionId={optionId}
          onPick={pick}
          onHover={setActive}
          leaving={menuPresence.leaving}
        />
      )}
      {replyPresence.mounted && lastQuote.current && (
        <div
          className="chat-reply-strip"
          role="status"
          data-leaving={replyPresence.leaving ? 'true' : undefined}
        >
          <ReplyIcon />
          <div className="chat-reply-body">
            <span className="chat-reply-name">
              {t('chat.replyingTo', { name: lastQuote.current.name })}
            </span>
            <span className="chat-reply-text">{lastQuote.current.text}</span>
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
      <div
        className="chat-toolbar"
        role="toolbar"
        aria-label={t('chat.toolbar')}
        onKeyDown={handleToolbarKeyDown}
      >
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
          {emojiPresence.mounted && (
            <EmojiPicker onPick={insertEmoji} leaving={emojiPresence.leaving} />
          )}
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
                    className="chat-tool chat-tool-format"
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
          // On a phone this key is how the list is used at all: there is no
          // Enter to pick with, so the send key takes the highlighted row.
          const chosen = shown[activeIndex];
          if (menuOpen && chosen) {
            pick(chosen);
            return;
          }
          const person = shownPeople[mentionIndex];
          if (mentionOpen && person) {
            pickMention(person);
            return;
          }
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
          // The field keeps its own role — this is a textbox with a list
          // hanging off it, and the list says which row the keys are on.
          aria-autocomplete="list"
          aria-expanded={menuOpen || mentionOpen}
          aria-controls={menuOpen ? listId : mentionOpen ? mentionListId : undefined}
          aria-activedescendant={
            menuOpen
              ? optionId(activeIndex)
              : mentionOpen
                ? mentionOptionId(mentionIndex)
                : undefined
          }
          // The return key on a phone's keyboard says what it will do.
          enterKeyHint={COARSE_POINTER ? 'enter' : 'send'}
          onChange={(event) => edit(event.target.value, event.target.selectionStart)}
          // Arrow keys, a click into the middle of the line, a selection
          // dragged: all of them move the caret without changing the text,
          // and the mention list is a question about where the caret is.
          onSelect={(event) => syncCaret(event.currentTarget)}
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
