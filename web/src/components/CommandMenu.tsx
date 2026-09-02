/**
 * The list that opens when a message starts with a slash.
 *
 * It is the only documentation slash commands have, and the only reason
 * anybody finds out they exist: the composer's placeholder says to type
 * a slash, and this is what happens next. So it lists everything the
 * build has, spells out what each one takes after it, and says in a line
 * what it does — no hidden commands, no cheat sheet to go and read.
 *
 * It draws nothing and decides nothing: what to show is `matches`, and
 * the keyboard belongs to the composer, which owns the field the person
 * is actually typing in (ChatComposer.tsx). This is a list with a
 * highlight — which is also why it is a listbox and not a menu of
 * buttons: the focus never leaves the textarea.
 */
import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import type { ChatCommand } from '../lib/chat-commands';
import './command-menu.css';

export default function CommandMenu({
  matches,
  active,
  optionId,
  listId,
  onPick,
  onHover,
  leaving,
}: {
  /** The commands that fit what has been typed so far, in menu order. */
  matches: readonly ChatCommand[];
  /** Which of them the keyboard is on. */
  active: number;
  /** Builds the id of one row, so the field can point at the active one. */
  optionId: (index: number) => string;
  listId: string;
  onPick: (command: ChatCommand) => void;
  onHover: (index: number) => void;
  /** On its way out: drawn for the length of the animation, and inert. */
  leaving?: boolean;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLUListElement>(null);

  // Sixteen commands do not fit the list's height, so the highlight has to
  // drag the scroll along with it: arrowing down past the last visible row
  // is otherwise a highlight that vanishes and a list that does not move.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <ul
      className="cmd-menu"
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={t('cmd.menu')}
      data-leaving={leaving ? 'true' : undefined}
    >
      {matches.map((command, index) => (
        <li
          key={command.name}
          id={optionId(index)}
          className={`cmd-option ${index === active ? 'is-active' : ''}`}
          role="option"
          aria-selected={index === active}
          // The pointer must not take the focus off the textarea: the
          // caret, the selection and the draft all live there.
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={() => onHover(index)}
          onClick={() => onPick(command)}
        >
          <span className="cmd-word">
            /{command.name}
            {command.arg && <span className="cmd-arg"> {`<${t(command.arg.key)}>`}</span>}
          </span>
          <span className="cmd-hint">{t(command.describe)}</span>
        </li>
      ))}
    </ul>
  );
}
