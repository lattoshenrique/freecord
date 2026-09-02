import { useI18n } from '../i18n';

/**
 * Curated set rendered as native glyphs: no sprite sheet, no fetch, no
 * dependency — the app promises zero third-party requests and the room bundle
 * is small enough that a full emoji database would dwarf it. Everything here
 * is Emoji 13 or older, so it renders on systems as old as Windows 10.
 */
const EMOJI = [
  '😀', '😄', '😂', '🤣', '😊', '😍', '😘', '😎',
  '🙂', '🙃', '😉', '🤔', '😅', '😳', '🥺', '😭',
  '😡', '🤯', '😱', '😴', '🥳', '🤩', '😇', '🙄',
  '👍', '👎', '👋', '🙏', '👏', '🤝', '💪', '🤞',
  '✌️', '🤙', '👀', '🤗', '🤷', '🎉', '✨', '🔥',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔',
  '💯', '⚡', '🚀', '🎶', '☕', '🍕', '🍺', '⚽',
  '🎮', '💻', '🐶', '🐱', '🌙', '🌈', '🌹', '😜',
];

export default function EmojiPicker({
  onPick,
  leaving,
}: {
  onPick: (emoji: string) => void;
  /** On its way out: drawn for the length of the animation, and inert. */
  leaving?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="chat-emoji-pop"
      role="group"
      aria-label={t('chat.emoji')}
      data-leaving={leaving ? 'true' : undefined}
    >
      {EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="chat-emoji-option"
          // mousedown would steal focus from the textarea, and the selection with it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
