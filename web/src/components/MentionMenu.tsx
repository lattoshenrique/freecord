/**
 * The list that opens when a message holds an `@`.
 *
 * Same shape and same spot as the slash-command list, deliberately: they
 * are the same gesture — a character that turns the field into a picker —
 * and two lists that opened differently in the same corner would read as
 * two unrelated surprises. So it borrows `cmd-menu`'s box and animation
 * and changes only the row: a face, then a name.
 *
 * It decides nothing. Who is offered is `people`, and the keyboard belongs
 * to the composer, which owns the field being typed in (ChatComposer.tsx).
 */
import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import Avatar from './Avatar';
import './command-menu.css';
import './mention.css';

export default function MentionMenu({
  people,
  active,
  listId,
  optionId,
  onPick,
  onHover,
  leaving,
}: {
  /** The names that fit what has been typed after the `@`, in menu order. */
  people: readonly string[];
  /** Which of them the keyboard is on. */
  active: number;
  listId: string;
  optionId: (index: number) => string;
  onPick: (name: string) => void;
  onHover: (index: number) => void;
  /** On its way out: drawn for the length of the animation, and inert. */
  leaving?: boolean;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLUListElement>(null);

  // The highlight drags the scroll along with it, so arrowing past the last
  // visible face does not leave the list sitting still (see CommandMenu).
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <ul
      className="cmd-menu mention-menu"
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={t('chat.mentionMenu')}
      data-leaving={leaving ? 'true' : undefined}
    >
      {people.map((name, index) => (
        <li
          key={name}
          id={optionId(index)}
          className={`cmd-option mention-option ${index === active ? 'is-active' : ''}`}
          role="option"
          aria-selected={index === active}
          // The pointer must not take the focus off the textarea: the caret,
          // the selection and the draft all live there.
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={() => onHover(index)}
          onClick={() => onPick(name)}
        >
          <Avatar name={name} className="mention-option-avatar" />
          <span className="mention-option-name">{name}</span>
        </li>
      ))}
    </ul>
  );
}
