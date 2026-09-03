/**
 * A name said inside a message.
 *
 * It carries the person's face because the face is what the room is
 * actually made of: the tiles, the dock badges and the pre-join card all
 * draw the same mascot from the same name (lib/identity.ts), so a mention
 * that shows it is recognised before the word is read. Nothing is fetched
 * to draw it — the avatar is arithmetic on the name.
 *
 * The `@` stays in the text. A chip that dropped it would read as a typo
 * in a sentence, and the whole point is that this is a word someone typed.
 */
import Avatar from './Avatar';
import './mention.css';

export default function Mention({ name, self }: { name: string; self?: boolean }) {
  return (
    <span className="chat-mention" data-self={self ? '' : undefined}>
      <Avatar name={name} className="chat-mention-avatar" />
      <span className="chat-mention-name">@{name}</span>
    </span>
  );
}
